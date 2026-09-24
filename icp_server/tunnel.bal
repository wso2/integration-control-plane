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

import icp_server.storage;
import icp_server.types;

import ballerina/http;
import ballerina/log;
import ballerina/time;
import ballerina/uuid;

// ============================================================================
// THE READ TUNNEL
// ============================================================================
// What workflow management (workflow_tunnel.bal) and MI management (mi_tunnel.bal) have
// in common: a read is answered from `cache_entry` or materialized by a runtime on its
// next heartbeat, exactly one fetch runs per distinct question however many callers ask
// it, and an expired answer is still served while its replacement is fetched.
//
// What they do not share is the **owner** — the key a fetch is claimed under. A workflow
// read may be answered by any runtime of the component, so its owner is the scope. An MI
// read must be answered by the one runtime it names: log files, node memory and fault
// traces differ per replica, so a sibling's answer would be wrong rather than merely old.
// Every other difference (cache key, TTL, command action) is likewise the caller's.

isolated function nowUnixSeconds() returns int => time:utcNow()[0];

isolated function newFetchId() returns string => uuid:createType4AsString();

// The cadence to ask a boosted runtime for, decaying back to its own interval as the boost
// window runs out. Each step is [seconds of boost remaining, cadence to ask for]: one
// heartbeat per second while a user is likely still clicking, then 2s, 5s, 10s. A flat
// window at 1s was the first design and cost too much — a runtime serving non-workflow
// traffic kept heartbeating every second long after the last view was closed.
//
// The runtime ignores a hint that is not shorter than its own interval, so the last step is
// a no-op for one already on a 10s interval.
final readonly & [int, int][] TUNNEL_BOOST_RAMP = [[25, 1], [20, 2], [10, 5], [0, 10]];

// How long a request keeps its scope boosted. Every request extends it, so an active
// session stays at the fastest cadence.
const int TUNNEL_BOOST_WINDOW_SECONDS = 30;

// A read is abandoned if no runtime answers it within this long. The caller is told the
// read failed rather than left polling a row nobody will ever fill.
const int TUNNEL_READ_FETCH_DEADLINE_SECONDS = 60;

// How long past expiry an entry is still served while it refreshes, for a feature that
// names no window of its own. Generous: after a user's first visit they should not see a
// spinner again, and a slightly old answer with its age shown beats a blank table.
//
// This is also the sweep's backstop retention, so the two can never disagree in the
// direction that matters — a row is never deleted while something would still serve it.
const int TUNNEL_STALE_SERVE_SECONDS = 1800;

// The cadence to ask of a boosted runtime, or () when its boost has run out and it should
// return to its own interval.
isolated function boostCadence(int boostRemainingSeconds) returns int? {
    if boostRemainingSeconds <= 0 {
        return ();
    }
    foreach [int, int] [remainingAbove, cadence] in TUNNEL_BOOST_RAMP {
        if boostRemainingSeconds > remainingAbove {
            return cadence;
        }
    }
    return ();
}

# One distinct question and where its answer belongs.
#
# + cacheKey - Identity of the question; two callers asking it share one fetch
# + kind - The feature this row belongs to, so one pair of tables serves several
# + owner - Whose heartbeat may carry the fetch, and the unit a mutation invalidates
# + componentId - Boost scope
# + environmentId - Boost scope
# + request - The command's request document, stored so a later refresh can ask again
# + staleServeSeconds - How long past expiry this answer may still be served. Also what the
#                       sweep is told to keep it for, so serving and deletion agree; a
#                       feature whose answers are large and cheap to re-ask should say so
#                       here rather than pay to store them (see mi_tunnel.bal).
type TunneledRead record {|
    string cacheKey;
    string kind;
    string owner;
    string componentId;
    string environmentId;
    string request;
    int staleServeSeconds = TUNNEL_STALE_SERVE_SECONDS;
|};

# What a caller should do with a read right now.
#
# `READY` covers a stale entry as well as a fresh one: a stale answer is served while its
# refresh runs, because deleting it instead would empty the cache faster than it could be
# rebuilt whenever several people work in the same environment, and everyone would be left
# watching a spinner. `stale` and `fetchedAt` travel with it so the console can say what it
# is showing and how old it is, rather than presenting cached data as live.
type TunneledReadOutcome record {|
    "READY"|"PENDING"|"FAILED"|"NO_RUNTIME" state;
    json body = ();
    int httpStatus = 200;
    int fetchedAt = 0;
    boolean stale = false;
|};

