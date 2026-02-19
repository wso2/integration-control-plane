// Copyright (c) 2025, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
//
// WSO2 Inc. licenses this file to you under the Apache License,
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

import icp_server.types as types;

import ballerina/http;
import ballerina/log;

// Column indices for log entry rows - used for deduplication
const int COL_TIMESTAMP = 0;
const int COL_LEVEL = 1;
const int COL_LOG_ENTRY = 2;
const int COL_CLASS = 3;
const int COL_LOG_FILE_PATH = 4;
const int COL_APP_NAME = 5;
const int COL_MODULE = 6;
const int COL_SERVICE_TYPE = 7;
const int COL_APP = 8;
const int COL_DEPLOYMENT = 9;
const int COL_ARTIFACT_CONTAINER = 10;
const int COL_PRODUCT = 11;
const int COL_ICP_RUNTIME_ID = 12;
const int COL_LOG_CONTEXT = 13;
const int COL_COMPONENT_VERSION = 14;
const int COL_COMPONENT_VERSION_ID = 15;
// Internal fields for deduplication (not returned to client)
const int COL_RAW_MESSAGE = 16;
const int COL_RAW_TIME = 17;

// OpenSearch response types
type OpenSearchShards record {
    int total;
    int successful;
    int skipped;
    int failed;
};

type OpenSearchHitsTotal record {
    int value;
    string relation;
};

type LogSource record {
    string? app_module?;
    string? spanId?;
    string? app_name?;
    string? time?;
    string? log_file_path?;
    string? module?;
    string? level?;
    string? message?;
    string? service_type?;
    string? product?;
    string? icp_runtimeId?;
    string? deployment?;
    string? app?;
    string? artifact_container?;
    string? 'class?;
    string? traceId?;
};

type OpenSearchHit record {
    string _index;
    string _id;
    decimal? _score;
    LogSource _source;
    int[]? sort?;
};

type OpenSearchHits record {
    OpenSearchHitsTotal total;
    decimal? max_score;
    OpenSearchHit[] hits;
};

type OpenSearchResponse record {
    int took;
    boolean timed_out;
    OpenSearchShards _shards;
    OpenSearchHits hits;
};

// HTTP client for OpenSearch with SSL verification disabled
final http:Client opensearchClient = check new (opensearchUrl,
    config = {
        auth: {
            username: opensearchUsername,
            password: opensearchPassword
        },
        secureSocket: {
            enable: false
        }
    }
);

// HTTP service configuration
listener http:Listener openSerachObservabilityListener = new (defaultOpensearchAdaptorPort,
    config = {
        host: serverHost,
        secureSocket: {
            key: {
                path: keystorePath,
                password: keystorePassword
            }
        }
    }
);

