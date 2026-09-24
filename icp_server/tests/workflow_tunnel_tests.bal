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

import ballerina/test;

// The stateless tunnel, tested against the database it actually uses. These replace the
// unit tests of the in-memory queue that this design removed: the behaviour that matters
// now is what two ICP nodes see in shared tables, and that cannot be tested in memory.
//
// The seeded sample-integration runtime supplies a real scope, since delivery resolves a
// runtime's component and environment from the runtimes table.

const string WF_TUNNEL_RUNTIME_ID = "880e8400-e29b-41d4-a716-446655440001";
const string WF_TUNNEL_COMPONENT_ID = "640e8400-e29b-41d4-a716-446655440001";
const string WF_TUNNEL_ENVIRONMENT_ID = "750e8400-e29b-41d4-a716-446655440001";
final string WF_TUNNEL_SCOPE = WF_TUNNEL_COMPONENT_ID + ":" + WF_TUNNEL_ENVIRONMENT_ID;

isolated function tunnelRequest(string operation) returns string =>
    {operation: operation, params: {}, identity: {userId: "alice", roles: ["APPROVER"]}}
        .toJsonString();

// ── Coalescing ───────────────────────────────────────────────────────────────

@test:Config {groups: ["workflow_tunnel"]}
function testConcurrentReadsCoalesceOntoOneFetch() returns error? {
    string cacheKey = "coalesce-" + storage:cacheNowEpoch().toString();
    int expiresAt = storage:cacheNowEpoch() + 60;

    boolean first = check storage:startCacheFetch(cacheKey, "workflow.read", WF_TUNNEL_SCOPE,
            tunnelRequest("humanTasks.list"), "fetch-1", expiresAt);
    test:assertTrue(first, "The first request must own the fetch");

    // A second request for the same key - from this node or any other - must not issue a
    // second command. The primary key is what makes that true, with no lock and no
    // read-then-write window.
    boolean second = check storage:startCacheFetch(cacheKey, "workflow.read", WF_TUNNEL_SCOPE,
            tunnelRequest("humanTasks.list"), "fetch-2", expiresAt);
    test:assertFalse(second, "A concurrent identical request must attach to the running fetch");

    types:CacheEntry? row = check storage:getCacheEntry(cacheKey);
    test:assertTrue(row is types:CacheEntry, "The row must exist");
    if row is types:CacheEntry {
        test:assertEquals(row.token, "fetch-1", "The first attempt must still own the fetch");
        test:assertEquals(row.status, types:CACHE_FETCHING);
    }
}

// ── Fencing ──────────────────────────────────────────────────────────────────

@test:Config {groups: ["workflow_tunnel"]}
function testResultFromASupersededAttemptIsDiscarded() returns error? {
    string cacheKey = "fence-" + storage:cacheNowEpoch().toString();
    int now = storage:cacheNowEpoch();
    _ = check storage:startCacheFetch(cacheKey, "workflow.read", WF_TUNNEL_SCOPE,
            tunnelRequest("instances.list"), "attempt-1", now + 60);

    // The attempt that is current wins.
    boolean stored = check storage:completeCacheFetch(cacheKey, "attempt-1",
            "{\"body\":\"first\"}", now + 60);
    test:assertTrue(stored, "The current attempt's result must be stored");

    // Now the row genuinely belongs to a DIFFERENT attempt, which is the case worth fencing:
    // the entry went stale, a refresh claimed it, and the first attempt's runtime is still
    // out there holding an answer. Re-using the old token instead would only prove that a
    // completed fetch cannot be completed twice — true, and much weaker.
    _ = check storage:claimCacheRefresh(cacheKey, "attempt-2", now + 60);

    boolean late = check storage:completeCacheFetch(cacheKey, "attempt-1",
            "{\"body\":\"stale\"}", now + 60);
    test:assertFalse(late, "A result whose attempt is no longer current must be discarded");

    types:CacheEntry? row = check storage:getCacheEntry(cacheKey);
    if row is types:CacheEntry {
        test:assertEquals(row.data, "{\"body\":\"first\"}",
            "The stored payload must not be overwritten by a superseded attempt");
        test:assertEquals(row.token, "attempt-2",
            "The refresh that owns the row must still be in flight after a late answer");
    }

    // And the attempt that does own it can still answer.
    boolean current = check storage:completeCacheFetch(cacheKey, "attempt-2",
            "{\"body\":\"second\"}", now + 60);
    test:assertTrue(current, "The owning attempt's result must be stored");
    types:CacheEntry? settled = check storage:getCacheEntry(cacheKey);
    if settled is types:CacheEntry {
        test:assertEquals(settled.data, "{\"body\":\"second\"}");
        test:assertEquals(settled.token, (), "A completed fetch must leave no attempt in flight");
    }
}