# Serves a read from the cache, starting a fetch when there is nothing usable.
#
# Every call also extends the scope's boost window, so an active session keeps its runtimes
# heartbeating fast enough for the next request to be answered in about a second.
#
# + read - The question and where its answer belongs
# + targetAvailable - Whether any runtime can currently answer it; `false` yields
#                     `NO_RUNTIME` rather than a fetch nobody would collect
# + forceRefresh - The user demanded certainty
# + return - What to serve, or an error only when the database itself failed
isolated function ensureTunneledRead(TunneledRead read, boolean targetAvailable,
        boolean forceRefresh = false) returns TunneledReadOutcome|error {
    int now = nowUnixSeconds();
    if forceRefresh {
        // Expiring the entry (never deleting it) drops this call into the stale-serve path
        // below: the current answer still comes back immediately, marked stale, while the
        // forced refresh runs. Coalescing makes this safe to expose — twenty people pressing
        // Refresh together still produce one fetch, and an entry already mid-fetch keeps that
        // fetch rather than having it expired out from under it.
        check storage:expireCacheEntry(read.cacheKey);
    }

    types:CacheEntry? row = check storage:getCacheEntry(read.cacheKey);
    if row is types:CacheEntry {
        string? payload = row.data;
        // A fetch whose deadline has passed is dead now, not when a timer gets round to saying
        // so. The sweep that abandons one runs every few minutes, and until it does, every
        // caller of this key is told "still fetching" about a question nobody will ever answer.
        // Giving up on it here bounds the wait at the fetch deadline: the retry below (or
        // another caller's) asks again straight away.
        boolean fetching = row.token is string;
        if fetching && row.expiresAt <= now {
            boolean|error abandoned = storage:abandonCacheFetch(read.cacheKey);
            if abandoned is error {
                log:printWarn("Failed to abandon a tunneled read nobody answered", abandoned,
                        cacheKey = read.cacheKey);
            } else if abandoned {
                fetching = false;
            }
            // `false` means the row moved under this read — answered, or abandoned by another
            // node. Either way this view of it is stale, so it stays PENDING and the next poll,
            // a moment away, acts on what the row actually says now.
        }
        // A failure that has outlived its expiry is a retry, not an answer.
        //
        // Stale-while-revalidate is right for data: an old list still tells the user
        // something true. It is wrong for a failure. Serving one keeps reporting an error the
        // system has already moved past — a single wedged pool, whose sweeper wrote "no
        // runtime answered in time", left that view answering 504 for every later request
        // while the integration was healthy the whole while. Reporting PENDING instead puts
        // the console back on "Fetching…" and lets the refresh below answer it. A failure
        // that has NOT yet expired is still served, so a caller learns promptly that a read
        // failed rather than watching a spinner.
        if row.status == types:CACHE_FAILED && row.expiresAt <= now {
            if !fetching {
                error? started = startTunneledReadRefresh(read, targetAvailable, now);
                if started is error {
                    log:printWarn("Failed to retry a failed tunneled read", started,
                            cacheKey = read.cacheKey);
                }
            }
            return {state: "PENDING"};
        }
        if payload is string {
            TunneledReadOutcome outcome =
                check readOutcomeFromPayload(payload, row, now, read.staleServeSeconds);
            if row.expiresAt <= now && !fetching {
                // Stale and nothing refreshing it: start one behind the answer we are about
                // to serve. A failure here is not the caller's problem — they still get data.
                error? started = startTunneledReadRefresh(read, targetAvailable, now);
                if started is error {
                    log:printWarn("Failed to start a tunneled cache refresh", started,
                            cacheKey = read.cacheKey);
                }
            }
            return outcome;
        }
        if fetching {
            return {state: "PENDING"};
        }
        // Nothing to serve, and nothing in flight: the fetch was given up on, here or by the
        // sweep. The retry has to be CLAIMED on the row rather than left to the insert below —
        // an abandoned entry keeps its row (that is where the request lives), so the insert
        // collides with it, wins nothing, and the caller would wait a whole poll for a retry
        // that never started here.
        error? retried = startTunneledReadRefresh(read, targetAvailable, now);
        if retried is error {
            log:printWarn("Failed to retry an abandoned tunneled read", retried,
                    cacheKey = read.cacheKey);
        }
        return {state: "PENDING"};
    }

    if !targetAvailable {
        return {state: "NO_RUNTIME"};
    }
    check boostTunnelScope(read.componentId, read.environmentId, now);

    boolean owns = check storage:startCacheFetch(read.cacheKey, read.kind, read.owner,
            read.request, newFetchId(), now + TUNNEL_READ_FETCH_DEADLINE_SECONDS);
    if !owns {
        // Another request — on this node or another — is already fetching this exact answer.
        // Both callers poll the one row instead of issuing two commands.
        types:CacheEntry? existing = check storage:getCacheEntry(read.cacheKey);
        if existing is types:CacheEntry {
            string? cached = existing.data;
            if cached is string {
                return check readOutcomeFromPayload(cached, existing, now, read.staleServeSeconds);
            }
        }
    }
    return {state: "PENDING"};
}

