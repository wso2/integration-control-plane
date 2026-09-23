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

import ballerina/http;
import ballerina/test;

// =============================================================================
// Instance graph composition tests
// =============================================================================
// `instanceGraphResponse` joins a workflow's published model to one run's history.
// The fixtures below are a real run captured from `ballerina/workflow` — an order
// workflow that reserves inventory, waits on a `paymentInfo` data event, then takes
// one arm of a branch:
//
//     reserveInventory ──► wait paymentInfo ──► if paid ──► sendConfirmationEmail
//                                                   └else──► cancelOrder
//
// Two of its executions name their call site (`stepId`); the data-event wait cannot,
// so it is placed by order against the model. The cases here pin what happens when
// the model and the run agree, when they do not, and when there is no model at all.
// =============================================================================

isolated function orderModelNodes() returns json[] => [
    {stepId: "reserveInventory#1", kind: "ACTIVITY", target: "reserveInventory"},
    {stepId: "wait#1", kind: "EVENT_WAIT", target: "paymentInfo"},
    {stepId: "if#1", kind: "BRANCH", label: "paymentInfo.status == \"PAID\""},
    {stepId: "sendConfirmationEmail#1", kind: "ACTIVITY", target: "sendConfirmationEmail", parent: "if#1", branch: "then"},
    {stepId: "return#1", kind: "EXIT", mode: "return", parent: "if#1", branch: "then"},
    {stepId: "cancelOrder#1", kind: "ACTIVITY", target: "cancelOrder", parent: "if#1", branch: "else"},
    {stepId: "return#2", kind: "EXIT", mode: "return", parent: "if#1", branch: "else"}
];

isolated function orderExecutedNodes() returns json[] => [
    {
        id: "6",
        name: "reserveInventory",
        'type: "ACTIVITY",
        status: "COMPLETED",
        stepId: "reserveInventory#1",
        startTime: "2026-09-22T15:55:04.023657Z",
        endTime: "2026-09-22T15:55:04.040927Z",
        attempt: 1
    },
    {
        id: "12",
        name: "paymentInfo",
        'type: "DATA",
        status: "COMPLETED",
        stepId: (),
        startTime: "2026-09-22T15:55:04.058446Z",
        endTime: "2026-09-22T15:55:07.943824Z"
    },
    {
        id: "18",
        name: "sendConfirmationEmail",
        'type: "ACTIVITY",
        status: "COMPLETED",
        stepId: "sendConfirmationEmail#1",
        startTime: "2026-09-22T15:55:07.970109Z",
        endTime: "2026-09-22T15:55:07.979435Z",
        attempt: 1
    }
];

// Composes a run against a model and returns the payload the console reads. `published` decides
// whether a graph was published at all: an empty model can mean either no descriptor, or a
// descriptor whose graph carries no usable nodes, and the two are not the same answer.
isolated function composeInstanceGraph(json[] executed, json[] model, boolean? published = ())
        returns map<json>|error {
    boolean hasGraph = published ?: model.length() > 0;
    json? graph = hasGraph ? {nodes: model, edges: []} : ();
    map<json> info = {status: "COMPLETED"};
    http:Response response = instanceGraphResponse("orderWorkflow", info, graph, "checksum-1",
            "workflow", executed, model);
    test:assertEquals(response.statusCode, 200);
    json payload = check response.getJsonPayload();
    return <map<json>>payload;
}

isolated function stepIdsOf(map<json> payload) returns string[] {
    map<json> steps = <map<json>>payload["steps"];
    return steps.keys().sort();
}

isolated function unmatchedLabelsOf(map<json> payload) returns string[] {
    json[] unmatched = <json[]>payload["unmatched"];
    string[] labels = [];
    foreach json entry in unmatched {
        map<json> item = <map<json>>entry;
        labels.push(item["label"] is string ? <string>item["label"] : "");
    }
    return labels.sort();
}