@test:Config {groups: ["workflow_tunnel"]}
function testFailedRefreshKeepsTheLastGoodPayload() returns error? {
    string cacheKey = "failkeep-" + storage:cacheNowEpoch().toString();
    int now = storage:cacheNowEpoch();
    _ = check storage:startCacheFetch(cacheKey, "workflow.read", WF_TUNNEL_SCOPE,
            tunnelRequest("instances.list"), "attempt-1", now + 60);
    _ = check storage:completeCacheFetch(cacheKey, "attempt-1", "{\"body\":\"good\"}",
            now + 60);

    boolean claimed = check storage:claimCacheRefresh(cacheKey, "attempt-2", now + 60);
    test:assertTrue(claimed, "A row with nothing in flight must be claimable for refresh");

    _ = check storage:failCacheFetch(cacheKey, "attempt-2", "{\"error\":\"boom\"}",
            now + 15);
    types:CacheEntry? row = check storage:getCacheEntry(cacheKey);
    if row is types:CacheEntry {
        test:assertEquals(row.data, "{\"body\":\"good\"}",
            "A failed refresh must keep serving the last good answer");
        test:assertEquals(row.status, types:CACHE_READY);
    }
}

@test:Config {groups: ["workflow_tunnel"]}
function testOnlyOneRefreshRunsAtATime() returns error? {
    string cacheKey = "onerefresh-" + storage:cacheNowEpoch().toString();
    int now = storage:cacheNowEpoch();
    _ = check storage:startCacheFetch(cacheKey, "workflow.read", WF_TUNNEL_SCOPE,
            tunnelRequest("workItems.list"), "attempt-1", now + 60);
    _ = check storage:completeCacheFetch(cacheKey, "attempt-1", "{\"body\":\"x\"}", now);

    test:assertTrue(check storage:claimCacheRefresh(cacheKey, "refresh-1", now + 60));
    test:assertFalse(check storage:claimCacheRefresh(cacheKey, "refresh-2", now + 60),
        "A second reader must not start a competing refresh");
}

// ── Invalidation ─────────────────────────────────────────────────────────────

@test:Config {groups: ["workflow_tunnel"]}
function testMutationStalesLiveEntriesAndSparesTerminalOnes() returns error? {
    int now = storage:cacheNowEpoch();
    string liveKey = "live-" + now.toString();
    string terminalKey = "terminal-" + now.toString();

    _ = check storage:startCacheFetch(liveKey, "workflow.read", WF_TUNNEL_SCOPE,
            tunnelRequest("humanTasks.list"), "live-attempt", now + 60);
    _ = check storage:completeCacheFetch(liveKey, "live-attempt", "{\"body\":1}", now + 60);

    // A closed instance's views cannot be falsified by anything, so they carry a long TTL
    // and must survive invalidation - that is what keeps finished work readable while the
    // runtime is down.
    _ = check storage:startCacheFetch(terminalKey, "workflow.read", WF_TUNNEL_SCOPE,
            tunnelRequest("instances.get"), "terminal-attempt", now + 60);
    _ = check storage:completeCacheFetch(terminalKey, "terminal-attempt",
            "{\"body\":2}", now + 86400);

    int marked = check storage:staleCacheOwner(WF_TUNNEL_SCOPE, 3600);
    test:assertTrue(marked >= 1, "The live entry must be marked stale");

    types:CacheEntry? live = check storage:getCacheEntry(liveKey);
    types:CacheEntry? terminal = check storage:getCacheEntry(terminalKey);
    if live is types:CacheEntry {
        test:assertTrue(live.expiresAt <= now + 1, "The live entry must now be stale");
        test:assertEquals(live.data, "{\"body\":1}",
            "Invalidation must mark, not delete: a stale entry is still served while it refreshes");
    }
    if terminal is types:CacheEntry {
        test:assertTrue(terminal.expiresAt > now + 3600,
            "A terminal entry must not be invalidated by a mutation");
    }
}

// ── Delivery bounds ──────────────────────────────────────────────────────────

