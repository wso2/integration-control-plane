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

import ballerina/test;
import icp_server.types;

// The query the console's workflow view runs against ballerina-workflow-metrics-*.
@test:Config {groups: ["workflow-metrics"]}
function testWorkflowMetricQueryScopesByRuntimeAndGroupsBySample() returns error? {
    types:MetricEntryRequest request = {
        runtimeIdList: ["rt-1", "rt-2"],
        startTime: "2026-09-08T00:00:00Z",
        endTime: "2026-09-08T01:00:00Z",
        resolutionInterval: "5m"
    };
    json query = check getBIWorkflowMetricQuery(request);

    json[] must = check query.query.bool.must.ensureType();
    test:assertEquals(must.length(), 2, "a time range and a runtime filter");
    map<json> terms = check must[1].terms.ensureType();
    test:assertEquals(terms["icp_runtimeId.keyword"], <json>["rt-1", "rt-2"],
            "the console's runtime ids scope the samples, named as the field's keyword");

    json[] sources = check query.aggs.tag_groups.composite.sources.ensureType();
    string[] sourceNames = [];
    foreach json src in sources {
        map<json> compositeSource = check src.ensureType();
        sourceNames.push(compositeSource.keys()[0]);
    }
    test:assertTrue(sourceNames.indexOf("sample") is int, "series are told apart by the sample kind");
    test:assertTrue(sourceNames.indexOf("workflow_type") is int && sourceNames.indexOf("task_name") is int
            && sourceNames.indexOf("outcome") is int, "and by the workflow tags");

    test:assertEquals(check query.aggs.tag_groups.aggs.time_buckets.date_histogram.fixed_interval, "5m");
    map<json> percentiles = check query.aggs.tag_groups.aggs.time_buckets.aggs.percentiles_duration.percentiles.ensureType();
    test:assertEquals(percentiles["field"], "duration_seconds", "durations are what a run and an activity attempt carry");
}

// One unscoped request must not become an unscoped query: the public resource refuses before
// reaching here, and the builder itself adds no runtime filter when none are given.
@test:Config {groups: ["workflow-metrics"]}
function testWorkflowMetricQueryWithoutRuntimesHasOnlyTheTimeRange() returns error? {
    json query = check getBIWorkflowMetricQuery({
        startTime: "2026-09-08T00:00:00Z",
        endTime: "2026-09-08T01:00:00Z",
        resolutionInterval: "1m"
    });
    json[] must = check query.query.bool.must.ensureType();
    test:assertEquals(must.length(), 1);
}

