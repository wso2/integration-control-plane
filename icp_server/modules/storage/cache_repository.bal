// Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com).
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
// REQUEST CACHE — STORAGE
// ============================================================================
// Every piece of tunnel state lives in cache_entry and cache_operation_outbox, shared by
// all ICP nodes, because the node that takes a user's data is usually not the node
// that receives the runtime's next heartbeat. Nothing here may be cached in a
// module-level variable: that would reintroduce node affinity, and the symptom (works on
// one node, intermittently stuck on two) is expensive to diagnose.
//
// Two properties do the work that locking would otherwise be needed for:
//
//   1. Coalescing is the primary key. Concurrent identical reads race to INSERT the same
//      cache_key; the loser reads the winner's row. No SELECT-then-INSERT window.
//   2. Fencing is the fetch id. A result is only accepted by the attempt that is still
//      current, so a late answer from a superseded or invalidated fetch is discarded
//      rather than resurrecting state a mutation removed.
//
// Redelivery is safe because the bridge replays a command id it has already executed, so
// a claim does not have to be exclusive across ICP nodes — two nodes handing out the same
// row causes a replay, not a second execution.

// A read whose command was claimed but produced no result within this many seconds is
// offered again. It bounds the loss when a heartbeat response is dropped in transit,
// without a delivery-acknowledgement round trip.
const int CACHE_REDELIVER_AFTER_SECONDS = 20;

# Current epoch seconds, the unit every time column in these two tables uses.
#
# + return - Seconds since the Unix epoch
public isolated function cacheNowEpoch() returns int => time:utcNow()[0];

// ── Read cache ───────────────────────────────────────────────────────────────

# Reads one cache row.
#
# + cacheKey - The data's key: scope, operation, params and the caller's role set
# + return - The row, `()` when nothing is cached, or an error
public isolated function getCacheEntry(string cacheKey)
        returns types:CacheEntry?|error {
    types:CacheEntry|sql:Error row = dbClient->queryRow(`
        SELECT cache_key, kind, owner, token, status, expires_at, claimed_at, data
        FROM cache_entry
        WHERE cache_key = ${cacheKey}
    `);
    if row is sql:NoRowsError {
        return ();
    }
    if row is sql:Error {
        return error(string `Failed to read a cache entry`, row);
    }
    return row;
}

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
        INSERT INTO cache_entry (cache_key, kind, owner, data, token, status, expires_at)
        VALUES (${cacheKey}, ${kind}, ${owner}, ${data}, ${token}, ${types:CACHE_FETCHING},
                ${expiresAt})
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
        UPDATE cache_entry
        SET token = ${token}, claimed_at = NULL, expires_at = ${expiresAt}
        WHERE cache_key = ${cacheKey} AND token IS NULL
    `);
    if result is sql:Error {
        return error(string `Failed to claim a cache refresh`, result);
    }
    int? affected = result.affectedRowCount;
    return affected is int && affected > 0;
}

# Records a fetched result, or discards it.
#
# The update is fenced on `token`: zero rows affected means the attempt was
# invalidated by a mutation or superseded by a newer attempt, so its data describes a
# world that no longer exists and must not be stored. This is what stops a late result
# resurrecting a task somebody has completed.
#
# + cacheKey - The data's key
# + token - The attempt this result belongs to
# + data - The response document
# + expiresAt - Epoch seconds until the entry goes stale
# + return - `true` when stored, `false` when discarded as superseded, or an error
public isolated function completeCacheFetch(string cacheKey, string token,
        string data, int expiresAt) returns boolean|error {
    sql:ExecutionResult|sql:Error result = dbClient->execute(`
        UPDATE cache_entry
        SET status = ${types:CACHE_READY}, data = ${data}, expires_at = ${expiresAt},
            token = NULL, claimed_at = NULL
        WHERE cache_key = ${cacheKey} AND token = ${token}
    `);
    if result is sql:Error {
        return error(string `Failed to store a cache result`, result);
    }
    int? affected = result.affectedRowCount;
    boolean stored = affected is int && affected > 0;
    if !stored {
        log:printDebug("Discarded a superseded cache result", cacheKey = cacheKey,
                token = token);
    }
    return stored;
}

# Records that a fetch failed. Fenced exactly like a success.
#
# A row that already holds a data keeps it: a failed refresh is a reason to go on
# serving the last good answer, not to throw it away.
#
# + cacheKey - The data's key
# + token - The attempt this failure belongs to
# + errorPayload - The failure as a response document
# + expiresAt - Epoch seconds until the failed entry is retried
# + return - `true` when recorded, `false` when discarded as superseded, or an error
public isolated function failCacheFetch(string cacheKey, string token,
        string errorPayload, int expiresAt) returns boolean|error {
    sql:ExecutionResult|sql:Error result = dbClient->execute(`
        UPDATE cache_entry
        SET status = CASE WHEN status = ${types:CACHE_FETCHING}
                          THEN ${types:CACHE_FAILED} ELSE status END,
            data = CASE WHEN status = ${types:CACHE_FETCHING} THEN ${errorPayload} ELSE data END,
            expires_at = ${expiresAt}, token = NULL, claimed_at = NULL
        WHERE cache_key = ${cacheKey} AND token = ${token}
    `);
    if result is sql:Error {
        return error(string `Failed to record a cache failure`, result);
    }
    int? affected = result.affectedRowCount;
    return affected is int && affected > 0;
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
        UPDATE cache_entry
        SET expires_at = ${now}
        WHERE owner = ${owner}
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
        UPDATE cache_entry
        SET expires_at = ${now}
        WHERE cache_key = ${cacheKey} AND expires_at > ${now}
    `);
    if result is sql:Error {
        return error(string `Failed to expire a cache entry`, result);
    }
    return ();
}