// Starts a refresh of a stale entry, if this caller wins the claim.
isolated function startTunneledReadRefresh(TunneledRead read, boolean targetAvailable, int now)
        returns error? {
    if !targetAvailable {
        // Nothing can answer it; keep serving what we have rather than marking it in flight.
        return ();
    }
    check boostTunnelScope(read.componentId, read.environmentId, now);
    _ = check storage:claimCacheRefresh(read.cacheKey, newFetchId(),
            now + TUNNEL_READ_FETCH_DEADLINE_SECONDS);
    return ();
}

isolated function boostTunnelScope(string componentId, string environmentId, int now)
        returns error? =>
    storage:boostCacheOwner(componentId, environmentId, now + TUNNEL_BOOST_WINDOW_SECONDS,
            now + TUNNEL_BOOST_WINDOW_SECONDS / 2);

isolated function readOutcomeFromPayload(string payload, types:CacheEntry row, int now,
        int staleServeSeconds = TUNNEL_STALE_SERVE_SECONDS) returns TunneledReadOutcome|error {
    map<json> document = check payload.fromJsonString().ensureType();
    // An entry that has only ever been fetched holds `{request}`; one that has been answered
    // holds `{request, response}`. Without a response there is nothing to serve yet.
    json responseJson = document["response"] ?: ();
    if responseJson !is map<json> {
        return {state: "PENDING"};
    }
    map<json> envelope = responseJson;
    int fetchedAt = envelope["fetchedAt"] is int ? <int>envelope["fetchedAt"] : 0;
    int httpStatus = envelope["httpStatus"] is int ? <int>envelope["httpStatus"] : 200;
    boolean serveable = row.expiresAt > now || row.expiresAt > now - staleServeSeconds;
    if !serveable {
        return {state: "PENDING"};
    }
    return {
        state: row.status == types:CACHE_FAILED ? "FAILED" : "READY",
        body: envelope["body"],
        httpStatus: httpStatus,
        fetchedAt: fetchedAt,
        // Stale while expired — and also while a refresh is IN FLIGHT. Claiming a refresh
        // pushes expires_at out to the fetch deadline, so on expiry alone the old answer
        // reported itself fresh for exactly the seconds its replacement was being fetched;
        // a client polling on staleness stopped right then, and the fresh copy landed to
        // nobody. An answer being replaced is stale by definition, whatever its clock says.
        stale: row.expiresAt <= now || row.token !is ()
    };
}

# How long an answer stands. The request is passed as well as the body because what was
# asked often decides it — a finished workflow instance can be held for a day, its running
# sibling for seconds — and the runtime id because a scope still settling after a mutation
# must expire fast whatever the answer says.
type ReadTtlResolver isolated function (json request, json body, string runtimeId) returns int;

# The answer a runtime posted, stored under the key whose attempt asked for it.
#
# The entry's `data` carries the request as well as the answer, because one column holds
# both: the request has to survive so a later refresh knows what to ask again. The row is
# read here anyway, so handing the request to the TTL resolver costs nothing.
#
# + return - `true` when this result was the one the row was waiting for
isolated function recordTunneledReadResult(string cacheKey, string fetchId,
        types:WorkflowCommandResult result, int now, ReadTtlResolver ttl, int failureTtlSeconds)
        returns boolean {
    types:CacheEntry?|error row = storage:getCacheEntry(cacheKey);
    json request = ();
    if row is types:CacheEntry {
        string? stored = row.data;
        if stored is string {
            json|error document = stored.fromJsonString();
            if document is map<json> {
                request = document["request"] ?: document;
            }
        }
    }
    map<json> envelope = {
        request: request,
        response: {
            httpStatus: result.httpStatus,
            body: result.body,
            fetchedAt: now,
            runtimeId: result.runtimeId
        }
    };
    if result.httpStatus >= 200 && result.httpStatus < 300 {
        boolean|error stored = storage:completeCacheFetch(cacheKey, fetchId,
                envelope.toJsonString(), now + ttl(request, result.body, result.runtimeId));
        if stored is error {
            log:printError("Failed to store a tunneled read result", stored, cacheKey = cacheKey);
            return false;
        }
        return stored;
    }
    // A failed read keeps any payload the row already holds: the last good answer is worth
    // more than a fresh error, and the caller is told the refresh failed either way.
    boolean|error recorded = storage:failCacheFetch(cacheKey, fetchId,
            envelope.toJsonString(), now + failureTtlSeconds);
    if recorded is error {
        log:printError("Failed to record a tunneled read failure", recorded, cacheKey = cacheKey);
        return false;
    }
    return recorded;
}

