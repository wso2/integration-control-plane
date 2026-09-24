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

import icp_server.mi_management;
import icp_server.storage;
import icp_server.types;

import ballerina/http;
import ballerina/test;

// What MI management adds to the shared tunnel: reads owned by ONE runtime rather than by
// the component, and a result routed by its own command-id prefix.

// Fresh per run: rows are keyed by owner and the suite shares one database with every
// previous run of itself, so a fixed id would have this counting yesterday's fetches.
final string MI_TUNNEL_RUNTIME_A = "mi-a-" + storage:cacheNowEpoch().toString();
final string MI_TUNNEL_RUNTIME_B = "mi-b-" + storage:cacheNowEpoch().toString();

@test:Config {groups: ["mi_tunnel"]}
function testAReadBelongsToOneRuntimeNotItsComponent() returns error? {
    // Two replicas of one component behind a load balancer. `/management/logs` lists the
    // files on the node that answers, so a read asked of A must never be handed to B — the
    // reason MI's owner is the runtime and the workflow tunnel's is the scope.
    string cacheKey = "mi-owner-" + storage:cacheNowEpoch().toString();
    int expiresAt = storage:cacheNowEpoch() + 60;
    boolean owns = check storage:startCacheFetch(cacheKey, CACHE_KIND_MI_READ,
            miReadOwner(MI_TUNNEL_RUNTIME_A),
            miRequestDocument("GET", "/management/logs", (), "alice"), "fetch-a", expiresAt);
    test:assertTrue(owns);

    types:CachePendingFetch[] toSibling =
        check storage:claimCacheFetches(miReadOwner(MI_TUNNEL_RUNTIME_B), 10);
    test:assertEquals(toSibling.length(), 0, "A sibling replica must not be offered A's read");

    types:CachePendingFetch[] toOwner =
        check storage:claimCacheFetches(miReadOwner(MI_TUNNEL_RUNTIME_A), 10);
    test:assertEquals(toOwner.length(), 1, "The runtime it was asked of must be offered it");
    test:assertEquals(toOwner[0].cacheKey, cacheKey);
}

@test:Config {groups: ["mi_tunnel"]}
function testTheCommandCarriesAMethodAndPath() returns error? {
    // The vocabulary is the management API itself, not a list of operation names both sides
    // have to agree on. Whatever the console asked for travels through unchanged.
    types:ControlCommand command = check tunneledCommand(types:MI_MGMT, MI_TUNNEL_RUNTIME_A,
            readCommandId(MI_READ_COMMAND_PREFIX, "key", "tok"),
            check miRequestDocument("GET", "/management/apis?apiName=Foo", (), "alice")
                .fromJsonString(),
            storage:cacheNowEpoch() + 60);

    test:assertEquals(command.action, types:MI_MGMT);
    map<json> payload = check (check (command.payload ?: "").fromJsonString()).ensureType();
    map<json> params = check payload["params"].ensureType();
    test:assertEquals(params["method"], "GET");
    test:assertEquals(params["path"], "/management/apis?apiName=Foo");
    test:assertTrue(payload["deadline"] is string, "A command must carry a deadline");
}

