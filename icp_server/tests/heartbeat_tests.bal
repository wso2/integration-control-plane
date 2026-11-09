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
// A second named runtime in the same component/environment, for the test that one
// runtime's retirement must not disturb another's tombstone.
const string HB_SECOND_OLD_ID = "aa000001-test-test-test-000000000011";
const string HB_SECOND_NEW_ID = "aa000001-test-test-test-000000000012";
const string HB_SECOND_NAME = "hb-restart-test-second-runtime";
// Service-listener binding test: dedicated ID cleaned up via an AfterGroups
// teardown so rows never leak when an assertion aborts the test.
const string HB_SERVICE_LISTENER_ID = "aa000001-test-test-test-000000000010";
const string HB_CAPP_VERSIONS_ID = "aa000001-test-test-test-000000000011";

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
    heartbeat.artifacts.inboundEndpoints = [
        {
            name: "CustomInboundEP",
            protocol: (),
            sequence: "main",
            state: "enabled",
            tracing: "disabled"
        }
    ];
    heartbeat.runtimeHash = "test-hash-mi-" + runtimeId;
    return heartbeat;
}

function buildCompositeAppHeartbeat() returns types:Heartbeat {
    return {
        runtimeId: HB_CAPP_VERSIONS_ID,
        runtime: "hb-capp-versions-runtime",
        runtimeType: "MI",
        status: "RUNNING",
        environment: HB_ENV_ID,
        project: HB_PROJECT_ID,
        component: HB_COMPONENT_ID,
        version: "4.6.0",
        nodeInfo: {platformName: "wso2-mi"},
        artifacts: {
            carbonApps: [
                {name: "EnterpriseServiceBus", version: "1.0.0-SNAPSHOT"},
                {name: "EnterpriseServiceBus", version: "2.0.0-SNAPSHOT"},
                {name: "LegacyUnversionedApp"}
            ]
        },
        runtimeHash: "test-hash-capp-versions",
        timestamp: time:utcNow()
    };
}

