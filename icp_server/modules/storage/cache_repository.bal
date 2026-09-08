// Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com) All Rights Reserved.
//
// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
//  http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

import icp_server.types;

import ballerina/log;
import ballerina/sql;
import ballerina/time;
import ballerina/uuid;

// ============================================================================
// TUNNELED OPERATIONS — STORAGE
// ============================================================================
// Every piece of tunnel state lives in one table, tunneled_operation, shared by all ICP
// nodes, because the node that takes a user's data is usually not the node that receives
// the runtime's next heartbeat. Nothing here may be cached in a module-level variable:
// that would reintroduce node affinity, and the symptom (works on one node, intermittently
// stuck on two) is expensive to diagnose.
//
// A read and a mutation are the same thing here — an operation to run on a runtime whose
// result is stored and polled for — so they share one table, one claim, one completion and
// one sweep. `cacheable` is the whole of the difference the storage layer sees: a read is
// coalesced onto a shared key and re-served while stale; a mutation is one row, one outcome,
// addressed to one runtime. The read-only entry points (startCacheFetch, claimCacheRefresh,
// recordCacheFetchResult) and the mutation ones (enqueueCacheOperation, completeCacheOperation)
// stay distinct because their identity and fencing rules differ; everything else is shared.
//
// Two properties do the work that locking would otherwise be needed for:
//
//   1. Coalescing is the primary key. Concurrent identical reads race to INSERT the same
//      op_id; the loser reads the winner's row. No SELECT-then-INSERT window.
//   2. Fencing is the fetch token (reads) or the DELIVERED status (mutations). A result is
//      only accepted from the attempt that still owns the row, so a late answer from a
//      superseded or invalidated attempt is discarded rather than resurrecting state a
//      mutation removed.
//
// Redelivery is safe because the bridge replays a command id it has already executed, so
// a claim does not have to be exclusive across ICP nodes — two nodes handing out the same
// row causes a replay, not a second execution.

// A read whose command was claimed but produced no result within this many seconds is
// offered again. It bounds the loss when a heartbeat response is dropped in transit,
// without a delivery-acknowledgement round trip.
const int CACHE_REDELIVER_AFTER_SECONDS = 20;

# Current epoch seconds, the unit every time column in this table uses.
#
# + return - Seconds since the Unix epoch
public isolated function cacheNowEpoch() returns int => time:utcNow()[0];

# Reads one row — a read or a mutation — by its id, which is what the console polls.
#
# + opId - The read's cache key or the mutation's operation id
# + return - The row, `()` when unknown, or an error
public isolated function getTunneledOperation(string opId)
        returns types:TunneledOperation?|error {
    types:TunneledOperation|sql:Error row = dbClient->queryRow(`
        SELECT op_id, kind, cacheable, owner, target, token, status,
               issued_at, expires_at, claimed_at, delivered_at, completed_at, data, result
        FROM tunneled_operation
        WHERE op_id = ${opId}
    `);
    if row is sql:NoRowsError {
        return ();
    }
    if row is sql:Error {
        return error(string `Failed to read a tunneled operation`, row);
    }
    return row;
}

// ── Reads ────────────────────────────────────────────────────────────────────

# Creates a FETCHING row, claiming the right to fetch this data.
#
# The insert *is* the coalescing mechanism: when several requests for the same key arrive
# at once — on one node or on several — exactly one insert succeeds and the rest are told
# to poll instead of issuing their own command.
#
# + cacheKey - The data's key
# + kind - What this entry is about, e.g. `workflow.read` — the only workflow-shaped thing
#          about it, and it is data
# + owner - The scope the entry belongs to; the invalidation unit, and never identity-scoped,
#              since a mutation must invalidate every role set's view
# + data - What to execute: `{operation, params, identity}` as JSON
# + token - This attempt's id, which becomes the command id
# + expiresAt - Epoch seconds after which an unanswered row is abandoned
# + return - `true` when this caller owns the fetch, `false` when another already does
public isolated function startCacheFetch(string cacheKey, string kind, string owner,
        string data, string token, int expiresAt) returns boolean|error {
    sql:ExecutionResult|sql:Error result = dbClient->execute(`
        INSERT INTO tunneled_operation (op_id, kind, cacheable, owner, data, token, status,
                                        issued_at, expires_at)
        VALUES (${cacheKey}, ${kind}, ${true}, ${owner}, ${data}, ${token},
                ${types:CACHE_FETCHING}, ${cacheNowEpoch()}, ${expiresAt})
    `);
    if result is sql:Error {
        if classifySqlError(result) == DUPLICATE_KEY {
            // Another data created the row first. Both callers poll the same row.
            return false;
        }
        return error(string `Failed to start a cache fetch`, result);
    }
    return true;
}