// A read's command id carries both the entry it fills and the attempt that asked for it,
// so a result needs no extra lookup. The attempt half is what fences a late result: an
// answer whose attempt the row no longer holds belongs to a superseded fetch.
isolated function readCommandId(string prefix, string cacheKey, string fetchId) returns string =>
    prefix + cacheKey + "." + fetchId;

isolated function splitReadCommandId(string prefix, string commandId) returns [string, string]? {
    string body = commandId.substring(prefix.length());
    int? separator = body.indexOf(".");
    if separator is () {
        return ();
    }
    return [body.substring(0, separator), body.substring(separator + 1)];
}

# Builds the control command that carries one queued item to a runtime.
#
# The wire shape is the same for every tunneled kind — an id, an operation, its params, the
# caller's identity and a deadline — so a runtime that can execute one kind needs no new
# plumbing for the next, only a new executor.
isolated function tunneledCommand(types:ControlAction action, string runtimeId, string commandId,
        json request, int deadlineEpoch) returns types:ControlCommand|error {
    map<json> requestDoc = check request.ensureType();
    map<json> payload = {
        commandId: commandId,
        operation: requestDoc["operation"],
        params: requestDoc["params"],
        identity: requestDoc["identity"],
        deadline: time:utcToString([deadlineEpoch, 0.0])
    };
    return {
        commandId: commandId,
        runtimeId: runtimeId,
        targetArtifact: {name: action == types:MI_MGMT ? "management" : "workflow"},
        action: action,
        issuedAt: time:utcNow(),
        status: types:PENDING,
        payload: payload.toJsonString()
    };
}

// ── Serving ──────────────────────────────────────────────────────────────────

// Headers that tell the console what it is looking at. Cached data must never be presented
// as live: an operator deciding whether to terminate an instance needs the view's age.
const string TUNNEL_FETCHED_AT_HEADER = "x-workflow-fetched-at";
const string TUNNEL_STALE_HEADER = "x-workflow-stale";

# Turns a read outcome into the response the console polls.
#
# `202` with `{status: "FETCHING"}` is the normal first answer for a view nobody has opened
# recently; the console polls the same URL. A stale entry is served with its age instead,
# while a refresh runs behind it.
isolated function serveReadOutcome(TunneledReadOutcome outcome, string offlineMessage)
        returns http:Response {
    match outcome.state {
        "NO_RUNTIME" => {
            // The console already renders 503 as "this integration has nothing to
            // contribute", so an environment with no runtime reads as offline, not broken.
            return tunnelErrorResponse(503, offlineMessage);
        }
        "PENDING" => {
            http:Response accepted = new;
            accepted.statusCode = 202;
            accepted.setJsonPayload({status: "FETCHING", retryAfterMs: 750});
            return accepted;
        }
    }
    http:Response response = new;
    response.statusCode = outcome.httpStatus;
    setTunneledBody(response, outcome.body);
    response.setHeader(TUNNEL_FETCHED_AT_HEADER, outcome.fetchedAt.toString());
    if outcome.stale {
        response.setHeader(TUNNEL_STALE_HEADER, "true");
    }
    return response;
}

# Writes a runtime's answer to the caller as the runtime meant it.
#
# A body that is a JSON *string* is a management API that answered in plain text — a log
# file, a fault stack trace — which the runtime wrapped so it could travel as JSON. Writing
# it back with `setJsonPayload` would hand the console a quoted, backslash-escaped blob, and
# a downloaded log file would be unreadable. Every other body is JSON and stays JSON.
isolated function setTunneledBody(http:Response response, json body) {
    if body is string {
        response.setTextPayload(body);
        return;
    }
    response.setJsonPayload(body);
}

