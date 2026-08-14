// Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
//
// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

import icp_server.storage as storage;
import icp_server.types;

import ballerina/test;
import ballerina/time;

// Test data from seed: Component 2, Project 1, Dev env
// Component 2 / Dev env has Runtime 3 (OFFLINE, named). Using null-name replicas here
// won't conflict with that record since the OFFLINE cleanup query now filters by name.
const string HB_PROJECT_ID = "650e8400-e29b-41d4-a716-446655440001";
const string HB_COMPONENT_ID = "640e8400-e29b-41d4-a716-446655440002";
const string HB_ENV_ID = "750e8400-e29b-41d4-a716-446655440001";

// Fixed test UUIDs so cleanup is deterministic even if a test aborts mid-way.
const string HB_REPLICA1_ID = "aa000001-test-test-test-000000000001";
const string HB_REPLICA2_ID = "aa000001-test-test-test-000000000002";
const string HB_REPLICA3_ID = "aa000001-test-test-test-000000000003";
// Restart test: dedicated IDs/name that do not overlap with any seeded runtime.
const string HB_RESTART_OLD_ID = "aa000001-test-test-test-000000000007";
const string HB_RESTART_NEW_ID = "aa000001-test-test-test-000000000008";
const string HB_RESTART_NAME = "hb-restart-test-unique-runtime";
// Service-listener binding test: dedicated ID cleaned up via an AfterGroups
// teardown so rows never leak when an assertion aborts the test.
const string HB_SERVICE_LISTENER_ID = "aa000001-test-test-test-000000000010";

// =============================================================================
// Helpers
// =============================================================================

function buildHeartbeat(string runtimeId, string? runtimeName) returns types:Heartbeat {
    return {
        runtimeId: runtimeId,
        runtime: runtimeName,
        runtimeType: "BI",
        status: "RUNNING",
        environment: HB_ENV_ID,
        project: HB_PROJECT_ID,
        component: HB_COMPONENT_ID,
        version: "1.0.0",
        nodeInfo: {platformName: "ballerina"},
        artifacts: {},
        runtimeHash: "test-hash-" + runtimeId,
        timestamp: time:utcNow()
    };
}

function buildMIHeartbeat(string runtimeId) returns types:Heartbeat {
    types:Heartbeat heartbeat = buildHeartbeat(runtimeId, ());
    heartbeat.runtimeType = "MI";
    heartbeat.nodeInfo.platformName = "wso2-mi";
    heartbeat.artifacts.inboundEndpoints = [{
        name: "CustomInboundEP",
        protocol: (),
        sequence: "main",
        state: "enabled",
        tracing: "disabled"
    }];
    heartbeat.runtimeHash = "test-hash-mi-" + runtimeId;
    return heartbeat;
}

function cleanupRuntime(string runtimeId) {
    error? result = storage:deleteRuntime(runtimeId);
    if result is error {
        // Ignore — runtime may have already been cleaned up or was never created.
    }
}

// =============================================================================
// Test: service -> listener binding round-trips through the heartbeat.
//
// A BI heartbeat reports each service with the listener(s) it is attached to
// (serviceDetail.listeners). This must be persisted and returned by
// getServicesForRuntime, enriched with the listener's full detail (port, etc.).
// Covers the many-to-many case the team lead called out: two services attached
// to the SAME listener must both report it.
// =============================================================================
@test:Config {
    groups: ["heartbeat", "service-listener"]
}
function testServiceListenerBindingRoundTrip() returns error? {
    string runtimeId = HB_SERVICE_LISTENER_ID;
    cleanupRuntime(runtimeId);

    types:Heartbeat heartbeat = buildHeartbeat(runtimeId, "hb-service-listener-runtime");
    heartbeat.artifacts = {
        listeners: [
            {name: "httpListenerA", package: "app", protocol: "HTTP", host: "0.0.0.0", port: 8080, state: "enabled"},
            {name: "httpListenerB", package: "app", protocol: "HTTP", host: "0.0.0.0", port: 8081, state: "enabled"}
        ],
        services: [
            {
                name: "orderService",
                package: "app",
                basePath: "/orders",
                'type: "API",
                resources: [],
                // heartbeat sends listeners name-only (as the runtime bridge does)
                listeners: [{name: "httpListenerA"}]
            },
            {
                name: "inventoryService",
                package: "app",
                basePath: "/inventory",
                'type: "API",
                resources: [],
                listeners: [{name: "httpListenerA"}] // same listener -> many-to-one
            }
        ]
    };

    types:HeartbeatResponse resp = check storage:processHeartbeat(heartbeat, preResolved = true);
    test:assertTrue(resp.acknowledged, "Heartbeat should be acknowledged");

    types:Service[] services = check storage:getServicesForRuntime(runtimeId);
    test:assertEquals(services.length(), 2, "Both services should be stored");

    foreach types:Service svc in services {
        test:assertEquals(svc.listeners.length(), 1,
                string `Service ${svc.name} should have exactly one bound listener`);
        test:assertEquals(svc.listeners[0].name, "httpListenerA",
                string `Service ${svc.name} should be bound to httpListenerA`);
        // Enriched from the listener table, not just the name sent by the heartbeat.
        test:assertEquals(svc.listeners[0].port, 8080,
                string `Service ${svc.name} listener should carry the enriched port`);
    }
    // Cleanup is handled by afterServiceListenerTests (runs even if an assert aborts).
}