# Takes up to `count` reads a runtime should execute, oldest claim first.
#
# Rows already claimed are offered again only after `CACHE_REDELIVER_AFTER_SECONDS`, so
# a dropped heartbeat response costs one delay rather than a stuck data. Redelivery is
# safe because the bridge replays a command id it has already executed.
#
# + owner - The scope this runtime serves
# + count - Hard cap on how many reads one heartbeat may carry
# + return - The reads to send, or an error
public isolated function claimCacheFetches(string owner, int count)
        returns types:CachePendingFetch[]|error {
    int now = cacheNowEpoch();
    int redeliverBefore = now - CACHE_REDELIVER_AFTER_SECONDS;
    sql:ParameterizedQuery query = `
        SELECT cache_key, token, data
        FROM cache_entry
        WHERE owner = ${owner}
          AND token IS NOT NULL
          AND expires_at > ${now}
          AND (claimed_at IS NULL OR claimed_at < ${redeliverBefore})
        ORDER BY created_at
    `;
    query = appendLimitClause(query, count);
    types:CachePendingFetch[] fetches = [];
    do {
        stream<types:CachePendingFetch, sql:Error?> rows = dbClient->query(query);
        check from types:CachePendingFetch fetch in rows
            do {
                fetches.push(fetch);
            };
    } on fail error e {
        return error("Failed to claim cache fetches", e);
    }
    foreach types:CachePendingFetch fetch in fetches {
        // Best effort: a stamp that does not land means the fetch is offered once more,
        // which the executing side absorbs as a replay.
        sql:ExecutionResult|sql:Error stamp = dbClient->execute(`
            UPDATE cache_entry SET claimed_at = ${now}
            WHERE cache_key = ${fetch.cacheKey} AND token = ${fetch.token}
        `);
        if stamp is sql:Error {
            log:printWarn("Failed to stamp a claimed cache fetch", stamp,
                    cacheKey = fetch.cacheKey);
        }
    }
    return fetches;
}

