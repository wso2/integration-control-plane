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

import icp_server.auth;
import icp_server.storage as storage;
import icp_server.types as types;

import ballerina/http;
import ballerina/jwt;
import ballerina/log;

// Observability JWT configuration record with defaults
type ObservabilityJwtConfig record {|
    string hmacSecret = resolvedObservabilityJwtHMACSecret;
    string issuer = "icp-observability-jwt-issuer";
    string audience = "icp-observability-adaptor";
    decimal expiryTimeSeconds = 120; // 2 minutes
|};

// Observability secure socket configuration
type ObservabilitySecureSocketConfig record {|
    boolean allowInsecureTLS = false; // Allow self-signed certs for dev/test; set to false in production
    boolean useCustomTruststore = true; // Use custom truststore instead of system CA
    string truststorePath = truststorePath; // Path to truststore defaults to same as server truststore
    string truststorePassword = resolvedObservabilityTruststorePassword; // Truststore password defaults to observability-specific truststore
    boolean verifyHostname = true; // Verify server hostname against certificate
|};

// Observability HTTP client configuration
type ObservabilityClientConfig record {|
    decimal timeout = 5; // Request timeout in seconds - fail fast for browser compatibility
    int retryCount = 3; // Number of retry attempts
    decimal retryInterval = 2; // Retry interval in seconds
    decimal retryBackoffFactor = 2.0; // Exponential backoff multiplier
    int maxPoolSize = 50; // Maximum connection pool size
|};

// Generate a short-lived JWT token for authenticating with opensearch adapter service
// Called on each request for simplicity and security
isolated function generateObservabilityToken() returns string|error {
    jwt:IssuerConfig issuerConfig = {
        issuer: observabilityJwt.issuer,
        audience: observabilityJwt.audience,
        expTime: observabilityJwt.expiryTimeSeconds,
        signatureConfig: {
            algorithm: jwt:HS256,
            config: observabilityJwt.hmacSecret
        }
    };

    string|jwt:Error jwtToken = jwt:issue(issuerConfig);
    if jwtToken is jwt:Error {
        log:printError("Error generating observability JWT token", jwtToken);
        return error("Failed to generate observability JWT token", jwtToken);
    }

    return jwtToken;
}

// Build secure socket configuration based on settings
isolated function getObservabilitySecureSocketConfig() returns http:ClientSecureSocket {
    if observabilitySecureSocket.allowInsecureTLS {
        return {enable: false};
    }

    // TLS enabled - choose truststore or system CA
    if observabilitySecureSocket.useCustomTruststore {
        // Use custom truststore
        return {
            cert: {
                path: observabilitySecureSocket.truststorePath,
                password: observabilitySecureSocket.truststorePassword
            },
            verifyHostName: observabilitySecureSocket.verifyHostname
        };

    }

    // Use system CA certificates (default for production)
    return {
        verifyHostName: observabilitySecureSocket.verifyHostname
    };
}

// HTTP client for OpenSearch adapter with configurable settings
// Token authentication added per request via Authorization header
// This client is optional - if initialization fails, observability endpoints will return service unavailable
final http:Client? observabilityHttpClient = initObservabilityClient();

isolated function initObservabilityClient() returns http:Client? {
    // Initialize HTTP client - connection errors will be handled per-request
    // No retries to fail fast on unreachable backend
    http:Client|error httpClient = new (observabilityBackendURL,
        {
            timeout: observabilityClient.timeout,
            poolConfig: {
                maxActiveConnections: observabilityClient.maxPoolSize
            },
            secureSocket: getObservabilitySecureSocketConfig()
        }
    );

    if httpClient is error {
        log:printWarn(string `Failed to initialize observability client: ${httpClient.message()}. Observability endpoints will be unavailable.`);
        return ();
    }

    log:printInfo("Observability client initialized successfully");
    return httpClient;
}