@test:Config {groups: ["workflow_tunnel"]}
function testReadClaimIsBoundedAndNotReofferedImmediately() returns error? {
    int now = storage:cacheNowEpoch();
    string scope = "claimscope-" + now.toString();
    foreach int i in 0 ..< 5 {
        _ = check storage:startCacheFetch(string `claim-${now}-${i}`, "workflow.read", scope,
                tunnelRequest("humanTasks.list"), string `attempt-${i}`, now + 60);
    }

    types:CachePendingFetch[] firstBatch = check storage:claimCacheFetches(scope, 2);
    test:assertEquals(firstBatch.length(), 2,
        "A heartbeat must never carry more than the cap, whatever the backlog");

    // Already-claimed reads are not offered again on the next heartbeat a second later;
    // without that a boosted runtime would be sent the same in-flight read every second.
    types:CachePendingFetch[] secondBatch = check storage:claimCacheFetches(scope, 5);
    test:assertEquals(secondBatch.length(), 3,
        "Only unclaimed reads may be delivered again this soon");
}

// ── Mutations ────────────────────────────────────────────────────────────────

@test:Config {groups: ["workflow_tunnel"]}
function testIdempotencyKeyPreventsADuplicateOperation() returns error? {
    int now = storage:cacheNowEpoch();
    types:CacheOperation operation = {
        operationId: "wfo-idem-" + now.toString(),
        target: WF_TUNNEL_RUNTIME_ID,
        owner: WF_TUNNEL_SCOPE,
        kind: "workflow.operation",
        status: types:CACHE_OP_PENDING,
        issuedAt: now,
        deadline: now + 1800,
        data: tunnelRequest("humanTasks.complete")
    };
    test:assertTrue(check storage:enqueueCacheOperation(operation),
        "The first submission must be queued");
    test:assertFalse(check storage:enqueueCacheOperation(operation),
        "A resubmitted click must not become a second operation");
}

@test:Config {groups: ["workflow_tunnel"]}
function testOutcomeIsRecordedExactlyOnce() returns error? {
    int now = storage:cacheNowEpoch();
    string operationId = "wfo-once-" + now.toString();
    _ = check storage:enqueueCacheOperation({
        operationId: operationId,
        target: WF_TUNNEL_RUNTIME_ID,
        owner: WF_TUNNEL_SCOPE,
        kind: "workflow.operation",
        status: types:CACHE_OP_PENDING,
        issuedAt: now,
        deadline: now + 1800,
        data: tunnelRequest("instances.terminate")
    });

    types:CacheOperation[] claimed =
        check storage:claimCacheOperations(WF_TUNNEL_RUNTIME_ID, 10);
    test:assertTrue(claimed.length() >= 1, "The queued mutation must be claimable");

    // Whichever node wins this write is the node that raises the notification or writes the
    // audit record, so a redelivered result cannot double-report an outcome.
    test:assertTrue(check storage:completeCacheOperation(operationId, types:CACHE_OP_COMPLETED,
            "{\"httpStatus\":200}"), "The first result must be recorded");
    test:assertFalse(check storage:completeCacheOperation(operationId, types:CACHE_OP_COMPLETED,
            "{\"httpStatus\":200}"), "A duplicate result must record nothing");

    types:CacheOperation? stored = check storage:getCacheOperation(operationId);
    if stored is types:CacheOperation {
        test:assertEquals(stored.status, types:CACHE_OP_COMPLETED);
    }
}

@test:Config {groups: ["workflow_tunnel"]}
function testMutationClaimIsAddressedAndBounded() returns error? {
    int now = storage:cacheNowEpoch();
    // Addressed to a runtime that is not the seeded one: claiming for that runtime must
    // return nothing. The bridge's replay cache is per process, so a mutation reaching a
    // second runtime of the same integration would execute twice.
    _ = check storage:enqueueCacheOperation({
        operationId: "wfo-addressed-" + now.toString(),
        target: "990e8400-e29b-41d4-a716-4466554400ff",
        owner: WF_TUNNEL_SCOPE,
        kind: "workflow.operation",
        status: types:CACHE_OP_PENDING,
        issuedAt: now,
        deadline: now + 1800,
        data: tunnelRequest("humanTasks.fail")
    });
    types:CacheOperation[] claimed =
        check storage:claimCacheOperations(WF_TUNNEL_RUNTIME_ID, 10);
    foreach types:CacheOperation operation in claimed {
        test:assertEquals(operation.target, WF_TUNNEL_RUNTIME_ID,
            "A mutation must only ever be claimed by the runtime it was addressed to");
    }
}

