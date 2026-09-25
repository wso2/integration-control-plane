// Copyright (c) 2026, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
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

import ballerina/io;
import ballerina/lang.runtime;
import ballerina/log;
import ballerina/sql;
import ballerina/time;

// ── Audit action constants ─────────────────────────────────────────────────

// Authentication events
public const string AUDIT_LOGIN_SUCCESS = "LOGIN_SUCCESS";
public const string AUDIT_LOGIN_FAILURE = "LOGIN_FAILURE";
public const string AUDIT_LOGIN_LOCKED = "LOGIN_LOCKED";
public const string AUDIT_LOGOUT = "LOGOUT";
public const string AUDIT_LOGOUT_ALL = "LOGOUT_ALL";
public const string AUDIT_OIDC_LOGIN_SUCCESS = "OIDC_LOGIN_SUCCESS";
public const string AUDIT_OIDC_LOGIN_FAILURE = "OIDC_LOGIN_FAILURE";

// Password events
public const string AUDIT_PASSWORD_CHANGE = "PASSWORD_CHANGE";
public const string AUDIT_PASSWORD_RESET = "PASSWORD_RESET";
public const string AUDIT_PASSWORD_FORCED_CHANGE = "PASSWORD_FORCED_CHANGE";

// User management events
public const string AUDIT_USER_CREATE = "USER_CREATE";
public const string AUDIT_USER_DELETE = "USER_DELETE";
public const string AUDIT_USER_SESSIONS_REVOKE = "USER_SESSIONS_REVOKE";

// Group management events
public const string AUDIT_GROUP_CREATE = "GROUP_CREATE";
public const string AUDIT_GROUP_UPDATE = "GROUP_UPDATE";
public const string AUDIT_GROUP_DELETE = "GROUP_DELETE";
public const string AUDIT_GROUP_MEMBER_ADD = "GROUP_MEMBER_ADD";
public const string AUDIT_GROUP_MEMBER_REMOVE = "GROUP_MEMBER_REMOVE";
public const string AUDIT_USER_GROUPS_UPDATE = "USER_GROUPS_UPDATE";

// Role management events
public const string AUDIT_ROLE_CREATE = "ROLE_CREATE";
public const string AUDIT_ROLE_UPDATE = "ROLE_UPDATE";
public const string AUDIT_ROLE_DELETE = "ROLE_DELETE";
public const string AUDIT_ROLE_ASSIGNED = "ROLE_ASSIGNED";
public const string AUDIT_ROLE_UNASSIGNED = "ROLE_UNASSIGNED";

// Environment management events
public const string AUDIT_ENVIRONMENT_CREATE = "ENVIRONMENT_CREATE";
public const string AUDIT_ENVIRONMENT_UPDATE = "ENVIRONMENT_UPDATE";
public const string AUDIT_ENVIRONMENT_DELETE = "ENVIRONMENT_DELETE";

// Project management events
public const string AUDIT_PROJECT_CREATE = "PROJECT_CREATE";
public const string AUDIT_PROJECT_UPDATE = "PROJECT_UPDATE";
public const string AUDIT_PROJECT_DELETE = "PROJECT_DELETE";

// Component management events
public const string AUDIT_COMPONENT_CREATE = "COMPONENT_CREATE";
public const string AUDIT_COMPONENT_UPDATE = "COMPONENT_UPDATE";
public const string AUDIT_COMPONENT_DELETE = "COMPONENT_DELETE";

// Runtime management events
public const string AUDIT_RUNTIME_DELETE = "RUNTIME_DELETE";

// Artifact control events
public const string AUDIT_ARTIFACT_STATUS_CHANGE = "ARTIFACT_STATUS_CHANGE";
public const string AUDIT_ARTIFACT_TRACING_CHANGE = "ARTIFACT_TRACING_CHANGE";
public const string AUDIT_ARTIFACT_STATISTICS_CHANGE = "ARTIFACT_STATISTICS_CHANGE";
public const string AUDIT_ARTIFACT_TRIGGER = "ARTIFACT_TRIGGER";

