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
import ballerina/jwt;
import ballerina/log;
import ballerina/sql;
import ballerina/uuid;

// Artifact type identifier constants
const string ARTIFACT_TYPE_API = "api";
const string ARTIFACT_TYPE_PROXY_SERVICE = "proxy-service";
const string ARTIFACT_TYPE_ENDPOINT = "endpoint";
const string ARTIFACT_TYPE_INBOUND_ENDPOINT = "inbound-endpoint";
const string ARTIFACT_TYPE_SEQUENCE = "sequence";
const string ARTIFACT_TYPE_TEMPLATE = "template";
const string ARTIFACT_TYPE_MESSAGE_PROCESSOR = "message-processor";
const string ARTIFACT_TYPE_TASK = "task";
const string ARTIFACT_TYPE_LOCAL_ENTRY = "local-entry";
const string ARTIFACT_TYPE_DATA_SERVICE = "data-service";
const string ARTIFACT_TYPE_CONNECTOR = "connector";

// Artifact type plural aliases (for backward compatibility and flexibility)
const string ARTIFACT_TYPE_APIS = "apis";
const string ARTIFACT_TYPE_PROXY_SERVICES = "proxy-services";
const string ARTIFACT_TYPE_ENDPOINTS = "endpoints";
const string ARTIFACT_TYPE_INBOUND_ENDPOINTS = "inbound-endpoints";
const string ARTIFACT_TYPE_SEQUENCES = "sequences";
const string ARTIFACT_TYPE_TASKS = "tasks";
const string ARTIFACT_TYPE_MESSAGE_PROCESSORS = "message-processors";
const string ARTIFACT_TYPE_LOCAL_ENTRIES = "local-entries";
const string ARTIFACT_TYPE_DATA_SERVICES = "data-services";
const string ARTIFACT_TYPE_CONNECTORS = "connectors";

// Management API path constants
const string MGMT_PATH_APIS = "/management/apis";
const string MGMT_PATH_PROXY_SERVICES = "/management/proxy-services";
const string MGMT_PATH_ENDPOINTS = "/management/endpoints";
const string MGMT_PATH_INBOUND_ENDPOINTS = "/management/inbound-endpoints";
const string MGMT_PATH_SEQUENCES = "/management/sequences";
const string MGMT_PATH_TEMPLATES = "/management/templates";
const string MGMT_PATH_MESSAGE_PROCESSORS = "/management/message-processors";
const string MGMT_PATH_TASKS = "/management/tasks";

// Artifact state value constants
const string STATE_ACTIVE = "active";
const string STATE_INACTIVE = "inactive";
const string STATE_TRIGGER = "trigger";
const string TOGGLE_ENABLE = "enable";
const string TOGGLE_DISABLE = "disable";

// HTTP header value constants
const string CONTENT_TYPE_JSON = "application/json";

// Returns the management API path for the given artifact type.
// When statusOnly=true, only artifact types that support the status field are matched;
// proxy-service, endpoint, message-processor, and task support status (active/inactive/trigger),
// while api, sequence, inbound-endpoint, and template only support trace/statistics.
isolated function getManagementPath(string artifactType, boolean statusOnly = false) returns string? {
    log:printDebug("Resolving management path", artifactType = artifactType, statusOnly = statusOnly);
    match artifactType.toLowerAscii().trim() {
        ARTIFACT_TYPE_PROXY_SERVICE => {
            return MGMT_PATH_PROXY_SERVICES;
        }
        ARTIFACT_TYPE_ENDPOINT => {
            return MGMT_PATH_ENDPOINTS;
        }
        ARTIFACT_TYPE_MESSAGE_PROCESSOR => {
            return MGMT_PATH_MESSAGE_PROCESSORS;
        }
        ARTIFACT_TYPE_TASK => {
            return MGMT_PATH_TASKS;
        }
        ARTIFACT_TYPE_INBOUND_ENDPOINT if !statusOnly => {
            return MGMT_PATH_INBOUND_ENDPOINTS;
        }
        ARTIFACT_TYPE_API if !statusOnly => {
            return MGMT_PATH_APIS;
        }
        ARTIFACT_TYPE_TEMPLATE if !statusOnly => {
            return MGMT_PATH_TEMPLATES;
        }
        ARTIFACT_TYPE_SEQUENCE if !statusOnly => {
            return MGMT_PATH_SEQUENCES;
        }
        _ => {
            return ();
        }
    }
}

// Record type for artifact lookup
type ArtifactInfoRecord record {|
    string artifact_name;
    string artifact_type;
|};