@test:Config {groups: ["mi_tunnel"]}
function testAnAnsweredReadIsServedAndThenGoesStale() returns error? {
    string cacheKey = "mi-answer-" + storage:cacheNowEpoch().toString();
    int now = storage:cacheNowEpoch();
    string request = miRequestDocument("GET", "/management/logging", (), "alice");
    _ = check storage:startCacheFetch(cacheKey, CACHE_KIND_MI_READ,
            miReadOwner(MI_TUNNEL_RUNTIME_A), request, "fetch-1", now + 60);

    // The result comes back on the same round trip a workflow result does, and is routed by
    // its prefix alone.
    boolean recorded = recordTunneledCommandResult({
        runtimeId: MI_TUNNEL_RUNTIME_A,
        commandId: readCommandId(MI_READ_COMMAND_PREFIX, cacheKey, "fetch-1"),
        status: "COMPLETED",
        httpStatus: 200,
        body: {count: 1, list: [{name: "org.apache.synapse", level: "INFO"}]}
    });
    test:assertTrue(recorded, "The answer must land on the row that asked for it");

    types:CacheEntry? row = check storage:getCacheEntry(cacheKey);
    test:assertTrue(row is types:CacheEntry);
    if row is types:CacheEntry {
        test:assertEquals(row.status, types:CACHE_READY);
        test:assertEquals(row.expiresAt, now + MI_READ_TTL_SECONDS);
        TunneledReadOutcome outcome = check readOutcomeFromPayload(row.data ?: "", row, now);
        test:assertEquals(outcome.state, "READY");
        test:assertFalse(outcome.stale);
        map<json> body = check outcome.body.ensureType();
        test:assertEquals(body["count"], 1, "The runtime's answer is served unchanged");
    }

    // A successful mutation on the same runtime stales its reads, so the view comes back for
    // what it just changed instead of serving what it changed away from.
    string operationId = MI_OPERATION_COMMAND_PREFIX + "op-" + now.toString();
    _ = check storage:enqueueCacheOperation({
        operationId: operationId,
        target: MI_TUNNEL_RUNTIME_A,
        kind: CACHE_KIND_MI_OPERATION,
        owner: miReadOwner(MI_TUNNEL_RUNTIME_A),
        status: types:CACHE_OP_PENDING,
        issuedAt: now,
        deadline: now + 120,
        data: miRequestDocument("PATCH", "/management/logging", {loggingLevel: "DEBUG"}, "alice")
    });
    // As delivery would: an outcome is only accepted for an operation already handed over.
    types:CacheOperation[] delivered = check storage:claimCacheOperations(MI_TUNNEL_RUNTIME_A, 10);
    test:assertEquals(delivered.length(), 1);
    test:assertTrue(recordTunneledCommandResult({
        runtimeId: MI_TUNNEL_RUNTIME_A,
        commandId: operationId,
        status: "COMPLETED",
        httpStatus: 200,
        body: {message: "Successfully updated"}
    }));

    types:CacheEntry? afterMutation = check storage:getCacheEntry(cacheKey);
    if afterMutation is types:CacheEntry {
        test:assertTrue(afterMutation.expiresAt <= storage:cacheNowEpoch(),
                "A write must stale this runtime's reads");
    }
}

@test:Config {groups: ["mi_tunnel"]}
function testLargeAnswersAreSweptLongBeforeWorkflowOnes() returns error? {
    // The reason MI declares a stale window at all. A log file is megabytes that nobody
    // re-reads; a workflow list is small and worth keeping while its runtime is away. One
    // sweep serves both tables, so the difference has to live in the retention it is given.
    int now = storage:cacheNowEpoch();
    string miKey = "mi-sweep-" + now.toString();
    string wfKey = "wf-sweep-" + now.toString();
    // Both expired the same long time ago — past MI's window, inside workflow's.
    int expiredAt = now - MI_STALE_SERVE_SECONDS - 60;
    _ = check storage:startCacheFetch(miKey, CACHE_KIND_MI_READ, miReadOwner(MI_TUNNEL_RUNTIME_A),
            miRequestDocument("GET", "/management/logs?file=big.log", (), "alice"), "f1", expiredAt);
    _ = check storage:startCacheFetch(wfKey, CACHE_KIND_WORKFLOW_READ, "scope-" + now.toString(),
            "{\"operation\":\"instances.list\"}", "f2", expiredAt);

    _ = check storage:sweepCacheTables(TUNNEL_STALE_SERVE_SECONDS, tunnelRetentionByKind(),
            TUNNEL_COMPLETED_RETENTION_SECONDS);

    test:assertTrue(check storage:getCacheEntry(miKey) is (),
            "An MI answer past its own window must be swept, whatever the backstop allows");
    test:assertTrue(check storage:getCacheEntry(wfKey) is types:CacheEntry,
            "A workflow answer inside the backstop window must survive the same sweep");
}