// A canned OpenSearch aggregation, the way the pipeline's documents come back: a closed-run group
// with durations, a decision group without, and an interval with no events.
@test:Config {groups: ["workflow-metrics"]}
function testWorkflowMetricsAreShapedBySampleKind() returns error? {
    json aggregations = {
        "tag_groups": {
            "buckets": [
                {
                    "key": {"sample": "workflow.closed", "workflow_type": "workflow-claimApproval", "outcome": "success",
                            "icp_runtimeId": "rt-1", "app_name": "claims", "activity_type": (),
                            "task_kind": (), "task_name": (), "action": (), "data_name": (), "deployment": "claims"},
                    "time_buckets": {
                        "buckets": [
                            {"key_as_string": "2026-09-08T00:00:00.000Z", "doc_count": 2,
                             "avg_duration": {"value": 12.5}, "max_duration": {"value": 20.0},
                             "percentiles_duration": {"values": {"50.0": 12.5, "95.0": 19.0, "99.0": 20.0}}},
                            {"key_as_string": "2026-09-08T00:05:00.000Z", "doc_count": 0,
                             "avg_duration": {"value": ()}, "max_duration": {"value": ()},
                             "percentiles_duration": {"values": {"50.0": (), "95.0": (), "99.0": ()}}}
                        ]
                    }
                },
                {
                    "key": {"sample": "task.decided", "task_kind": "HUMAN_TASK", "task_name": "claimApproval.reviewClaim",
                            "action": "complete", "outcome": "failure", "icp_runtimeId": "rt-1", "app_name": "claims",
                            "deployment": "claims", "workflow_type": (), "activity_type": (), "data_name": ()},
                    "time_buckets": {
                        "buckets": [
                            {"key_as_string": "2026-09-08T00:00:00.000Z", "doc_count": 3,
                             "avg_duration": {"value": ()}, "max_duration": {"value": ()},
                             "percentiles_duration": {"values": {"50.0": (), "95.0": (), "99.0": ()}}}
                        ]
                    }
                },
                {
                    "key": {"sample": (), "workflow_type": (), "icp_runtimeId": "rt-1", "app_name": "claims",
                            "deployment": "claims", "activity_type": (), "outcome": (), "task_kind": (),
                            "task_name": (), "action": (), "data_name": ()},
                    "time_buckets": {"buckets": []}
                },
                {
                    "key": {"sample": "agent.tool_called", "workflow_type": "workflow-claimAgent", "tool_name": "fileClaim",
                            "activity_type": "fileClaim", "outcome": "failure", "error_type": "error",
                            "icp_runtimeId": "rt-1", "app_name": "claims-agent", "deployment": "claims-agent",
                            "task_kind": (), "task_name": (), "action": (), "data_name": ()},
                    "time_buckets": {
                        "buckets": [
                            {"key_as_string": "2026-09-08T00:00:00.000Z", "doc_count": 1,
                             "avg_duration": {"value": 0.4}, "max_duration": {"value": 0.4},
                             "percentiles_duration": {"values": {"50.0": 0.4, "95.0": 0.4, "99.0": 0.4}}}
                        ]
                    }
                },
                {
                    "key": {"sample": "workflow.suspended", "outcome": "success", "icp_runtimeId": "rt-1",
                            "app_name": "claims", "deployment": "claims", "workflow_type": (), "activity_type": (),
                            "task_kind": (), "task_name": (), "action": (), "data_name": (), "tool_name": (),
                            "error_type": ()},
                    "time_buckets": {
                        "buckets": [
                            {"key_as_string": "2026-09-08T00:00:00.000Z", "doc_count": 2,
                             "avg_duration": {"value": ()}, "max_duration": {"value": ()},
                             "percentiles_duration": {"values": {"50.0": (), "95.0": (), "99.0": ()}}}
                        ]
                    }
                }
            ]
        }
    };

    types:WorkflowMetricEntriesResponse shaped = check shapeWorkflowMetrics(aggregations);

    test:assertEquals(shaped.runs.length(), 1, "the closed-run group is a run series");
    test:assertEquals(shaped.decisions.length(), 1, "the decision group is a decision series");
    test:assertEquals(shaped.activities.length(), 0);
    test:assertEquals(shaped.dataEvents.length(), 0, "a group without a sample kind is not a series at all");
    test:assertEquals(shaped.agentSteps.length(), 1, "an agent.* sample is an agent-step series");
    test:assertEquals(shaped.agentSteps[0].tags["tool_name"], "fileClaim");
    test:assertEquals(shaped.agentSteps[0].tags["error_type"], "error");
    test:assertEquals(shaped.controls.length(), 1, "a control operation sample is a control series");
    test:assertEquals(shaped.controls[0].sample, "workflow.suspended");

    types:WorkflowMetricEntry run = shaped.runs[0];
    test:assertEquals(run.sample, "workflow.closed");
    test:assertEquals(run.tags["workflow_type"], "workflow-claimApproval");
    test:assertEquals(run.tags["outcome"], "success");
    test:assertFalse(run.tags.hasKey("activity_type"), "absent tags are not reported as empty strings");
    test:assertEquals(run.count.timeSeriesData["2026-09-08T00:00:00.000Z"], 2);
    test:assertEquals(run.count.timeSeriesData["2026-09-08T00:05:00.000Z"], 0, "an empty interval is a zero, not a gap");
    test:assertEquals(run.duration_seconds_percentile_95.timeSeriesData["2026-09-08T00:00:00.000Z"], <decimal>19.0);
    test:assertEquals(run.duration_seconds_avg.timeSeriesData["2026-09-08T00:05:00.000Z"], <decimal>0);

    types:WorkflowMetricEntry decision = shaped.decisions[0];
    test:assertEquals(decision.tags["task_name"], "claimApproval.reviewClaim");
    test:assertEquals(decision.tags["outcome"], "failure", "a denied decision is a failure outcome");
    test:assertEquals(decision.count.timeSeriesData["2026-09-08T00:00:00.000Z"], 3);
    test:assertEquals(decision.duration_seconds_avg.timeSeriesData["2026-09-08T00:00:00.000Z"], <decimal>0,
            "a decision has no duration; the series is zeros rather than an error");
}