@test:Config {groups: ["workflow_tunnel"]}
function testDeadlineExpiresAnUnconfirmedMutation() returns error? {
    int now = storage:cacheNowEpoch();
    string operationId = "wfo-expire-" + now.toString();
    _ = check storage:enqueueCacheOperation({
        operationId: operationId,
        target: WF_TUNNEL_RUNTIME_ID,
        owner: WF_TUNNEL_SCOPE,
        kind: "workflow.operation",
        status: types:CACHE_OP_PENDING,
        issuedAt: now - 3600,
        deadline: now - 60,
        data: tunnelRequest("instances.suspend")
    });

    // A past deadline must also make the row undeliverable, not merely sweepable: this is
    // what stops a backlog being handed to a runtime that comes back after an outage.
    types:CacheOperation[] claimed =
        check storage:claimCacheOperations(WF_TUNNEL_RUNTIME_ID, 10);
    foreach types:CacheOperation operation in claimed {
        test:assertNotEquals(operation.operationId, operationId,
            "An expired mutation must never be delivered");
    }

    types:CacheOperation[] expired = check storage:sweepCacheTables(2100, {}, 300);
    // The sweeper must name what it expired: an unconfirmed mutation nobody can name is one
    // nobody can be told about.
    boolean named = false;
    foreach types:CacheOperation row in expired {
        if row.operationId == operationId {
            named = true;
        }
    }
    test:assertTrue(named, "The sweeper must report the operation it expired");
    types:CacheOperation? swept = check storage:getCacheOperation(operationId);
    if swept is types:CacheOperation {
        test:assertEquals(swept.status, types:CACHE_OP_EXPIRED,
            "An unconfirmed mutation must end EXPIRED so it can be surfaced, not dropped");
    }
}

// ── Boost ────────────────────────────────────────────────────────────────────

@test:Config {groups: ["workflow_tunnel"]}
function testBoostWindowIsSharedThroughTheDatabase() returns error? {
    int until = storage:cacheNowEpoch() + 30;
    check storage:boostCacheOwner(WF_TUNNEL_COMPONENT_ID, WF_TUNNEL_ENVIRONMENT_ID, until, until);
    // Any node answering this runtime's heartbeat reads the same window, which is the point:
    // an in-memory window would boost only the node that served the user's request.
    int remaining = check storage:cacheBoostRemaining(WF_TUNNEL_RUNTIME_ID);
    test:assertTrue(remaining > 0 && remaining <= 30,
        "The boost window must be visible to every node, got: " + remaining.toString());
}

@test:Config {groups: ["workflow_tunnel"]}
function testUnansweredFetchIsAbandonedRatherThanReoffered() returns error? {
    int now = storage:cacheNowEpoch();
    string cacheKey = "abandon-" + now.toString();
    string scope = "abandonscope-" + now.toString();
    // A fetch whose deadline has already passed: nobody answered it.
    _ = check storage:startCacheFetch(cacheKey, "workflow.read", scope,
            tunnelRequest("instances.list"), "attempt-gone", now - 5);

    // It must not be handed to a runtime again — that was dozens of commands for a question
    // nobody could answer.
    types:CachePendingFetch[] offered = check storage:claimCacheFetches(scope, 10);
    test:assertEquals(offered.length(), 0, "An expired fetch must not be offered again");

    int abandoned = check storage:abandonExpiredCacheFetches(15);
    test:assertTrue(abandoned >= 1, "The expired fetch must be abandoned");

    // And the caller polling it gets an answer instead of an eternal "still fetching".
    types:CacheEntry? row = check storage:getCacheEntry(cacheKey);
    if row is types:CacheEntry {
        test:assertEquals(row.token, (), "An abandoned fetch must leave nothing in flight");
        test:assertEquals(row.status, types:CACHE_FAILED);
        // The request survives the failure, because a retry has to ask the same question
        // again. Overwriting it with a failure notice made the row unrecoverable: the view
        // answered 504 for as long as the row lived, with nothing left to re-ask.
        string? data = row.data;
        test:assertTrue(data is string && data.includes("instances.list"),
                "An abandoned fetch must keep the request a retry needs");
    }
}