@test:Config {groups: ["mi_tunnel"]}
function testEveryManagementWriteIsAuditable() {
    // The tunnel carries a method and a path and no notion of what they mean, which costs
    // the audit trail its knowledge of what a write was: creating a user on a runtime is
    // exactly the thing the log exists for. The meaning is recovered from the route, never
    // from the caller, and a route with no specific name is still recorded rather than lost.
    // Each record must name what it changed, and what a write names is not always in its
    // path — a logger is named in the payload, a user in the URL. "A log level changed on
    // this runtime" is not an audit record anyone can act on.
    [string, string, string] createUser =
        miAuditSubject("POST", "/management/users", {userId: "alice", isAdmin: true});
    test:assertEquals(createUser[0], storage:AUDIT_MI_USER_CREATE);
    test:assertEquals(createUser[1], storage:AUDIT_RESOURCE_USER);
    test:assertEquals(createUser[2], "alice", "from the payload");

    [string, string, string] deleteUser = miAuditSubject("DELETE", "/management/users/alice?domain=primary");
    test:assertEquals(deleteUser[0], storage:AUDIT_MI_USER_DELETE);
    test:assertEquals(deleteUser[2], "alice", "from the URL");
    test:assertEquals(miAuditSubject("DELETE", "/management/users/alice%40corp")[2], "alice@corp",
            "from the URL, decoded, so a search for the name finds it");

    [string, string, string] setLevel =
        miAuditSubject("PATCH", "/management/logging", {loggerName: "SynapseCtl", loggingLevel: "DEBUG"});
    test:assertEquals(setLevel[0], storage:AUDIT_LOG_LEVEL_CHANGE);
    test:assertEquals(setLevel[2], "SynapseCtl", "from the payload");

    [string, string, string] dropLogger =
        miAuditSubject("DELETE", "/management/logging?loggerName=Synapse%20Ctl");
    test:assertEquals(dropLogger[0], storage:AUDIT_LOGGER_DELETE);
    test:assertEquals(dropLogger[2], "Synapse Ctl", "from the query, decoded");

    test:assertEquals(miAuditSubject("POST", "/management/something-new")[0],
            storage:AUDIT_MI_MANAGEMENT_WRITE, "An unnamed write is still audited");
}

@test:Config {groups: ["mi_tunnel"]}
function testAQueuedWriteCarriesWhereItWasAskedFromButDoesNotTellTheRuntime() returns error? {
    json document = check miRequestDocument("DELETE", "/management/users/alice", (), "u-1", "10.0.0.7")
        .fromJsonString();
    test:assertEquals(check document.clientIp, "10.0.0.7");
    test:assertEquals(check document.identity.userId, "u-1");

    types:ControlCommand command = check tunneledCommand(types:MI_MGMT, "runtime-1", "mio-1",
            document, storage:cacheNowEpoch() + 60);
    string delivered = command.payload ?: "";
    test:assertFalse(delivered.includes("10.0.0.7"), "the caller's address must not be delivered");
    test:assertTrue(delivered.includes("/management/users/alice"), "the call itself still is");
}

@test:Config {groups: ["mi_tunnel"]}
function testEveryPathIsBuiltHereAndEncoded() returns error? {
    // A command carries a path to an agent that executes it against its own loopback, so
    // what may be asked of a runtime is decided by what this module can spell. Nothing a
    // caller supplies reaches the path unencoded, which is what keeps a file name or a
    // registry path from becoming a second query parameter or a traversal.
    test:assertEquals(check mi_management:artifactPath("api", "Hello Api"),
            "/management/apis?apiName=Hello%20Api");
    test:assertEquals(check mi_management:logFilePath("../../conf/deployment.toml"),
            "/management/logs?file=..%2F..%2Fconf%2Fdeployment.toml",
            "A traversal survives as a file name, not as a path");
    test:assertEquals(check mi_management:registryPath("registry/governance"),
            "/management/registry-resources?path=registry%2Fgovernance");
    test:assertEquals(check mi_management:userPath("alice", "secondary"),
            "/management/users/alice?domain=secondary");
    test:assertEquals(check mi_management:userPath("alice"), "/management/users/alice",
            "The primary domain is the one MI assumes");

    // A template is named by its type as well, and an artifact type this module does not
    // know is one the ICP cannot ask about.
    test:assertEquals(check mi_management:artifactPath("template", "T", "endpoint"),
            "/management/templates?name=T&type=endpoint");
    test:assertTrue(mi_management:artifactPath("template", "T") is error);
    test:assertTrue(mi_management:artifactPath("carbonapps", "X") is error);
}

@test:Config {groups: ["mi_tunnel"]}
function testAWriteIsGivenUpOnAtItsDeadlineNotAtTheSweep() {
    // The sweep marks expired operations every few minutes; a write's deadline is two.
    // Between the two the row still says PENDING, and a caller polling it must be told the
    // truth then — otherwise the console's own timeout answers instead, with a message the
    // server never sent.
    int now = storage:cacheNowEpoch();
    types:CacheOperation pending = operationRow(types:CACHE_OP_PENDING, now + 60);
    types:CacheOperation overdue = operationRow(types:CACHE_OP_DELIVERED, now - 1);
    types:CacheOperation swept = operationRow(types:CACHE_OP_EXPIRED, now + 60);

    test:assertFalse(operationGaveUp(pending, now), "a write inside its deadline is still live");
    test:assertTrue(operationGaveUp(overdue, now), "a deadline in the past is a dead write");
    test:assertTrue(operationGaveUp(swept, now), "the sweep's verdict still stands");
}