@http:ServiceConfig {
    // auth: [
    //     {
    //         jwtValidatorConfig: {
    //             issuer: frontendJwtIssuer,
    //             audience: frontendJwtAudience,
    //             signatureConfig: {
    //                 secret: defaultobservabilityJwtHMACSecret
    //             }
    //         }
    //     }
    // ],
    cors: {
        allowOrigins: ["*"],
        allowHeaders: ["Content-Type", "Authorization"]
    }
}
service /observability on openSerachObservabilityListener {

    function init() {
        log:printInfo("Opensearch adapter service started at " + serverHost + ":" + defaultOpensearchAdaptorPort.toString());
    }

    resource function post logs/[string componentType](@http:Header {name: "X-API-Key"} string? apiKeyHeader, http:Request request, types:LogEntryRequest logRequest) returns types:LogEntriesResponse|error {
        log:printInfo("Received log request for component: " + logRequest.toString());

        // Build OpenSearch query
        json query = buildLogQuery(logRequest);

        // Execute search against OpenSearch
        string sortOrder = logRequest.sort == "asc" ? "asc" : "desc";
        json searchRequest = {
            "query": query,
            "size": logRequest.'limit,
            "sort": [
                {"@timestamp": sortOrder}
            ]
        };

        log:printDebug("OpenSearch query: " + searchRequest.toJsonString());

        // Call OpenSearch
        string indexPattern;
        if componentType == "BI" {
            indexPattern = "/ballerina-application-logs-*/_search";
        } else if componentType == "MI" {
            indexPattern = "/mi-application-logs-*/_search";
        } else if componentType == "ALL" {
            // Multi-index search: combine both index patterns in a single query
            indexPattern = "/ballerina-application-logs-*,mi-application-logs-*/_search";
        } else {
            string errorMessage = "Unknown component type specified: " + componentType;
            log:printWarn(errorMessage);
            return error(errorMessage);
        }

        OpenSearchResponse searchResponse = check opensearchClient->post(indexPattern, searchRequest);
        log:printDebug("Search returned " + searchResponse.hits.total.value.toString() + " results");

        // Build response columns
        types:LogColumn[] columns = [
            {name: "TimeGenerated", 'type: "datetime"},
            {name: "LogLevel", 'type: "string"},
            {name: "LogEntry", 'type: "dynamic"},
            {name: "Class", 'type: "dynamic"},
            {name: "LogFilePath", 'type: "dynamic"},
            {name: "AppName", 'type: "dynamic"},
            {name: "Module", 'type: "dynamic"},
            {name: "ServiceType", 'type: "dynamic"},
            {name: "App", 'type: "dynamic"},
            {name: "Deployment", 'type: "dynamic"},
            {name: "ArtifactContainer", 'type: "dynamic"},
            {name: "Product", 'type: "dynamic"},
            {name: "IcpRuntimeId", 'type: "dynamic"},
            {name: "LogContext", 'type: "dynamic"},
            {name: "ComponentVersion", 'type: "string"},
            {name: "ComponentVersionId", 'type: "string"}
        ];

        // Build response rows
        json[][] rows = [];
        foreach OpenSearchHit hit in searchResponse.hits.hits {
            LogSource sourceData = hit._source;

            // Extract fields from the log entry
            anydata timestampData = sourceData["@timestamp"];
            string timestamp = timestampData is string ? timestampData : timestampData.toString();
            string level = sourceData?.level ?: "INFO";
            string? 'class = sourceData?.'class ?: ();
            string logFilePath = sourceData?.log_file_path ?: "";
            string? appName = sourceData?.app_name ?: ();
            string? module = sourceData?.module ?: ();
            string serviceType = sourceData?.service_type ?: "";
            string? app = sourceData?.app ?: ();
            string? deployment = sourceData?.deployment ?: ();
            string? artifactContainer = sourceData?.artifact_container ?: ();
            string product = sourceData?.product ?: "";
            string icpRuntimeId = sourceData?.icp_runtimeId ?: "";

            // Extract raw message and time for deduplication
            string rawMessage = sourceData?.message ?: "";
            string rawTime = sourceData?.time ?: timestamp;

            // Construct the full log entry string
            string logEntry = constructLogEntry(sourceData);

            json[] row = [
                timestamp, // COL_TIMESTAMP (0)
                level, // COL_LEVEL (1)
                logEntry, // COL_LOG_ENTRY (2)
                'class, // COL_CLASS (3)
                logFilePath, // COL_LOG_FILE_PATH (4)
                appName, // COL_APP_NAME (5)
                module, // COL_MODULE (6)
                serviceType, // COL_SERVICE_TYPE (7)
                app, // COL_APP (8)
                deployment, // COL_DEPLOYMENT (9)
                artifactContainer, // COL_ARTIFACT_CONTAINER (10)
                product, // COL_PRODUCT (11)
                icpRuntimeId, // COL_ICP_RUNTIME_ID (12)
                (), // COL_LOG_CONTEXT (13) - null for now
                "", // COL_COMPONENT_VERSION (14)
                "", // COL_COMPONENT_VERSION_ID (15)
                rawMessage, // COL_RAW_MESSAGE (16) - for deduplication
                rawTime // COL_RAW_TIME (17) - for deduplication
            ];
            rows.push(row);
        }

        // Deduplicate log entries before returning
        json[][] deduplicatedRows = deduplicateLogEntries(rows);
        int duplicatesRemoved = rows.length() - deduplicatedRows.length();
        if duplicatesRemoved > 0 {
            log:printInfo(string `Removed ${duplicatesRemoved} duplicate log entries`);
        }

        // Trim internal deduplication fields before returning to client
        json[][] clientRows = [];
        foreach json[] row in deduplicatedRows {
            // Return only the first 16 columns (exclude COL_RAW_MESSAGE and COL_RAW_TIME)
            json[] clientRow = [];
            int i = 0;
            while i <= COL_COMPONENT_VERSION_ID {
                clientRow.push(row[i]);
                i += 1;
            }
            clientRows.push(clientRow);
        }

        log:printInfo("Returning " + clientRows.length().toString() + " log entries");

        return {
            columns: columns,
            rows: clientRows
        };
    }

    resource function post metrics(@http:Header {name: "X-API-Key"} string? apiKeyHeader, http:Request request, types:MetricEntryRequest metricRequest) returns types:MetricEntriesResponse|error {
        log:printInfo("Received metric request: " + metricRequest.toString());

        // Build OpenSearch query for metrics
        json metricsQuery = check getMetricQuery(metricRequest);
        log:printDebug("OpenSearch metrics query: " + metricsQuery.toJsonString());

        // Execute the query
        json metricsResponseJson = check opensearchClient->post("/ballerina-metrics-logs-*/_search", metricsQuery);

        // Parse the response and build metrics
        types:MetricEntry[] metrics = [];

        // Extract aggregation buckets
        json aggregations = check metricsResponseJson.aggregations;
        json tagGroups = check aggregations.tag_groups;
        json[] buckets = check tagGroups.buckets.ensureType();

        log:printInfo("Found " + buckets.length().toString() + " unique tag groups");

        // Process each tag group
        foreach json bucket in buckets {
            // Extract tags from the bucket key
            json bucketKey = check bucket.key;
            map<string> tags = {};

            // Get all tag fields from the composite key
            map<json> keyMap = check bucketKey.ensureType();
            foreach string tagField in keyMap.keys() {
                json tagValue = keyMap.get(tagField);
                if (tagValue is string && tagValue != "") {
                    tags[tagField] = tagValue;
                } else if (tagValue is ()) {
                    // Skip null values
                    continue;
                }
            }

            // Get time buckets
            json timeBuckets = check bucket.time_buckets;
            json[] timeBucketArray = check timeBuckets.buckets.ensureType();

            // Build time series data for all metrics
            map<int> requestsTotalTimeSeries = {};
            map<decimal> avgResponseTimeTimeSeries = {};
            map<decimal> minResponseTimeTimeSeries = {};
            map<decimal> maxResponseTimeTimeSeries = {};
            map<decimal> percentile33TimeSeries = {};
            map<decimal> percentile50TimeSeries = {};
            map<decimal> percentile66TimeSeries = {};
            map<decimal> percentile95TimeSeries = {};
            map<decimal> percentile99TimeSeries = {};

            foreach json timeBucket in timeBucketArray {
                string timestamp = check timeBucket.key_as_string;
                int docCount = check timeBucket.doc_count;

                // Always add request count (even if 0)
                requestsTotalTimeSeries[timestamp] = docCount;

                // Add response time metrics - use actual values if available, otherwise use 0
                if (docCount > 0) {
                    // Extract response time stats
                    json avgRT = check timeBucket.avg_response_time;
                    decimal avgValue = check avgRT.value;
                    avgResponseTimeTimeSeries[timestamp] = avgValue;

                    json minRT = check timeBucket.min_response_time;
                    decimal minValue = check minRT.value;
                    minResponseTimeTimeSeries[timestamp] = minValue;

                    json maxRT = check timeBucket.max_response_time;
                    decimal maxValue = check maxRT.value;
                    maxResponseTimeTimeSeries[timestamp] = maxValue;

                    // Extract percentiles
                    json percentilesRT = check timeBucket.percentiles_response_time;
                    json percentilesValues = check percentilesRT.values;
                    map<json> percentilesMap = check percentilesValues.ensureType();

                    // Extract each percentile value
                    decimal p33 = check percentilesMap["33.0"];
                    percentile33TimeSeries[timestamp] = p33;

                    decimal p50 = check percentilesMap["50.0"];
                    percentile50TimeSeries[timestamp] = p50;

                    decimal p66 = check percentilesMap["66.0"];
                    percentile66TimeSeries[timestamp] = p66;

                    decimal p95 = check percentilesMap["95.0"];
                    percentile95TimeSeries[timestamp] = p95;

                    decimal p99 = check percentilesMap["99.0"];
                    percentile99TimeSeries[timestamp] = p99;
                } else {
                    // No requests, fill all response time metrics with 0
                    avgResponseTimeTimeSeries[timestamp] = 0;
                    minResponseTimeTimeSeries[timestamp] = 0;
                    maxResponseTimeTimeSeries[timestamp] = 0;
                    percentile33TimeSeries[timestamp] = 0;
                    percentile50TimeSeries[timestamp] = 0;
                    percentile66TimeSeries[timestamp] = 0;
                    percentile95TimeSeries[timestamp] = 0;
                    percentile99TimeSeries[timestamp] = 0;
                }
            }

            // Only add metric entry if there's actual data
            if (requestsTotalTimeSeries.length() > 0) {
                types:MetricEntry metricEntry = {
                    tags: tags,
                    requests_total: {
                        name: "requests_total",
                        timeSeriesData: requestsTotalTimeSeries
                    },
                    response_time_seconds_avg: {
                        name: "response_time_seconds_avg",
                        timeSeriesData: avgResponseTimeTimeSeries
                    },
                    response_time_seconds_min: {
                        name: "response_time_seconds_min",
                        timeSeriesData: minResponseTimeTimeSeries
                    },
                    response_time_seconds_max: {
                        name: "response_time_seconds_max",
                        timeSeriesData: maxResponseTimeTimeSeries
                    },
                    response_time_seconds_percentile_33: {
                        name: "response_time_seconds_percentile_33",
                        timeSeriesData: percentile33TimeSeries
                    },
                    response_time_seconds_percentile_50: {
                        name: "response_time_seconds_percentile_50",
                        timeSeriesData: percentile50TimeSeries
                    },
                    response_time_seconds_percentile_66: {
                        name: "response_time_seconds_percentile_66",
                        timeSeriesData: percentile66TimeSeries
                    },
                    response_time_seconds_percentile_95: {
                        name: "response_time_seconds_percentile_95",
                        timeSeriesData: percentile95TimeSeries
                    },
                    response_time_seconds_percentile_99: {
                        name: "response_time_seconds_percentile_99",
                        timeSeriesData: percentile99TimeSeries
                    }
                };

                metrics.push(metricEntry);
            }
        }

        log:printInfo("Returning " + metrics.length().toString() + " metric entries");

        return {
            metrics: metrics
        };
    }
}

// Helper function to build OpenSearch query based on request parameters
function buildLogQuery(types:LogEntryRequest logRequest) returns json {
    log:printDebug("Building OpenSearch query");

    json[] mustClauses = [];

    // Filter by runtime IDs if specified
    string[] runtimeIds = logRequest.runtimeIdList;
    if (runtimeIds.length() > 0) {
        mustClauses.push({
            "terms": {
                "icp_runtimeId": runtimeIds
            }
        });
    }

    // Filter by log levels if specified
    string[]? levels = logRequest.logLevels;
    if (levels is string[] && levels.length() > 0) {
        mustClauses.push({
            "terms": {
                "level": levels
            }
        });
    }

    // Filter by search phrase if specified
    string? searchPhrase = logRequest.searchPhrase;
    if (searchPhrase is string && searchPhrase.length() > 0) {
        mustClauses.push({
            "match_phrase": {
                "message": searchPhrase
            }
        });
    }

    // Filter by regex phrase if specified
    string? regexPhrase = logRequest.regexPhrase;
    if (regexPhrase is string && regexPhrase.length() > 0) {
        mustClauses.push({
            "regexp": {
                "message": regexPhrase
            }
        });
    }

    // Time range filter
    map<json> timeRange = {};
    string? startTime = logRequest.startTime;
    if (startTime is string) {
        timeRange["gte"] = startTime;
    }
    string? endTime = logRequest.endTime;
    if (endTime is string) {
        timeRange["lte"] = endTime;
    }
    if (timeRange.length() > 0) {
        mustClauses.push({
            "range": {
                "@timestamp": timeRange
            }
        });
    }

    return {
        "bool": {
            "must": mustClauses
        }
    };
}

// Helper function to construct log entry string from OpenSearch document
function constructLogEntry(LogSource sourceData) returns string {
    string time = sourceData?.time ?: "";
    string level = sourceData?.level ?: "";
    string message = sourceData?.message ?: "";
    string serviceType = sourceData?.service_type ?: "";

    // Common fields
    string? traceIdValue = sourceData?.traceId;
    string traceId = traceIdValue is string && traceIdValue != "" ? " traceId=\"" + traceIdValue + "\"" : "";

    string? spanIdValue = sourceData?.spanId;
    string spanId = spanIdValue is string && spanIdValue != "" ? " spanId=\"" + spanIdValue + "\"" : "";

    string? runtimeIdValue = sourceData?.icp_runtimeId;
    string runtimeId = runtimeIdValue is string && runtimeIdValue != "" ? " icp.runtimeId=\"" + runtimeIdValue + "\"" : "";

    // Service-type specific fields
    string serviceSpecificFields = "";
    if serviceType == "ballerina" {
        string? moduleValue = sourceData?.module;
        string module = moduleValue is string && moduleValue != "" ? " module=\"" + moduleValue + "\"" : "";

        string? appNameValue = sourceData?.app_name;
        string appName = appNameValue is string && appNameValue != "" ? " app_name=\"" + appNameValue + "\"" : "";

        serviceSpecificFields = module + appName;
    } else if serviceType == "MI" {
        string? artifactContainerValue = sourceData?.artifact_container;
        string artifactContainer = artifactContainerValue is string && artifactContainerValue != "" ? " artifact_container=\"" + artifactContainerValue + "\"" : "";

        serviceSpecificFields = artifactContainer;
    }

    // Construct the log entry in logfmt style
    return string `time=${time} level=${level}${serviceSpecificFields} message="${message}"${traceId}${spanId}${runtimeId}`;
}

// Helper function to deduplicate log entries based on composite key
// Uses the same fields as Fluent Bit's generate_document_id to ensure consistent deduplication:
// timestamp (raw time field) | message (raw message) | level | icp_runtimeId | log_file_path
function deduplicateLogEntries(json[][] rows) returns json[][] {
    map<boolean> seenEntries = {};
    json[][] uniqueRows = [];

    foreach json[] row in rows {
        // Extract fields using named constants to avoid fragile positional indices
        // Use raw fields that match Fluent Bit's composite key format
        string rawTime = row[COL_RAW_TIME] is string ? <string>row[COL_RAW_TIME] : row[COL_RAW_TIME].toString();
        string rawMessage = row[COL_RAW_MESSAGE] is string ? <string>row[COL_RAW_MESSAGE] : "";
        string level = row[COL_LEVEL] is string ? <string>row[COL_LEVEL] : row[COL_LEVEL].toString();
        string icpRuntimeId = row[COL_ICP_RUNTIME_ID] is string ? <string>row[COL_ICP_RUNTIME_ID] : "";
        string logFilePath = row[COL_LOG_FILE_PATH] is string ? <string>row[COL_LOG_FILE_PATH] : "";

        // Create composite key matching Fluent Bit's format:
        // timestamp_str | message | level | runtime_id | log_file_path
        string compositeKey = string `${rawTime}|${rawMessage}|${level}|${icpRuntimeId}|${logFilePath}`;

        // Only add if we haven't seen this combination before
        if !seenEntries.hasKey(compositeKey) {
            seenEntries[compositeKey] = true;
            uniqueRows.push(row);
        }
    }

    return uniqueRows;
}

function getMetricQuery(types:MetricEntryRequest metricRequest) returns json|error {
    // Build the time series query for requests per minute
    string interval = metricRequest.resolutionInterval;
    string startTime = metricRequest.startTime;
    string endTime = metricRequest.endTime;

    // Build must clauses
    json[] mustClauses = [
        {
            "exists": {
                "field": "response_time_seconds"
            }
        },
        {
            "range": {
                "@timestamp": {
                    "gte": startTime,
                    "lte": endTime
                }
            }
        }
    ];

    // Filter by runtime IDs if specified
    string[] runtimeIds = metricRequest.runtimeIdList;
    if (runtimeIds.length() > 0) {
        mustClauses.push({
            "terms": {
                "icp_runtimeId.keyword": runtimeIds
            }
        });
    }

    // Step 1: Get sample documents to discover all field names
    json sampleQuery = {
        "size": 1000,
        "query": {
            "bool": {
                "must": mustClauses
            }
        }
    };

    log:printDebug("Fetching sample documents to discover fields");
    json sampleResponse = check opensearchClient->post("/ballerina-metrics-logs-*/_search", sampleQuery);

    // Extract field names from sample documents
    string[] tagFields = extractTagFields(sampleResponse);
    log:printInfo("Discovered " + tagFields.length().toString() + " tag fields: " + tagFields.toString());

    if (tagFields.length() == 0) {
        log:printWarn("No tag fields found, returning empty metrics");
        return {
            metrics: []
        };
    }

    // Step 2: Build composite aggregation with discovered fields
    json[] compositeSources = [];
    foreach string tagKey in tagFields {
        // Use keyword field for aggregation
        string fieldName = tagKey + ".keyword";
        compositeSources.push({
            [tagKey]: {
                "terms": {
                    "field": fieldName,
                    "missing_bucket": true
                }
            }
        });
    }

    json metricsQuery = {
        "size": 0,
        "query": {
            "bool": {
                "must": mustClauses
            }
        },
        "aggs": {
            "tag_groups": {
                "composite": {
                    "size": 10000, // Adjust based on expected unique tag combinations
                    "sources": compositeSources
                },
                "aggs": {
                    "time_buckets": {
                        "date_histogram": {
                            "field": "@timestamp",
                            "fixed_interval": interval,
                            "min_doc_count": 0,
                            "extended_bounds": {
                                "min": startTime,
                                "max": endTime
                            }
                        },
                        "aggs": {
                            "avg_response_time": {
                                "avg": {
                                    "field": "response_time_seconds"
                                }
                            },
                            "min_response_time": {
                                "min": {
                                    "field": "response_time_seconds"
                                }
                            },
                            "max_response_time": {
                                "max": {
                                    "field": "response_time_seconds"
                                }
                            },
                            "percentiles_response_time": {
                                "percentiles": {
                                    "field": "response_time_seconds",
                                    "percents": [33.0, 50.0, 66.0, 95.0, 99.0]
                                }
                            }
                        }
                    }
                }
            }
        }
    };

    return metricsQuery;
}

// Helper function to extract tag fields from sample documents
function extractTagFields(json sampleResponse) returns string[] {
    string[] tagFields = [];

    do {
        json hits = check sampleResponse.hits;
        json[] hitArray = check hits.hits.ensureType();

        if (hitArray.length() == 0) {
            return tagFields;
        }

        // Use a map to collect unique field names
        map<boolean> fieldSet = {};

        // Iterate through sample documents to collect all field names
        foreach json hit in hitArray {
            json sourceDoc = check hit._source;
            map<json> sourceMap = check sourceDoc.ensureType();

            // Extract all field names from the document
            foreach string fieldName in sourceMap.keys() {
                // Check if field should be excluded
                if (!isExcludedField(fieldName)) {
                    fieldSet[fieldName] = true;
                }
            }
        }

        // Convert map keys to array
        tagFields = fieldSet.keys();

    } on fail error e {
        log:printError("Error extracting tag fields: " + e.message());
    }

    return tagFields;
}

// Helper function to check if a field should be excluded from tags
function isExcludedField(string fieldName) returns boolean {
    final string[] EXCLUDED_TAG_FIELDS = ["level", "time", "spanId", "traceId", "message", "logger", "@timestamp", "response_time_seconds"];

    foreach string excludedField in EXCLUDED_TAG_FIELDS {
        if (fieldName == excludedField) {
            return true;
        }
    }
    return false;
}