@test:AfterGroups {
    value: ["service-listener"]
}
function afterServiceListenerTests() {
    cleanupRuntime(HB_SERVICE_LISTENER_ID);
}

// =============================================================================
// Test 1: multi-replica null names — replicas must not delete each other
//
// Regression test for: https://github.com/wso2/product-integrator/issues/1780
//
// Before the fix, replica 2's heartbeat would find replica 1's RUNNING record
// (same component/env/null-name), treat it as a stale old instance, and delete it.
// After the fix (AND status = 'OFFLINE'), RUNNING records are never deleted this way.
// =============================================================================
@test:Config {
    groups: ["heartbeat", "multi-replica"]
}
function testMultiReplicaNullNamesBothSurvive() returns error? {
    // Ensure a clean slate before the test.
    cleanupRuntime(HB_REPLICA1_ID);
    cleanupRuntime(HB_REPLICA2_ID);

    // Replica 1 registers.
    types:HeartbeatResponse r1Response = check storage:processHeartbeat(
            buildHeartbeat(HB_REPLICA1_ID, ()), preResolved = true);
    test:assertTrue(r1Response.acknowledged, "Replica 1 heartbeat should be acknowledged");

    // Replica 2 registers. Before the fix this deleted Replica 1.
    types:HeartbeatResponse r2Response = check storage:processHeartbeat(
            buildHeartbeat(HB_REPLICA2_ID, ()), preResolved = true);
    test:assertTrue(r2Response.acknowledged, "Replica 2 heartbeat should be acknowledged");

    // Both replicas must still exist in the DB.
    types:Runtime? replica1 = check storage:getRuntimeById(HB_REPLICA1_ID);
    test:assertNotEquals(replica1, (), "Replica 1 must still exist after replica 2 registers");

    types:Runtime? replica2 = check storage:getRuntimeById(HB_REPLICA2_ID);
    test:assertNotEquals(replica2, (), "Replica 2 must exist");

    cleanupRuntime(HB_REPLICA1_ID);
    cleanupRuntime(HB_REPLICA2_ID);
}

// =============================================================================
// Test 2: five replicas null names — none of the 5 should delete each other
// =============================================================================
@test:Config {
    groups: ["heartbeat", "multi-replica"]
}
function testFiveReplicasNullNamesAllSurvive() returns error? {
    string[] replicaIds = [
        HB_REPLICA1_ID,
        HB_REPLICA2_ID,
        HB_REPLICA3_ID,
        "aa000001-test-test-test-000000000005",
        "aa000001-test-test-test-000000000006"
    ];

    foreach string id in replicaIds {
        cleanupRuntime(id);
    }

    foreach string id in replicaIds {
        types:HeartbeatResponse resp = check storage:processHeartbeat(
                buildHeartbeat(id, ()), preResolved = true);
        test:assertTrue(resp.acknowledged, string `Replica ${id} heartbeat should be acknowledged`);
    }

    // All 5 must coexist.
    foreach string id in replicaIds {
        types:Runtime? replica = check storage:getRuntimeById(id);
        test:assertNotEquals(replica, (), string `Replica ${id} must still exist after all replicas register`);
    }

    foreach string id in replicaIds {
        cleanupRuntime(id);
    }
}