// Logger / listener events
public const string AUDIT_LOG_LEVEL_CHANGE = "LOG_LEVEL_CHANGE";
public const string AUDIT_LOGGER_DELETE = "LOGGER_DELETE";
public const string AUDIT_LISTENER_STATE_CHANGE = "LISTENER_STATE_CHANGE";

// Secret events
public const string AUDIT_ORG_SECRET_CREATE = "ORG_SECRET_CREATE";
public const string AUDIT_ORG_SECRET_REVOKE = "ORG_SECRET_REVOKE";

// MI runtime user events
public const string AUDIT_MI_USER_CREATE = "MI_USER_CREATE";
public const string AUDIT_MI_USER_DELETE = "MI_USER_DELETE";

// Any other write to an MI management API, which the console reaches through the heartbeat
// tunnel. The tunnel carries a method and a path, so a write the ICP has no specific name
// for is still recorded rather than going unlogged.
public const string AUDIT_MI_MANAGEMENT_WRITE = "MI_MANAGEMENT_WRITE";

// ── Audit resource type constants ──────────────────────────────────────────

public const string AUDIT_RESOURCE_SESSION = "SESSION";
public const string AUDIT_RESOURCE_USER = "USER";
public const string AUDIT_RESOURCE_GROUP = "GROUP";
public const string AUDIT_RESOURCE_ROLE = "ROLE";
public const string AUDIT_RESOURCE_ENVIRONMENT = "ENVIRONMENT";
public const string AUDIT_RESOURCE_PROJECT = "PROJECT";
public const string AUDIT_RESOURCE_COMPONENT = "COMPONENT";
public const string AUDIT_RESOURCE_RUNTIME = "RUNTIME";
public const string AUDIT_RESOURCE_ARTIFACT = "ARTIFACT";
public const string AUDIT_RESOURCE_LOGGER = "LOGGER";
public const string AUDIT_RESOURCE_LISTENER = "LISTENER";
public const string AUDIT_RESOURCE_SECRET = "SECRET";

// ── Module-level isolated state ────────────────────────────────────────────

isolated boolean auditEnabled = false;
// Set to true only while the file-drainer strand is running successfully.
// Prevents unbounded queue growth when file output is disabled or the file
// cannot be opened.
isolated boolean auditFileDraining = false;
// JSONL lines queued for the background file-drainer strand.
// string is immutable in Ballerina, so it is a valid isolated expression and
// can be pushed/popped across lock boundaries.
isolated string[] pendingAuditLines = [];

// ── Initialization ─────────────────────────────────────────────────────────

// Called from the non-isolated init() in init.bal.
// Starts a background strand that drains pendingAuditLines to the audit log
// file, keeping I/O entirely out of the isolated logAuditEvent function.
public function initAuditLogging(boolean enabled, string filePath) {
    lock {
        auditEnabled = enabled;
    }

    if enabled {
        log:printInfo("Audit logging enabled",
                auditFile = filePath.length() > 0 ? filePath : "application log only");
    }

    if enabled && filePath.length() > 0 {
        lock {
            auditFileDraining = true;
        }
        _ = start runAuditFileDrainer(filePath);
    }
}

// ── Core audit function ────────────────────────────────────────────────────

// Write a structured audit event to the application log and (when configured)
// enqueue a JSONL line for the background file-drainer. Isolated so it can be
// called from any isolated service resource.
public isolated function logAuditEvent(
        string action,
        string? userId = (),
        string? resourceType = (),
        string? resourceId = (),
        string? details = (),
        string? clientIp = (),
        string? userAgent = ()
) {
    boolean enabled;
    lock {
        enabled = auditEnabled;
    }
    if !enabled {
        return;
    }

    // Always emit to the application log with an AUDIT prefix so the event
    // is visible in any log aggregator / SIEM that reads the application log.
    log:printInfo("AUDIT",
            action = action,
            userId = userId ?: "",
            resourceType = resourceType ?: "",
            resourceId = resourceId ?: "",
            details = details ?: "",
            clientIp = clientIp ?: "");

    string timestamp = buildTimestamp();
    json entry = {
        timestamp: timestamp,
        action: action,
        userId: userId,
        resourceType: resourceType,
        resourceId: resourceId,
        details: details,
        clientIp: clientIp
    };
    string line = entry.toJsonString() + "\n";

    // Enqueue for the background file-drainer only while it is active.
    boolean fileDraining;
    lock {
        fileDraining = auditFileDraining;
    }
    if fileDraining {
        lock {
            pendingAuditLines.push(line);
        }
    }
}