# Claims the refresh of an entry that is already serving an answer.
#
# A stale entry keeps its answer and its READY status while it refreshes, so the caller still
# gets data — `token` alone marks a refresh as in flight. Only the caller that wins this
# update issues a fetch.
#
# It deliberately does NOT write `data`. The cache key is computed from the request, so a
# refresh of the same key is a refresh of the same request: rewriting it would replace the
# answer being served with the question that produced it, which is exactly the payload
# stale-while-revalidate exists to keep.
#
# + cacheKey - The entry's key
# + token - This attempt's id, which becomes the fetch's command id
# + expiresAt - New abandonment deadline for the in-flight fetch
# + return - `true` when this caller owns the refresh, `false` when one is already running
public isolated function claimCacheRefresh(string cacheKey, string token, int expiresAt)
        returns boolean|error {
    sql:ExecutionResult|sql:Error result = dbClient->execute(`
        UPDATE tunneled_operation
        SET token = ${token}, claimed_at = NULL, expires_at = ${expiresAt}
        WHERE op_id = ${cacheKey} AND cacheable = ${true} AND token IS NULL
    `);
    if result is sql:Error {
        return error(string `Failed to claim a cache refresh`, result);
    }
    int? affected = result.affectedRowCount;
    return affected is int && affected > 0;
}

# Records a fetched result — an answer or a failure — or discards it as superseded.
#
# The update is fenced on `token`: zero rows affected means the attempt was invalidated by a
# mutation or superseded by a newer attempt, so its data describes a world that no longer
# exists and must not be stored. This is what stops a late result resurrecting a task
# somebody has completed.
#
# On success the answer replaces `data` and the row goes READY. On failure the row keeps any
# data it already holds — a failed refresh is a reason to go on serving the last good answer,
# not to throw it away — and goes FAILED only if it had never answered (was still FETCHING).
#
# + cacheKey - The data's key
# + token - The attempt this result belongs to
# + succeeded - Whether the runtime answered or failed
# + payload - The response document (the answer, or the failure)
# + expiresAt - Epoch seconds until the row goes stale (success) or is retried (failure)
# + return - `true` when recorded, `false` when discarded as superseded, or an error
public isolated function recordCacheFetchResult(string cacheKey, string token,
        boolean succeeded, string payload, int expiresAt) returns boolean|error {
    sql:ParameterizedQuery update = succeeded
        ? `UPDATE tunneled_operation
           SET status = ${types:CACHE_READY}, data = ${payload}, expires_at = ${expiresAt},
               token = NULL, claimed_at = NULL
           WHERE op_id = ${cacheKey} AND token = ${token}`
        : `UPDATE tunneled_operation
           SET status = CASE WHEN status = ${types:CACHE_FETCHING}
                             THEN ${types:CACHE_FAILED} ELSE status END,
               data = CASE WHEN status = ${types:CACHE_FETCHING} THEN ${payload} ELSE data END,
               expires_at = ${expiresAt}, token = NULL, claimed_at = NULL
           WHERE op_id = ${cacheKey} AND token = ${token}`;
    sql:ExecutionResult|sql:Error result = dbClient->execute(update);
    if result is sql:Error {
        return error(string `Failed to record a cache fetch result`, result);
    }
    int? affected = result.affectedRowCount;
    boolean stored = affected is int && affected > 0;
    if !stored {
        log:printDebug("Discarded a superseded cache result", cacheKey = cacheKey,
                token = token);
    }
    return stored;
}