# Answers a poll for a queued mutation.
#
# A finished operation reports what the runtime said. `EXPIRED` is deliberately distinct
# from `FAILED`: the ICP never learned the outcome, so the caller is told to check the
# target's state rather than to retry.
isolated function serveTunneledOperationStatus(string operationId, string? owner = ()) returns http:Response {
    types:CacheOperation?|error row = storage:getCacheOperation(operationId);
    // An operation id from another scope reads as unknown, not as someone else's status.
    if row is types:CacheOperation && owner is string && row.owner != owner {
        row = ();
    }
    if row is error {
        return tunnelErrorResponse(500, "Failed to read the operation: " + row.message());
    }
    if row is () {
        return tunnelErrorResponse(404, "Unknown operation: " + operationId);
    }
    if row.status == types:CACHE_OP_PENDING || row.status == types:CACHE_OP_DELIVERED {
        http:Response pending = new;
        pending.statusCode = 202;
        pending.setJsonPayload({status: row.status, operationId: operationId, retryAfterMs: 750});
        return pending;
    }
    if row.status == types:CACHE_OP_EXPIRED {
        http:Response expired = new;
        expired.statusCode = 504;
        expired.setJsonPayload({
            status: types:CACHE_OP_EXPIRED,
            operationId: operationId,
            "error": {
                "message": "The runtime did not confirm this operation. Check the target's " +
                    "state before retrying — it may or may not have been applied."
            }
        });
        return expired;
    }
    json outcome = ();
    string? result = row.result;
    if result is string {
        json|error parsed = result.fromJsonString();
        if parsed is json {
            outcome = parsed;
        }
    }
    int status = 200;
    json body = ();
    if outcome is map<json> {
        json? httpStatus = outcome["httpStatus"];
        if httpStatus is int {
            status = httpStatus;
        }
        body = outcome["body"];
    }
    http:Response response = new;
    response.statusCode = status;
    setTunneledBody(response, body);
    return response;
}

isolated function tunnelErrorResponse(int statusCode, string message) returns http:Response {
    http:Response response = new;
    response.statusCode = statusCode;
    response.setJsonPayload({"error": {"message": message}});
    return response;
}

// ── Sweeping ───────────────────────────────────────────────────────────────

# The kinds whose rows should be dropped sooner than the backstop window.
#
# One entry, and it is the point of the mechanism: an MI log file is megabytes that nobody
# re-reads, and keeping it for the half hour a workflow list earns is storage spent on
# nothing. Everything absent from this map is swept by the backstop.
isolated function tunnelRetentionByKind() returns map<int> => {
    [CACHE_KIND_MI_READ]: MI_STALE_SERVE_SECONDS
};

# Hands each expired mutation to the feature that queued it.
#
# The single place a cache kind is recognised, in the manner of the bridge's
# `tunneledCommandBinding`: adding a tunneled feature means adding an arm. It earns its
# place — without it every expired MI logger write was announced as "a workflow operation
# never confirmed by the integration", to operators who have no workflows.
isolated function reportExpiredOperations(types:CacheOperation[] expired) {
    foreach types:CacheOperation row in expired {
        match row.kind {
            CACHE_KIND_WORKFLOW_OPERATION => {
                reportExpiredWorkflowOperation(row);
            }
            CACHE_KIND_MI_OPERATION => {
                reportExpiredMIOperation(row);
            }
            _ => {
                log:printWarn("An operation of an unrecognised kind expired unconfirmed",
                        operationId = row.operationId, kind = row.kind);
            }
        }
    }
}

# Runs on a timer on every node; every statement is idempotent, so two nodes sweeping is
# harmless and needs no leader election.
public isolated function sweepTunnelState() {
    // Fetches nobody answered are given up on first. Left alone they keep their token, so
    // every heartbeat re-offers them and every poll on them reads as "still fetching" — a
    // question nobody could answer, asked dozens of times, and a caller never told.
    //
    // The row keeps its data: that is where the request lives, and a retry needs it to build
    // a command. `status` carries the failure on its own.
    int|error abandoned = storage:abandonExpiredCacheFetches(TUNNEL_FAILED_READ_TTL_SECONDS);
    if abandoned is error {
        log:printError("Failed to abandon expired cache fetches", abandoned);
    } else if abandoned > 0 {
        log:printWarn(string `${abandoned} cache fetch(es) went unanswered and were abandoned`);
    }

    types:CacheOperation[]|error expired = storage:sweepCacheTables(TUNNEL_STALE_SERVE_SECONDS,
            tunnelRetentionByKind(), TUNNEL_COMPLETED_RETENTION_SECONDS);
    if expired is error {
        log:printError("The tunnel sweep failed", expired);
        return;
    }
    reportExpiredOperations(expired);
}

// How long a failed read stands before a retry, and how long an abandoned fetch waits.
// Both features settled on the same number, so it lives here rather than twice.
const int TUNNEL_FAILED_READ_TTL_SECONDS = 15;

// How long a recorded outcome stays readable by the console after it finished. Short: the
// audit trail lives in audit_logs, so the row itself only has to outlast the poll that
// reads it.
const int TUNNEL_COMPLETED_RETENTION_SECONDS = 300;