// Caller must run after HTTP JWT validation (Authorization present and signature verified).
isolated function extractUserFromObservabilityRequest(http:Request request) returns types:UserContextV2|error {
    string|http:HeaderNotFoundError authHeader = request.getHeader("Authorization");
    if authHeader is http:HeaderNotFoundError {
        return error("Authorization header missing");
    }
    return auth:extractUserContextV2(authHeader);
}

// Restrict resolved runtimes to those the user may access (integration + environment scope).
isolated function filterRuntimeIdsForUser(string userId, string[] runtimeIds) returns string[]|error {
    log:printDebug("Filtering runtime IDs for user", userId = userId, runtimeCount = runtimeIds.length());
    string[] filtered = [];
    foreach string rid in runtimeIds {
        boolean|error allowed = storage:hasAccessToRuntime(userId, rid);
        if allowed is error {
            return allowed;
        }
        if allowed {
            filtered.push(rid);
        }
    }
    return filtered;
}

@http:ServiceConfig {
    auth: [
        {
            jwtValidatorConfig: {
                issuer: frontendJwtIssuer,
                audience: frontendJwtAudience,
                signatureConfig: {
                    secret: resolvedFrontendJwtHMACSecret
                }
            }
        }
    ],
    cors: {
        allowOrigins: normalizedCorsAllowedOrigins,
        allowHeaders: ["Content-Type", "Authorization"]
    }
}
service /icp/observability on httpListener {

    function init() {
        log:printInfo("Observability service started at " + serverHost + ":" + serverPort.toString());
    }

    resource function post logs(http:Request request, types:ICPLogEntryRequest logRequest) returns types:LogEntriesResponse|http:Response|error {
        log:printDebug("Received log request: " + logRequest.toString());

        // Transform ICPLogEntryRequest to LogEntryRequest by resolving component/environment filters to runtime IDs
        string[] runtimeIdList = check resolveRuntimeIds({
                                                             componentId: logRequest.componentId,
                                                             componentIdList: logRequest.componentIdList,
                                                             environmentId: logRequest.environmentId,
                                                             environmentList: logRequest.environmentList
                                                         });

        types:UserContextV2 userContext = check extractUserFromObservabilityRequest(request);
        log:printInfo("Processing logs request", userId = userContext.userId);
        runtimeIdList = check filterRuntimeIdsForUser(userContext.userId, runtimeIdList);

        // If component/environment filters were provided but no runtimes found, return empty result
        boolean hasFilters = logRequest.componentId is string ||
                            (logRequest.componentIdList is string[] && (<string[]>logRequest.componentIdList).length() > 0) ||
                            logRequest.environmentId is string ||
                            (logRequest.environmentList is string[] && (<string[]>logRequest.environmentList).length() > 0);

        if (hasFilters && runtimeIdList.length() == 0) {
            log:printDebug("No runtimes found for the given component/environment filters. Returning empty result.");
            return {
                columns: [],
                rows: []
            };
        }

        // Guard: an empty runtimeIdList with no filters would produce an unscoped OpenSearch query
        // returning data across all runtimes. Return empty instead.
        if runtimeIdList.length() == 0 {
            return {
                columns: [],
                rows: []
            };
        }

        // Check if observability client is available before any runtime-type lookups
        http:Client? httpClient = observabilityHttpClient;
        if httpClient is () {
            log:printWarn("Observability backend is not configured or unavailable");
            http:Response unavailableResponse = new;
            unavailableResponse.statusCode = 503;
            unavailableResponse.setPayload({
                message: "Observability service is unavailable. Please ensure Observability backend is configured and running."
            });
            return unavailableResponse;
        }

        // Resolve runtime types to request
        types:LogIndexRuntimeType componentType = check resolveComponentTypes(runtimeIdList);
        log:printDebug("Resolved component type: " + componentType.toString() + " for log filtering");

        // Construct LogEntryRequest with resolved runtime IDs and copy other filter fields
        types:LogEntryRequest adaptorRequest = {
            runtimeIdList: runtimeIdList,
            logLevels: logRequest.logLevels,
            region: logRequest.region,
            searchPhrase: logRequest.searchPhrase,
            regexPhrase: logRequest.regexPhrase,
            startTime: logRequest.startTime,
            endTime: logRequest.endTime,
            'limit: logRequest.'limit,
            sort: logRequest.sort
        };

        log:printDebug("Invoking observability adapter with " + runtimeIdList.length().toString() + " runtime IDs");

        // Generate fresh JWT token and invoke observability adapter service
        string token = check generateObservabilityToken();
        map<string|string[]> headers = {"Authorization": "Bearer " + token};
        types:LogEntriesResponse|error response = httpClient->post(string `/observability/logs/${componentType.toString()}`, adaptorRequest, headers);
        if response is error {
            // Forward upstream 4xx/5xx errors with their status code and body
            if response is http:ClientRequestError|http:RemoteServerError {
                var detail = response.detail();
                log:printWarn(string `Observability backend returned ${detail.statusCode}: ${response.message()}`);
                http:Response errorResponse = new;
                errorResponse.statusCode = detail.statusCode;
                errorResponse.setPayload(detail.body);
                return errorResponse;
            }
            // Connection or other client failures - return 503
            log:printWarn(string `Failed to connect to observability backend: ${response.message()}`);
            http:Response unavailableResponse = new;
            unavailableResponse.statusCode = 503;
            unavailableResponse.setPayload({
                message: "Observability service is unavailable. Please ensure Observability backend is configured and running."
            });
            return unavailableResponse;
        }
        return response;
    }

    // Workflow metrics: the same request as `metrics`, answered from the samples the Ballerina
    // workflow module publishes (runs, activity attempts, data events, task decisions).
    resource function post workflow\-metrics(http:Request request, types:ICPMetricEntryRequest metricRequest) returns types:WorkflowMetricEntriesResponse|http:Response|error {
        log:printDebug("Received workflow metric request: " + metricRequest.toString());

        string[] runtimeIdList = check resolveRuntimeIds({
                                                             componentId: metricRequest.componentId,
                                                             componentIdList: metricRequest.componentIdList,
                                                             environmentId: metricRequest.environmentId,
                                                             environmentList: metricRequest.environmentList
                                                         });

        types:UserContextV2 userContext = check extractUserFromObservabilityRequest(request);
        log:printInfo("Processing workflow metrics request", userId = userContext.userId);
        runtimeIdList = check filterRuntimeIdsForUser(userContext.userId, runtimeIdList);

        // No runtimes to scope by — either the filters matched none, or none were given, and an
        // unscoped query would read every runtime's samples. Either way, nothing to show.
        if runtimeIdList.length() == 0 {
            return {runs: [], activities: [], decisions: [], dataEvents: []};
        }

        http:Client? httpClient = observabilityHttpClient;
        if httpClient is () {
            log:printWarn("Observability backend is not configured or unavailable");
            http:Response unavailableResponse = new;
            unavailableResponse.statusCode = 503;
            unavailableResponse.setPayload({
                message: "Observability service is unavailable. Please ensure Observability backend is configured and running."
            });
            return unavailableResponse;
        }

        types:LogIndexRuntimeType componentType = check resolveComponentTypes(runtimeIdList);
        types:MetricEntryRequest adaptorRequest = {
            runtimeIdList: runtimeIdList,
            region: metricRequest.region,
            startTime: metricRequest.startTime,
            endTime: metricRequest.endTime,
            resolutionInterval: metricRequest.resolutionInterval
        };

        string token = check generateObservabilityToken();
        map<string|string[]> headers = {"Authorization": "Bearer " + token};
        types:WorkflowMetricEntriesResponse|error response = httpClient->post(string `/observability/workflow-metrics/${componentType.toString()}`, adaptorRequest, headers);
        if response is error {
            if response is http:ClientRequestError|http:RemoteServerError {
                var detail = response.detail();
                log:printWarn(string `Observability backend returned ${detail.statusCode}: ${response.message()}`);
                http:Response errorResponse = new;
                errorResponse.statusCode = detail.statusCode;
                errorResponse.setPayload(detail.body);
                return errorResponse;
            }
            log:printWarn(string `Failed to connect to observability backend: ${response.message()}`);
            http:Response unavailableResponse = new;
            unavailableResponse.statusCode = 503;
            unavailableResponse.setPayload({
                message: "Observability service is unavailable. Please ensure Observability backend is configured and running."
            });
            return unavailableResponse;
        }
        return response;
    }

    resource function post metrics(http:Request request, types:ICPMetricEntryRequest metricRequest) returns types:MetricEntriesResponse|http:Response|error {

        log:printDebug("Received metric request: " + metricRequest.toString());

        // Transform ICPMetricEntryRequest to MetricEntryRequest by resolving component/environment filters to runtime IDs
        string[] runtimeIdList = check resolveRuntimeIds({
                                                             componentId: metricRequest.componentId,
                                                             componentIdList: metricRequest.componentIdList,
                                                             environmentId: metricRequest.environmentId,
                                                             environmentList: metricRequest.environmentList
                                                         });

        types:UserContextV2 userContext = check extractUserFromObservabilityRequest(request);
        log:printInfo("Processing metrics request", userId = userContext.userId);
        runtimeIdList = check filterRuntimeIdsForUser(userContext.userId, runtimeIdList);

        // If component/environment filters were provided but no runtimes found, return empty result
        boolean hasFilters = metricRequest.componentId is string ||
                            (metricRequest.componentIdList is string[] && (<string[]>metricRequest.componentIdList).length() > 0) ||
                            metricRequest.environmentId is string ||
                            (metricRequest.environmentList is string[] && (<string[]>metricRequest.environmentList).length() > 0);

        if (hasFilters && runtimeIdList.length() == 0) {
            log:printDebug("No runtimes found for the given component/environment filters. Returning empty result.");
            return {
                inboundMetrics: [],
                outboundMetrics: []
            };
        }

        // Guard: an empty runtimeIdList with no filters would produce an unscoped OpenSearch query
        // returning data across all runtimes. Return empty instead.
        if runtimeIdList.length() == 0 {
            return {
                inboundMetrics: [],
                outboundMetrics: []
            };
        }

        // Check if observability client is available before any runtime-type lookups
        http:Client? httpClient = observabilityHttpClient;
        if httpClient is () {
            log:printWarn("Observability backend is not configured or unavailable");
            http:Response unavailableResponse = new;
            unavailableResponse.statusCode = 503;
            unavailableResponse.setPayload({
                message: "Observability service is unavailable. Please ensure Observability backend is configured and running."
            });
            return unavailableResponse;
        }

        // Resolve runtime types to determine which index to query (same as logs)
        types:LogIndexRuntimeType componentType = check resolveComponentTypes(runtimeIdList);
        log:printDebug("Resolved component type: " + componentType.toString() + " for metrics filtering");

        // Construct MetricEntryRequest with resolved runtime IDs and copy other filter fields
        types:MetricEntryRequest adaptorRequest = {
            runtimeIdList: runtimeIdList,
            region: metricRequest.region,
            startTime: metricRequest.startTime,
            endTime: metricRequest.endTime,
            resolutionInterval: metricRequest.resolutionInterval
        };

        log:printDebug("Invoking observability adapter with " + runtimeIdList.length().toString() + " runtime IDs for component type: " + componentType.toString());

        // Generate fresh JWT token and invoke observability adapter service with component type path param
        string token = check generateObservabilityToken();
        map<string|string[]> headers = {"Authorization": "Bearer " + token};
        types:MetricEntriesResponse|error response = httpClient->post(string `/observability/metrics/${componentType.toString()}`, adaptorRequest, headers);
        if response is error {
            // Forward upstream 4xx/5xx errors with their status code and body
            if response is http:ClientRequestError|http:RemoteServerError {
                var detail = response.detail();
                log:printWarn(string `Observability backend returned ${detail.statusCode}: ${response.message()}`);
                http:Response errorResponse = new;
                errorResponse.statusCode = detail.statusCode;
                errorResponse.setPayload(detail.body);
                return errorResponse;
            }
            // Connection or other client failures - return 503
            log:printWarn(string `Failed to connect to observability backend: ${response.message()}`);
            http:Response unavailableResponse = new;
            unavailableResponse.statusCode = 503;
            unavailableResponse.setPayload({
                message: "Observability service is unavailable. Please ensure Observability backend is configured and running."
            });
            return unavailableResponse;
        }
        return response;
    }
}