# Marks a scope's live entries stale, without deleting them.
#
# Called when a mutation completes — never when one is submitted, because until the
# integration confirms it the world has not changed and the cached answer is still
# correct.
#
# Stale rows keep serving while they refresh, which is the point: deleting them would
# empty the cache faster than it could be rebuilt whenever several people are working in
# the same environment, and everyone would be left watching a spinner.
#
# Entries whose expiry is far in the future are the immutable ones — a closed instance's
# history cannot be falsified by anything — so they are left alone.
#
# + owner - `componentId:environmentId`
# + liveHorizonSeconds - Only rows expiring within this many seconds are marked; longer
#                        TTLs identify terminal, immutable data
# + return - How many entries were marked, or an error
public isolated function staleCacheOwner(string owner, int liveHorizonSeconds)
        returns int|error {
    int now = cacheNowEpoch();
    sql:ExecutionResult|sql:Error result = dbClient->execute(`
        UPDATE tunneled_operation
        SET expires_at = ${now}
        WHERE cacheable = ${true}
          AND owner = ${owner}
          AND expires_at > ${now}
          AND expires_at < ${now + liveHorizonSeconds}
    `);
    if result is sql:Error {
        return error(string `Failed to invalidate an owner's cache entries`, result);
    }
    int? affected = result.affectedRowCount;
    return affected is int ? affected : 0;
}

# Expires one cached read on demand — the `?refresh=true` escape hatch. The entry is not
# deleted: the stale data keeps serving (with its age shown) while the refresh the caller
# forced runs behind it. A no-op for an entry that is already stale or absent.
#
# + cacheKey - The entry to expire
# + return - An error only when the database itself failed
public isolated function expireCacheEntry(string cacheKey) returns error? {
    int now = cacheNowEpoch();
    sql:ExecutionResult|sql:Error result = dbClient->execute(`
        UPDATE tunneled_operation
        SET expires_at = ${now}
        WHERE op_id = ${cacheKey} AND cacheable = ${true} AND expires_at > ${now}
    `);
    if result is sql:Error {
        return error(string `Failed to expire a cache entry`, result);
    }
    return ();
}

# Takes the work due for this runtime's heartbeat: its pending mutations first, then the
# reads of its scope. Mutations outrank reads because a user waiting on an action outranks a
# list refresh, so they are claimed first and delivered first.
#
# One claim, two rules, because a read and a mutation are addressed and fenced differently:
#
#   - A mutation is addressed to THIS runtime and no other (the bridge's replay cache is per
#     process, so the same command reaching two runtimes of one integration would execute
#     twice) and claimed by flipping PENDING -> DELIVERED, so it is handed over once.
#   - A read is addressed to a SCOPE (any runtime of the component can answer a namespace
#     query) and merely stamped `claimed_at`, so a dropped response re-offers it after
#     `CACHE_REDELIVER_AFTER_SECONDS` — a replay the bridge absorbs, not a second execution.
#
# Expired rows are filtered out here as well as swept, so neither a stale read nor a mutation
# past its deadline is ever delivered.
#
# + runtimeId - The runtime whose heartbeat is being answered
# + scopeKey - The scope that runtime serves, whose reads it may answer
# + maxMutations - Hard cap on how many mutations one heartbeat may carry
# + maxReads - Hard cap on how many reads one heartbeat may carry
# + return - The work to send, mutations before reads, or an error
public isolated function claimTunneledOperations(string runtimeId, string scopeKey,
        int maxMutations, int maxReads) returns types:TunneledOperation[]|error {
    int now = cacheNowEpoch();
    types:TunneledOperation[] claimed = [];

    if maxMutations > 0 {
        sql:ParameterizedQuery mutations = `
            SELECT op_id, kind, cacheable, owner, target, token, status,
                   issued_at, expires_at, claimed_at, delivered_at, completed_at, data, result
            FROM tunneled_operation
            WHERE cacheable = ${false}
              AND target = ${runtimeId}
              AND status = ${types:CACHE_OP_PENDING}
              AND expires_at > ${now}
            ORDER BY issued_at
        `;
        check collectClaimed(appendLimitClause(mutations, maxMutations), claimed);
    }

    if maxReads > 0 {
        int redeliverBefore = now - CACHE_REDELIVER_AFTER_SECONDS;
        sql:ParameterizedQuery reads = `
            SELECT op_id, kind, cacheable, owner, target, token, status,
                   issued_at, expires_at, claimed_at, delivered_at, completed_at, data, result
            FROM tunneled_operation
            WHERE cacheable = ${true}
              AND owner = ${scopeKey}
              AND token IS NOT NULL
              AND expires_at > ${now}
              AND (claimed_at IS NULL OR claimed_at < ${redeliverBefore})
            ORDER BY issued_at
        `;
        check collectClaimed(appendLimitClause(reads, maxReads), claimed);
    }

    foreach types:TunneledOperation op in claimed {
        // A mutation is handed over once: flip it DELIVERED, fenced on PENDING so a second
        // node cannot re-deliver it. A read is best-effort: a stamp that does not land means
        // it is offered once more, which the executing side absorbs as a replay.
        sql:ParameterizedQuery stamp = op.cacheable
            ? `UPDATE tunneled_operation SET claimed_at = ${now}
               WHERE op_id = ${op.opId} AND token = ${op.token}`
            : `UPDATE tunneled_operation
               SET status = ${types:CACHE_OP_DELIVERED}, delivered_at = ${now}
               WHERE op_id = ${op.opId} AND status = ${types:CACHE_OP_PENDING}`;
        sql:ExecutionResult|sql:Error marked = dbClient->execute(stamp);
        if marked is sql:Error {
            log:printWarn("Failed to stamp a claimed tunneled operation", marked,
                    opId = op.opId);
        }
    }
    return claimed;
}