// A run and the model it ran against: every execution lands on its own step, the data-event
// wait is interpolated onto the model's EVENT_WAIT, and the arm that ran is the one recorded.
@test:Config {
    groups: ["instance-graph"]
}
isolated function testRunPlacedOnItsOwnModel() returns error? {
    map<json> payload = check composeInstanceGraph(orderExecutedNodes(), orderModelNodes());

    test:assertEquals(stepIdsOf(payload), ["reserveInventory#1", "sendConfirmationEmail#1", "wait#1"]);
    test:assertEquals(<json[]>payload["unmatched"], []);
    test:assertEquals(payload["stepIdsAvailable"], true);
    test:assertEquals(payload["takenArms"], {"if#1": ["then"]});

    map<json> steps = <map<json>>payload["steps"];
    map<json> waitStep = <map<json>>steps.get("wait#1");
    test:assertEquals(waitStep["label"], "paymentInfo", "the unstamped data event belongs to the model's wait");
    test:assertEquals(waitStep["count"], 1);
}

// A buffered data event completes the instant the wait is published, so its node carries
// equal start and end times. It is still one execution on one step.
@test:Config {
    groups: ["instance-graph"]
}
isolated function testBufferedDataEventStillPlaced() returns error? {
    json[] executed = orderExecutedNodes();
    map<json> dataEvent = <map<json>>executed[1];
    dataEvent["startTime"] = "2026-09-22T15:55:23.145809Z";
    dataEvent["endTime"] = "2026-09-22T15:55:23.145809Z";

    map<json> payload = check composeInstanceGraph(executed, orderModelNodes());

    test:assertEquals(stepIdsOf(payload), ["reserveInventory#1", "sendConfirmationEmail#1", "wait#1"]);
    test:assertEquals(<json[]>payload["unmatched"], []);
}

// The integration was redeployed after the run and one call site was renamed. The execution
// names a step this model does not have: it is reported, never filed under an id no node
// carries — that read as "never executed" on the diagram while the history showed it running.
@test:Config {
    groups: ["instance-graph"]
}
isolated function testStepMissingFromModelIsReported() returns error? {
    json[] model = orderModelNodes();
    map<json> renamed = <map<json>>model[3];
    renamed["stepId"] = "notifyCustomer#1";
    renamed["target"] = "notifyCustomer";

    map<json> payload = check composeInstanceGraph(orderExecutedNodes(), model);

    test:assertEquals(stepIdsOf(payload), ["reserveInventory#1", "wait#1"]);
    test:assertEquals(unmatchedLabelsOf(payload), ["sendConfirmationEmail"]);

    json[] unmatched = <json[]>payload["unmatched"];
    map<json> entry = <map<json>>unmatched[0];
    test:assertEquals(entry["stepId"], "sendConfirmationEmail#1");
    test:assertEquals(entry["status"], "COMPLETED");
}

// Every stamped step missing from the model — the run is a different version of the workflow
// end to end. `steps` is empty, but the run DID name its steps, so `stepIdsAvailable` must stay
// true: false is read as "this runtime is too old to name them", which sends the console to a
// different explanation and hides the report of what could not be placed.
@test:Config {
    groups: ["instance-graph"]
}
isolated function testWholeRunFromAnotherVersionStaysPlaceable() returns error? {
    json[] model = [];
    foreach json node in orderModelNodes() {
        map<json> copy = <map<json>>node.clone();
        copy["stepId"] = (copy["stepId"] is string ? <string>copy["stepId"] : "") + "-v2";
        model.push(copy);
    }
    // Without the data event nothing is interpolated either, so `steps` comes back empty — the
    // state this flag has to tell apart from a run whose steps never named themselves at all.
    json[] executed = orderExecutedNodes();
    _ = executed.remove(1);

    map<json> payload = check composeInstanceGraph(executed, model);

    test:assertEquals(stepIdsOf(payload), []);
    test:assertEquals(unmatchedLabelsOf(payload), ["reserveInventory", "sendConfirmationEmail"]);
    test:assertEquals(payload["stepIdsAvailable"], true,
            "the steps named themselves; this model is simply not the one they ran against");
}