@test:Config {groups: ["mi_tunnel"]}
function testAnAnsweredWriteReportsWhatHappenedHoweverLateItIsAskedAbout() {
    // The deadline says how long the runtime has to answer, not how long its answer is worth.
    // A log level changed at two seconds, polled at two minutes — which the console does, its
    // own deadline being 130s — must read as changed, not as never confirmed. The sweep agrees:
    // it only expires rows that are still PENDING or DELIVERED.
    int now = storage:cacheNowEpoch();
    types:CacheOperation confirmed = operationRow(types:CACHE_OP_COMPLETED, now - 60);
    types:CacheOperation refused = operationRow(types:CACHE_OP_FAILED, now - 60);

    test:assertFalse(operationGaveUp(confirmed, now), "an answered write keeps its answer");
    test:assertFalse(operationGaveUp(refused, now), "and so does a refused one: MI's words are owed");
}

isolated function operationRow(string status, int deadline) returns types:CacheOperation => {
    operationId: "op",
    target: "runtime",
    owner: "mi:runtime",
    kind: CACHE_KIND_MI_OPERATION,
    status: status,
    issuedAt: 0,
    deadline: deadline,
    data: "{}"
};

@test:Config {groups: ["mi_tunnel"]}
function testARequestIdTooLongToBeAnOperationIdIsRefused() returns error? {
    // 100-character column, "mio-" + requestId + "." + a 36-character runtime id.
    string runtimeId = "807e1f21-2711-4ecd-ad4f-b9eff7ad91a2";
    string longestAllowed = "".'join(...from int i in 0 ..< MI_MAX_REQUEST_ID_LENGTH select "q");
    test:assertEquals(miOperationId(runtimeId, longestAllowed).length(), 100);
}

@test:Config {groups: ["mi_tunnel"]}
function testTextKeepsItsBytesAndJsonIsParsed() returns error? {
    // MI serves a registry resource and a log file as application/txt. Reformatting them
    // would make the direct path disagree with the tunnel, which relays text untouched.
    string onDisk = "{\n  \"b\": 1,\n  \"a\": { \"z\": true }\n}\n";
    http:Response asText = new;
    asText.setTextPayload(onDisk, "application/txt");
    test:assertEquals(check relayedBody(asText), onDisk, "text is relayed as sent");

    http:Response asJson = new;
    asJson.setTextPayload(onDisk, "application/json");
    test:assertEquals(check (check relayedBody(asJson)).b, 1, "JSON is still parsed");
}

@test:Config {groups: ["mi_tunnel"]}
function testAResultFromAnotherRuntimeCannotCompleteThisOne() returns error? {
    // The poster's key proves which runtime it is, never which command it was given. An op id
    // is derivable — "mio-" + the console's requestId + "." + a visible runtime id — so a
    // runtime that was never sent this write could answer for it: its outcome would be recorded,
    // the target's own answer dropped as late, and the wrong runtime's reads staled.
    string target = "11111111-1111-4111-8111-111111111111";
    string other = "22222222-2222-4222-8222-222222222222";
    string operationId = "mio-h3-" + storage:cacheNowEpoch().toString() + "." + target;
    int now = storage:cacheNowEpoch();
    _ = check storage:enqueueCacheOperation({
        operationId: operationId,
        target: target,
        owner: miReadOwner(target),
        kind: CACHE_KIND_MI_OPERATION,
        status: types:CACHE_OP_PENDING,
        issuedAt: now,
        deadline: now + 120,
        data: miRequestDocument("PATCH", "/management/logging", (), "u-1")
    });
    // The write has been handed to its runtime: that is the only state an outcome may land on.
    types:CacheOperation[] claimed = check storage:claimCacheOperations(target, 10);
    test:assertEquals(claimed.length(), 1, "the fixture's write must be the one claimed");

    boolean recorded = recordMIOperationResult(operationId, {
        runtimeId: other,
        commandId: operationId,
        status: "COMPLETED",
        httpStatus: 200,
        body: {message: "ok"}
    });

    test:assertFalse(recorded, "only the runtime the write was addressed to may report it");
    types:CacheOperation? row = check storage:getCacheOperation(operationId);
    test:assertTrue(row is types:CacheOperation && row.status == types:CACHE_OP_DELIVERED,
            "the write stays open for its own runtime to answer");

    test:assertTrue(recordMIOperationResult(operationId, {
        runtimeId: target,
        commandId: operationId,
        status: "COMPLETED",
        httpStatus: 200,
        body: {message: "ok"}
    }), "and its own answer still settles it");
}