# Gives up on fetches nobody answered before their deadline.
#
# Without this an unanswered fetch kept its token and was re-offered on every heartbeat until
# the sweeper deleted the row - dozens of commands for one question nobody could answer - and
# the caller polling it never got an answer at all, because a row with a token reads as "still
# fetching". Failing it turns that into a reply.
#
# + failureData - What to record as the entry's answer, as JSON
# + retryAfterSeconds - How long before the entry may be fetched again
# + return - How many fetches were abandoned, or an error
# Gives up on fetches nobody answered before their deadline.
#
# `data` is deliberately left alone. It holds the REQUEST that a retry needs in order to
# build a command again, and an entry that has been answered before holds the last good
# answer beside it — both worth more than a failure notice. `status` already says the fetch
# failed, so writing a failure document over the request would trade a recoverable row for
# an unrecoverable one: the retry would have nothing to ask. (It did exactly that once —
# a wedged connection pool expired a fetch, and that view answered 504 from then on.)
#
# + retryAfterSeconds - How long the failed state stands before a read retries it
# + return - How many fetches were given up on
public isolated function abandonExpiredCacheFetches(int retryAfterSeconds)
        returns int|error {
    int now = cacheNowEpoch();
    sql:ExecutionResult|sql:Error result = dbClient->execute(`
        UPDATE cache_entry
        SET status = CASE WHEN status = ${types:CACHE_FETCHING}
                          THEN ${types:CACHE_FAILED} ELSE status END,
            token = NULL, claimed_at = NULL, expires_at = ${now + retryAfterSeconds}
        WHERE token IS NOT NULL AND expires_at <= ${now}
    `);
    if result is sql:Error {
        return error(string `Failed to abandon expired cache fetches`, result);
    }
    int? affected = result.affectedRowCount;
    return affected is int ? affected : 0;
}

// ── Operation outbox ──────────────────────────────────────────────────────────

# Queues a mutation for delivery to one runtime.
#
# `operationId` is the caller's idempotency key, so a resubmitted click collides on the
# primary key instead of becoming a second operation — the one duplicate the ICP can
# genuinely prevent. Two *different* users acting on the same task are two operations by
# design: one succeeds and the other must be told it lost.
#
# + operation - The row to queue, with its data and deadline already built
# + return - `true` when queued, `false` when this idempotency key already exists
public isolated function enqueueCacheOperation(types:CacheOperation operation)
        returns boolean|error {
    sql:ExecutionResult|sql:Error result = dbClient->execute(`
        INSERT INTO cache_operation_outbox (operation_id, target, owner, kind, status,
                                            issued_at, deadline, data)
        VALUES (${operation.operationId}, ${operation.target}, ${operation.owner},
                ${operation.kind}, ${types:CACHE_OP_PENDING}, ${operation.issuedAt},
                ${operation.deadline}, ${operation.data})
    `);
    if result is sql:Error {
        if classifySqlError(result) == DUPLICATE_KEY {
            return false;
        }
        return error(string `Failed to queue an operation`, result);
    }
    return true;
}

# Reads one queued or finished mutation, which is what the console polls.
#
# + operationId - The operation's id
# + return - The row, `()` when unknown, or an error
public isolated function getCacheOperation(string operationId)
        returns types:CacheOperation?|error {
    types:CacheOperation|sql:Error row = dbClient->queryRow(`
        SELECT operation_id, target, owner, kind, status, issued_at, deadline,
               delivered_at, completed_at, data, result
        FROM cache_operation_outbox
        WHERE operation_id = ${operationId}
    `);
    if row is sql:NoRowsError {
        return ();
    }
    if row is sql:Error {
        return error(string `Failed to read an operation`, row);
    }
    return row;
}