@test:Config {groups: ["workflow_tunnel"]}
function testOneDecisionPerTaskReachesTheRuntime() returns error? {
    // Two users deciding one task must produce ONE queued operation. The runtime cannot arbitrate
    // this for us: it accepts a second taskCompletion signal whenever it arrives before the task
    // workflow closes, so both callers were told they had succeeded while one decision was
    // silently discarded. The outbox is where it can be settled, because the id is derived from
    // the task rather than from the caller.
    int now = storage:cacheNowEpoch();
    string taskId = "humantask-decide-" + now.toString();
    string first = decisionOperationId(WF_TUNNEL_SCOPE, taskId);
    string second = decisionOperationId(WF_TUNNEL_SCOPE, taskId);
    test:assertEquals(first, second, "One task must always produce one decision id");

    types:CacheOperation decision = {
        operationId: first,
        target: WF_TUNNEL_RUNTIME_ID,
        kind: "workflow.operation",
        owner: WF_TUNNEL_SCOPE,
        status: types:CACHE_OP_PENDING,
        issuedAt: now,
        deadline: now + 60,
        data: {operation: "humanTasks.complete", params: {taskId: taskId},
                identity: {userId: "user-a", roles: ["APPROVER"]}}.toJsonString()
    };
    test:assertTrue(check storage:enqueueCacheOperation(decision),
            "The first decision must be queued");

    types:CacheOperation racing = decision.clone();
    racing.data = {operation: "humanTasks.complete", params: {taskId: taskId},
            identity: {userId: "user-b", roles: ["APPROVER"]}}.toJsonString();
    test:assertFalse(check storage:enqueueCacheOperation(racing),
            "A second user's decision on the same task must not be queued");

    // And the stored row still belongs to whoever got there first, which is what the refusal
    // tells the loser.
    types:CacheOperation? stored = check storage:getCacheOperation(first);
    if stored is types:CacheOperation {
        test:assertEquals(operationActor(stored), "user-a",
                "The queued decision must remain the first user's");
    } else {
        test:assertFail("The first decision should still be queued");
    }
}

@test:Config {groups: ["workflow_tunnel"]}
function testASweepReportsOnlyWhatItExpired() returns error? {
    int now = storage:cacheNowEpoch();
    string operationId = "wfo-sweepdedup-" + now.toString();
    _ = check storage:enqueueCacheOperation({
        operationId: operationId,
        target: WF_TUNNEL_RUNTIME_ID,
        owner: WF_TUNNEL_SCOPE,
        kind: "workflow.operation",
        status: types:CACHE_OP_PENDING,
        issuedAt: now - 3600,
        deadline: now - 60,
        data: tunnelRequest("humanTasks.complete")
    });

    types:CacheOperation[] first = check storage:sweepCacheTables(2100, {}, 300);
    test:assertTrue(first.some(o => o.operationId == operationId),
        "The sweep that expires an operation must report it");

    // Every node runs this sweep on the same interval. A second pass must report nothing for
    // the same operation, or two nodes would raise two notifications for one lost outcome.
    types:CacheOperation[] second = check storage:sweepCacheTables(2100, {}, 300);
    test:assertFalse(second.some(o => o.operationId == operationId),
        "A later sweep must not re-report an operation it did not expire");
}

@test:Config {groups: ["workflow_tunnel"]}
function testTwoUsersDoNotShareOneCachedTaskList() {
    // A human task list is filtered per user inside the integration — a task assigned to
    // Alice, or one that excludes her, answers differently for Bob. Roles alone used to key
    // the entry, so two colleagues with the same role read each other's queue.
    map<json> params = {taskQueue: "approvals"};
    string[] roles = ["reviewer"];

    string alice = workflowCacheKey(WF_TUNNEL_SCOPE, "humanTasks.list", params, roles, "alice");
    string bob = workflowCacheKey(WF_TUNNEL_SCOPE, "humanTasks.list", params, roles, "bob");
    string aliceAgain = workflowCacheKey(WF_TUNNEL_SCOPE, "humanTasks.list", params, roles, "alice");

    test:assertNotEquals(alice, bob, "two users must not share one entry");
    test:assertEquals(alice, aliceAgain, "the same user must reuse their own entry");
}

@test:Config {groups: ["workflow_tunnel"]}
function testTheReadTheRuntimeRunsNamesItsCaller() returns error? {
    // The integration applies its own role check, so the request carries who is asking.
    // The tunnel passes it through unread; losing it here would have the integration
    // filtering for nobody.
    json request = check workflowRequestDocument("humanTasks.list", {}, ["reviewer"], "alice")
        .fromJsonString();
    json identity = check request.identity;

    test:assertEquals(check identity.userId, "alice");
    test:assertEquals(check request.actorId, "alice", "the audit trail names the same caller");
}