// Runs a claim query and appends its rows to `into`, preserving the caller's order.
isolated function collectClaimed(sql:ParameterizedQuery query,
        types:TunneledOperation[] into) returns error? {
    stream<types:TunneledOperation, sql:Error?> rows = dbClient->query(query);
    check from types:TunneledOperation op in rows
        do {
            into.push(op);
        };
}

# Queues a mutation for delivery to one runtime.
#
# `opId` is the caller's idempotency key, so a resubmitted click collides on the primary key
# instead of becoming a second operation — the one duplicate the ICP can genuinely prevent.
# Two *different* users acting on the same task are two operations by design: one succeeds
# and the other must be told it lost.
#
# + operation - The row to queue, with its data and expiry (the delivery deadline) already built
# + return - `true` when queued, `false` when this idempotency key already exists
public isolated function enqueueCacheOperation(types:TunneledOperation operation)
        returns boolean|error {
    sql:ExecutionResult|sql:Error result = dbClient->execute(`
        INSERT INTO tunneled_operation (op_id, kind, cacheable, target, owner, status,
                                        issued_at, expires_at, data)
        VALUES (${operation.opId}, ${operation.kind}, ${false}, ${operation.target},
                ${operation.owner}, ${types:CACHE_OP_PENDING}, ${operation.issuedAt},
                ${operation.expiresAt}, ${operation.data})
    `);
    if result is sql:Error {
        if classifySqlError(result) == DUPLICATE_KEY {
            return false;
        }
        return error(string `Failed to queue an operation`, result);
    }
    return true;
}

# Records a mutation's outcome, first write wins.
#
# Fenced on DELIVERED so a duplicate result — a redelivery the runtime replayed, or a
# result arriving at two nodes — updates nothing the second time. The caller writes the
# audit record or the notification only when this returns `true`, so an outcome is
# recorded exactly once no matter which node received it.
#
# + operationId - The operation's id
# + status - `COMPLETED` or `FAILED`
# + result - The outcome document, including the error code when it failed
# + return - `true` when this call recorded the outcome, `false` when it was already
#            recorded, or an error
public isolated function completeCacheOperation(string operationId, string status,
        string result) returns boolean|error {
    sql:ExecutionResult|sql:Error updated = dbClient->execute(`
        UPDATE tunneled_operation
        SET status = ${status}, result = ${result}, completed_at = ${cacheNowEpoch()}
        WHERE op_id = ${operationId} AND status = ${types:CACHE_OP_DELIVERED}
    `);
    if updated is sql:Error {
        return error(string `Failed to record an operation outcome`, updated);
    }
    int? affected = updated.affectedRowCount;
    return affected is int && affected > 0;
}

// ── Sweeper ──────────────────────────────────────────────────────────────────