// =============================================================================
// Test 3: VM restart — an OFFLINE record with the same name must be cleaned up
//
// Self-contained: seeds a dedicated OFFLINE runtime (HB_RESTART_OLD_ID / HB_RESTART_NAME)
// that is unrelated to any other test's data, so this test is order-independent.
// =============================================================================
@test:Config {
    groups: ["heartbeat", "heartbeat-restart"]
}
function testVmRestartCleansUpOfflineRecord() returns error? {
    cleanupRuntime(HB_RESTART_OLD_ID);
    cleanupRuntime(HB_RESTART_NEW_ID);

    // Seed the "old" runtime as RUNNING first, then mark it OFFLINE to simulate a stale instance.
    _ = check storage:processHeartbeat(
            buildHeartbeat(HB_RESTART_OLD_ID, HB_RESTART_NAME), preResolved = true);
    check storage:updateRuntimeStatus(HB_RESTART_OLD_ID, "OFFLINE");

    // New instance comes up with the same name but a fresh UUID.
    types:HeartbeatResponse resp = check storage:processHeartbeat(
            buildHeartbeat(HB_RESTART_NEW_ID, HB_RESTART_NAME), preResolved = true);
    test:assertTrue(resp.acknowledged, "New instance heartbeat should be acknowledged");

    // Old OFFLINE record must have been cleaned up.
    types:Runtime? oldRecord = check storage:getRuntimeById(HB_RESTART_OLD_ID);
    test:assertEquals(oldRecord, (), "Old OFFLINE record must be deleted after restart");

    // New runtime must exist.
    types:Runtime? newRuntime = check storage:getRuntimeById(HB_RESTART_NEW_ID);
    test:assertNotEquals(newRuntime, (), "New runtime must be registered");

    cleanupRuntime(HB_RESTART_NEW_ID);
}

// =============================================================================
// Test 4: Kubernetes rolling restart — the old record is still RUNNING
//
// A pod replaced faster than heartbeatTimeoutSeconds (any rolling update, eviction
// or reschedule) comes back with a fresh UUID while its previous row is still
// RUNNING. Restricting the cleanup query to OFFLINE rows left that row in place,
// so the INSERT violated uq_runtime_identity (component_id, environment_id, name)
// and the heartbeat was rejected — permanently for runtimes that do not retry.
//
// Named runtimes are safe to reclaim this way: the unique constraint guarantees no
// live sibling can be holding the name. The null-name replica tests above cover the
// case where siblings genuinely can, and that guard is retained.
// =============================================================================
@test:Config {
    groups: ["heartbeat", "heartbeat-restart"]
}
function testK8sRestartReplacesRunningRecord() returns error? {
    cleanupRuntime(HB_RESTART_OLD_ID);
    cleanupRuntime(HB_RESTART_NEW_ID);

    // Old instance registers and stays RUNNING — it is never marked OFFLINE, because
    // the replacement comes up well inside the heartbeat timeout.
    _ = check storage:processHeartbeat(
            buildHeartbeat(HB_RESTART_OLD_ID, HB_RESTART_NAME), preResolved = true);
    types:Runtime? seeded = check storage:getRuntimeById(HB_RESTART_OLD_ID);
    test:assertNotEquals(seeded, (), "Old runtime should be seeded as RUNNING before the restart");

    // Replacement instance: same name, fresh UUID, old row still RUNNING.
    types:HeartbeatResponse response = check storage:processHeartbeat(
            buildHeartbeat(HB_RESTART_NEW_ID, HB_RESTART_NAME), preResolved = true);
    test:assertTrue(response.acknowledged,
            "Restarted runtime must be acknowledged even though the old record is still RUNNING");

    types:Runtime? oldRecord = check storage:getRuntimeById(HB_RESTART_OLD_ID);
    test:assertEquals(oldRecord, (), "Superseded RUNNING record must be replaced, not left behind");

    types:Runtime? newRuntime = check storage:getRuntimeById(HB_RESTART_NEW_ID);
    test:assertNotEquals(newRuntime, (), "Restarted runtime must be registered under its new ID");
}

@test:AfterGroups {
    value: ["heartbeat-restart"]
}
function afterHeartbeatRestartTests() {
    cleanupRuntime(HB_RESTART_OLD_ID);
    cleanupRuntime(HB_RESTART_NEW_ID);
}

@test:Config {
    groups: ["heartbeat", "mi-artifacts"]
}
function testMIInboundEndpointAcceptsNullProtocol() returns error? {
    string runtimeId = "aa000001-test-test-test-000000000009";
    cleanupRuntime(runtimeId);

    types:HeartbeatResponse resp = check storage:processHeartbeat(
            buildMIHeartbeat(runtimeId), preResolved = true);
    test:assertTrue(resp.acknowledged, "MI heartbeat with custom inbound endpoint should be acknowledged");

    types:InboundEndpoint[] inboundEndpoints = check storage:getInboundEndpointsForRuntime(runtimeId);
    test:assertEquals(inboundEndpoints.length(), 1, "Expected one inbound endpoint to be stored");
    test:assertEquals(inboundEndpoints[0].protocol, (), "Custom inbound endpoint protocol should remain null");

    cleanupRuntime(runtimeId);
}