// Resolve component/environment filters to runtime IDs by querying the storage layer
isolated function resolveRuntimeIds(types:IntegrationDetails integrationDetails) returns string[]|error {
    string[] runtimeIds = [];

    // Build list of component IDs to query
    string[] componentIds = [];
    if integrationDetails.componentId is string {
        componentIds.push(<string>integrationDetails.componentId);
    }
    if integrationDetails.componentIdList is string[] {
        componentIds.push(...<string[]>integrationDetails.componentIdList);
    }

    // Build list of environment IDs to query
    string[] environmentIds = [];
    if integrationDetails.environmentId is string {
        environmentIds.push(<string>integrationDetails.environmentId);
    }
    if integrationDetails.environmentList is string[] {
        environmentIds.push(...<string[]>integrationDetails.environmentList);
    }

    // Query runtimes based on filters
    if componentIds.length() > 0 || environmentIds.length() > 0 {
        // If both component and environment filters exist, query for each component-environment combination
        if componentIds.length() > 0 && environmentIds.length() > 0 {
            foreach string componentId in componentIds {
                foreach string environmentId in environmentIds {
                    types:Runtime[] runtimes = check storage:getRuntimes((), (), environmentId, (), componentId);
                    foreach types:Runtime runtime in runtimes {
                        runtimeIds.push(runtime.runtimeId);
                    }
                }
            }
        }
        // If only component IDs, query by component
        else if componentIds.length() > 0 {
            foreach string componentId in componentIds {
                types:Runtime[] runtimes = check storage:getRuntimes((), (), (), (), componentId);
                foreach types:Runtime runtime in runtimes {
                    runtimeIds.push(runtime.runtimeId);
                }
            }
        }
        // If only environment IDs, query by environment
        else {
            foreach string environmentId in environmentIds {
                types:Runtime[] runtimes = check storage:getRuntimes((), (), environmentId, (), ());
                foreach types:Runtime runtime in runtimes {
                    runtimeIds.push(runtime.runtimeId);
                }
            }
        }
    }

    log:printDebug("Resolved " + runtimeIds.length().toString() + " runtime IDs from component/environment filters");
    return runtimeIds;
}

isolated function resolveComponentTypes(string[] runtimeIdList) returns types:LogIndexRuntimeType|error {
    boolean hasMIRuntime = false;
    boolean hasBIRuntime = false;
    foreach string runtimeId in runtimeIdList {
        types:RuntimeTypeRecord? runtimeType = check storage:getRuntimeTypeById(runtimeId);
        if !(runtimeType is ()) && runtimeType.runtimeType == "MI" {
            hasMIRuntime = true;
        } else if !(runtimeType is ()) && runtimeType.runtimeType == "BI" {
            hasBIRuntime = true;
        }
        if hasMIRuntime && hasBIRuntime {
            return "ALL";
        }
    }
    if hasBIRuntime {
        return "BI";
    } else if hasMIRuntime {
        return "MI";
    } else {
        string errorMsg = "Could not resolve component types for filtering logs";
        log:printError(errorMsg);
        return error(errorMsg);
    }
}