# Gives up on dead work and deletes what is no longer servable, in one pass over the table.
#
# Every statement is idempotent and none depends on which node runs it, so both ICP nodes
# sweeping is harmless and no leader election is needed. Order matters: unanswered reads are
# failed and unconfirmed mutations expired BEFORE finished rows are deleted, so work that
# timed out in this same pass still becomes a reply or a notification rather than vanishing.
#
# + staleRetentionSeconds - How long past expiry a read row stays servable before deletion
# + completedRetentionSeconds - How long a recorded mutation outcome stays readable by the console
# + failedReadRetrySeconds - How long an abandoned read's FAILED state stands before a retry
# + return - The mutations this pass expired, so the caller can surface each one, or an error
public isolated function sweepTunneledOperations(int staleRetentionSeconds,
        int completedRetentionSeconds, int failedReadRetrySeconds)
        returns types:TunneledOperation[]|error {
    int now = cacheNowEpoch();

    // 1. Reads nobody answered before their deadline. Left in flight they keep their token,
    //    so every heartbeat re-offers them and every poll reads as "still fetching" — a
    //    question asked dozens of times and never answered. Failing turns that into a reply.
    //    `data` is left alone: it holds the request a retry needs, and `status` carries the
    //    failure on its own. Overwriting it with a failure notice once made a row
    //    unrecoverable — a wedged pool expired a fetch and that view answered 504 for as long
    //    as the row lived, with nothing left to re-ask.
    sql:ExecutionResult|sql:Error abandoned = dbClient->execute(`
        UPDATE tunneled_operation
        SET status = CASE WHEN status = ${types:CACHE_FETCHING}
                          THEN ${types:CACHE_FAILED} ELSE status END,
            token = NULL, claimed_at = NULL, expires_at = ${now + failedReadRetrySeconds}
        WHERE cacheable = ${true} AND token IS NOT NULL AND expires_at <= ${now}
    `);
    if abandoned is sql:Error {
        return error(string `Failed to abandon expired cache fetches`, abandoned);
    }

    // 2. Expire unconfirmed mutations FIRST, stamping this sweep's own id, then read back only
    //    what this call transitioned. Reading first and expiring second let two nodes see the
    //    same rows before either UPDATE ran, so both returned them and both raised a
    //    notification for one operation — the exactly-once discipline that completeCacheOperation
    //    establishes for outcomes, undone by the sweep that reports them. Publish what you
    //    transitioned.
    string sweepId = uuid:createType4AsString();
    sql:ExecutionResult|sql:Error expired = dbClient->execute(`
        UPDATE tunneled_operation
        SET status = ${types:CACHE_OP_EXPIRED}, completed_at = ${now}, result = ${sweepId}
        WHERE cacheable = ${false} AND expires_at < ${now}
          AND status IN (${types:CACHE_OP_PENDING}, ${types:CACHE_OP_DELIVERED})
    `);
    if expired is sql:Error {
        return error(string `Failed to expire unconfirmed operations`, expired);
    }
    int? expiredCount = expired.affectedRowCount;
    types:TunneledOperation[] expiring = [];
    if expiredCount is int && expiredCount > 0 {
        log:printWarn(string `${expiredCount} operation(s) expired unconfirmed`);
        do {
            stream<types:TunneledOperation, sql:Error?> rows = dbClient->query(`
                SELECT op_id, kind, cacheable, owner, target, token, status,
                       issued_at, expires_at, claimed_at, delivered_at, completed_at, data, result
                FROM tunneled_operation
                WHERE status = ${types:CACHE_OP_EXPIRED} AND result = ${sweepId}
            `);
            check from types:TunneledOperation row in rows
                do {
                    expiring.push(row);
                };
        } on fail error e {
            return error("Failed to read the operations this sweep expired", e);
        }
    }

    // 3. Read rows past the window in which they would still have been served.
    sql:ExecutionResult|sql:Error dropped = dbClient->execute(`
        DELETE FROM tunneled_operation
        WHERE cacheable = ${true} AND expires_at < ${now - staleRetentionSeconds}
    `);
    if dropped is sql:Error {
        return error(string `Failed to sweep the cache`, dropped);
    }

    // 4. Mutations whose outcome is recorded elsewhere (audit log for a success, an
    //    unresolved system event for a failure), and which the console has had time to
    //    read. FAILED and EXPIRED rows stay until their notification is resolved.
    sql:ExecutionResult|sql:Error finished = dbClient->execute(`
        DELETE FROM tunneled_operation
        WHERE cacheable = ${false} AND status = ${types:CACHE_OP_COMPLETED}
          AND completed_at < ${now - completedRetentionSeconds}
    `);
    if finished is sql:Error {
        return error(string `Failed to sweep completed operations`, finished);
    }
    return expiring;
}

