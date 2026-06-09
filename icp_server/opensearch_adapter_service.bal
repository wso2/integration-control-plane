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
const int COL_ERROR = 16;
// Internal fields for deduplication (not returned to client)
const int COL_RAW_MESSAGE = 17;
const int COL_RAW_TIME = 18;

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
    json? 'error?;
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

// Initialized in init() with resolved (decrypted) credentials
// This client is optional - if initialization fails, OpenSearch endpoints will return service unavailable
final http:Client? opensearchClient;

// HTTP service configuration
listener http:Listener openSerachObservabilityListener = new (defaultOpensearchAdaptorPort,
    config = {
        host: serverHost,
        secureSocket: {
            key: {
                path: keystorePath,
                password: resolvedKeystorePassword
            }
        }
    }
);

@http:ServiceConfig {
    auth: [
        {
            jwtValidatorConfig: {
                issuer: observabilityJwt.issuer,
                audience: observabilityJwt.audience,
                signatureConfig: {
                    secret: observabilityJwt.hmacSecret
                }
            }
        }
    ],
    cors: {
        allowOrigins: normalizedCorsAllowedOrigins,
        allowHeaders: ["Content-Type", "Authorization"]
    }
}
service /observability on openSerachObservabilityListener {

    function init() {
        log:printInfo("Opensearch adapter service started at " + serverHost + ":" + defaultOpensearchAdaptorPort.toString());
    }

    resource function post logs/[string componentType](@http:Header {name: "X-API-Key"} string? apiKeyHeader, http:Request request, types:LogEntryRequest logRequest) returns types:LogEntriesResponse|error {
        log:printDebug("Received log request for component: " + logRequest.toString());

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

        // Check if opensearch client is available
        http:Client? httpClient = opensearchClient;
        if httpClient is () {
            log:printError("OpenSearch client is not configured or unavailable");
            return error("OpenSearch service is unavailable. Please ensure OpenSearch is configured and running.");
        }

        OpenSearchResponse|error searchResponse = httpClient->post(indexPattern, searchRequest);
        if searchResponse is error {
            log:printError(string `Failed to query OpenSearch: ${searchResponse.message()}`);
            return error("OpenSearch service is unavailable. Please ensure OpenSearch is configured and running.");
        }
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
            {name: "ComponentVersionId", 'type: "string"},
            {name: "Error", 'type: "dynamic"}
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

            // Extract error details if present
            json? errorData = sourceData?.'error;

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
                errorData, // COL_ERROR (16)
                rawMessage, // COL_RAW_MESSAGE (17) - for deduplication
                rawTime // COL_RAW_TIME (18) - for deduplication
            ];
            rows.push(row);
        }

        // Deduplicate log entries before returning
        json[][] deduplicatedRows = deduplicateLogEntries(rows);
        int duplicatesRemoved = rows.length() - deduplicatedRows.length();
        if duplicatesRemoved > 0 {
            log:printDebug(string `Removed ${duplicatesRemoved} duplicate log entries`);
        }

        // Trim internal deduplication fields before returning to client
        json[][] clientRows = [];
        foreach json[] row in deduplicatedRows {
            // Return only the first 17 columns (exclude COL_RAW_MESSAGE and COL_RAW_TIME)
            json[] clientRow = [];
            int i = 0;
            while i <= COL_ERROR {
                clientRow.push(row[i]);
                i += 1;
            }
            clientRows.push(clientRow);
        }

        log:printDebug("Returning " + clientRows.length().toString() + " log entries");

        return {
            columns: columns,
            rows: clientRows
        };
    }

    isolated resource function post metrics/[string componentType](@http:Header {name: "X-API-Key"} string? apiKeyHeader, http:Request request, types:MetricEntryRequest metricRequest) returns types:MetricEntriesResponse|error {
        log:printDebug("Received metric request for component type " + componentType + ": " + metricRequest.toString());

        if componentType == "BI" {
            return check fetchBIMetrics(metricRequest);
        } else if componentType == "MI" {
            return check fetchMIMetrics(metricRequest);
        } else if componentType == "ALL" {
            // Fetch both BI and MI metrics and merge results
            types:MetricEntriesResponse biResult = check fetchBIMetrics(metricRequest);
            types:MetricEntriesResponse miResult = check fetchMIMetrics(metricRequest);
            return {
                inboundMetrics: [...biResult.inboundMetrics, ...miResult.inboundMetrics],
                outboundMetrics: [...biResult.outboundMetrics, ...miResult.outboundMetrics]
            };
        } else {
            string errorMessage = "Unknown component type specified for metrics: " + componentType;
            log:printWarn(errorMessage);
            return error(errorMessage);
        }
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Ballerina Integrator (BI) metrics — index: ballerina-metrics-logs-*
// ──────────────────────────────────────────────────────────────────────────────

isolated function fetchBIMetrics(types:MetricEntryRequest metricRequest) returns types:MetricEntriesResponse|error {
    // Build OpenSearch query for BI metrics
    json metricsQuery = check getBIMetricQuery(metricRequest);
    log:printDebug("BI OpenSearch metrics query: " + metricsQuery.toJsonString());

    // Check if opensearch client is available
    http:Client? httpClient = opensearchClient;
    if httpClient is () {
        log:printError("OpenSearch client is not configured or unavailable");
        return error("OpenSearch service is unavailable. Please ensure OpenSearch is configured and running.");
    }

    // Execute the query
    json|error biResponseResult = httpClient->post("/ballerina-metrics-logs-*/_search", metricsQuery);
    if biResponseResult is error {
        log:printError(string `Failed to query OpenSearch for BI metrics: ${biResponseResult.message()}`);
        return error("OpenSearch service is unavailable. Please ensure OpenSearch is configured and running.");
    }

    // Parse the response and build metrics
    types:MetricEntry[] metrics = [];

    // Extract aggregation buckets — return empty if no aggregations present
    json|error aggregationsResult = biResponseResult.aggregations;
    if aggregationsResult is error {
        log:printWarn("No aggregations in BI metrics response. Returning empty result.");
        return {inboundMetrics: [], outboundMetrics: []};
    }
    json aggregations = aggregationsResult;
    json tagGroups = check aggregations.tag_groups;
    json[] buckets = check tagGroups.buckets.ensureType();

    log:printDebug("BI metrics: Found " + buckets.length().toString() + " unique tag groups");

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

            requestsTotalTimeSeries[timestamp] = docCount;

            if (docCount > 0) {
                json avgRT = check timeBucket.avg_response_time;
                decimal avgValue = check avgRT.value;
                avgResponseTimeTimeSeries[timestamp] = avgValue;

                json minRT = check timeBucket.min_response_time;
                decimal minValue = check minRT.value;
                minResponseTimeTimeSeries[timestamp] = minValue;

                json maxRT = check timeBucket.max_response_time;
                decimal maxValue = check maxRT.value;
                maxResponseTimeTimeSeries[timestamp] = maxValue;

                json percentilesRT = check timeBucket.percentiles_response_time;
                json percentilesValues = check percentilesRT.values;
                map<json> percentilesMap = check percentilesValues.ensureType();

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

        if (requestsTotalTimeSeries.length() > 0) {
            types:MetricEntry metricEntry = {
                tags: tags,
                requests_total: {name: "requests_total", timeSeriesData: requestsTotalTimeSeries},
                response_time_seconds_avg: {name: "response_time_seconds_avg", timeSeriesData: avgResponseTimeTimeSeries},
                response_time_seconds_min: {name: "response_time_seconds_min", timeSeriesData: minResponseTimeTimeSeries},
                response_time_seconds_max: {name: "response_time_seconds_max", timeSeriesData: maxResponseTimeTimeSeries},
                response_time_seconds_percentile_33: {name: "response_time_seconds_percentile_33", timeSeriesData: percentile33TimeSeries},
                response_time_seconds_percentile_50: {name: "response_time_seconds_percentile_50", timeSeriesData: percentile50TimeSeries},
                response_time_seconds_percentile_66: {name: "response_time_seconds_percentile_66", timeSeriesData: percentile66TimeSeries},
                response_time_seconds_percentile_95: {name: "response_time_seconds_percentile_95", timeSeriesData: percentile95TimeSeries},
                response_time_seconds_percentile_99: {name: "response_time_seconds_percentile_99", timeSeriesData: percentile99TimeSeries}
            };
            metrics.push(metricEntry);
        }
    }

    // Split into inbound (service/worker entries) and outbound (client remote calls)
    // Use hasKey() to avoid {ballerina/lang.map}KeyNotFound on missing tag fields
    types:MetricEntry[] inboundMetrics = metrics.filter(m =>
        !(m.tags.hasKey("src_client_remote") && m.tags.get("src_client_remote") == "true")
        && m.tags.hasKey("url"));
    types:MetricEntry[] outboundMetrics = metrics.filter(m =>
        m.tags.hasKey("src_client_remote") && m.tags.get("src_client_remote") == "true");
    log:printDebug("BI Filtered metrics - Total: " + metrics.length().toString() + ", Inbound: " + inboundMetrics.length().toString() + ", Outbound: " + outboundMetrics.length().toString());

    log:printDebug("Returning " + inboundMetrics.length().toString() + " BI inbound and " + outboundMetrics.length().toString() + " BI outbound metric entries");

    return {
        inboundMetrics: inboundMetrics,
        outboundMetrics: outboundMetrics
    };
}

// ──────────────────────────────────────────────────────────────────────────────
// Micro Integrator (MI) metrics — index: mi-metrics-logs-*
//
// MI document schema (flat + nested):
//   @timestamp, service_type, product, payload.entityType, payload.latency (ms),
//   payload.failure, payload.faultResponse,
//   payload.apiDetails.api, payload.apiDetails.apiContext, payload.apiDetails.method,
//   payload.apiDetails.transport, payload.apiDetails.subRequestPath,
//   serverInfo.hostname, serverInfo.serverName, serverInfo.id
//
// Inbound requests are identified by the presence of `payload.apiDetails`.
// Latency is in milliseconds; we convert to seconds to match the BI schema.
// ──────────────────────────────────────────────────────────────────────────────

isolated function fetchMIMetrics(types:MetricEntryRequest metricRequest) returns types:MetricEntriesResponse|error {
    // Build OpenSearch query for MI metrics
    json miQuery = check getMIMetricQuery(metricRequest);
    log:printDebug("MI OpenSearch metrics query: " + miQuery.toJsonString());

    // Check if opensearch client is available
    http:Client? httpClient = opensearchClient;
    if httpClient is () {
        log:printError("OpenSearch client is not configured or unavailable");
        return error("OpenSearch service is unavailable. Please ensure OpenSearch is configured and running.");
    }

    // Execute the query
    json|error miResponseResult = httpClient->post("/mi-metrics-logs-*/_search", miQuery);
    if miResponseResult is error {
        log:printError(string `Failed to query OpenSearch for MI metrics: ${miResponseResult.message()}`);
        return error("OpenSearch service is unavailable. Please ensure OpenSearch is configured and running.");
    }
    json miResponseJson = miResponseResult;

    // Parse the response and build metrics
    types:MetricEntry[] inboundMetrics = [];

    // Extract aggregation buckets — return empty if no aggregations present
    json|error aggregationsResult = miResponseJson.aggregations;
    if aggregationsResult is error {
        log:printWarn("No aggregations in MI metrics response. Returning empty result.");
        return {inboundMetrics: [], outboundMetrics: []};
    }
    json aggregations = aggregationsResult;
    json apiGroups = check aggregations.api_groups;
    json[] buckets = check apiGroups.buckets.ensureType();

    log:printDebug("MI metrics: Found " + buckets.length().toString() + " unique API groups");

    foreach json bucket in buckets {
        // Extract composite key fields as tags
        json bucketKey = check bucket.key;
        map<json> keyMap = check bucketKey.ensureType();

        map<string> tags = {};
        foreach string tagField in keyMap.keys() {
            json tagValue = keyMap.get(tagField);
            if tagValue is string && tagValue != "" {
                tags[tagField] = tagValue;
            }
        }

        // Derive status and sublevel tags to align with BI schema used by the frontend
        string apiName = tags["api"] ?: "";
        string apiContext = tags["apiContext"] ?: "";
        string method = tags["method"] ?: "";
        tags["sublevel"] = apiName;
        tags["integration"] = apiContext;
        tags["service_type"] = "MI";
        tags["product"] = "Micro Integrator";

        // Get time buckets
        json timeBuckets = check bucket.time_buckets;
        json[] timeBucketArray = check timeBuckets.buckets.ensureType();

        // Build time series data
        map<int> requestsTotalTimeSeries = {};
        map<decimal> avgLatencyTimeSeries = {};
        map<decimal> minLatencyTimeSeries = {};
        map<decimal> maxLatencyTimeSeries = {};
        map<decimal> percentile33TimeSeries = {};
        map<decimal> percentile50TimeSeries = {};
        map<decimal> percentile66TimeSeries = {};
        map<decimal> percentile95TimeSeries = {};
        map<decimal> percentile99TimeSeries = {};

        // Track successful and failed counts per time bucket for status split
        map<int> failedCountTimeSeries = {};

        foreach json timeBucket in timeBucketArray {
            string timestamp = check timeBucket.key_as_string;
            int docCount = check timeBucket.doc_count;

            requestsTotalTimeSeries[timestamp] = docCount;

            // Extract failed request count from the filter aggregation
            json failedBucket = check timeBucket.failed_requests;
            int failedCount = check failedBucket.doc_count;
            failedCountTimeSeries[timestamp] = failedCount;

            if (docCount > 0) {
                // MI latency is in milliseconds — convert to seconds to match BI schema
                json avgLat = check timeBucket.avg_latency;
                decimal avgMs = check avgLat.value;
                avgLatencyTimeSeries[timestamp] = avgMs / 1000;

                json minLat = check timeBucket.min_latency;
                decimal minMs = check minLat.value;
                minLatencyTimeSeries[timestamp] = minMs / 1000;

                json maxLat = check timeBucket.max_latency;
                decimal maxMs = check maxLat.value;
                maxLatencyTimeSeries[timestamp] = maxMs / 1000;

                json percentilesLat = check timeBucket.percentiles_latency;
                json percentilesValues = check percentilesLat.values;
                map<json> percentilesMap = check percentilesValues.ensureType();

                decimal p33 = check percentilesMap["33.0"];
                percentile33TimeSeries[timestamp] = p33 / 1000;
                decimal p50 = check percentilesMap["50.0"];
                percentile50TimeSeries[timestamp] = p50 / 1000;
                decimal p66 = check percentilesMap["66.0"];
                percentile66TimeSeries[timestamp] = p66 / 1000;
                decimal p95 = check percentilesMap["95.0"];
                percentile95TimeSeries[timestamp] = p95 / 1000;
                decimal p99 = check percentilesMap["99.0"];
                percentile99TimeSeries[timestamp] = p99 / 1000;
            } else {
                avgLatencyTimeSeries[timestamp] = 0;
                minLatencyTimeSeries[timestamp] = 0;
                maxLatencyTimeSeries[timestamp] = 0;
                percentile33TimeSeries[timestamp] = 0;
                percentile50TimeSeries[timestamp] = 0;
                percentile66TimeSeries[timestamp] = 0;
                percentile95TimeSeries[timestamp] = 0;
                percentile99TimeSeries[timestamp] = 0;
            }
        }

        // Emit a "successful" metric entry
        map<int> successfulTimeSeries = {};
        foreach string ts in requestsTotalTimeSeries.keys() {
            int total = requestsTotalTimeSeries[ts] ?: 0;
            int failed = failedCountTimeSeries[ts] ?: 0;
            successfulTimeSeries[ts] = total - failed;
        }

        if (requestsTotalTimeSeries.length() > 0) {
            // Successful entry
            map<string> successTags = tags.clone();
            successTags["status"] = "successful";
            successTags["method"] = method;
            types:MetricEntry successEntry = {
                tags: successTags,
                requests_total: {name: "requests_total", timeSeriesData: successfulTimeSeries},
                response_time_seconds_avg: {name: "response_time_seconds_avg", timeSeriesData: avgLatencyTimeSeries},
                response_time_seconds_min: {name: "response_time_seconds_min", timeSeriesData: minLatencyTimeSeries},
                response_time_seconds_max: {name: "response_time_seconds_max", timeSeriesData: maxLatencyTimeSeries},
                response_time_seconds_percentile_33: {name: "response_time_seconds_percentile_33", timeSeriesData: percentile33TimeSeries},
                response_time_seconds_percentile_50: {name: "response_time_seconds_percentile_50", timeSeriesData: percentile50TimeSeries},
                response_time_seconds_percentile_66: {name: "response_time_seconds_percentile_66", timeSeriesData: percentile66TimeSeries},
                response_time_seconds_percentile_95: {name: "response_time_seconds_percentile_95", timeSeriesData: percentile95TimeSeries},
                response_time_seconds_percentile_99: {name: "response_time_seconds_percentile_99", timeSeriesData: percentile99TimeSeries}
            };
            inboundMetrics.push(successEntry);

            // Failed entry (only if there were failures)
            boolean hasFailures = false;
            foreach int fc in failedCountTimeSeries {
                if fc > 0 {
                    hasFailures = true;
                    break;
                }
            }
            if hasFailures {
                map<string> failTags = tags.clone();
                failTags["status"] = "failed";
                failTags["method"] = method;
                // For failed entries, zero-fill latency since MI doesn't provide per-failure latency
                map<decimal> zeroDecimalSeries = {};
                foreach string ts in requestsTotalTimeSeries.keys() {
                    zeroDecimalSeries[ts] = 0;
                }
                types:MetricEntry failEntry = {
                    tags: failTags,
                    requests_total: {name: "requests_total", timeSeriesData: failedCountTimeSeries},
                    response_time_seconds_avg: {name: "response_time_seconds_avg", timeSeriesData: zeroDecimalSeries},
                    response_time_seconds_min: {name: "response_time_seconds_min", timeSeriesData: zeroDecimalSeries},
                    response_time_seconds_max: {name: "response_time_seconds_max", timeSeriesData: zeroDecimalSeries},
                    response_time_seconds_percentile_33: {name: "response_time_seconds_percentile_33", timeSeriesData: zeroDecimalSeries},
                    response_time_seconds_percentile_50: {name: "response_time_seconds_percentile_50", timeSeriesData: zeroDecimalSeries},
                    response_time_seconds_percentile_66: {name: "response_time_seconds_percentile_66", timeSeriesData: zeroDecimalSeries},
                    response_time_seconds_percentile_95: {name: "response_time_seconds_percentile_95", timeSeriesData: zeroDecimalSeries},
                    response_time_seconds_percentile_99: {name: "response_time_seconds_percentile_99", timeSeriesData: zeroDecimalSeries}
                };
                inboundMetrics.push(failEntry);
            }
        }
    }

    log:printDebug("Returning " + inboundMetrics.length().toString() + " MI inbound metric entries");

    return {
        inboundMetrics: inboundMetrics,
        outboundMetrics: []
    };
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

    // Append any extra fields from the open record (e.g. 'error', custom app fields)
    // that are not already handled explicitly above.
    string[] knownFields = ["time", "level", "message", "service_type", "module", "app_name",
                            "artifact_container", "traceId", "spanId", "icp_runtimeId",
                            "@timestamp", "log_file_path", "product", "deployment", "app",
                            "app_module", "class", "icp.runtimeId"];
    string extraFields = "";
    map<anydata> sourceMap = <map<anydata>>sourceData;
    foreach [string, anydata] [key, val] in sourceMap.entries() {
        if knownFields.indexOf(key) is () {
            string strVal = val.toString();
            if strVal != "" && strVal != "()" {
                extraFields += string ` ${key}=${strVal}`;
            }
        }
    }

    // Construct the log entry in logfmt style
    return string `time=${time} level=${level}${serviceSpecificFields} message="${message}"${traceId}${spanId}${runtimeId}${extraFields}`;
}

// Helper function to deduplicate log entries based on composite key
// Uses the same fields as Fluent Bit's generate_document_id to ensure consistent deduplication:
// timestamp (raw time field) | message (raw message) | level | icp_runtimeId | log_file_path
// Uses U+001F (unit separator) as delimiter to prevent ambiguous keys
function deduplicateLogEntries(json[][] rows) returns json[][] {
    map<boolean> seenEntries = {};
    json[][] uniqueRows = [];

    // Unit separator control character - cannot appear in ISO-8601 timestamps or normal log text
    string delimiter = "\u{001F}";

    foreach json[] row in rows {
        // Extract fields using named constants to avoid fragile positional indices
        // Use raw fields that match Fluent Bit's composite key format
        string rawTime = row[COL_RAW_TIME] is string ? <string>row[COL_RAW_TIME] : row[COL_RAW_TIME].toString();
        string rawMessage = row[COL_RAW_MESSAGE] is string ? <string>row[COL_RAW_MESSAGE] : "";
        string level = row[COL_LEVEL] is string ? <string>row[COL_LEVEL] : row[COL_LEVEL].toString();
        string icpRuntimeId = row[COL_ICP_RUNTIME_ID] is string ? <string>row[COL_ICP_RUNTIME_ID] : "";
        string logFilePath = row[COL_LOG_FILE_PATH] is string ? <string>row[COL_LOG_FILE_PATH] : "";

        // Create composite key matching Fluent Bit's format:
        // timestamp_str <US> message <US> level <US> runtime_id <US> log_file_path
        string compositeKey = string `${rawTime}${delimiter}${rawMessage}${delimiter}${level}${delimiter}${icpRuntimeId}${delimiter}${logFilePath}`;

        // Only add if we haven't seen this combination before
        if !seenEntries.hasKey(compositeKey) {
            seenEntries[compositeKey] = true;
            uniqueRows.push(row);
        }
    }

    return uniqueRows;
}

// Predefined set of Ballerina metrics tag fields used in composite aggregation.
// These are the known fields emitted by the Ballerina metrics publisher, excluding
// high-cardinality or non-tag fields (timestamps, trace IDs, raw metric values, etc.).
// Using a static list avoids a costly sample-document query on every metrics request.
//
// IMPORTANT — impact of a missing field:
//   If the Ballerina observability library emits a new tag field that is NOT listed here,
//   the system will NOT crash and metrics counts/latencies will remain correct.
//   The only effect is reduced granularity: documents that differ only by the unknown
//   field will be merged into the same aggregation group instead of being split.
//   Add any new fields from ballerinax/metrics.logs emitted documents to this list
//   when upgrading the Ballerina observability library or the ICP runtime agent.
final readonly & string[] METRICS_TAG_FIELDS = [
    "status",
    "sublevel",
    "deployment",
    "app_name",
    "integration",
    "src_client_remote",
    "url",
    "icp_runtimeId",
    "service_type",
    "app",
    "module",
    "app_module",
    "src_module",
    "protocol",
    "method",
    "http_method",
    "status_code_group",
    "http_status_code_group",
    "product",
    "src_object_name",
    "src_function_name",
    "entrypoint_function_name",
    "entrypoint_function_module"
];

isolated function getBIMetricQuery(types:MetricEntryRequest metricRequest) returns json|error {
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

    // Build composite aggregation sources from the predefined tag field list.
    // missing_bucket:true ensures tag combinations with absent fields are still grouped.
    json[] compositeSources = [];
    foreach string tagKey in METRICS_TAG_FIELDS {
        compositeSources.push({
            [tagKey]: {
                "terms": {
                    "field": tagKey + ".keyword",
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

// Build OpenSearch query for MI metrics.
// MI documents store metrics in nested payload fields and don't have a top-level response_time_seconds.
// Only inbound requests (payload.entityType == "API" with apiDetails) are queried.
// Grouped by: api, apiContext, method, transport — then time-bucketed with latency stats.
isolated function getMIMetricQuery(types:MetricEntryRequest metricRequest) returns json|error {
    string interval = metricRequest.resolutionInterval;
    string startTime = metricRequest.startTime;
    string endTime = metricRequest.endTime;

    // Build must clauses
    json[] mustClauses = [
        // Only inbound API requests (documents with payload.apiDetails)
        {
            "exists": {
                "field": "payload.apiDetails"
            }
        },
        {
            "term": {
                "payload.entityType.keyword": "API"
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

    // Filter by runtime IDs
    string[] runtimeIds = metricRequest.runtimeIdList;
    if (runtimeIds.length() > 0) {
        mustClauses.push({
            "terms": {
                "icp_runtimeId.keyword": runtimeIds
            }
        });
    }

    // Composite sources for grouping: api name, context, method, transport, runtimeId
    json[] compositeSources = [
        {"api": {"terms": {"field": "payload.apiDetails.api.keyword", "missing_bucket": true}}},
        {"apiContext": {"terms": {"field": "payload.apiDetails.apiContext.keyword", "missing_bucket": true}}},
        {"method": {"terms": {"field": "payload.apiDetails.method.keyword", "missing_bucket": true}}},
        {"transport": {"terms": {"field": "payload.apiDetails.transport.keyword", "missing_bucket": true}}},
        {"icp_runtimeId": {"terms": {"field": "icp_runtimeId.keyword", "missing_bucket": true}}}
    ];

    json miQuery = {
        "size": 0,
        "query": {
            "bool": {
                "must": mustClauses
            }
        },
        "aggs": {
            "api_groups": {
                "composite": {
                    "size": 10000,
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
                            "avg_latency": {
                                "avg": {"field": "payload.latency"}
                            },
                            "min_latency": {
                                "min": {"field": "payload.latency"}
                            },
                            "max_latency": {
                                "max": {"field": "payload.latency"}
                            },
                            "percentiles_latency": {
                                "percentiles": {
                                    "field": "payload.latency",
                                    "percents": [33.0, 50.0, 66.0, 95.0, 99.0]
                                }
                            },
                            "failed_requests": {
                                "filter": {
                                    "bool": {
                                        "should": [
                                            {"term": {"payload.failure": true}},
                                            {"term": {"payload.faultResponse": true}}
                                        ],
                                        "minimum_should_match": 1
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    };

    return miQuery;
}