// No runtime has published a descriptor for this type, so there are no model nodes to be absent
// from. The stamped steps are still returned as a flat set — a missing model is reported by a nil
// `graph`, not by calling every step a version mismatch.
@test:Config {
    groups: ["instance-graph"]
}
isolated function testNoModelKeepsStampedSteps() returns error? {
    map<json> payload = check composeInstanceGraph(orderExecutedNodes(), []);

    test:assertEquals(stepIdsOf(payload), ["reserveInventory#1", "sendConfirmationEmail#1"]);
    test:assertEquals(payload["stepIdsAvailable"], true);
    // Only the data event is unplaceable: with no model there is nothing to interpolate against.
    test:assertEquals(unmatchedLabelsOf(payload), ["paymentInfo"]);
}

// A runtime too old to name any of its steps: nothing can be placed and nothing was stamped,
// so the console is told to fall back to the history rather than draw an empty diagram.
@test:Config {
    groups: ["instance-graph"]
}
isolated function testUnstampedActivitiesReportNoStepIds() returns error? {
    json[] executed = [];
    foreach json node in orderExecutedNodes() {
        map<json> copy = <map<json>>node.clone();
        copy["stepId"] = ();
        executed.push(copy);
    }
    // Drop the data event, which is placed by order rather than by id, so nothing can be placed.
    _ = executed.remove(1);

    map<json> payload = check composeInstanceGraph(executed, orderModelNodes());

    test:assertEquals(stepIdsOf(payload), []);
    test:assertEquals(payload["stepIdsAvailable"], false);
    test:assertEquals(unmatchedLabelsOf(payload), ["reserveInventory", "sendConfirmationEmail"]);
}

// A review task is drawn on the step it gates, named by the step id in its memo.
@test:Config {
    groups: ["instance-graph"]
}
isolated function testReviewFoldsOntoTheStepItGates() returns error? {
    json[] executed = orderExecutedNodes();
    executed.push({
        id: "20",
        name: "approveSend",
        'type: "REVIEW_ACTIVITY",
        status: "COMPLETED",
        stepId: "sendConfirmationEmail#1",
        childWorkflowId: "reviewactivity-1"
    });

    map<json> payload = check composeInstanceGraph(executed, orderModelNodes());

    map<json> steps = <map<json>>payload["steps"];
    map<json> gated = <map<json>>steps.get("sendConfirmationEmail#1");
    json[] reviews = <json[]>gated["reviews"];
    test:assertEquals(reviews.length(), 1);
    test:assertEquals((<map<json>>reviews[0])["taskId"], "reviewactivity-1");
    test:assertEquals(<json[]>payload["unmatched"], []);
}

// A published graph with no usable nodes is still a model, and a step it does not have is still
// unplaceable. Reading that off the node count instead let a degenerate graph fall through to the
// phantom-id recording this reports — the console drew the step as never executed, silently.
@test:Config {
    groups: ["instance-graph"]
}
isolated function testPublishedGraphWithNoNodesStillReports() returns error? {
    map<json> payload = check composeInstanceGraph(orderExecutedNodes(), [], published = true);

    test:assertEquals(stepIdsOf(payload), [], "nothing can be placed on a model with no nodes");
    test:assertEquals(unmatchedLabelsOf(payload), ["paymentInfo", "reserveInventory", "sendConfirmationEmail"]);
    test:assertEquals(payload["stepIdsAvailable"], true, "the steps named themselves");
}

// A review naming a step the model does not have has nothing to fold onto, and is reported.
@test:Config {
    groups: ["instance-graph"]
}
isolated function testReviewWithoutItsStepIsReported() returns error? {
    json[] executed = orderExecutedNodes();
    executed.push({
        id: "20",
        name: "approveSend",
        'type: "REVIEW_ACTIVITY",
        status: "COMPLETED",
        stepId: "goneFromTheModel#1",
        childWorkflowId: "reviewactivity-2"
    });

    map<json> payload = check composeInstanceGraph(executed, orderModelNodes());

    json[] unmatched = <json[]>payload["unmatched"];
    test:assertEquals(unmatched.length(), 1);
    map<json> orphan = <map<json>>unmatched[0];
    test:assertEquals(orphan["taskId"], "reviewactivity-2");
    // Every unmatched entry says why, or the console's note has nothing to show for this one.
    test:assertEquals(orphan["stepId"], "goneFromTheModel#1");
    test:assertTrue(orphan["reason"] is string && (<string>orphan["reason"]).length() > 0,
            "an orphaned review carries a reason like every other unplaceable execution");
}