// ── Boost window ─────────────────────────────────────────────────────────────
// A runtime whose scope somebody is actively working in is asked to heartbeat faster, so
// queued reads and mutations are picked up in about a second rather than on its normal
// interval. The window lives on the runtime row rather than in memory for the same reason
// everything else here does: the node that serves the user's data is usually not the
// node that answers the heartbeat, so an in-memory window would boost the wrong half of
// the time.

# Extends the boost window for every runtime in a scope.
#
# + componentId - The component whose runtimes are serving these views
# + environmentId - The environment
# + until - Epoch seconds up to which fast heartbeats are wanted
# + return - An error if the update failed
# Extends the boost window on a component's runtimes, but only when it is running out.
#
# `extendWhenBelow` is what keeps this off the hot path. `until` always moves forward, because
# it is derived from now, so a guard against moving backwards still writes on EVERY read — and
# these are the same `runtimes` rows that `processHeartbeat` locks for the length of its
# transaction (see analysis/05 §8b). Twenty readers polling therefore queued twenty writes
# against a row that a heartbeat was already holding. Extending only when the remaining window
# has half lapsed keeps the boost continuous and turns a write per read into at most one write
# per half-window.
#
# + until - The new expiry to set
# + extendWhenBelow - Only write when the stored expiry is earlier than this
# + return - An error if the update fails
public isolated function boostCacheOwner(string componentId, string environmentId, int until,
        int extendWhenBelow) returns error? {
    sql:ExecutionResult|sql:Error result = dbClient->execute(`
        UPDATE runtimes
        SET wf_boosted_until = ${until}
        WHERE component_id = ${componentId} AND environment_id = ${environmentId}
          AND (wf_boosted_until IS NULL OR wf_boosted_until < ${extendWhenBelow})
    `);
    if result is sql:Error {
        return error(string `Failed to boost an owner`, result);
    }
    return ();
}

# Reads how long a runtime's boost has left, for the heartbeat cadence hint.
#
# + runtimeId - The runtime being answered
# + return - Seconds of boost remaining (0 when not boosted), or an error
public isolated function cacheBoostRemaining(string runtimeId) returns int|error {
    record {|int? wf_boosted_until;|}|sql:Error row = dbClient->queryRow(`
        SELECT wf_boosted_until FROM runtimes WHERE runtime_id = ${runtimeId}
    `);
    if row is sql:NoRowsError {
        return 0;
    }
    if row is sql:Error {
        return error(string `Failed to read a boost window`, row);
    }
    int? until = row.wf_boosted_until;
    if until is () {
        return 0;
    }
    int remaining = until - cacheNowEpoch();
    return remaining > 0 ? remaining : 0;
}

# The scope a runtime serves and how much boost it has left, in ONE query.
#
# Folded together deliberately. Every heartbeat of every runtime runs this, and the pool is
# small (`maxOpenConnections` defaults to 10 per node): two queries where one will do is a
# steady multiplier on a resource whose exhaustion does not degrade gracefully - a
# transaction holding a connection while its flow waits for a second one deadlocks the pool
# rather than slowing down.
#
# A dedicated query rather than `getRuntimeById`, because the mapped `Runtime` record does
# not carry these columns and the delivery path needs nothing else.
#
# + runtimeId - The runtime being answered
# + return - `[componentId, environmentId, boostSecondsRemaining]`, `()` when the runtime is
#            unknown or has no component, or an error
public isolated function getRuntimeCacheOwner(string runtimeId)
        returns [string, string, int]?|error {
    record {|string? component_id; string environment_id; int? wf_boosted_until;|}|sql:Error row =
        dbClient->queryRow(`
        SELECT component_id, environment_id, wf_boosted_until
        FROM runtimes WHERE runtime_id = ${runtimeId}
    `);
    if row is sql:NoRowsError {
        return ();
    }
    if row is sql:Error {
        return error(string `Failed to read a runtime's cache owner`, row);
    }
    string? componentId = row.component_id;
    if componentId is () {
        return ();
    }
    int? until = row.wf_boosted_until;
    int remaining = until is int ? until - cacheNowEpoch() : 0;
    return [componentId, row.environment_id, remaining > 0 ? remaining : 0];
}
