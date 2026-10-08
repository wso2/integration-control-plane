// Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com).
//
// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

import icp_server.storage;
import icp_server.types;

import ballerina/io;
import ballerina/test;

// Workflow metadata ingestion tests: the bi_workflow_metadata rows written off full
// heartbeats, the field negotiation advertising "workflowMetadata", and the GraphQL
// definitions source reading stored metadata instead of live-calling the runtime.
//
// Uses Component 2 / Prod with dedicated runtimes so the workflow proxy tests'
// component (Component 1 / Dev) keeps exercising the legacy live-fetch path.

const string WF_META_RUNTIME_ID = "aa000002-test-test-test-000000000003";
const string WF_META_RUNTIME_2_ID = "aa000002-test-test-test-000000000004";

// A minimal workflow metadata document in the shape the ICP bridge publishes.
final map<json> & readonly WF_META_DOCUMENT = {
    metadataVersion: "1.0",
    definitions: [
        {workflowType: "expenseApproval", kind: "WORKFLOW", inputSchema: "{\"type\":\"object\"}"}
    ],
    humanTasks: [
        {name: "expenseApproval.approve", resultSchema: "{\"type\":\"object\"}"}
    ],
    activities: [
        {workflowType: "expenseApproval", name: "recordApproval", inputSchema: "{\"type\":\"object\"}"}
    ],
    reviewActions: ["proceed", "proceed-with-input", "reject"],
    agents: []
};

function buildWorkflowMetadataHeartbeat(string runtimeId, string runtimeName,
        boolean withMetadata) returns types:Heartbeat {
    types:Heartbeat heartbeat = buildWorkflowHeartbeat(runtimeId, runtimeName,
            WF_COMPONENT_2_ID, WF_PROD_ENV_ID);
    if withMetadata {
        heartbeat.workflowMetadata = WF_META_DOCUMENT.clone();
        heartbeat.capabilities = ["workflowCommands"];
    }
    return heartbeat;
}

// alwaysRun: a failure here leaves runtime rows behind, and the tunnel and GraphQL tests
// count runtimes for the same component and environment — so they would fail for a reason
// that has nothing to do with them.
@test:AfterGroups {value: ["workflow-metadata"], alwaysRun: true}
function cleanupWorkflowMetadataTests() {
    cleanupRuntime(WF_META_RUNTIME_ID);
    cleanupRuntime(WF_META_RUNTIME_2_ID);
    // The promotion test deliberately changes this component's integration type. Restore it
    // here rather than at the end of a later test, so the fixture is right regardless of
    // which tests ran, in what order, or whether they passed.
    error? restored = storage:updateComponent(WF_COMPONENT_2_ID, (), (),
            SUPER_ADMIN_USER_ID, "service");
    if restored is error {
        io:println("Failed to restore the workflow-metadata component fixture: ", restored.message());
    }
}

// The server advertises the workflowMetadata field so bridges know to attach it, and a
// full heartbeat carrying the document lands as this runtime's bi_workflow_metadata row
// (with its advertised capabilities). A later full heartbeat WITHOUT the document clears
// the row — delete-then-insert, same semantics as packed OpenAPI definitions.
@test:Config {groups: ["workflow-metadata"]}
function testWorkflowMetadataUpsertFromHeartbeat() returns error? {
    cleanupRuntime(WF_META_RUNTIME_ID);

    types:HeartbeatResponse response = check storage:processHeartbeat(
            buildWorkflowMetadataHeartbeat(WF_META_RUNTIME_ID, "wf-meta-test-runtime", true),
            preResolved = true);
    test:assertTrue(response.acknowledged);
    test:assertTrue(response.supportedHeartbeatFields.indexOf("workflowMetadata") is int,
        "The server must advertise the workflowMetadata heartbeat field");

    types:WorkflowMetadataRecord? stored = check storage:getWorkflowMetadataForRuntime(WF_META_RUNTIME_ID);
    if stored is () {
        test:assertFail("The heartbeat's workflow metadata must be stored");
    }
    json storedDocument = check stored.metadata.fromJsonString();
    test:assertEquals(check storedDocument.metadataVersion, "1.0");
    test:assertEquals(stored.capabilities, "workflowCommands");

    // Re-sending the same heartbeat replaces the row without erroring (idempotent upsert).
    types:HeartbeatResponse repeat = check storage:processHeartbeat(
            buildWorkflowMetadataHeartbeat(WF_META_RUNTIME_ID, "wf-meta-test-runtime", true),
            preResolved = true);
    test:assertTrue(repeat.acknowledged);
    test:assertTrue(check storage:getWorkflowMetadataForRuntime(WF_META_RUNTIME_ID)
        is types:WorkflowMetadataRecord);

    // A full heartbeat without the document clears the stored row.
    types:HeartbeatResponse withoutMetadata = check storage:processHeartbeat(
            buildWorkflowMetadataHeartbeat(WF_META_RUNTIME_ID, "wf-meta-test-runtime", false),
            preResolved = true);
    test:assertTrue(withoutMetadata.acknowledged);
    test:assertTrue(check storage:getWorkflowMetadataForRuntime(WF_META_RUNTIME_ID) is (),
        "A full heartbeat without metadata must clear the stored row");
}