# Takes up to `count` mutations addressed to this runtime, oldest first.
#
# Addressed to *this* runtime and no other: the bridge's replay cache is per process, so
# the same command reaching two runtimes of one integration would execute twice. Expired
# rows are filtered out here as well as swept, so a mutation whose deadline has passed is
# never delivered.
#
# + runtimeId - The runtime whose heartbeat is being answered
# + count - Hard cap on how many mutations one heartbeat may carry
# + return - The mutations to send, or an error
public isolated function claimCacheOperations(string runtimeId, int count)
        returns types:CacheOperation[]|error {
    int now = cacheNowEpoch();
    sql:ParameterizedQuery query = `
        SELECT operation_id, target, owner, kind, status, issued_at, deadline,
               delivered_at, completed_at, data, result
        FROM cache_operation_outbox
        WHERE target = ${runtimeId}
          AND status = ${types:CACHE_OP_PENDING}
          AND deadline > ${now}
        ORDER BY issued_at
    `;
    query = appendLimitClause(query, count);
    types:CacheOperation[] operations = [];
    do {
        stream<types:CacheOperation, sql:Error?> rows = dbClient->query(query);
        check from types:CacheOperation operation in rows
            do {
                operations.push(operation);
            };
    } on fail error e {
        return error("Failed to claim operations", e);
    }
    // Only stamped operations are handed out: an unstamped one could not record its outcome.
    types:CacheOperation[] delivered = [];
    foreach types:CacheOperation operation in operations {
        sql:ExecutionResult|sql:Error marked = dbClient->execute(`
            UPDATE cache_operation_outbox
            SET status = ${types:CACHE_OP_DELIVERED}, delivered_at = ${now}
            WHERE operation_id = ${operation.operationId} AND status = ${types:CACHE_OP_PENDING}
        `);
        if marked is sql:Error {
            log:printWarn("Failed to mark a cached operation delivered; it stays queued", marked,
                    operationId = operation.operationId);
            continue;
        }
        delivered.push(operation);
    }
    return delivered;
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
        UPDATE cache_operation_outbox
        SET status = ${status}, result = ${result}, completed_at = ${cacheNowEpoch()}
        WHERE operation_id = ${operationId} AND status = ${types:CACHE_OP_DELIVERED}
    `);
    if updated is sql:Error {
        return error(string `Failed to record an operation outcome`, updated);
    }
    int? affected = updated.affectedRowCount;
    return affected is int && affected > 0;
}

// ── Sweeper ──────────────────────────────────────────────────────────────────

# Expires unconfirmed mutations and deletes what is no longer servable.
#
# Every statement is idempotent and none depends on which node runs it, so both ICP nodes
# sweeping is harmless and no leader election is needed.
#
# Order matters: mutations are expired before finished rows are deleted, so a mutation
# that timed out in this same pass still becomes a notification rather than vanishing.
#
# + staleRetentionSeconds - How long past expiry a cache row stays servable
# + completedRetentionSeconds - How long a recorded outcome stays readable by the console
# + return - The operations this pass expired, so the caller can surface each one, or an error
public isolated function sweepCacheTables(int staleRetentionSeconds,
        int completedRetentionSeconds) returns types:CacheOperation[]|error {
    int now = cacheNowEpoch();

    // Expire FIRST, stamping this sweep's own id, then read back only what this call
    // transitioned. Reading first and expiring second let two nodes see the same rows before
    // either UPDATE ran, so both returned them and both raised a notification for one
    // operation — the exactly-once discipline that completeCacheOperation establishes for
    // outcomes, undone by the sweep that reports them. Publish what you transitioned.
    string sweepId = uuid:createType4AsString();
    sql:ExecutionResult|sql:Error expired = dbClient->execute(`
        UPDATE cache_operation_outbox
        SET status = ${types:CACHE_OP_EXPIRED}, completed_at = ${now}, result = ${sweepId}
        WHERE deadline < ${now}
          AND status IN (${types:CACHE_OP_PENDING}, ${types:CACHE_OP_DELIVERED})
    `);
    if expired is sql:Error {
        return error(string `Failed to expire unconfirmed operations`, expired);
    }
    int? expiredCount = expired.affectedRowCount;
    types:CacheOperation[] expiring = [];
    if expiredCount is int && expiredCount > 0 {
        log:printWarn(string `${expiredCount} operation(s) expired unconfirmed`);
        do {
            stream<types:CacheOperation, sql:Error?> rows = dbClient->query(`
                SELECT operation_id, target, owner, kind, status, issued_at, deadline,
                       delivered_at, completed_at, data, result
                FROM cache_operation_outbox
                WHERE status = ${types:CACHE_OP_EXPIRED} AND result = ${sweepId}
            `);
            check from types:CacheOperation row in rows
                do {
                    expiring.push(row);
                };
        } on fail error e {
            return error("Failed to read the operations this sweep expired", e);
        }
    }

    // 2. Cache rows past the window in which they would still have been served.
    sql:ExecutionResult|sql:Error dropped = dbClient->execute(`
        DELETE FROM cache_entry WHERE expires_at < ${now - staleRetentionSeconds}
    `);
    if dropped is sql:Error {
        return error(string `Failed to sweep the cache`, dropped);
    }

    // 3. Mutations whose outcome is recorded elsewhere (audit log for a success, an
    //    unresolved system event for a failure), and which the console has had time to
    //    read. FAILED and EXPIRED rows stay until their notification is resolved.
    sql:ExecutionResult|sql:Error finished = dbClient->execute(`
        DELETE FROM cache_operation_outbox
        WHERE status = ${types:CACHE_OP_COMPLETED}
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