// ── Background file drainer ────────────────────────────────────────────────

// Runs as a separate strand (started from initAuditLogging). Opens the audit
// log file once, then continuously drains pendingAuditLines until the process
// exits. Uses a short sleep when the queue is empty to avoid busy-waiting.
function runAuditFileDrainer(string filePath) {
    io:WritableByteChannel|io:Error byteChannel = io:openWritableFile(filePath, option = io:APPEND);
    if byteChannel is io:Error {
        log:printError("Cannot open audit log file; file output disabled", byteChannel, filePath = filePath);
        lock {
            auditFileDraining = false;
        }
        return;
    }
    io:WritableCharacterChannel charChannel = new (byteChannel, "UTF-8");
    while true {
        string? line = ();
        lock {
            if pendingAuditLines.length() > 0 {
                line = pendingAuditLines.remove(0);
            }
        }
        if line is string {
            int|io:Error writeResult = charChannel.write(line, 0);
            if writeResult is io:Error {
                log:printError("Failed to write audit entry to log file", writeResult);
            }
        } else {
            // Nothing queued — yield for 100 ms before checking again.
            runtime:sleep(0.1);
        }
    }
}

// ── Timestamp helper ───────────────────────────────────────────────────────

isolated function buildTimestamp() returns string {
    time:Utc utcNow = time:utcNow();
    time:Civil c = time:utcToCivil(utcNow);
    string month = c.month < 10 ? "0" + c.month.toString() : c.month.toString();
    string day = c.day < 10 ? "0" + c.day.toString() : c.day.toString();
    string hour = c.hour < 10 ? "0" + c.hour.toString() : c.hour.toString();
    string minute = c.minute < 10 ? "0" + c.minute.toString() : c.minute.toString();
    decimal second = c.second ?: 0d;
    int secondInt = <int>second;
    string secondStr = secondInt < 10 ? "0" + secondInt.toString() : secondInt.toString();
    return string `${c.year}-${month}-${day}T${hour}:${minute}:${secondStr}Z`;
}

# Raises a system event: something the operator needs to see and acknowledge.
#
# Distinct from an audit record, which states that something *happened*. A system event
# states that something needs attention and stays unresolved until a person clears it
# (`resolved`/`resolved_by` on the row), which is what makes it usable for an outcome the
# ICP could not establish — a mutation delivered to an integration that never confirmed it.
#
# + eventType - Short machine-readable kind, e.g. `workflow_operation_unconfirmed`
# + severity - INFO | WARN | ERROR | CRITICAL
# + message - What a person should read
# + eventSource - The runtime or component it concerns, when there is one
# + metadata - Structured detail as a JSON string
public isolated function raiseSystemEvent(string eventType, string severity, string message,
        string? eventSource = (), string? metadata = ()) {
    // `metadata` is jsonb on PostgreSQL and a text column on the others, so the cast has to be
    // conditional — the same split upsertWorkflowMetadata makes. Without it PostgreSQL refuses
    // the bind with 42804 ("column is of type jsonb but expression is of type character
    // varying") and, because this function deliberately swallows its errors, every notification
    // was lost in a log line nobody reads. The table was empty for an entire test round.
    sql:ExecutionResult|sql:Error result;
    if dbType == POSTGRESQL {
        result = dbClient->execute(`
            INSERT INTO system_events (event_type, severity, source, message, metadata)
            VALUES (${eventType}, ${severity}, ${eventSource}, ${message}, ${metadata}::jsonb)
        `);
    } else {
        result = dbClient->execute(`
            INSERT INTO system_events (event_type, severity, source, message, metadata)
            VALUES (${eventType}, ${severity}, ${eventSource}, ${message}, ${metadata})
        `);
    }
    if result is sql:Error {
        // Never propagated: an event nobody can store is still worth having in the log, and
        // failing the caller would turn a reporting problem into a functional one.
        log:printError("Failed to raise a system event", result, eventType = eventType,
                eventMessage = message);
    }
}