function containsCompositeApp(types:CompositeApp[] apps, string name, string? version) returns boolean {
    foreach types:CompositeApp app in apps {
        if app.name == name && app.version == version {
            return true;
        }
    }
    return false;
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
// Test 4: fast restart — the superseded record is still RUNNING
//
// A runtime replaced quicker than heartbeatTimeoutSeconds (a rolling update, an eviction, a
// reschedule, or any container that lost its persisted runtime ID) comes back under a fresh
// UUID while its previous row is still RUNNING. Matching only OFFLINE rows left that row in
// place, so the INSERT violated uq_runtime_identity and the heartbeat was rejected.
//
// Reclaiming the name is safe here: the constraint guarantees no live sibling holds it. The
// null-name replica tests above cover the case where siblings genuinely can, and that branch
// keeps its OFFLINE guard.
// =============================================================================
@test:Config {
    groups: ["heartbeat", "heartbeat-restart"]
}
function testFastRestartReplacesRunningRecord() returns error? {
    cleanupRuntime(HB_RESTART_OLD_ID);
    cleanupRuntime(HB_RESTART_NEW_ID);

    // Old instance registers and stays RUNNING — it is never marked OFFLINE, because the
    // replacement comes up well inside the heartbeat timeout.
    _ = check storage:processHeartbeat(
            buildHeartbeat(HB_RESTART_OLD_ID, HB_RESTART_NAME), preResolved = true);
    types:Runtime? seeded = check storage:getRuntimeById(HB_RESTART_OLD_ID);
    test:assertNotEquals(seeded, (), "Old runtime should be seeded as RUNNING before the restart");

    // Replacement instance: same name, fresh UUID, old row still RUNNING.
    types:HeartbeatResponse response = check storage:processHeartbeat(
            buildHeartbeat(HB_RESTART_NEW_ID, HB_RESTART_NAME), preResolved = true);
    test:assertTrue(response.acknowledged,
            "Restarted runtime must be acknowledged even though the old record is still RUNNING");

    // The superseded row is kept as a tombstone rather than deleted, so a late heartbeat from
    // the instance it belonged to still resolves and cannot reclaim the name.
    types:Runtime? oldRecord = check storage:getRuntimeById(HB_RESTART_OLD_ID);
    test:assertTrue(oldRecord is types:Runtime, "Superseded record must be retired, not deleted");
    if oldRecord is types:Runtime {
        // Asserted against the name rather than a literal empty value: the mapping renders a
        // NULL name as a placeholder, so what matters is that it is no longer this name.
        test:assertNotEquals(oldRecord?.runtimeName, HB_RESTART_NAME,
                "Superseded record must give up the name");
        test:assertEquals(oldRecord.status, "OFFLINE", "Superseded record must not still read as running");
    }

    // A tombstone is bookkeeping, not a runtime, so it must not surface in listings. The
    // replacement is asserted present in the same pass, so an empty result cannot let the
    // absence check pass by default.
    types:Runtime[] listed = check storage:getRuntimes((), (), (), (), HB_COMPONENT_ID);
    boolean replacementListed = false;
    foreach types:Runtime listedRuntime in listed {
        test:assertNotEquals(listedRuntime.runtimeId, HB_RESTART_OLD_ID,
                "Retired record must not appear in runtime listings");
        if listedRuntime.runtimeId == HB_RESTART_NEW_ID {
            replacementListed = true;
        }
    }
    test:assertTrue(replacementListed, "Replacement must appear in runtime listings");

    types:Runtime? newRuntime = check storage:getRuntimeById(HB_RESTART_NEW_ID);
    test:assertNotEquals(newRuntime, (), "Restarted runtime must be registered under its new ID");

    cleanupRuntime(HB_RESTART_OLD_ID);
    cleanupRuntime(HB_RESTART_NEW_ID);
}

// =============================================================================
// Test 5: one runtime's retirement must not unguard another's
//
// Retirement erases the name, so within a component and environment nothing tells one named
// runtime's tombstone from another's. Clearing tombstones wholesale when the next runtime is
// replaced would therefore leave whichever was replaced first free to take its name back off
// its own replacement — the very exchange the tombstone exists to stop.
// =============================================================================
@test:Config {
    groups: ["heartbeat", "heartbeat-restart"]
}
function testRetiringOneRuntimeKeepsAnotherGuarded() returns error? {
    cleanupRuntime(HB_RESTART_OLD_ID);
    cleanupRuntime(HB_RESTART_NEW_ID);
    cleanupRuntime(HB_SECOND_OLD_ID);
    cleanupRuntime(HB_SECOND_NEW_ID);

    // First named runtime is replaced, leaving a tombstone behind.
    _ = check storage:processHeartbeat(
            buildHeartbeat(HB_RESTART_OLD_ID, HB_RESTART_NAME), preResolved = true);
    _ = check storage:processHeartbeat(
            buildHeartbeat(HB_RESTART_NEW_ID, HB_RESTART_NAME), preResolved = true);

    // A second, unrelated named runtime in the same component and environment is replaced too.
    _ = check storage:processHeartbeat(
            buildHeartbeat(HB_SECOND_OLD_ID, HB_SECOND_NAME), preResolved = true);
    _ = check storage:processHeartbeat(
            buildHeartbeat(HB_SECOND_NEW_ID, HB_SECOND_NAME), preResolved = true);

    types:Runtime? firstTombstone = check storage:getRuntimeById(HB_RESTART_OLD_ID);
    test:assertTrue(firstTombstone is types:Runtime,
            "Retiring the second runtime must not drop the first runtime's tombstone");

    // With its tombstone intact, the first superseded instance is still refused.
    types:HeartbeatResponse|error stale = storage:processHeartbeat(
            buildHeartbeat(HB_RESTART_OLD_ID, HB_RESTART_NAME), preResolved = true);
    test:assertTrue(stale is error,
            "First superseded instance must still be unable to take its name back");

    types:Runtime? firstReplacement = check storage:getRuntimeById(HB_RESTART_NEW_ID);
    test:assertTrue(firstReplacement is types:Runtime, "First replacement must survive");

    cleanupRuntime(HB_RESTART_OLD_ID);
    cleanupRuntime(HB_RESTART_NEW_ID);
    cleanupRuntime(HB_SECOND_OLD_ID);
    cleanupRuntime(HB_SECOND_NEW_ID);
}

// =============================================================================
// Test 6: a delta heartbeat must not revive a retired record
//
// The delta path only refreshes last_heartbeat and status, keyed on runtime_id alone. A
// retired row carries no name, so reviving it would put a nameless RUNNING runtime in the
// listings next to the replacement that legitimately holds the name — and the instance would
// never have re-registered. The row must stay retired, and the reply must ask for the full
// heartbeat that is where the refusal happens.
// =============================================================================
@test:Config {
    groups: ["heartbeat", "heartbeat-restart"]
}
function testDeltaHeartbeatDoesNotReviveRetiredRecord() returns error? {
    cleanupRuntime(HB_RESTART_OLD_ID);
    cleanupRuntime(HB_RESTART_NEW_ID);

    _ = check storage:processHeartbeat(
            buildHeartbeat(HB_RESTART_OLD_ID, HB_RESTART_NAME), preResolved = true);
    _ = check storage:processHeartbeat(
            buildHeartbeat(HB_RESTART_NEW_ID, HB_RESTART_NAME), preResolved = true);

    types:HeartbeatResponse deltaResponse = check storage:processDeltaHeartbeat({
        runtimeId: HB_RESTART_OLD_ID,
        runtimeHash: "stale-hash-forcing-a-full-heartbeat",
        timestamp: time:utcNow()
    });
    test:assertTrue(deltaResponse?.fullHeartbeatRequired ?: false,
            "A retired record's delta heartbeat must be answered with fullHeartbeatRequired");

    types:Runtime? retired = check storage:getRuntimeById(HB_RESTART_OLD_ID);
    test:assertTrue(retired is types:Runtime, "Retired record should still exist");
    if retired is types:Runtime {
        test:assertEquals(retired.status, "OFFLINE",
                "A delta heartbeat must not bring a retired record back to RUNNING");
    }

    // Reviving a tombstone would also put it back in the listings, so check there too: the
    // status alone would not catch a row that was revived and then swept back to OFFLINE.
    types:Runtime[] listed = check storage:getRuntimes((), (), (), (), HB_COMPONENT_ID);
    foreach types:Runtime listedRuntime in listed {
        test:assertNotEquals(listedRuntime.runtimeId, HB_RESTART_OLD_ID,
                "A delta heartbeat must not return a retired record to the listings");
    }

    types:Runtime? replacement = check storage:getRuntimeById(HB_RESTART_NEW_ID);
    test:assertTrue(replacement is types:Runtime, "Replacement must be unaffected");

    cleanupRuntime(HB_RESTART_OLD_ID);
    cleanupRuntime(HB_RESTART_NEW_ID);
}

// =============================================================================
// Test 7: the superseded instance must not evict its own replacement
//
// A replaced instance is often still alive for a few seconds — a terminating pod keeps
// heartbeating through its grace period. That heartbeat finds the replacement holding the
// name under an unfamiliar runtime ID. Treating it as a restart would delete the live
// replacement and reinstate the dead instance, and the two would then trade the name back
// and forth for as long as both kept heartbeating.
// =============================================================================
@test:Config {
    groups: ["heartbeat", "heartbeat-restart"]
}
function testSupersededInstanceCannotEvictItsReplacement() returns error? {
    cleanupRuntime(HB_RESTART_OLD_ID);
    cleanupRuntime(HB_RESTART_NEW_ID);

    _ = check storage:processHeartbeat(
            buildHeartbeat(HB_RESTART_OLD_ID, HB_RESTART_NAME), preResolved = true);
    _ = check storage:processHeartbeat(
            buildHeartbeat(HB_RESTART_NEW_ID, HB_RESTART_NAME), preResolved = true);

    // Late heartbeat from the instance that was just replaced.
    types:HeartbeatResponse|error stale = storage:processHeartbeat(
            buildHeartbeat(HB_RESTART_OLD_ID, HB_RESTART_NAME), preResolved = true);
    test:assertTrue(stale is error,
            "A superseded instance must not be able to take its name back");

    types:Runtime? replacement = check storage:getRuntimeById(HB_RESTART_NEW_ID);
    test:assertTrue(replacement is types:Runtime,
            "Replacement must survive a heartbeat from the instance it replaced");
    if replacement is types:Runtime {
        test:assertEquals(replacement?.runtimeName, HB_RESTART_NAME,
                "Replacement must still hold the name");
    }

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

// =============================================================================
// Test 4: same-name Composite Apps with different versions must coexist
// =============================================================================
@test:Config {
    groups: ["heartbeat", "composite-app"]
}
function testCompositeAppsWithSameNameAndDifferentVersions() returns error? {
    cleanupRuntime(HB_CAPP_VERSIONS_ID);

    types:HeartbeatResponse response = check storage:processHeartbeat(
            buildCompositeAppHeartbeat(), preResolved = true);
    test:assertTrue(response.acknowledged,
            "Heartbeat containing same-name Composite Apps with different versions should be acknowledged");

    types:CompositeApp[] runtimeApps = check storage:getCompositeAppsForRuntime(HB_CAPP_VERSIONS_ID);
    test:assertEquals(runtimeApps.length(), 3, "All Composite App versions should be stored");
    test:assertTrue(containsCompositeApp(runtimeApps, "EnterpriseServiceBus", "1.0.0-SNAPSHOT"));
    test:assertTrue(containsCompositeApp(runtimeApps, "EnterpriseServiceBus", "2.0.0-SNAPSHOT"));
    test:assertTrue(containsCompositeApp(runtimeApps, "LegacyUnversionedApp", ()),
            "The internal unversioned sentinel must not leak through the storage API");

    types:CompositeApp[] componentApps = check storage:getCompositeAppsByEnvironmentAndComponent(
            HB_ENV_ID, HB_COMPONENT_ID);
    test:assertTrue(containsCompositeApp(componentApps, "EnterpriseServiceBus", "1.0.0-SNAPSHOT"),
            "Component query should include the first version");
    test:assertTrue(containsCompositeApp(componentApps, "EnterpriseServiceBus", "2.0.0-SNAPSHOT"),
            "Component query should not collapse a second version with the same name");

    cleanupRuntime(HB_CAPP_VERSIONS_ID);
}