// Async worker function to send MI control command (fire-and-forget)
public isolated function sendMIControlCommandAsync(string runtimeId, string artifactType, string artifactName, string action) {
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
        string hmacToken = check issueRuntimeHmacToken(runtimeId);

        string artifactPath;
        json payload;

        // Determine API endpoint and payload based on action type
        if action == types:ARTIFACT_ENABLE || action == types:ARTIFACT_DISABLE || action == types:ARTIFACT_TRIGGER {
            // Status change: use artifact-specific management API paths
            string status;
            if action == types:ARTIFACT_ENABLE {
                status = STATE_ACTIVE;
            } else if action == types:ARTIFACT_DISABLE {
                status = STATE_INACTIVE;
            } else {
                status = STATE_TRIGGER;
            }

            string? managementPath = getManagementPath(artifactType, true);
            if managementPath is () {
                log:printWarn(string `Status change not supported for artifact type: ${artifactType}`, runtimeId = runtimeId);
                return;
            }

            payload = {
                "name": artifactName,
                "status": status
            };
            artifactPath = managementPath;
        } else if action == types:ARTIFACT_ENABLE_TRACING || action == types:ARTIFACT_DISABLE_TRACING {
            // Tracing change: enable/disable - use artifact-specific management API paths
            string tracing = action == types:ARTIFACT_ENABLE_TRACING ? TOGGLE_ENABLE : TOGGLE_DISABLE;

            string? managementPath = getManagementPath(artifactType);
            if managementPath is () {
                log:printWarn(string `Tracing not supported for artifact type: ${artifactType}`, runtimeId = runtimeId);
                return;
            }

            payload = {
                "name": artifactName,
                "trace": tracing
            };
            artifactPath = managementPath;
        } else if action == types:ARTIFACT_ENABLE_STATISTICS || action == types:ARTIFACT_DISABLE_STATISTICS {
            // Statistics change: enable/disable - use artifact-specific management API paths
            string statistics = action == types:ARTIFACT_ENABLE_STATISTICS ? TOGGLE_ENABLE : TOGGLE_DISABLE;
            
            // Map artifact type to the correct management API path
            string? managementPath = getManagementPath(artifactType);
            if managementPath is () {
                log:printWarn(string `Statistics not supported for artifact type: ${artifactType}`, runtimeId = runtimeId);
                return;
            }
            
            // Build payload based on artifact type
            if artifactType == ARTIFACT_TYPE_TEMPLATE {
                // Templates require a 'type' field (sequence or endpoint)
                payload = {
                    "name": artifactName,
                    "type": ARTIFACT_TYPE_SEQUENCE, // Default to sequence template
                    "statistics": statistics
                };
            } else {
                payload = {
                    "name": artifactName,
                    "statistics": statistics
                };
            }
            
            artifactPath = managementPath;
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
            "Content-Type": CONTENT_TYPE_JSON
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

// Retrieve and mark BI control commands as sent (within transaction)
// Caller must ensure the runtime belongs to a BI component before calling this function
isolated function sendPendingBIControlCommands(string runtimeId) returns types:ControlCommand[]|error {
    types:ControlCommand[] pendingCommands = [];

    // Retrieve pending control commands for this BI runtime (FOR UPDATE prevents concurrent heartbeats
    // from selecting the same commands within overlapping transactions)
    stream<types:ControlCommandDBRecord, sql:Error?> commandStream = dbClient->query(`
        SELECT command_id, runtime_id, target_artifact, action, payload, issued_at, status
        FROM bi_runtime_control_commands
        WHERE runtime_id = ${runtimeId}
        AND status = 'pending'
        ORDER BY issued_at ASC
        FOR UPDATE
    `);

    check from types:ControlCommandDBRecord dbCommand in commandStream
        do {
            // Convert string action to enum
            types:ControlAction action;
            if dbCommand.action == "START" {
                action = types:START;
            } else if dbCommand.action == "SET_LOGGER_LEVEL" {
                action = types:SET_LOGGER_LEVEL;
            } else {
                action = types:STOP;
            }

            types:ControlCommand command = {
                commandId: dbCommand.command_id,
                runtimeId: dbCommand.runtime_id,
                targetArtifact: {name: dbCommand.target_artifact},
                action: action,
                issuedAt: dbCommand.issued_at,
                status: convertToControlCommandStatus(dbCommand.status),
                payload: dbCommand?.payload
            };
            pendingCommands.push(command);
        };

    // Mark retrieved commands as 'sent'
    if pendingCommands.length() > 0 {
        foreach types:ControlCommand command in pendingCommands {
            _ = check dbClient->execute(`
                UPDATE bi_runtime_control_commands
                SET status = 'sent'
                WHERE command_id = ${command.commandId}
            `);
        }
    }
    log:printInfo("pending commands", pendingCommands = pendingCommands);
    return pendingCommands;
}

// Retrieve and mark MI control commands as sent (within transaction)
// Caller must ensure the runtime belongs to an MI component before calling this function
// MI commands are executed immediately via runtime management API calls (fire and forget)
isolated function sendPendingMIControlCommands(string runtimeId) returns error? {

    // Retrieve pending control commands for this MI runtime (FOR UPDATE prevents concurrent heartbeats
    // from selecting the same commands within overlapping transactions)
    stream<types:MIRuntimeControlCommandDBRecord, sql:Error?> commandStream = dbClient->query(`
        SELECT runtime_id, component_id, artifact_name, artifact_type, action, status, issued_at, sent_at, acknowledged_at, completed_at, error_message, issued_by
        FROM mi_runtime_control_commands
        WHERE runtime_id = ${runtimeId}
        AND status = 'pending'
        ORDER BY issued_at ASC
        FOR UPDATE
    `);

    types:MIRuntimeControlCommandDBRecord[] pendingCommands = check from types:MIRuntimeControlCommandDBRecord cmd in commandStream
        select cmd;

    if pendingCommands.length() == 0 {
        log:printDebug(string `No pending MI control commands for runtime ${runtimeId}`);
        return ();
    }

    // Fire API calls and mark commands as sent
    foreach types:MIRuntimeControlCommandDBRecord dbCommand in pendingCommands {
        // Use artifact name and type from the command record
        log:printDebug(string `Processing MI control command for artifact: ${dbCommand.artifact_name} (${dbCommand.artifact_type})`);

        // Fire the API call asynchronously (fire and forget)
        sendMIControlCommandAsync(
                dbCommand.runtime_id,
                dbCommand.artifact_type,
                dbCommand.artifact_name,
                dbCommand.action
        );

        // Mark command as sent in DB after API call is fired
        _ = check dbClient->execute(`
            UPDATE mi_runtime_control_commands
            SET status = 'sent',
                sent_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE runtime_id = ${dbCommand.runtime_id}
            AND component_id = ${dbCommand.component_id}
            AND artifact_name = ${dbCommand.artifact_name}
            AND artifact_type = ${dbCommand.artifact_type}
        `);
    }
    log:printInfo(string `Marked ${pendingCommands.length()} MI control commands as sent for runtime ${runtimeId}`);
    return ();
}

// Convert database status string to ControlCommandStatus enum
isolated function convertToControlCommandStatus(string status) returns types:ControlCommandStatus {
    match status {
        "pending" => {
            return types:PENDING;
        }
        "sent" => {
            return types:SENT;
        }
        "acknowledged" => {
            return types:ACKNOWLEDGED;
        }
        "failed" => {
            return types:FAILED;
        }
        "completed" => {
            return types:COMPLETED;
        }
        _ => {
            return types:PENDING;
        }
    }
}

// Convert database action string to MIControlAction enum
isolated function convertToMIControlAction(string action) returns types:MIControlAction {
    match action {
        "ARTIFACT_ENABLE" => {
            return types:ARTIFACT_ENABLE;
        }
        "ARTIFACT_DISABLE" => {
            return types:ARTIFACT_DISABLE;
        }
        "ARTIFACT_ENABLE_TRACING" => {
            return types:ARTIFACT_ENABLE_TRACING;
        }
        "ARTIFACT_DISABLE_TRACING" => {
            return types:ARTIFACT_DISABLE_TRACING;
        }
        "ARTIFACT_ENABLE_STATISTICS" => {
            return types:ARTIFACT_ENABLE_STATISTICS;
        }
        "ARTIFACT_DISABLE_STATISTICS" => {
            return types:ARTIFACT_DISABLE_STATISTICS;
        }
        _ => {
            return types:ARTIFACT_ENABLE;
        }
    }
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

// Insert a control command for a runtime
public isolated function insertControlCommand(
        string runtimeId,
        string targetArtifact,
        types:ControlAction action,
        string? issuedBy = ()
) returns string|error {
    // Generate a unique command ID
    string commandId = uuid:createType1AsString();

    // Convert action enum to string
    string actionStr = action.toString();

    // Insert control command
    _ = check dbClient->execute(`
        INSERT INTO bi_runtime_control_commands (
            command_id, runtime_id, target_artifact, action, status, issued_at, issued_by
        ) VALUES (
            ${commandId}, ${runtimeId}, ${targetArtifact}, ${actionStr}, 'pending', CURRENT_TIMESTAMP, ${issuedBy}
        )
    `);

    return commandId;
}

// Upsert BI artifact intended state for a component
public isolated function upsertBIArtifactIntendedState(string componentId, string targetArtifact, string action, string? issuedBy = ()) returns error? {
    if dbType == MSSQL {
        _ = check dbClient->execute(`
            MERGE INTO bi_artifact_intended_state AS target
            USING (VALUES (${componentId}, ${targetArtifact}, ${action}, ${issuedBy}))
                   AS source (component_id, target_artifact, action, issued_by)
            ON (target.component_id = source.component_id AND target.target_artifact = source.target_artifact)
            WHEN MATCHED THEN
                UPDATE SET action = source.action, issued_at = CURRENT_TIMESTAMP, 
                           issued_by = source.issued_by, updated_at = CURRENT_TIMESTAMP
            WHEN NOT MATCHED THEN
                INSERT (component_id, target_artifact, action, issued_by)
                VALUES (source.component_id, source.target_artifact, source.action, source.issued_by);
        `);
    } else if dbType == POSTGRESQL {
        _ = check dbClient->execute(`
            INSERT INTO bi_artifact_intended_state (
                component_id, target_artifact, action, issued_by
            ) VALUES (
                ${componentId}, ${targetArtifact}, ${action}, ${issuedBy}
            )
            ON CONFLICT (component_id, target_artifact) DO UPDATE SET
                action = EXCLUDED.action,
                issued_at = CURRENT_TIMESTAMP,
                issued_by = EXCLUDED.issued_by,
                updated_at = CURRENT_TIMESTAMP
        `);
    } else if dbType == H2 {
        // H2 uses MERGE syntax similar to MSSQL
        _ = check dbClient->execute(`
            MERGE INTO bi_artifact_intended_state AS target
            USING (VALUES (${componentId}, ${targetArtifact}, ${action}, ${issuedBy}))
                   AS source (component_id, target_artifact, action, issued_by)
            ON (target.component_id = source.component_id AND target.target_artifact = source.target_artifact)
            WHEN MATCHED THEN
                UPDATE SET action = source.action, issued_at = CURRENT_TIMESTAMP, 
                           issued_by = source.issued_by, updated_at = CURRENT_TIMESTAMP
            WHEN NOT MATCHED THEN
                INSERT (component_id, target_artifact, action, issued_by)
                VALUES (source.component_id, source.target_artifact, source.action, source.issued_by)
        `);
    } else {
        // MySQL
        _ = check dbClient->execute(`
            INSERT INTO bi_artifact_intended_state (
                component_id, target_artifact, action, issued_by
            ) VALUES (
                ${componentId}, ${targetArtifact}, ${action}, ${issuedBy}
            )
            ON DUPLICATE KEY UPDATE
                action = VALUES(action),
                issued_at = CURRENT_TIMESTAMP,
                issued_by = VALUES(issued_by),
                updated_at = CURRENT_TIMESTAMP
        `);
    }
}

// Insert log level control command for a runtime
public isolated function insertLogLevelControlCommand(
        string runtimeId,
        string componentName,
        string logLevel,
        string? issuedBy = ()
) returns string|error {
    string commandId = uuid:createType1AsString();

    // Store as JSON payload for the SET_LOGGER_LEVEL action
    json payload = {
        "componentName": componentName,
        "logLevel": logLevel
    };
    string payloadStr = payload.toJsonString();

    _ = check dbClient->execute(`
        INSERT INTO bi_runtime_control_commands (
            command_id, runtime_id, target_artifact, action, payload, status, issued_at, issued_by
        ) VALUES (
            ${commandId}, ${runtimeId}, ${componentName}, 'SET_LOGGER_LEVEL', ${payloadStr}, 'pending', CURRENT_TIMESTAMP, ${issuedBy}
        )
    `);

    return commandId;
}

// Upsert BI log level intended state for a component
public isolated function upsertBILogLevelIntendedState(
        string componentId,
        string componentName,
        string logLevel,
        string? issuedBy = ()
) returns error? {
    if dbType == MSSQL {
        _ = check dbClient->execute(`
            MERGE INTO bi_log_level_intended_state AS target
            USING (VALUES (${componentId}, ${componentName}, ${logLevel}, ${issuedBy}))
                   AS source (component_id, component_name, log_level, issued_by)
            ON (target.component_id = source.component_id AND target.component_name = source.component_name)
            WHEN MATCHED THEN
                UPDATE SET log_level = source.log_level, issued_at = CURRENT_TIMESTAMP, 
                           issued_by = source.issued_by, updated_at = CURRENT_TIMESTAMP
            WHEN NOT MATCHED THEN
                INSERT (component_id, component_name, log_level, issued_by)
                VALUES (source.component_id, source.component_name, source.log_level, source.issued_by);
        `);
    } else if dbType == POSTGRESQL {
        _ = check dbClient->execute(`
            INSERT INTO bi_log_level_intended_state (
                component_id, component_name, log_level, issued_by
            ) VALUES (
                ${componentId}, ${componentName}, ${logLevel}, ${issuedBy}
            )
            ON CONFLICT (component_id, component_name) DO UPDATE SET
                log_level = EXCLUDED.log_level,
                issued_at = CURRENT_TIMESTAMP,
                issued_by = EXCLUDED.issued_by,
                updated_at = CURRENT_TIMESTAMP
        `);
    } else if dbType == H2 {
        // H2 uses MERGE syntax
        _ = check dbClient->execute(`
            MERGE INTO bi_log_level_intended_state AS target
            USING (VALUES (${componentId}, ${componentName}, ${logLevel}, ${issuedBy}))
                   AS source (component_id, component_name, log_level, issued_by)
            ON (target.component_id = source.component_id AND target.component_name = source.component_name)
            WHEN MATCHED THEN
                UPDATE SET log_level = source.log_level, issued_at = CURRENT_TIMESTAMP, 
                           issued_by = source.issued_by, updated_at = CURRENT_TIMESTAMP
            WHEN NOT MATCHED THEN
                INSERT (component_id, component_name, log_level, issued_by)
                VALUES (source.component_id, source.component_name, source.log_level, source.issued_by)
        `);
    } else {
        // MySQL
        _ = check dbClient->execute(`
            INSERT INTO bi_log_level_intended_state (
                component_id, component_name, log_level, issued_by
            ) VALUES (
                ${componentId}, ${componentName}, ${logLevel}, ${issuedBy}
            )
            ON DUPLICATE KEY UPDATE
                log_level = VALUES(log_level),
                issued_at = CURRENT_TIMESTAMP,
                issued_by = VALUES(issued_by),
                updated_at = CURRENT_TIMESTAMP
        `);
    }
}

// Get BI artifact intended states for a component
public isolated function getBIIntendedStatesForComponent(string componentId) returns map<string>|error {
    map<string> intendedStates = {};

    stream<types:BIArtifactIntendedStateDBRecord, sql:Error?> stateStream = dbClient->query(`
        SELECT target_artifact, action
        FROM bi_artifact_intended_state
        WHERE component_id = ${componentId}
    `);

    check from types:BIArtifactIntendedStateDBRecord state in stateStream
        do {
            intendedStates[state.target_artifact] = state.action;
        };

    return intendedStates;
}

// Delete BI artifact intended state
public isolated function deleteBIArtifactIntendedState(
        string componentId,
        string targetArtifact
) returns error? {
    _ = check dbClient->execute(`
        DELETE FROM bi_artifact_intended_state
        WHERE component_id = ${componentId}
        AND target_artifact = ${targetArtifact}
    `);
}

// Get MI artifact intended states for a component (combines status and tracing tables)
public isolated function getMIIntendedStatesForComponent(string componentId) returns types:MIArtifactIntendedStateDBRecord[]|error {
    // Query status intended states
    stream<types:MIArtifactIntendedStateDBRecord, sql:Error?> statusStream = dbClient->query(`
        SELECT component_id, artifact_name, artifact_type, action
        FROM mi_artifact_intended_status
        WHERE component_id = ${componentId}
    `);
    types:MIArtifactIntendedStateDBRecord[] intendedStatesList =
        check from types:MIArtifactIntendedStateDBRecord state in statusStream
        select state;

    // Query tracing intended states
    stream<types:MIArtifactIntendedStateDBRecord, sql:Error?> tracingStream = dbClient->query(`
        SELECT component_id, artifact_name, artifact_type, action
        FROM mi_artifact_intended_tracing
        WHERE component_id = ${componentId}
    `);
    types:MIArtifactIntendedStateDBRecord[] tracingStates =
        check from types:MIArtifactIntendedStateDBRecord state in tracingStream
        select state;

    // Query statistics intended states
    stream<types:MIArtifactIntendedStateDBRecord, sql:Error?> statisticsStream = dbClient->query(`
        SELECT component_id, artifact_name, artifact_type, action
        FROM mi_artifact_intended_statistics
        WHERE component_id = ${componentId}
    `);
    types:MIArtifactIntendedStateDBRecord[] statisticsStates =
        check from types:MIArtifactIntendedStateDBRecord state in statisticsStream
        select state;

    // Combine all lists
    foreach types:MIArtifactIntendedStateDBRecord tracingState in tracingStates {
        intendedStatesList.push(tracingState);
    }
    foreach types:MIArtifactIntendedStateDBRecord statisticsState in statisticsStates {
        intendedStatesList.push(statisticsState);
    }

    return intendedStatesList;
}

// Upsert MI control command (update if exists, insert if not)
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

// Metadata for mapping artifact types to their database table and column names
type ArtifactTableMetadata record {|
    string tableName;
    string nameColumn;
    boolean hasTracing;
    boolean hasStatistics;
    string stateColumn;
|};

// Resolve artifact type aliases to table metadata (single source of truth for artifact type → table mapping)
isolated function resolveArtifactTableMetadata(string artifactType) returns ArtifactTableMetadata? {
    string normalizedType = artifactType.toLowerAscii().trim();
    if normalizedType == ARTIFACT_TYPE_APIS {
        return {tableName: "mi_api_artifacts", nameColumn: "api_name", hasTracing: true, hasStatistics: true, stateColumn: "state"};
    } else if normalizedType == ARTIFACT_TYPE_PROXY_SERVICES {
        return {tableName: "mi_proxy_service_artifacts", nameColumn: "proxy_name", hasTracing: true, hasStatistics: true, stateColumn: "state"};
    } else if normalizedType == ARTIFACT_TYPE_ENDPOINTS {
        return {tableName: "mi_endpoint_artifacts", nameColumn: "endpoint_name", hasTracing: true, hasStatistics: true, stateColumn: "state"};
    } else if normalizedType == ARTIFACT_TYPE_INBOUND_ENDPOINTS {
        return {tableName: "mi_inbound_endpoint_artifacts", nameColumn: "inbound_name", hasTracing: true, hasStatistics: true, stateColumn: "state"};
    } else if normalizedType == ARTIFACT_TYPE_SEQUENCES {
        return {tableName: "mi_sequence_artifacts", nameColumn: "sequence_name", hasTracing: true, hasStatistics: true, stateColumn: "state"};
    } else if normalizedType == ARTIFACT_TYPE_TASKS {
        return {tableName: "mi_task_artifacts", nameColumn: "task_name", hasTracing: false, hasStatistics: false, stateColumn: "state"};
    } else if normalizedType == ARTIFACT_TYPE_MESSAGE_PROCESSORS {
        return {tableName: "mi_message_processor_artifacts", nameColumn: "processor_name", hasTracing: false, hasStatistics: false, stateColumn: "state"};
    } else if normalizedType == ARTIFACT_TYPE_LOCAL_ENTRIES {
        return {tableName: "mi_local_entry_artifacts", nameColumn: "entry_name", hasTracing: false, hasStatistics: false, stateColumn: "state"};
    } else if normalizedType == ARTIFACT_TYPE_DATA_SERVICES {
        return {tableName: "mi_data_service_artifacts", nameColumn: "service_name", hasTracing: false, hasStatistics: false, stateColumn: "state"};
    } else if normalizedType == ARTIFACT_TYPE_CONNECTORS {
        return {tableName: "mi_connector_artifacts", nameColumn: "connector_name", hasTracing: false, hasStatistics: false, stateColumn: "status"};
    }
    return ();
}

// Upsert MI artifact intended status (enable/disable) for a component
public isolated function upsertMIArtifactIntendedStatus(string componentId, string artifactName, string artifactType, string action, string? issuedBy = ()) returns error? {
    if dbType == MSSQL {
        _ = check dbClient->execute(`
            MERGE INTO mi_artifact_intended_status AS target
            USING (VALUES (${componentId}, ${artifactName}, ${artifactType}, ${action}, ${issuedBy}))
                   AS source (component_id, artifact_name, artifact_type, action, issued_by)
            ON (target.component_id = source.component_id AND target.artifact_name = source.artifact_name AND target.artifact_type = source.artifact_type)
            WHEN MATCHED THEN
                UPDATE SET action = source.action, issued_at = CURRENT_TIMESTAMP,
                           issued_by = source.issued_by, updated_at = CURRENT_TIMESTAMP
            WHEN NOT MATCHED THEN
                INSERT (component_id, artifact_name, artifact_type, action, issued_by)
                VALUES (source.component_id, source.artifact_name, source.artifact_type, source.action, source.issued_by);
        `);
    } else if dbType == POSTGRESQL {
        _ = check dbClient->execute(`
            INSERT INTO mi_artifact_intended_status (
                component_id, artifact_name, artifact_type, action, issued_by
            ) VALUES (
                ${componentId}, ${artifactName}, ${artifactType}, ${action}, ${issuedBy}
            )
            ON CONFLICT (component_id, artifact_name, artifact_type) DO UPDATE SET
                action = EXCLUDED.action,
                issued_at = CURRENT_TIMESTAMP,
                issued_by = EXCLUDED.issued_by,
                updated_at = CURRENT_TIMESTAMP
        `);
    } else if dbType == H2 {
        // H2 uses MERGE syntax similar to MSSQL
        _ = check dbClient->execute(`
            MERGE INTO mi_artifact_intended_status AS target
            USING (VALUES (${componentId}, ${artifactName}, ${artifactType}, ${action}, ${issuedBy}))
                   AS source (component_id, artifact_name, artifact_type, action, issued_by)
            ON (target.component_id = source.component_id AND target.artifact_name = source.artifact_name AND target.artifact_type = source.artifact_type)
            WHEN MATCHED THEN
                UPDATE SET action = source.action, issued_at = CURRENT_TIMESTAMP,
                           issued_by = source.issued_by, updated_at = CURRENT_TIMESTAMP
            WHEN NOT MATCHED THEN
                INSERT (component_id, artifact_name, artifact_type, action, issued_by)
                VALUES (source.component_id, source.artifact_name, source.artifact_type, source.action, source.issued_by)
        `);
    } else {
        // MySQL
        _ = check dbClient->execute(`
            INSERT INTO mi_artifact_intended_status (
                component_id, artifact_name, artifact_type, action, issued_by
            ) VALUES (
                ${componentId}, ${artifactName}, ${artifactType}, ${action}, ${issuedBy}
            )
            ON DUPLICATE KEY UPDATE
                action = VALUES(action),
                issued_at = CURRENT_TIMESTAMP,
                issued_by = VALUES(issued_by),
                updated_at = CURRENT_TIMESTAMP
        `);
    }
}

// Upsert MI artifact intended statistics (enable/disable statistics) for a component
public isolated function upsertMIArtifactIntendedStatistics(string componentId, string artifactName, string artifactType, string action, string? issuedBy = ()) returns error? {
    if dbType == MSSQL {
        _ = check dbClient->execute(`
            MERGE INTO mi_artifact_intended_statistics AS target
            USING (VALUES (${componentId}, ${artifactName}, ${artifactType}, ${action}, ${issuedBy}))
                   AS source (component_id, artifact_name, artifact_type, action, issued_by)
            ON (target.component_id = source.component_id AND target.artifact_name = source.artifact_name AND target.artifact_type = source.artifact_type)
            WHEN MATCHED THEN
                UPDATE SET action = source.action, issued_at = CURRENT_TIMESTAMP,
                           issued_by = source.issued_by, updated_at = CURRENT_TIMESTAMP
            WHEN NOT MATCHED THEN
                INSERT (component_id, artifact_name, artifact_type, action, issued_by)
                VALUES (source.component_id, source.artifact_name, source.artifact_type, source.action, source.issued_by);
        `);
    } else if dbType == POSTGRESQL {
        _ = check dbClient->execute(`
            INSERT INTO mi_artifact_intended_statistics (
                component_id, artifact_name, artifact_type, action, issued_by
            ) VALUES (
                ${componentId}, ${artifactName}, ${artifactType}, ${action}, ${issuedBy}
            )
            ON CONFLICT (component_id, artifact_name, artifact_type) DO UPDATE SET
                action = EXCLUDED.action,
                issued_at = CURRENT_TIMESTAMP,
                issued_by = EXCLUDED.issued_by,
                updated_at = CURRENT_TIMESTAMP
        `);
    } else if dbType == H2 {
        // H2 uses MERGE syntax similar to MSSQL
        _ = check dbClient->execute(`
            MERGE INTO mi_artifact_intended_statistics AS target
            USING (VALUES (${componentId}, ${artifactName}, ${artifactType}, ${action}, ${issuedBy}))
                   AS source (component_id, artifact_name, artifact_type, action, issued_by)
            ON (target.component_id = source.component_id AND target.artifact_name = source.artifact_name AND target.artifact_type = source.artifact_type)
            WHEN MATCHED THEN
                UPDATE SET action = source.action, issued_at = CURRENT_TIMESTAMP,
                           issued_by = source.issued_by, updated_at = CURRENT_TIMESTAMP
            WHEN NOT MATCHED THEN
                INSERT (component_id, artifact_name, artifact_type, action, issued_by)
                VALUES (source.component_id, source.artifact_name, source.artifact_type, source.action, source.issued_by)
        `);
    } else {
        // MySQL
        _ = check dbClient->execute(`
            INSERT INTO mi_artifact_intended_statistics (
                component_id, artifact_name, artifact_type, action, issued_by
            ) VALUES (
                ${componentId}, ${artifactName}, ${artifactType}, ${action}, ${issuedBy}
            )
            ON DUPLICATE KEY UPDATE
                action = VALUES(action),
                issued_at = CURRENT_TIMESTAMP,
                issued_by = VALUES(issued_by),
                updated_at = CURRENT_TIMESTAMP
        `);
    }
}

// Upsert MI artifact intended tracing (enable/disable tracing) for a component
public isolated function upsertMIArtifactIntendedTracing(string componentId, string artifactName, string artifactType, string action, string? issuedBy = ()) returns error? {
    if dbType == MSSQL {
        _ = check dbClient->execute(`
            MERGE INTO mi_artifact_intended_tracing AS target
            USING (VALUES (${componentId}, ${artifactName}, ${artifactType}, ${action}, ${issuedBy}))
                   AS source (component_id, artifact_name, artifact_type, action, issued_by)
            ON (target.component_id = source.component_id AND target.artifact_name = source.artifact_name AND target.artifact_type = source.artifact_type)
            WHEN MATCHED THEN
                UPDATE SET action = source.action, issued_at = CURRENT_TIMESTAMP,
                           issued_by = source.issued_by, updated_at = CURRENT_TIMESTAMP
            WHEN NOT MATCHED THEN
                INSERT (component_id, artifact_name, artifact_type, action, issued_by)
                VALUES (source.component_id, source.artifact_name, source.artifact_type, source.action, source.issued_by);
        `);
    } else if dbType == POSTGRESQL {
        _ = check dbClient->execute(`
            INSERT INTO mi_artifact_intended_tracing (
                component_id, artifact_name, artifact_type, action, issued_by
            ) VALUES (
                ${componentId}, ${artifactName}, ${artifactType}, ${action}, ${issuedBy}
            )
            ON CONFLICT (component_id, artifact_name, artifact_type) DO UPDATE SET
                action = EXCLUDED.action,
                issued_at = CURRENT_TIMESTAMP,
                issued_by = EXCLUDED.issued_by,
                updated_at = CURRENT_TIMESTAMP
        `);
    } else if dbType == H2 {
        // H2 uses MERGE syntax similar to MSSQL
        _ = check dbClient->execute(`
            MERGE INTO mi_artifact_intended_tracing AS target
            USING (VALUES (${componentId}, ${artifactName}, ${artifactType}, ${action}, ${issuedBy}))
                   AS source (component_id, artifact_name, artifact_type, action, issued_by)
            ON (target.component_id = source.component_id AND target.artifact_name = source.artifact_name AND target.artifact_type = source.artifact_type)
            WHEN MATCHED THEN
                UPDATE SET action = source.action, issued_at = CURRENT_TIMESTAMP,
                           issued_by = source.issued_by, updated_at = CURRENT_TIMESTAMP
            WHEN NOT MATCHED THEN
                INSERT (component_id, artifact_name, artifact_type, action, issued_by)
                VALUES (source.component_id, source.artifact_name, source.artifact_type, source.action, source.issued_by)
        `);
    } else {
        // MySQL
        _ = check dbClient->execute(`
            INSERT INTO mi_artifact_intended_tracing (
                component_id, artifact_name, artifact_type, action, issued_by
            ) VALUES (
                ${componentId}, ${artifactName}, ${artifactType}, ${action}, ${issuedBy}
            )
            ON DUPLICATE KEY UPDATE
                action = VALUES(action),
                issued_at = CURRENT_TIMESTAMP,
                issued_by = VALUES(issued_by),
                updated_at = CURRENT_TIMESTAMP
        `);
    }
}

// Upsert MI logger intended state for a component
public isolated function upsertMILoggerIntendedState(
        string componentId,
        string loggerName,
        string logLevel,
        string? issuedBy = ()
) returns error? {
    if dbType == MSSQL {
        _ = check dbClient->execute(`
            MERGE INTO mi_logger_intended_state AS target
            USING (VALUES (${componentId}, ${loggerName}, ${logLevel}, ${issuedBy}))
                   AS source (component_id, logger_name, log_level, issued_by)
            ON (target.component_id = source.component_id AND target.logger_name = source.logger_name)
            WHEN MATCHED THEN
                UPDATE SET log_level = source.log_level, issued_at = CURRENT_TIMESTAMP,
                           issued_by = source.issued_by, updated_at = CURRENT_TIMESTAMP
            WHEN NOT MATCHED THEN
                INSERT (component_id, logger_name, log_level, issued_by)
                VALUES (source.component_id, source.logger_name, source.log_level, source.issued_by);
        `);
    } else if dbType == POSTGRESQL {
        _ = check dbClient->execute(`
            INSERT INTO mi_logger_intended_state (
                component_id, logger_name, log_level, issued_by
            ) VALUES (
                ${componentId}, ${loggerName}, ${logLevel}, ${issuedBy}
            )
            ON CONFLICT (component_id, logger_name) DO UPDATE SET
                log_level = EXCLUDED.log_level,
                issued_at = CURRENT_TIMESTAMP,
                issued_by = EXCLUDED.issued_by,
                updated_at = CURRENT_TIMESTAMP
        `);
    } else if dbType == H2 {
        // H2 uses MERGE syntax similar to MSSQL
        _ = check dbClient->execute(`
            MERGE INTO mi_logger_intended_state AS target
            USING (VALUES (${componentId}, ${loggerName}, ${logLevel}, ${issuedBy}))
                   AS source (component_id, logger_name, log_level, issued_by)
            ON (target.component_id = source.component_id AND target.logger_name = source.logger_name)
            WHEN MATCHED THEN
                UPDATE SET log_level = source.log_level, issued_at = CURRENT_TIMESTAMP,
                           issued_by = source.issued_by, updated_at = CURRENT_TIMESTAMP
            WHEN NOT MATCHED THEN
                INSERT (component_id, logger_name, log_level, issued_by)
                VALUES (source.component_id, source.logger_name, source.log_level, source.issued_by)
        `);
    } else {
        // MySQL
        _ = check dbClient->execute(`
            INSERT INTO mi_logger_intended_state (
                component_id, logger_name, log_level, issued_by
            ) VALUES (
                ${componentId}, ${loggerName}, ${logLevel}, ${issuedBy}
            )
            ON DUPLICATE KEY UPDATE
                log_level = VALUES(log_level),
                issued_at = CURRENT_TIMESTAMP,
                issued_by = VALUES(issued_by),
                updated_at = CURRENT_TIMESTAMP
        `);
    }
}

// Get BI log level intended states for a component
public isolated function getBILogLevelIntendedStatesForComponent(string componentId) returns map<string>|error {
    map<string> intendedLogLevels = {};

    stream<record {|string component_name; string log_level;|}, sql:Error?> stateStream = dbClient->query(`
        SELECT component_name, log_level
        FROM bi_log_level_intended_state
        WHERE component_id = ${componentId}
    `);

    check from var state in stateStream
        do {
            intendedLogLevels[state.component_name] = state.log_level;
        };

    return intendedLogLevels;
}

// Get MI logger intended states for a component
public isolated function getMILoggerIntendedStatesForComponent(string componentId) returns map<string>|error {
    map<string> intendedLogLevels = {};

    stream<record {|string logger_name; string log_level;|}, sql:Error?> stateStream = dbClient->query(`
        SELECT logger_name, log_level
        FROM mi_logger_intended_state
        WHERE component_id = ${componentId}
    `);

    check from var state in stateStream
        do {
            intendedLogLevels[state.logger_name] = state.log_level;
        };

    return intendedLogLevels;
}

// Delete MI artifact intended status
public isolated function deleteMIArtifactIntendedStatus(
        string componentId,
        string artifactName,
        string artifactType
) returns error? {
    _ = check dbClient->execute(`
        DELETE FROM mi_artifact_intended_status
        WHERE component_id = ${componentId}
        AND artifact_name = ${artifactName}
        AND artifact_type = ${artifactType}
    `);
}

// Delete MI artifact intended tracing
public isolated function deleteMIArtifactIntendedTracing(
        string componentId,
        string artifactName,
        string artifactType
) returns error? {
    _ = check dbClient->execute(`
        DELETE FROM mi_artifact_intended_tracing
        WHERE component_id = ${componentId}
        AND artifact_name = ${artifactName}
        AND artifact_type = ${artifactType}
    `);
}

// Delete MI artifact intended statistics
public isolated function deleteMIArtifactIntendedStatistics(
        string componentId,
        string artifactName,
        string artifactType
) returns error? {
    _ = check dbClient->execute(`
        DELETE FROM mi_artifact_intended_statistics
        WHERE component_id = ${componentId}
        AND artifact_name = ${artifactName}
        AND artifact_type = ${artifactType}
    `);
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
    string? managementPath = getManagementPath(artifactType);
    if managementPath is () {
        return error(string `Tracing not supported for artifact type: ${artifactType}`);
    }

    string baseUrl = check buildManagementBaseUrl(runtime.managementHostname, runtime.managementPort);

    http:Client|error mgmtClient = artifactsApiAllowInsecureTLS
        ? new (baseUrl, {secureSocket: {enable: false}})
        : new (baseUrl);

    if mgmtClient is error {
        log:printError("Failed to create management API client for runtime", runtimeId = runtime.runtimeId, 'error = mgmtClient);
        return error("Failed to create management API client");
    }

    string hmacToken = check issueRuntimeHmacToken(runtime.runtimeId);

    json payload = {
        "name": artifactName,
        "trace": trace
    };

    log:printDebug("Sending artifact tracing change request",
            runtimeId = runtime.runtimeId,
            url = string `${baseUrl}${managementPath}`,
            artifactType = artifactType,
            artifactName = artifactName,
            trace = trace);

    http:Response|error resp = mgmtClient->post(managementPath, payload, {
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

// Issue an HMAC JWT for calling a runtime's management API.
// Resolves the signing secret via runtimes.key_id → org_secrets.key_material.
// Includes kid in the JWT header so the runtime can match the key.
public isolated function issueRuntimeHmacToken(string runtimeId) returns string|error {
    record {|string keyId; string keyMaterial;|} keyInfo = check resolveKeyIdAndMaterialByRuntimeId(runtimeId);
    jwt:IssuerConfig issConfig = {
        username: "icp-artifact-fetcher",
        issuer: jwtIssuer,
        keyId: keyInfo.keyId,
        expTime: <decimal>defaultTokenExpiryTime,
        audience: jwtAudience,
        signatureConfig: {algorithm: jwt:HS256, config: keyInfo.keyMaterial}
    };
    issConfig.customClaims["scope"] = "runtime_agent";

    string|jwt:Error hmacToken = jwt:issue(issConfig);
    if hmacToken is jwt:Error {
        log:printError("Failed to generate HMAC JWT for internal ICP API", hmacToken);
        return error("Failed to generate authentication token");
    }
    return hmacToken;
}