// A component auto-created from a heartbeat carries the generic integration type: the
// bridge registers the runtime before anything knows whether the integration contains
// workflows. The first heartbeat carrying workflow metadata records it as a workflow
// integration — without which an auto-registered integration shows no workflow features
// even though its workflows are registered and its metadata is stored, which is the
// difference between the auto-registration path and creating the integration by hand and
// picking Workflow.
@test:Config {groups: ["workflow-metadata"]}
function testWorkflowMetadataRecordsWorkflowIntegrationType() returns error? {
    cleanupRuntime(WF_META_RUNTIME_ID);
    // Put the component back to the generic type so this holds whatever else has run.
    check storage:updateComponent(WF_COMPONENT_2_ID, (), (), SUPER_ADMIN_USER_ID, "service");
    types:Component generic = check storage:getComponentById(WF_COMPONENT_2_ID);
    test:assertEquals(generic.displayType, "service", "Precondition: the generic integration type");

    types:HeartbeatResponse response = check storage:processHeartbeat(
            buildWorkflowMetadataHeartbeat(WF_META_RUNTIME_ID, "wf-meta-type-runtime", true),
            preResolved = true);
    test:assertTrue(response.acknowledged);

    types:Component promoted = check storage:getComponentById(WF_COMPONENT_2_ID);
    test:assertEquals(promoted.displayType, "ballerinaWorkflow",
        "A runtime reporting workflow metadata must mark its integration as a workflow one");

    // Re-reporting is a no-op rather than an error.
    types:HeartbeatResponse repeat = check storage:processHeartbeat(
            buildWorkflowMetadataHeartbeat(WF_META_RUNTIME_ID, "wf-meta-type-runtime", true),
            preResolved = true);
    test:assertTrue(repeat.acknowledged);
    types:Component again = check storage:getComponentById(WF_COMPONENT_2_ID);
    test:assertEquals(again.displayType, "ballerinaWorkflow");
}

// An integration type an operator chose is never overwritten: only the generic default is
// promoted, so a deliberate choice survives a runtime that reports workflows.
@test:Config {groups: ["workflow-metadata"]}
function testWorkflowMetadataKeepsDeliberateIntegrationType() returns error? {
    cleanupRuntime(WF_META_RUNTIME_ID);
    check storage:updateComponent(WF_COMPONENT_2_ID, (), (), SUPER_ADMIN_USER_ID, "ballerinaService");

    types:HeartbeatResponse response = check storage:processHeartbeat(
            buildWorkflowMetadataHeartbeat(WF_META_RUNTIME_ID, "wf-meta-type-keep", true),
            preResolved = true);
    test:assertTrue(response.acknowledged);

    types:Component unchanged = check storage:getComponentById(WF_COMPONENT_2_ID);
    test:assertEquals(unchanged.displayType, "ballerinaService",
        "A chosen integration type must survive a workflow-reporting runtime");

    // The group teardown restores the fixture, so it is right even if this test fails.
}

// The definitions resolver prefers stored metadata: no call into the integration, one
// Workflow item per workflow type deduped across the component's runtimes, workerCount =
// number of RUNNING runtimes declaring the type.
@test:Config {groups: ["workflow-metadata"]}
function testWorkflowDefinitionsFromStoredMetadata() returns error? {
    cleanupRuntime(WF_META_RUNTIME_ID);
    cleanupRuntime(WF_META_RUNTIME_2_ID);

    _ = check storage:processHeartbeat(
            buildWorkflowMetadataHeartbeat(WF_META_RUNTIME_ID, "wf-meta-test-runtime", true),
            preResolved = true);
    _ = check storage:processHeartbeat(
            buildWorkflowMetadataHeartbeat(WF_META_RUNTIME_2_ID, "wf-meta-test-runtime-2", true),
            preResolved = true);

    types:WorkflowMetadataRecord[] records =
        check storage:getWorkflowMetadataForComponentEnv(WF_COMPONENT_2_ID, WF_PROD_ENV_ID);
    test:assertEquals(records.length(), 2, "Both RUNNING runtimes' metadata must be returned");

    types:Workflow[] definitions = check fetchWorkflowDefinitions(WF_COMPONENT_2_ID, WF_PROD_ENV_ID);
    test:assertEquals(definitions.length(), 1,
        "The same workflow type from two runtimes must dedupe to one definition");
    test:assertEquals(definitions[0].name, "expenseApproval");
    test:assertTrue(definitions[0].isActive);
    test:assertEquals(definitions[0].workerCount, 2,
        "workerCount must be the number of RUNNING runtimes declaring the type");
    test:assertEquals(definitions[0].state, types:ENABLED);
    test:assertEquals(definitions[0].inputSchema, "{\"type\":\"object\"}");
}
