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
import icp_server.utils;

import ballerina/http;
import ballerina/jwt;
import ballerina/log;
import ballerina/sql;

// Constants for artifact management
const string ICP_ARTIFACTS_PATH = "/icp/artifacts";

// Async worker function to send MI control command (fire-and-forget)
public isolated function sendMIControlCommandAsync(string runtimeId, string artifactType, string artifactName, string action) {
    log:printInfo(string `Sending MI control command: runtime=${runtimeId}, artifact=${artifactName}, type=${artifactType}, action=${action}`);
    do {
        // Get runtime details
        types:Runtime? runtime = check getRuntimeById(runtimeId);
        if runtime is () {
            log:printWarn(string `Runtime ${runtimeId} not found, cannot send MI control command`);
            return;
        }

        string baseUrl = check buildManagementBaseUrl(runtime.managementHostname, runtime.managementPort);

        http:Client|error mgmtClientResult = artifactsApiAllowInsecureTLS
            ? new (baseUrl, {secureSocket: {enable: false}})
            : new (baseUrl);

        if mgmtClientResult is error {
            log:printError("Failed to create management API client for MI command", runtimeId = runtimeId, 'error = mgmtClientResult);
            return;
        }

        http:Client mgmtClient = mgmtClientResult;
        string hmacToken = check issueRuntimeHmacToken();

        string artifactPath;
        json payload;

        // Determine API endpoint and payload based on action type
        if action == types:ARTIFACT_ENABLE || action == types:ARTIFACT_DISABLE || action == types:ARTIFACT_TRIGGER {
            // Status change: active/inactive/trigger
            string status;
            if action == types:ARTIFACT_ENABLE {
                status = "active";
            } else if action == types:ARTIFACT_DISABLE {
                status = "inactive";
            } else {
                status = "trigger";
            }
            payload = {
                "type": artifactType,
                "name": artifactName,
                "status": status
            };
            artifactPath = string `${ICP_ARTIFACTS_PATH}/status`;
        } else if action == types:ARTIFACT_ENABLE_TRACING || action == types:ARTIFACT_DISABLE_TRACING {
            // Tracing change: enable/disable
            string trace = action == types:ARTIFACT_ENABLE_TRACING ? "enable" : "disable";
            payload = {
                "type": artifactType,
                "name": artifactName,
                "trace": trace
            };
            artifactPath = string `${ICP_ARTIFACTS_PATH}/tracing`;
        } else if action == types:ARTIFACT_ENABLE_STATISTICS || action == types:ARTIFACT_DISABLE_STATISTICS {
            // Statistics change: enable/disable
            string statistics = action == types:ARTIFACT_ENABLE_STATISTICS ? "enable" : "disable";
            payload = {
                "type": artifactType,
                "name": artifactName,
                "statistics": statistics
            };
            artifactPath = string `${ICP_ARTIFACTS_PATH}/statistics`;
        } else {
            log:printWarn(string `Unknown MI control action: ${action}`, runtimeId = runtimeId);
            return;
        }

        log:printDebug("Sending MI control command (fire and forget)",
                runtimeId = runtimeId,
                url = string `${baseUrl}${artifactPath}`,
                artifactType = artifactType,
                artifactName = artifactName,
                action = action);

        http:Response|error resp = mgmtClient->post(artifactPath, payload, {
            "Authorization": string `Bearer ${hmacToken}`,
            "Content-Type": "application/json"
        });

        if resp is error {
            log:printError("MI control command HTTP request failed", runtimeId = runtimeId, 'error = resp);
        } else if resp.statusCode != http:STATUS_OK && resp.statusCode != http:STATUS_ACCEPTED {
            string|error errPayload = resp.getTextPayload();
            string errMsg = errPayload is string ? errPayload : "Unknown error";
            log:printError("MI control command failed",
                    runtimeId = runtimeId,
                    statusCode = resp.statusCode,
                    response = errMsg);
        } else {
            log:printDebug("MI control command sent successfully", runtimeId = runtimeId);
        }
    } on fail error e {
        log:printError(string `Failed to send MI control command for runtime ${runtimeId}`, e);
    }
}

// Helper function to get display name by user ID
isolated function getDisplayNameById(string? userId) returns string? {
    if userId is () {
        return ();
    }

    types:User|error user = getUserDetailsById(userId);
    if user is types:User {
        return user.displayName;
    }

    // Return user ID if display name not found
    return userId;
}

// Helper function to get count from a query
isolated function getCount(sql:ParameterizedQuery query) returns int|error {
    stream<record {|int count;|}, sql:Error?> countStream = dbClient->query(query);
    record {|int count;|}[] results = check from record {|int count;|} count in countStream
        select count;

    if results.length() > 0 {
        return results[0].count;
    }
    return 0;
}

// Get component type for a runtime
isolated function getComponentTypeByRuntimeId(string runtimeId) returns string?|error {
    stream<record {|string component_type;|}, sql:Error?> componentStream = dbClient->query(`
        SELECT c.component_type
        FROM runtimes r
        JOIN components c ON r.component_id = c.component_id
        WHERE r.runtime_id = ${runtimeId}
    `);

    record {|record {|string component_type;|} value;|}|sql:Error? streamRecord = componentStream.next();
    check componentStream.close();

    if streamRecord is record {|record {|string component_type;|} value;|} {
        return streamRecord.value.component_type;
    }

    return ();
}

// Count total artifacts in heartbeat
isolated function countTotalArtifacts(types:Artifacts artifacts) returns int {
    int totalArtifacts = artifacts.services.length() + artifacts.listeners.length();

    totalArtifacts += (<types:RestApi[]>artifacts.apis).length();

    totalArtifacts += (<types:ProxyService[]>artifacts.proxyServices).length();

    totalArtifacts += (<types:Endpoint[]>artifacts.endpoints).length();

    totalArtifacts += (<types:InboundEndpoint[]>artifacts.inboundEndpoints).length();

    totalArtifacts += (<types:Sequence[]>artifacts.sequences).length();

    totalArtifacts += (<types:Task[]>artifacts.tasks).length();

    totalArtifacts += (<types:Template[]>artifacts.templates).length();

    totalArtifacts += (<types:MessageStore[]>artifacts.messageStores).length();

    totalArtifacts += (<types:MessageProcessor[]>artifacts.messageProcessors).length();

    totalArtifacts += (<types:LocalEntry[]>artifacts.localEntries).length();

    totalArtifacts += (<types:DataService[]>artifacts.dataServices).length();

    totalArtifacts += (<types:CarbonApp[]>artifacts.carbonApps).length();

    totalArtifacts += (<types:DataSource[]>artifacts.dataSources).length();

    totalArtifacts += (<types:Connector[]>artifacts.connectors).length();

    totalArtifacts += (<types:RegistryResource[]>artifacts.registryResources).length();

    return totalArtifacts;
}

// Upsert MI control command (update if exists, insert if not)
// Still used by triggerArtifact mutation (one-shot action, not desired state).
public isolated function insertMIControlCommand(
        string runtimeId,
        string componentId,
        string artifactName,
        string artifactType,
        types:MIControlAction action,
        string status = "pending",
        string? issuedBy = ()
) returns error? {
    // Convert action enum to string
    string actionStr = action.toString();

    // Use UPSERT to handle duplicate commands (update existing pending commands)
    if dbType == MSSQL {
        _ = check dbClient->execute(`
            MERGE INTO mi_runtime_control_commands AS target
            USING (VALUES (${runtimeId}, ${componentId}, ${artifactName}, ${artifactType}, ${actionStr}, ${status}, ${issuedBy}))
                   AS source (runtime_id, component_id, artifact_name, artifact_type, action, status, issued_by)
            ON (target.runtime_id = source.runtime_id
                AND target.component_id = source.component_id
                AND target.artifact_name = source.artifact_name
                AND target.artifact_type = source.artifact_type)
            WHEN MATCHED THEN
                UPDATE SET action = source.action,
                           status = source.status,
                           issued_at = CURRENT_TIMESTAMP,
                           issued_by = source.issued_by,
                           sent_at = CASE WHEN source.status = 'sent' THEN CURRENT_TIMESTAMP ELSE NULL END,
                           acknowledged_at = NULL,
                           completed_at = NULL,
                           error_message = NULL,
                           updated_at = CURRENT_TIMESTAMP
            WHEN NOT MATCHED THEN
                INSERT (runtime_id, component_id, artifact_name, artifact_type, action, status, issued_by, sent_at)
                VALUES (source.runtime_id, source.component_id, source.artifact_name, source.artifact_type, source.action, source.status, source.issued_by,
                        CASE WHEN source.status = 'sent' THEN CURRENT_TIMESTAMP ELSE NULL END);
        `);
    } else if dbType == POSTGRESQL {
        _ = check dbClient->execute(`
            INSERT INTO mi_runtime_control_commands (
                runtime_id, component_id, artifact_name, artifact_type, action, status, issued_at, issued_by, sent_at
            ) VALUES (
                ${runtimeId}, ${componentId}, ${artifactName}, ${artifactType}, ${actionStr}, ${status}, CURRENT_TIMESTAMP, ${issuedBy},
                CASE WHEN ${status} = 'sent' THEN CURRENT_TIMESTAMP ELSE NULL END
            )
            ON CONFLICT (runtime_id, component_id, artifact_name, artifact_type)
            DO UPDATE SET
                action = EXCLUDED.action,
                status = EXCLUDED.status,
                issued_at = CURRENT_TIMESTAMP,
                issued_by = EXCLUDED.issued_by,
                sent_at = CASE WHEN EXCLUDED.status = 'sent' THEN CURRENT_TIMESTAMP ELSE NULL END,
                acknowledged_at = NULL,
                completed_at = NULL,
                error_message = NULL,
                updated_at = CURRENT_TIMESTAMP
        `);
    } else if dbType == H2 {
        // H2 uses MERGE syntax similar to MSSQL
        _ = check dbClient->execute(`
            MERGE INTO mi_runtime_control_commands AS target
            USING (VALUES (${runtimeId}, ${componentId}, ${artifactName}, ${artifactType}, ${actionStr}, ${status}, ${issuedBy}))
                   AS source (runtime_id, component_id, artifact_name, artifact_type, action, status, issued_by)
            ON (target.runtime_id = source.runtime_id
                AND target.component_id = source.component_id
                AND target.artifact_name = source.artifact_name
                AND target.artifact_type = source.artifact_type)
            WHEN MATCHED THEN
                UPDATE SET action = source.action,
                           status = source.status,
                           issued_at = CURRENT_TIMESTAMP,
                           issued_by = source.issued_by,
                           sent_at = CASE WHEN source.status = 'sent' THEN CURRENT_TIMESTAMP ELSE NULL END,
                           acknowledged_at = NULL,
                           completed_at = NULL,
                           error_message = NULL,
                           updated_at = CURRENT_TIMESTAMP
            WHEN NOT MATCHED THEN
                INSERT (runtime_id, component_id, artifact_name, artifact_type, action, status, issued_by, sent_at)
                VALUES (source.runtime_id, source.component_id, source.artifact_name, source.artifact_type, source.action, source.status, source.issued_by,
                        CASE WHEN source.status = 'sent' THEN CURRENT_TIMESTAMP ELSE NULL END)
        `);
    } else {
        // MySQL
        _ = check dbClient->execute(`
            INSERT INTO mi_runtime_control_commands (
                runtime_id, component_id, artifact_name, artifact_type, action, status, issued_at, issued_by, sent_at
            ) VALUES (
                ${runtimeId}, ${componentId}, ${artifactName}, ${artifactType}, ${actionStr}, ${status}, CURRENT_TIMESTAMP, ${issuedBy},
                CASE WHEN ${status} = 'sent' THEN CURRENT_TIMESTAMP ELSE NULL END
            )
            ON DUPLICATE KEY UPDATE
                action = VALUES(action),
                status = VALUES(status),
                issued_at = CURRENT_TIMESTAMP,
                issued_by = VALUES(issued_by),
                sent_at = VALUES(sent_at),
                acknowledged_at = NULL,
                completed_at = NULL,
                error_message = NULL,
                updated_at = CURRENT_TIMESTAMP
        `);
    }
}

public isolated function buildManagementBaseUrl(string? managementHost, string? managementPort) returns string|error {
    if managementHost is () {
        return error("Management hostname not configured for this runtime");
    }
    string baseUrl = string `https://${<string>managementHost}`;
    if managementPort is string {
        baseUrl = string `${baseUrl}:${managementPort}`;
    }
    return baseUrl;
}

// Helper function to send artifact tracing change to a runtime
public isolated function sendArtifactTracingChange(types:Runtime runtime, string artifactType, string artifactName, string trace) returns error? {
    string baseUrl = check buildManagementBaseUrl(runtime.managementHostname, runtime.managementPort);

    http:Client|error mgmtClient = artifactsApiAllowInsecureTLS
        ? new (baseUrl, {secureSocket: {enable: false}})
        : new (baseUrl);

    if mgmtClient is error {
        log:printError("Failed to create management API client for runtime", runtimeId = runtime.runtimeId, 'error = mgmtClient);
        return error("Failed to create management API client");
    }

    string hmacToken = check issueRuntimeHmacToken();

    json payload = {
        "type": artifactType,
        "name": artifactName,
        "trace": trace
    };

    string artifactPath = string `${ICP_ARTIFACTS_PATH}/tracing`;
    log:printDebug("Sending artifact tracing change request",
            runtimeId = runtime.runtimeId,
            url = string `${baseUrl}${artifactPath}`,
            artifactType = artifactType,
            artifactName = artifactName,
            trace = trace);

    http:Response|error resp = mgmtClient->post(artifactPath, payload, {
        "Authorization": string `Bearer ${hmacToken}`,
        "Content-Type": "application/json"
    });

    if resp is error {
        log:printError("HTTP request failed for artifact tracing change", runtimeId = runtime.runtimeId, 'error = resp);
        return error(string `HTTP request failed: ${resp.message()}`);
    }

    if resp.statusCode != http:STATUS_OK && resp.statusCode != http:STATUS_ACCEPTED {
        string|error errPayload = resp.getTextPayload();
        string errMsg = errPayload is string ? errPayload : "Unknown error";
        log:printError("Artifact tracing change failed",
                runtimeId = runtime.runtimeId,
                statusCode = resp.statusCode,
                response = errMsg);
        return error(string `Tracing change failed with status ${resp.statusCode}: ${errMsg}`);
    }

    log:printDebug("Artifact tracing changed successfully on runtime", runtimeId = runtime.runtimeId);
    return;
}

// Helper: generate HMAC JWT used to call ICP internal APIs
public isolated function issueRuntimeHmacToken() returns string|error {
    string hmacSecret = check utils:resolveConfig(defaultRuntimeJwtHMACSecret, secrets);
    jwt:IssuerConfig issConfig = {
        username: "icp-artifact-fetcher",
        issuer: jwtIssuer,
        expTime: <decimal>defaultTokenExpiryTime,
        audience: jwtAudience,
        signatureConfig: {algorithm: jwt:HS256, config: hmacSecret}
    };
    issConfig.customClaims["scope"] = "runtime_agent";

    string|jwt:Error hmacToken = jwt:issue(issConfig);
    if hmacToken is jwt:Error {
        log:printError("Failed to generate HMAC JWT for internal ICP API", hmacToken);
        return error("Failed to generate authentication token");
    }
    return hmacToken;
}
