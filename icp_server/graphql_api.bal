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
import icp_server.mi_management;
import icp_server.storage;
import icp_server.sync;
import icp_server.types;
import icp_server.utils;

import ballerina/graphql;
import ballerina/http;
import ballerina/lang.value;
import ballerina/log;

// GraphQL listener configuration
listener graphql:Listener graphqlListener = new (httpListener);

const int MAX_PAGE_LIMIT = 500;
const int DEFAULT_PAGE_LIMIT = 2;

// Returns [sliceFrom, sliceTo, PageInfo] for a collection of `total` items.
// When pagination is nil, the slice covers the entire collection.
isolated function buildPageResult(int total, types:PaginationInput? pagination) returns [int, int, types:PageInfo] {
    if pagination?.'limit is () {
        return [0, total, {total, 'limit: total, offset: 0}];
    }
    int effectiveLimit = int:max(0, int:min(pagination?.'limit ?: DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT));
    int safeOffset = int:max(0, int:min(pagination?.offset ?: 0, total));
    int safeEnd = int:min(safeOffset + effectiveLimit, total);
    log:printDebug("Building page result", total = total, 'limit = effectiveLimit, offset = safeOffset);
    return [safeOffset, safeEnd, {total, 'limit: effectiveLimit, offset: safeOffset}];
}

// Reusable: pick a runtime from a list with optional runtimeId

// Extract user context from GraphQL context
isolated function extractUserContext(graphql:Context context) returns types:UserContextV2|error {
    value:Cloneable|error|isolated object {} authHeader = context.get("Authorization");
    if authHeader !is string {
        return error("Authorization header missing in request");
    }
    types:UserContextV2 userCtx = check auth:extractUserContextV2(authHeader);
    value:Cloneable|error|isolated object {} ipVal = context.get("clientIp");
    value:Cloneable|error|isolated object {} uaVal = context.get("userAgent");
    userCtx.clientIp = ipVal is string ? ipVal : ();
    userCtx.userAgent = uaVal is string ? uaVal : ();
    return userCtx;
}

isolated function authorizeEnvironmentAccess(string userId, string environmentId, string action) returns error? {
    types:Environment env = check storage:getEnvironmentById(environmentId);
    types:AccessScope scope = {orgUuid: storage:DEFAULT_ORG_ID};
    log:printDebug(string `authorizeEnvironmentAccess: userId=${userId}, envId=${environmentId}, critical=${env.critical}, action=${action}`);

    if env.critical {
        if !check auth:hasPermission(userId, auth:PERMISSION_ENVIRONMENT_MANAGE, scope) {
            return error(string `Access denied: insufficient permissions to ${action} for production environment`);
        }
        return;
    }
    if !check auth:hasAnyPermission(userId,
            [auth:PERMISSION_ENVIRONMENT_MANAGE, auth:PERMISSION_ENVIRONMENT_MANAGE_NONPROD], scope) {
        return error(string `Access denied: insufficient permissions to ${action}`);
    }
}

// ── MI management fields ─────────────────────────────────────────────────────
// Each of these ends in miRead or miWrite (mi_access.bal) and knows nothing about how the
// runtime was reached. What it does have to handle is an answer that is not ready yet,
// which `types:Fetchable` carries to the console.

# The runtime a runtime-scoped MI field will ask, once the caller may ask it.
#
# + permissions - Any one of these grants the field; reading a runtime's user accounts asks
#                 for more than viewing its artifacts does
# + refusal - What the caller is told when they may not. A field that asks for more than
#             the usual three says which right is missing, because "Unauthorized" on a
#             screen the user can see is a puzzle rather than an answer
isolated function miRuntimeById(graphql:Context context, string runtimeId,
        string[] permissions, string refusal = "Unauthorized")
        returns types:Runtime|error {
    types:UserContextV2 userContext = check extractUserContext(context);
    types:Runtime? runtime = check storage:getRuntimeById(runtimeId);
    if runtime is () {
        return error("Runtime not found");
    }
    types:AccessScope scope = auth:buildScopeFromContext(runtime.component.projectId,
            runtime.component.id, runtime.environment.id);
    if !check auth:hasAnyPermission(userContext.userId, permissions, scope) {
        log:printWarn("Attempt to reach an MI runtime's management API without permission",
                userId = userContext.userId, runtimeId = runtimeId);
        return error(refusal);
    }
    return runtime;
}

# The same, for the two fields that answer an empty page rather than an error when the
# runtime is gone or the caller may not see it. That is the shape the console has always had
# for a runtime's loggers and log files, and a table that empties is not worth a red banner.
isolated function miVisibleRuntime(graphql:Context context, string runtimeId)
        returns types:Runtime?|error {
    types:Runtime|error runtime = miRuntimeById(context, runtimeId, MI_VIEW_PERMISSIONS);
    return runtime is error ? () : runtime;
}

# One named runtime of a named integration, once the caller may act on it.
#
# The integration is an ownership check on a runtime the caller named, not the way it is
# found, which is why a mismatch is refused rather than resolved around.
isolated function miRuntimeOfIntegration(graphql:Context context, string componentId,
        string runtimeId, string[] permissions, string refusal = "Unauthorized")
        returns types:Runtime|error {
    types:Runtime runtime = check miRuntimeById(context, runtimeId, permissions, refusal);
    if runtime.component.id != componentId {
        return error("Runtime does not belong to the specified integration");
    }
    return runtime;
}

# The runtime a component-scoped MI field will ask, once the caller may ask it.
#
# Most of the management API describes the deployed configuration, which is the same on
# every replica, so the caller names a component and any of its runtimes may answer.
isolated function miRuntimeOfComponent(graphql:Context context, string componentId,
        string? environmentId, string? runtimeId) returns types:Runtime|error {
    types:UserContextV2 userContext = check extractUserContext(context);
    types:Component? component = check storage:getComponentById(componentId);
    if component is () {
        return error("Integration not found");
    }
    types:AccessScope scope = auth:buildScopeFromContext(component.projectId,
            integrationId = componentId, envId = environmentId);
    if !check auth:hasAnyPermission(userContext.userId, MI_VIEW_PERMISSIONS, scope) {
        return error("Insufficient permissions to view component artifacts");
    }
    types:Runtime[] runtimes = check storage:getRuntimes((), (), environmentId,
            component.projectId, componentId);
    return utils:selectRuntime(runtimes, componentId, environmentId, runtimeId);
}

# A management answer the console renders as text.
isolated function fetchableText(MIAnswer answer) returns types:FetchableText =>
    answer.preparing
        ? {...stillFetching()}
        : {...fetchableOf(answer), content: miText(answer.body)};

# An artifact's own parameter map as the console's name/value rows.
isolated function namedValues(map<json> values) returns types:Parameter[] =>
    from var [name, value] in values.entries()
    select {name, value: value.toString()};

# An overview's fields as rows, in the order given and without the ones the runtime left
# out: a field MI did not report is one the artifact does not have, and an empty row saying
# so is worse than no row.
isolated function presentValues([string, json][] fields) returns types:Parameter[] =>
    from [string, json] [name, value] in fields
    where value !is ()
    select {name, value: value.toString()};

// The rights every read of a runtime's deployed configuration asks for.
final readonly & string[] MI_VIEW_PERMISSIONS = [
    auth:PERMISSION_INTEGRATION_VIEW,
    auth:PERMISSION_INTEGRATION_EDIT,
    auth:PERMISSION_INTEGRATION_MANAGE
];

# One runtime's loggers, and the answer they came from.
#
# The answer travels with them because grouping several replicas must not lose their
# staleness: a level just set on one node makes that node's list old, and a group assembled
# from it is old too.
type MILoggerReport record {|
    types:Logger[] loggers = [];
    MIAnswer answer;
|};

# The loggers in a management answer, one entry at a time.
#
# Entry by entry because the list is only as good as its worst member: MI has been seen to
# report an entry with neither name just after a level change, and converting the array in
# one step let that one entry hide the other eighty-two — the page read "No loggers found"
# until something else refetched it. A logger the runtime described incompletely is one
# logger missing from the table, which is the smallest way to be wrong here.
isolated function reportedLoggers(json body) returns types:MgmtLoggerInfo[]|error {
    json list = check body.list;
    if list !is json[] {
        return error("The runtime did not report a list of loggers");
    }
    types:MgmtLoggerInfo[] loggers = [];
    foreach json entry in list {
        types:MgmtLoggerInfo|error logger = entry.cloneWithType();
        if logger is error {
            log:printWarn("Skipping a logger the runtime described incompletely", logger,
                    entry = entry.toJsonString());
            continue;
        }
        loggers.push(logger);
    }
    return loggers;
}

# The loggers one MI runtime reports.
isolated function fetchMILoggersByRuntime(types:Runtime runtime) returns MILoggerReport|error {
    MIAnswer answer = check miRead(runtime, mi_management:loggersPath());
    if answer.preparing {
        return {answer};
    }
    types:Logger[] loggers = [];
    foreach types:MgmtLoggerInfo info in check reportedLoggers(answer.body) {
        types:LogLevel|error level = utils:toLogLevel(info.level);
        if level is error {
            log:printWarn("Skipping a logger with a level the ICP does not know",
                    loggerName = info.loggerName, logLevel = info.level);
            continue;
        }
        loggers.push({
            loggerName: info.loggerName,
            componentName: info.componentName,
            logLevel: level,
            "runtimeId": runtime.runtimeId
        });
    }
    return {loggers, answer};
}

// Look up a single reconcile state field for an artifact.
isolated function stateOf(map<map<types:ArtifactStateField>> sm, string name, string artifactType, string key)
        returns types:ArtifactStateField? {
    map<types:ArtifactStateField>? fields = sm[string `${name}|${artifactType}`];
    return fields is map<types:ArtifactStateField> ? fields[key] : ();
}

// Canonical artifact type for a reconcile key, with any desired state left under a different
// spelling folded in first. All three artifact mutations go through this, so one artifact cannot
// end up with two desired-state keys because one mutation normalized and another did not.
isolated function canonicalArtifactType(string componentId, types:Runtime[] runtimes,
        string artifactName, string rawArtifactType) returns string|error {
    string artifactType = storage:normalizeArtifactType(rawArtifactType);
    map<boolean> migratedEnvs = {};
    foreach types:Runtime runtime in runtimes {
        string envId = runtime.environment.id;
        if migratedEnvs.hasKey(envId) {
            continue;
        }
        migratedEnvs[envId] = true;
        check storage:migrateLegacyArtifactTypeKeys(componentId, envId, artifactName, artifactType);
    }
    return artifactType;
}

// Group runtimes by environment, upsert desired state per env, and reconcile.
// Returns [successCount, failedCount] across all envs.
isolated function reconcilePerEnv(types:Runtime[] runtimes, string componentId,
        types:ReconcileArtifactKey artifact, map<string> desiredProps,
        types:DispatchFn dispatchFn) returns [int, int]|error {
    map<string[]> envRuntimes = {};
    foreach types:Runtime r in runtimes {
        string envId = r.environment.id;
        if envRuntimes.hasKey(envId) {
            envRuntimes.get(envId).push(r.runtimeId);
        } else {
            envRuntimes[envId] = [r.runtimeId];
        }
    }

    int successCount = 0;
    int failedCount = 0;
    foreach [string, string[]] [envId, runtimeIds] in envRuntimes.entries() {
        log:printDebug("reconcilePerEnv upsert", componentId = componentId, envId = envId,
                runtimeCount = runtimeIds.length());
        check storage:upsertReconcileDesiredState(componentId, envId, artifact, desiredProps);
        error? e = sync:reconcileArtifactAllRuntimes(runtimeIds, componentId, envId, artifact, dispatchFn);
        if e is error {
            failedCount += runtimeIds.length();
        } else {
            successCount += runtimeIds.length();
        }
    }
    return [successCount, failedCount];
}

isolated function contextInit(http:RequestContext reqCtx, http:Request request) returns graphql:Context {
    string|error authorization = request.getHeader("Authorization");
    graphql:Context context = new;
    if authorization is string {
        context.set("Authorization", authorization);
    }
    return context;
}

// Helper function to fetch BI loggers from database
isolated function fetchBILoggersByRuntime(string runtimeId) returns types:Logger[]|error {
    log:printDebug("Fetching loggers from BI runtime database", runtimeId = runtimeId);

    // Get log levels for runtime from database
    types:RuntimeLogLevelRecord[] logLevels = check storage:getLogLevelsForRuntime(runtimeId);
    types:Logger[] loggers = [];
    foreach types:RuntimeLogLevelRecord logLevel in logLevels {
        types:LogLevel level = check utils:toLogLevel(logLevel.logLevel);
        loggers.push({
            loggerName: (), // BI loggers don't have loggerName
            componentName: logLevel.componentName,
            logLevel: level,
            "runtimeId": runtimeId
        });
    }

    log:printDebug("Successfully fetched loggers from BI runtime database",
            runtimeId = runtimeId,
            loggerCount = loggers.length());

    return loggers;
}

# Every replica's loggers, grouped by the logger they describe, or `()` while any replica
# has not answered.
#
# Grouping is the backend's work, not the console's: what a user acts on is "this logger, on
# these runtimes", and a console that had to assemble that would make MI's per-node payload
# the contract. A runtime that fails is skipped, as it always was — one node being down does
# not hide the rest. A runtime that is merely not ready yet holds the whole answer back,
# because a group missing a replica would read as that replica not having the logger.
#
# Every replica is asked before that decision is taken. Returning at the first one that is
# not ready would leave the others' fetches unstarted, so a component with N replicas would
# take N heartbeats to show a page that should take one.
isolated function fetchMILoggersByEnvironmentAndComponent(string environmentId, string componentId,
        string projectId) returns MILoggerGroupReport|error {
    types:Runtime[] runtimes = check storage:getRuntimes((), (), environmentId, projectId, componentId);
    map<types:LoggerGroup> groups = {};
    boolean preparing = false;
    boolean stale = false;

    foreach types:Runtime runtime in runtimes {
        MILoggerReport|error reported = fetchMILoggersByRuntime(runtime);
        if reported is error {
            log:printError("Failed to fetch loggers from runtime", reported,
                    runtimeId = runtime.runtimeId);
            continue;
        }
        if reported.answer.preparing {
            preparing = true;
            continue;
        }
        stale = stale || reported.answer.stale;
        foreach types:Logger logger in reported.loggers {
            string groupKey = string `${logger.loggerName ?: ""}|${logger.componentName}|${logger.logLevel}`;
            types:LoggerGroup? group = groups[groupKey];
            if group is types:LoggerGroup {
                group.runtimeIds.push(runtime.runtimeId);
                continue;
            }
            groups[groupKey] = {
                loggerName: logger.loggerName,
                componentName: logger.componentName,
                logLevel: logger.logLevel,
                logLevelInSync: true,
                runtimeIds: [runtime.runtimeId]
            };
        }
    }
    if preparing {
        return {state: stillFetching()};
    }
    return {
        groups: groups.toArray(),
        state: stale ? {stale: true, retryAfterMs: MI_STALE_RETRY_MS} : {}
    };
}

# Every replica's loggers as one set of groups, and whether they are still settling.
type MILoggerGroupReport record {|
    types:LoggerGroup[] groups = [];
    types:Fetchable state = {};
|};

// Helper function: Update log level for BI runtimes (database + command queue)
isolated function updateLogLevelBI(types:UserContextV2 userContext, types:UpdateLogLevelInput input) returns types:UpdateLogLevelResponse|error {
    string? componentNameOpt = input?.componentName;
    if componentNameOpt is () {
        return error("Component name is required for BI components");
    }
    string componentName = componentNameOpt;
    string logLevelStr = input.logLevel.toString();
    map<boolean> processed = {};
    record {|string envId; string envName; string runtimeId;|}[] pendingEvents = [];

    foreach string runtimeId in input.runtimeIds {
        types:Runtime? runtime = check storage:getRuntimeById(runtimeId);
        if runtime is () {
            continue;
        }

        types:AccessScope scope = auth:buildScopeFromContext(
                runtime.component.projectId, runtime.component.id, runtime.environment.id);
        if !check auth:hasPermission(userContext.userId, auth:PERMISSION_INTEGRATION_MANAGE, scope) {
            return error(string `Access denied: insufficient permissions to control log level on runtime ${runtimeId}`);
        }

        string componentId = runtime.component.id;
        string envId = runtime.environment.id;
        string key = componentId + ":" + envId;
        if !processed.hasKey(key) {
            processed[key] = true;
            string qualName = types:qualifiedArtifactName(componentName, input?.componentPackage);
            types:ReconcileArtifactKey artifact = {artifactName: qualName, artifactType: "log-level"};
            log:printDebug("upsertReconcileDesiredState for log-level", componentId = componentId, envId = envId);
            check storage:upsertReconcileDesiredState(componentId, envId, artifact,
                    {"logLevel": logLevelStr});
            pendingEvents.push({envId, envName: runtime.environment.name, runtimeId});
        }
    }

    // Publish after all runtimes are processed (one event per component+env).
    foreach var evt in pendingEvents {
        storage:runtimeBroadcaster.publishLogLevelChange(evt.envId, evt.envName, evt.runtimeId, componentName, logLevelStr);
    }

    return {
        success: true,
        message: string `Log level for ${componentName} set to ${logLevelStr}`,
        commandIds: []
    };
}

// Helper function: Update log level for MI runtimes (immediate via management API)
isolated function updateLogLevelMI(types:UserContextV2 userContext, types:UpdateLogLevelInput input) returns types:UpdateLogLevelResponse|error {
    string? loggerNameOpt = input?.loggerName;
    if loggerNameOpt is () {
        return error("Logger name is required for MI components");
    }
    string loggerName = loggerNameOpt;
    string logLevelStr = input.logLevel.toString();

    // Phase 1: Pre-validate all runtimes and permissions (no side-effects)
    types:ValidatedRuntime[] validatedRuntimes = [];

    foreach string runtimeId in input.runtimeIds {
        // Fetch the runtime to get its context
        types:Runtime? runtime = check storage:getRuntimeById(runtimeId);

        if runtime is () {
            log:printWarn(string `Runtime ${runtimeId} not found, skipping`);
            continue;
        }

        // Build scope from runtime's context
        types:AccessScope scope = auth:buildScopeFromContext(
                runtime.component.projectId,
                runtime.component.id,
                runtime.environment.id
        );

        // Check permission to manage this integration's runtime
        if !check auth:hasPermission(userContext.userId, auth:PERMISSION_INTEGRATION_MANAGE, scope) {
            log:printWarn(string `User ${userContext.userId} lacks permission to manage runtime ${runtimeId}`);
            return error(string `Access denied: insufficient permissions to control log level on runtime ${runtimeId}`);
        }

        // All validations passed - collect this runtime
        validatedRuntimes.push({
            runtimeId: runtimeId,
            componentId: runtime.component.id,
            runtime: runtime
        });
    }

    // Check if we have any valid runtimes after validation
    if validatedRuntimes.length() == 0 {
        return {
            success: false,
            message: "No valid runtimes found to update log levels",
            commandIds: []
        };
    }

    // Phase 2: All validations passed - persist intended state and call MI management API
    int successCount = 0;
    int failureCount = 0;
    map<boolean> processedComponents = {};
    record {|string envId; string envName; string runtimeId;|}[] pendingEvents = [];

    // Only include loggerClass when adding a new logger; its presence is what tells MI which
    // of the two this is.
    string? loggerClass = input?.loggerClass;
    json request = loggerClass is string && loggerClass.trim().length() > 0
        ? {loggerName, loggingLevel: logLevelStr, loggerClass}
        : {loggerName, loggingLevel: logLevelStr};

    // Every replica is written to before any "not yet" is reported, so a component's
    // writes all queue on the same heartbeat rather than one per round trip.
    boolean preparing = false;
    foreach types:ValidatedRuntime validated in validatedRuntimes {
        MIAnswer|error updated = miWrite(validated.runtime, http:PATCH,
                mi_management:loggersPath(), request, userContext, input?.requestId);
        if updated is error {
            log:printError("Failed to update logger on runtime", updated,
                    runtimeId = validated.runtimeId, loggerName = loggerName);
            failureCount += 1;
            continue;
        }

        // Intent is recorded by the call that submits the write, never by the polls that
        // follow it: this mutation is re-sent until the runtime confirms, and an upsert per
        // poll wrote the same desired state fifteen times for one log level change.
        string envId = validated.runtime.environment.id;
        string key = validated.componentId + ":" + envId;
        if updated.submitted && !processedComponents.hasKey(key) {
            types:ReconcileArtifactKey artifact = {artifactName: loggerName, artifactType: "mi-logger"};
            check storage:upsertReconcileDesiredState(validated.componentId, envId, artifact,
                    {"logLevel": logLevelStr});
            log:printInfo(string `Updated reconcile desired state for MI logger ${loggerName} to ${logLevelStr} in component ${validated.componentId}`);
            processedComponents[key] = true;
        }

        if updated.preparing {
            preparing = true;
            continue;
        }
        log:printInfo("Successfully updated logger on runtime",
                runtimeId = validated.runtimeId, loggerName = loggerName, logLevel = logLevelStr);
        successCount += 1;
        pendingEvents.push({
            envId: validated.runtime.environment.id,
            envName: validated.runtime.environment.name,
            runtimeId: validated.runtimeId
        });
    }
    if preparing {
        return {
            ...stillFetching(),
            success: false,
            message: "Waiting for the runtime to confirm this change",
            commandIds: []
        };
    }

    if successCount == 0 {
        return {
            success: false,
            message: string `Failed to update logger ${loggerName} on all ${failureCount} runtime(s)`,
            commandIds: []
        };
    }

    // Publish one WS event per environment after all runtimes are updated.
    map<boolean> notifiedEnvs = {};
    foreach var evt in pendingEvents {
        if !notifiedEnvs.hasKey(evt.envId) {
            notifiedEnvs[evt.envId] = true;
            storage:runtimeBroadcaster.publishLogLevelChange(evt.envId, evt.envName, evt.runtimeId, loggerName, logLevelStr);
        }
    }

    string message = successCount == validatedRuntimes.length()
        ? string `Successfully updated logger ${loggerName} to ${logLevelStr} on all ${successCount} runtime(s)`
        : string `Updated logger ${loggerName} to ${logLevelStr} on ${successCount} runtime(s), failed on ${failureCount} runtime(s)`;

    return {
        success: true,
        message: message,
        commandIds: [] // MI updates are immediate, no command tracking
    };
}

isolated function deleteLoggerMI(types:UserContextV2 userContext, types:DeleteLoggerInput input) returns types:DeleteLoggerResponse|error {
    string loggerName = input.loggerName;
    log:printDebug("deleteLoggerMI: validating runtimes and permissions", userId = userContext.userId, loggerName = loggerName, runtimeIds = input.runtimeIds);

    types:ValidatedRuntime[] validatedRuntimes = [];

    foreach string runtimeId in input.runtimeIds {
        types:Runtime? runtime = check storage:getRuntimeById(runtimeId);
        if runtime is () {
            log:printWarn("Runtime not found, skipping", runtimeId = runtimeId, loggerName = loggerName);
            continue;
        }

        types:AccessScope scope = auth:buildScopeFromContext(
                runtime.component.projectId,
                runtime.component.id,
                runtime.environment.id
        );

        if !check auth:hasPermission(userContext.userId, auth:PERMISSION_INTEGRATION_MANAGE, scope) {
            log:printWarn("User lacks permission to delete logger on runtime", userId = userContext.userId, runtimeId = runtimeId, loggerName = loggerName);
            return error(string `Access denied: insufficient permissions to delete logger on runtime ${runtimeId}`);
        }

        log:printDebug("Runtime validated for logger deletion", runtimeId = runtimeId, loggerName = loggerName, componentId = runtime.component.id);
        validatedRuntimes.push({
            runtimeId: runtimeId,
            componentId: runtime.component.id,
            runtime: runtime
        });
    }

    if validatedRuntimes.length() == 0 {
        log:printWarn("No valid runtimes found to delete logger", loggerName = loggerName);
        return {
            success: false,
            message: "No valid runtimes found to delete logger"
        };
    }

    log:printDebug("deleteLoggerMI: calling MI management API", loggerName = loggerName, validatedRuntimeCount = validatedRuntimes.length());
    int successCount = 0;
    int failureCount = 0;
    string loggerPath = check mi_management:loggerPath(loggerName);

    boolean preparing = false;
    foreach types:ValidatedRuntime validated in validatedRuntimes {
        MIAnswer|error deleted = miWrite(validated.runtime, http:DELETE, loggerPath, (),
                userContext, input?.requestId);
        if deleted is error {
            log:printError("Failed to delete logger on runtime", deleted,
                    runtimeId = validated.runtimeId, loggerName = loggerName);
            failureCount += 1;
            continue;
        }
        if deleted.preparing {
            preparing = true;
            continue;
        }
        log:printInfo("Successfully deleted logger on runtime",
                runtimeId = validated.runtimeId, loggerName = loggerName);
        successCount += 1;
    }
    if preparing {
        return {
            ...stillFetching(),
            success: false,
            message: "Waiting for the runtime to confirm this change"
        };
    }

    if successCount == 0 {
        log:printError("Failed to delete logger on all runtimes", loggerName = loggerName, failureCount = failureCount);
        return {
            success: false,
            message: string `Failed to delete logger ${loggerName} on all ${failureCount} runtime(s)`
        };
    }

    string message = successCount == validatedRuntimes.length()
        ? string `Successfully deleted logger ${loggerName} from all ${successCount} runtime(s)`
        : string `Deleted logger ${loggerName} from ${successCount} runtime(s), failed on ${failureCount} runtime(s)`;

    return {success: true, message: message};
}

isolated function validateRegistryResourceAccess(
        types:UserContextV2 userContext,
        string runtimeId,
        string path,
        string operation
) returns types:ValidatedRegistryAccess|error {
    log:printDebug(string `Validating registry access for ${operation}`, userId = userContext.userId, runtimeId = runtimeId, path = path);

    string trimmedPath = path.trim();
    if trimmedPath == "" {
        log:printWarn(string `Empty path for ${operation}`, userId = userContext.userId, runtimeId = runtimeId);
        return error("Invalid path");
    }

    types:Runtime? runtime = check storage:getRuntimeById(runtimeId);
    if runtime is () {
        log:printWarn(string `Runtime not found for ${operation}`, userId = userContext.userId, runtimeId = runtimeId);
        return error(string `Unable to retrieve ${operation}`);
    }

    log:printDebug(string `Runtime found for ${operation}`,
            userId = userContext.userId,
            runtimeId = runtimeId,
            projectId = runtime.component.projectId,
            componentId = runtime.component.id,
            environmentId = runtime.environment.id,
            status = runtime.status
    );

    types:AccessScope scope = auth:buildScopeFromContext(runtime.component.projectId, runtime.component.id, runtime.environment.id);

    if !check auth:hasAnyPermission(userContext.userId, [auth:PERMISSION_INTEGRATION_VIEW, auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
        log:printWarn(string `Permission denied for ${operation}`, userId = userContext.userId, runtimeId = runtimeId, path = path);
        return error(string `Unable to retrieve ${operation}`);
    }

    if runtime.status != types:RUNNING {
        log:printWarn(string `Runtime not online for ${operation}`, userId = userContext.userId, runtimeId = runtimeId, status = runtime.status);
        return error("Runtime is not online");
    }

    log:printDebug(string `Access validated for ${operation}`, userId = userContext.userId, runtimeId = runtimeId, trimmedPath = trimmedPath);
    return {runtime, trimmedPath};
}

@graphql:ServiceConfig {
    contextInit: utils:initGraphQLContext,
    interceptors: new utils:WsAuthInterceptor(),
    cors: {
        allowOrigins: normalizedCorsAllowedOrigins
    },
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
    ]
}

service /graphql on graphqlListener {

    function init() {
        log:printInfo("GraphQL service started at " + serverHost + ":" + serverPort.toString());
    }

    // ----------- Runtime Resources
    // Get all runtimes with optional filtering
    // componentId is now optional - if not provided, returns all runtimes in the project
    isolated resource function get runtimes(graphql:Context context, string? status, string? runtimeType, string? environmentId, string? projectId, string? componentId, types:PaginationInput? pagination) returns types:RuntimesPage|error {
        types:UserContextV2 userContext = check extractUserContext(context);
        types:Runtime[] allRuntimes = [];

        // Step 1: Determine the actual projectId
        string actualProjectId = projectId ?: "";

        // If componentId is provided and projectId is not, infer projectId from componentId
        if componentId is string && actualProjectId == "" {
            string|error projectIdResult = storage:getProjectIdByComponentId(componentId);
            if projectIdResult is error {
                return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}}; // Component not found
            }
            actualProjectId = projectIdResult;
        }

        // Step 2: Org-level query — environmentId only, no project/component context.
        // Returns all runtimes for the environment (used by the org-level Runtimes page).
        if actualProjectId == "" && environmentId is string {
            // Org-level access: check environment management permissions
            types:AccessScope scope = auth:buildScopeFromContext("", envId = environmentId);
            if !check auth:hasAnyPermission(userContext.userId,
                    [auth:PERMISSION_ENVIRONMENT_MANAGE, auth:PERMISSION_ENVIRONMENT_MANAGE_NONPROD], scope) {
                return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
            }
            allRuntimes = check storage:getRuntimes(status, runtimeType, environmentId, (), componentId);
        } else if actualProjectId == "" {
            // If projectId is still empty and no environmentId, we cannot proceed
            return error("Either projectId or componentId must be provided");
        } else if environmentId is string {
            // Step 3: environmentId specified — check access to that specific environment
            // Build scope with project, optional integration, and environment
            types:AccessScope scope = auth:buildScopeFromContext(actualProjectId, integrationId = componentId, envId = environmentId);

            // Check if user has permission to view this integration/project in this environment
            if !check auth:hasAnyPermission(userContext.userId,
                    [auth:PERMISSION_INTEGRATION_VIEW, auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
                return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}}; // No access to this integration/project in this environment
            }
            // Fetch runtimes for the specified environment
            allRuntimes = check storage:getRuntimes(status, runtimeType, environmentId, actualProjectId, componentId);
        } else {
            // Step 4: If environmentId is NOT specified, resolve accessible environments
            auth:EnvironmentAccessInfo envAccess = check auth:resolveEnvironmentAccess(
                    userContext.userId,
                    projectId = actualProjectId,
                    integrationId = componentId
            );
            // If no restriction, user can access all environments - fetch all runtimes
            if !envAccess.hasRestriction {
                allRuntimes = check storage:getRuntimes(status, runtimeType, (), actualProjectId, componentId);
            } else {
                // If blocked (empty allowed list), return empty
                string[]? allowedEnvs = envAccess.allowedEnvironments;
                if allowedEnvs is string[] && allowedEnvs.length() > 0 {
                    // Fetch runtimes for each allowed environment and combine
                    foreach string envId in allowedEnvs {
                        types:Runtime[] envRuntimes = check storage:getRuntimes(status, runtimeType, envId, actualProjectId, componentId);
                        allRuntimes.push(...envRuntimes);
                    }
                }
            }
        }

        [int, int, types:PageInfo] [sliceFrom, sliceTo, pageInfo] = buildPageResult(allRuntimes.length(), pagination);
        log:printDebug("Fetching runtimes page", total = allRuntimes.length(), 'limit = pageInfo.'limit, offset = pageInfo.offset);
        return {items: allRuntimes.slice(sliceFrom, sliceTo), pageInfo};
    }

    // Get a specific runtime by ID
    isolated resource function get runtime(graphql:Context context, string runtimeId) returns types:Runtime?|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Fetch the runtime to get its context
        types:Runtime? runtime = check storage:getRuntimeById(runtimeId);

        if runtime is () {
            return (); // Runtime not found
        }

        // Build scope from runtime's context
        types:AccessScope scope = auth:buildScopeFromContext(
                runtime.component.projectId,
                runtime.component.id,
                runtime.environment.id
        );

        // Check permission to view this integration
        if !check auth:hasPermission(userContext.userId, auth:PERMISSION_INTEGRATION_VIEW, scope) {
            return (); // No access - return 404 (same as not found)
        }

        return runtime;
    }

    // Get component deployment information for a specific environment
    isolated resource function get componentDeployment(
            graphql:Context context,
            string orgHandler,
            string orgUuid,
            string componentId,
            string versionId,
            string environmentId
    ) returns types:ComponentDeployment?|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Get project ID for the component (lightweight query for access control)
        string|error projectIdResult = storage:getProjectIdByComponentId(componentId);
        if projectIdResult is error {
            return (); // Component not found
        }

        // Build scope with project, integration, and environment
        types:AccessScope scope = auth:buildScopeFromContext(
                projectIdResult,
                componentId,
                environmentId
        );

        // Check permission to view this integration deployment
        if !check auth:hasPermission(userContext.userId, auth:PERMISSION_INTEGRATION_VIEW, scope) {
            return (); // No access - return 404 (same as not found)
        }

        // Get deployment information from runtimes table
        types:ComponentDeployment? deployment = check storage:getComponentDeployment(componentId, environmentId, versionId);

        return deployment;
    }

    // Get services for a specific runtime
    isolated resource function get services(graphql:Context context, string runtimeId, types:PaginationInput? pagination = ()) returns types:ServicesPage|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // First, fetch the runtime to verify access to its environment
        types:Runtime? runtime = check storage:getRuntimeById(runtimeId);

        if runtime is () {
            return error("Runtime not found");
        }

        // Build scope with project, integration, and environment
        types:AccessScope scope = {
            orgUuid: 1,
            projectUuid: runtime.component.projectId,
            integrationUuid: runtime.component.id,
            envUuid: runtime.environment.id
        };

        // Verify user has view, edit, or manage permission
        if !check auth:hasAnyPermission(userContext.userId, [auth:PERMISSION_INTEGRATION_VIEW, auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
            log:printWarn("Attempt to access runtime services without permission", userId = userContext.userId, runtimeId = runtimeId);
            return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }

        types:Service[] result = check storage:getServicesForRuntime(runtimeId);
        [int, int, types:PageInfo] [sliceFrom, sliceTo, pageInfo] = buildPageResult(result.length(), pagination);
        return {items: result.slice(sliceFrom, sliceTo), pageInfo};
    }

    // Get the OpenAPI (Swagger) definitions packed into a BI runtime's JAR by the
    // swagger-pack compiler plugin, reported via the full heartbeat.
    isolated resource function get openApiDefinitionsByRuntime(graphql:Context context, string runtimeId) returns types:OpenApiDefinitionRecord[]|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // First, fetch the runtime to verify access to its environment
        types:Runtime? runtime = check storage:getRuntimeById(runtimeId);

        if runtime is () {
            return error("Runtime not found");
        }

        // Build scope with project, integration, and environment
        types:AccessScope scope = {
            orgUuid: 1,
            projectUuid: runtime.component.projectId,
            integrationUuid: runtime.component.id,
            envUuid: runtime.environment.id
        };

        // Verify user has view, edit, or manage permission
        if !check auth:hasAnyPermission(userContext.userId, [auth:PERMISSION_INTEGRATION_VIEW, auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
            log:printWarn("Attempt to access runtime OpenAPI definitions without permission", userId = userContext.userId, runtimeId = runtimeId);
            return [];
        }

        return check storage:getOpenApiDefinitionsForRuntime(runtimeId);
    }

    // Get services for a specific environment and component
    isolated resource function get servicesByEnvironmentAndComponent(graphql:Context context, string environmentId, string componentId, types:PaginationInput? pagination = ()) returns types:ServicesPage|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Get project ID for the component (lightweight query for access control)
        string projectId = check storage:getProjectIdByComponentId(componentId);

        // Build scope with project, integration, and environment
        types:AccessScope scope = {
            orgUuid: 1,
            projectUuid: projectId,
            integrationUuid: componentId,
            envUuid: environmentId
        };

        // Verify user has view, edit, or manage permission
        if !check auth:hasAnyPermission(userContext.userId, [auth:PERMISSION_INTEGRATION_VIEW, auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
            log:printWarn("Attempt to access component services without permission", userId = userContext.userId, environmentId = environmentId, componentId = componentId);
            return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }

        types:Service[] result = check storage:getServicesByEnvironmentAndComponent(environmentId, componentId);
        if result.length() == 0 {
            return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }
        map<map<types:ArtifactStateField>> sm = check storage:queryArtifactState(componentId, environmentId);
        foreach types:Service a in result {
            string qualName = types:qualifiedArtifactName(a.name, a.package);
            types:ArtifactStateField? s = stateOf(sm, qualName, "service", "status");
            if s is types:ArtifactStateField {
                a.state = <types:ArtifactState>s.value;
                a.stateInSync = s.inSync;
            }
        }
        [int, int, types:PageInfo] [sliceFrom, sliceTo, pageInfo] = buildPageResult(result.length(), pagination);
        return {items: result.slice(sliceFrom, sliceTo), pageInfo};
    }

    // Get listeners for a specific runtime
    isolated resource function get listeners(graphql:Context context, string runtimeId, types:PaginationInput? pagination = ()) returns types:ListenersPage|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // First, fetch the runtime to verify access to its environment
        types:Runtime? runtime = check storage:getRuntimeById(runtimeId);

        if runtime is () {
            return error("Runtime not found");
        }

        // Build scope with project, integration, and environment
        types:AccessScope scope = {
            orgUuid: 1,
            projectUuid: runtime.component.projectId,
            integrationUuid: runtime.component.id,
            envUuid: runtime.environment.id
        };

        // Verify user has view, edit, or manage permission
        if !check auth:hasAnyPermission(userContext.userId, [auth:PERMISSION_INTEGRATION_VIEW, auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
            log:printWarn("Attempt to access listeners without permission", userId = userContext.userId, runtimeId = runtimeId);
            return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }

        types:Listener[] result = check storage:getListenersForRuntime(runtimeId);
        [int, int, types:PageInfo] [sliceFrom, sliceTo, pageInfo] = buildPageResult(result.length(), pagination);
        return {items: result.slice(sliceFrom, sliceTo), pageInfo};
    }

    // Get listeners for a specific environment and component
    isolated resource function get listenersByEnvironmentAndComponent(graphql:Context context, string environmentId, string componentId, types:PaginationInput? pagination = ()) returns types:ListenersPage|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Get project ID for the component (lightweight query for access control)
        string projectId = check storage:getProjectIdByComponentId(componentId);

        // Build scope with project, integration, and environment
        types:AccessScope scope = {
            orgUuid: 1,
            projectUuid: projectId,
            integrationUuid: componentId,
            envUuid: environmentId
        };

        // Verify user has view, edit, or manage permission
        if !check auth:hasAnyPermission(userContext.userId, [auth:PERMISSION_INTEGRATION_VIEW, auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
            log:printWarn("Attempt to access listeners without permission", userId = userContext.userId, environmentId = environmentId, componentId = componentId);
            return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }

        types:Listener[] result = check storage:getListenersByEnvironmentAndComponent(environmentId, componentId);
        if result.length() == 0 {
            return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }
        map<map<types:ArtifactStateField>> sm = check storage:queryArtifactState(componentId, environmentId);
        foreach types:Listener a in result {
            string qualName = types:qualifiedArtifactName(a.name, a.package);
            types:ArtifactStateField? s = stateOf(sm, qualName, "listener", "status");
            if s is types:ArtifactStateField {
                a.state = <types:ArtifactState>s.value;
                a.stateInSync = s.inSync;
            }
        }
        [int, int, types:PageInfo] [sliceFrom, sliceTo, pageInfo] = buildPageResult(result.length(), pagination);
        return {items: result.slice(sliceFrom, sliceTo), pageInfo};
    }

    // Get workflow definitions for a specific environment and component,
    // from the workflow metadata stored off heartbeats (bi_workflow_metadata).
    isolated resource function get workflowsByEnvironmentAndComponent(graphql:Context context, string environmentId, string componentId, types:PaginationInput? pagination = ()) returns types:WorkflowsPage|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Get project ID for the component (lightweight query for access control)
        string projectId = check storage:getProjectIdByComponentId(componentId);

        // Build scope with project, integration, and environment
        types:AccessScope scope = {
            orgUuid: 1,
            projectUuid: projectId,
            integrationUuid: componentId,
            envUuid: environmentId
        };

        // Verify user has the workflow-specific view (or manage) permission — same rule as
        // the workflow proxy's browse paths.
        if !check auth:hasAnyPermission(userContext.userId, [auth:PERMISSION_WORKFLOW_VIEW_WORKFLOWS, auth:PERMISSION_WORKFLOW_MANAGE_WORKFLOWS], scope) {
            log:printWarn("Attempt to access component workflows without permission", userId = userContext.userId, environmentId = environmentId, componentId = componentId);
            return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }

        types:Workflow[] result = check fetchWorkflowDefinitions(componentId, environmentId);
        [int, int, types:PageInfo] [sliceFrom, sliceTo, pageInfo] = buildPageResult(result.length(), pagination);
        return {items: result.slice(sliceFrom, sliceTo), pageInfo};
    }

    // Get automation artifacts for a specific environment and component
    isolated resource function get automationsByEnvironmentAndComponent(graphql:Context context, string environmentId, string componentId, types:PaginationInput? pagination = ()) returns types:AutomationsPage|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Get project ID for the component (lightweight query for access control)
        string projectId = check storage:getProjectIdByComponentId(componentId);

        // Build scope with project, integration, and environment
        types:AccessScope scope = {
            orgUuid: 1,
            projectUuid: projectId,
            integrationUuid: componentId,
            envUuid: environmentId
        };

        // Verify user has view, edit, or manage permission
        if !check auth:hasAnyPermission(userContext.userId, [auth:PERMISSION_INTEGRATION_VIEW, auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
            log:printWarn("Attempt to access automations without permission", userId = userContext.userId, environmentId = environmentId, componentId = componentId);
            return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }

        types:Automation[] result = check storage:getAutomationsByEnvironmentAndComponent(environmentId, componentId);
        [int, int, types:PageInfo] [sliceFrom, sliceTo, pageInfo] = buildPageResult(result.length(), pagination);
        return {items: result.slice(sliceFrom, sliceTo), pageInfo};
    }

    // Get REST APIs for a specific environment and component
    isolated resource function get restApisByEnvironmentAndComponent(graphql:Context context, string environmentId, string componentId, types:PaginationInput? pagination = ()) returns types:RestApisPage|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Get project ID for the component (lightweight query for access control)
        string projectId = check storage:getProjectIdByComponentId(componentId);

        // Build scope with project, integration, and environment
        types:AccessScope scope = {
            orgUuid: 1,
            projectUuid: projectId,
            integrationUuid: componentId,
            envUuid: environmentId
        };

        // Verify user has view, edit, or manage permission
        if !check auth:hasAnyPermission(userContext.userId, [auth:PERMISSION_INTEGRATION_VIEW, auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
            log:printWarn("Attempt to access component REST APIs without permission", userId = userContext.userId, environmentId = environmentId, componentId = componentId);
            return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }

        types:RestApi[] result = check storage:getRestApisByEnvironmentAndComponent(environmentId, componentId);
        if result.length() == 0 {
            return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }
        map<map<types:ArtifactStateField>> sm = check storage:queryArtifactState(componentId, environmentId);
        foreach types:RestApi a in result {
            types:ArtifactStateField? s = stateOf(sm, a.name, "api", "status");
            if s is types:ArtifactStateField {
                a.state = <types:ArtifactState>s.value;
                a.stateInSync = s.inSync;
            }
            types:ArtifactStateField? t = stateOf(sm, a.name, "api", "tracing");
            if t is types:ArtifactStateField {
                a.tracing = t.value;
                a.tracingInSync = t.inSync;
            }
            types:ArtifactStateField? st = stateOf(sm, a.name, "api", "statistics");
            if st is types:ArtifactStateField {
                a.statistics = st.value;
                a.statisticsInSync = st.inSync;
            }
        }
        [int, int, types:PageInfo] [sliceFrom, sliceTo, pageInfo] = buildPageResult(result.length(), pagination);
        return {items: result.slice(sliceFrom, sliceTo), pageInfo};
    }

    // Get Composite Apps for a specific environment and component
    isolated resource function get compositeAppsByEnvironmentAndComponent(graphql:Context context, string environmentId, string componentId, types:PaginationInput? pagination = ()) returns types:CompositeAppsPage|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Get project ID for the component (lightweight query for access control)
        string projectId = check storage:getProjectIdByComponentId(componentId);

        // Build scope with project, integration, and environment
        types:AccessScope scope = {
            orgUuid: 1,
            projectUuid: projectId,
            integrationUuid: componentId,
            envUuid: environmentId
        };

        // Verify user has view, edit, or manage permission
        if !check auth:hasAnyPermission(userContext.userId, [auth:PERMISSION_INTEGRATION_VIEW, auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
            log:printWarn("Attempt to access component Composite Apps without permission", userId = userContext.userId, environmentId = environmentId, componentId = componentId);
            return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }

        types:CompositeApp[] result = check storage:getCompositeAppsByEnvironmentAndComponent(environmentId, componentId);
        [int, int, types:PageInfo] [sliceFrom, sliceTo, pageInfo] = buildPageResult(result.length(), pagination);
        return {items: result.slice(sliceFrom, sliceTo), pageInfo};
    }

    isolated resource function get compositeAppFaultStackTrace(graphql:Context context, string runtimeId, string appName) returns types:CompositeAppFaultStackTrace|error {
        string trimmedAppName = appName.trim();
        if trimmedAppName == "" {
            return error("App name must not be empty");
        }
        types:Runtime runtime = check miRuntimeById(context, runtimeId, MI_VIEW_PERMISSIONS);
        MIAnswer answer = check miRead(runtime,
                check mi_management:compositeAppFaultPath(trimmedAppName));
        if answer.preparing {
            return {...stillFetching(), runtimeId, appName: trimmedAppName};
        }
        return {
            ...fetchableOf(answer),
            runtimeId,
            appName: trimmedAppName,
            faultStackTrace: check mi_management:faultStackTrace(answer.body, trimmedAppName)
        };
    }

    isolated resource function get dataServiceFaultStackTrace(graphql:Context context, string runtimeId, string serviceName) returns types:DataServiceFaultStackTrace|error {
        string trimmedServiceName = serviceName.trim();
        if trimmedServiceName == "" {
            return error("Data service name must not be empty");
        }
        types:Runtime runtime = check miRuntimeById(context, runtimeId, MI_VIEW_PERMISSIONS);
        MIAnswer answer = check miRead(runtime,
                check mi_management:dataServiceFaultPath(trimmedServiceName));
        if answer.preparing {
            return {...stillFetching(), runtimeId, serviceName: trimmedServiceName};
        }
        return {
            ...fetchableOf(answer),
            runtimeId,
            serviceName: trimmedServiceName,
            faultStackTrace: check mi_management:faultStackTrace(answer.body, trimmedServiceName)
        };
    }

    // Get Inbound Endpoints for a specific environment and component
    isolated resource function get inboundEndpointsByEnvironmentAndComponent(graphql:Context context, string environmentId, string componentId, types:PaginationInput? pagination = ()) returns types:InboundEndpointsPage|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Get project ID for the component (lightweight query for access control)
        string projectId = check storage:getProjectIdByComponentId(componentId);

        // Build scope with project, integration, and environment
        types:AccessScope scope = {
            orgUuid: 1,
            projectUuid: projectId,
            integrationUuid: componentId,
            envUuid: environmentId
        };

        // Verify user has view, edit, or manage permission
        if !check auth:hasAnyPermission(userContext.userId, [auth:PERMISSION_INTEGRATION_VIEW, auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
            log:printWarn("Attempt to access component inbound endpoints without permission", userId = userContext.userId, environmentId = environmentId, componentId = componentId);
            return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }

        types:InboundEndpoint[] result = check storage:getInboundEndpointsByEnvironmentAndComponent(environmentId, componentId);
        if result.length() == 0 {
            return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }
        map<map<types:ArtifactStateField>> sm = check storage:queryArtifactState(componentId, environmentId);
        foreach types:InboundEndpoint a in result {
            types:ArtifactStateField? s = stateOf(sm, a.name, "inbound-endpoint", "status");
            if s is types:ArtifactStateField {
                a.state = <types:ArtifactState>s.value;
                a.stateInSync = s.inSync;
            }
            types:ArtifactStateField? t = stateOf(sm, a.name, "inbound-endpoint", "tracing");
            if t is types:ArtifactStateField {
                a.tracing = t.value;
                a.tracingInSync = t.inSync;
            }
            types:ArtifactStateField? st = stateOf(sm, a.name, "inbound-endpoint", "statistics");
            if st is types:ArtifactStateField {
                a.statistics = st.value;
                a.statisticsInSync = st.inSync;
            }
        }
        [int, int, types:PageInfo] [sliceFrom, sliceTo, pageInfo] = buildPageResult(result.length(), pagination);
        return {items: result.slice(sliceFrom, sliceTo), pageInfo};
    }

    // Get Endpoints for a specific environment and component
    isolated resource function get endpointsByEnvironmentAndComponent(graphql:Context context, string environmentId, string componentId, types:PaginationInput? pagination = ()) returns types:EndpointsPage|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Get project ID for the component (lightweight query for access control)
        string projectId = check storage:getProjectIdByComponentId(componentId);

        // Build scope with project, integration, and environment
        types:AccessScope scope = {
            orgUuid: 1,
            projectUuid: projectId,
            integrationUuid: componentId,
            envUuid: environmentId
        };

        // Verify user has view, edit, or manage permission
        if !check auth:hasAnyPermission(userContext.userId, [auth:PERMISSION_INTEGRATION_VIEW, auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
            log:printWarn("Attempt to access component endpoints without permission", userId = userContext.userId, environmentId = environmentId, componentId = componentId);
            return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }

        types:Endpoint[] result = check storage:getEndpointsByEnvironmentAndComponent(environmentId, componentId);
        if result.length() == 0 {
            return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }
        map<map<types:ArtifactStateField>> sm = check storage:queryArtifactState(componentId, environmentId);
        foreach types:Endpoint a in result {
            types:ArtifactStateField? s = stateOf(sm, a.name, "endpoint", "status");
            if s is types:ArtifactStateField {
                a.state = <types:ArtifactState>s.value;
                a.stateInSync = s.inSync;
            }
            types:ArtifactStateField? t = stateOf(sm, a.name, "endpoint", "tracing");
            if t is types:ArtifactStateField {
                a.tracing = t.value;
                a.tracingInSync = t.inSync;
            }
            types:ArtifactStateField? st = stateOf(sm, a.name, "endpoint", "statistics");
            if st is types:ArtifactStateField {
                a.statistics = st.value;
                a.statisticsInSync = st.inSync;
            }
        }
        [int, int, types:PageInfo] [sliceFrom, sliceTo, pageInfo] = buildPageResult(result.length(), pagination);
        return {items: result.slice(sliceFrom, sliceTo), pageInfo};
    }

    // Get Sequences for a specific environment and component
    isolated resource function get sequencesByEnvironmentAndComponent(graphql:Context context, string environmentId, string componentId, types:PaginationInput? pagination = ()) returns types:SequencesPage|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Get project ID for the component (lightweight query for access control)
        string projectId = check storage:getProjectIdByComponentId(componentId);

        // Build scope with project, integration, and environment
        types:AccessScope scope = {
            orgUuid: 1,
            projectUuid: projectId,
            integrationUuid: componentId,
            envUuid: environmentId
        };

        // Verify user has view, edit, or manage permission
        if !check auth:hasAnyPermission(userContext.userId, [auth:PERMISSION_INTEGRATION_VIEW, auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
            log:printWarn("Attempt to access component sequences without permission", userId = userContext.userId, environmentId = environmentId, componentId = componentId);
            return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }

        types:Sequence[] result = check storage:getSequencesByEnvironmentAndComponent(environmentId, componentId);
        if result.length() == 0 {
            return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }
        map<map<types:ArtifactStateField>> sm = check storage:queryArtifactState(componentId, environmentId);
        foreach types:Sequence a in result {
            types:ArtifactStateField? s = stateOf(sm, a.name, "sequence", "status");
            if s is types:ArtifactStateField {
                a.state = <types:ArtifactState>s.value;
                a.stateInSync = s.inSync;
            }
            types:ArtifactStateField? t = stateOf(sm, a.name, "sequence", "tracing");
            if t is types:ArtifactStateField {
                a.tracing = t.value;
                a.tracingInSync = t.inSync;
            }
            types:ArtifactStateField? st = stateOf(sm, a.name, "sequence", "statistics");
            if st is types:ArtifactStateField {
                a.statistics = st.value;
                a.statisticsInSync = st.inSync;
            }
        }
        [int, int, types:PageInfo] [sliceFrom, sliceTo, pageInfo] = buildPageResult(result.length(), pagination);
        return {items: result.slice(sliceFrom, sliceTo), pageInfo};
    }

    // Get Proxy Services for a specific environment and component
    isolated resource function get proxyServicesByEnvironmentAndComponent(graphql:Context context, string environmentId, string componentId, types:PaginationInput? pagination = ()) returns types:ProxyServicesPage|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Get project ID for the component (lightweight query for access control)
        string projectId = check storage:getProjectIdByComponentId(componentId);

        // Build scope with project, integration, and environment
        types:AccessScope scope = {
            orgUuid: 1,
            projectUuid: projectId,
            integrationUuid: componentId,
            envUuid: environmentId
        };

        // Verify user has view, edit, or manage permission
        if !check auth:hasAnyPermission(userContext.userId, [auth:PERMISSION_INTEGRATION_VIEW, auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
            log:printWarn("Attempt to access component proxy services without permission", userId = userContext.userId, environmentId = environmentId, componentId = componentId);
            return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }

        types:ProxyService[] result = check storage:getProxyServicesByEnvironmentAndComponent(environmentId, componentId);
        if result.length() == 0 {
            return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }
        map<map<types:ArtifactStateField>> sm = check storage:queryArtifactState(componentId, environmentId);
        foreach types:ProxyService a in result {
            types:ArtifactStateField? s = stateOf(sm, a.name, "proxy-service", "status");
            if s is types:ArtifactStateField {
                a.state = <types:ArtifactState>s.value;
                a.stateInSync = s.inSync;
            }
            types:ArtifactStateField? t = stateOf(sm, a.name, "proxy-service", "tracing");
            if t is types:ArtifactStateField {
                a.tracing = t.value;
                a.tracingInSync = t.inSync;
            }
            types:ArtifactStateField? st = stateOf(sm, a.name, "proxy-service", "statistics");
            if st is types:ArtifactStateField {
                a.statistics = st.value;
                a.statisticsInSync = st.inSync;
            }
        }
        [int, int, types:PageInfo] [sliceFrom, sliceTo, pageInfo] = buildPageResult(result.length(), pagination);
        return {items: result.slice(sliceFrom, sliceTo), pageInfo};
    }

    // Get Tasks for a specific environment and component
    isolated resource function get tasksByEnvironmentAndComponent(graphql:Context context, string environmentId, string componentId, types:PaginationInput? pagination = ()) returns types:TasksPage|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Get project ID for the component (lightweight query for access control)
        string projectId = check storage:getProjectIdByComponentId(componentId);

        // Build scope with project, integration, and environment
        types:AccessScope scope = {
            orgUuid: 1,
            projectUuid: projectId,
            integrationUuid: componentId,
            envUuid: environmentId
        };

        // Verify user has view, edit, or manage permission
        if !check auth:hasAnyPermission(userContext.userId, [auth:PERMISSION_INTEGRATION_VIEW, auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
            log:printWarn("Attempt to access component tasks without permission", userId = userContext.userId, environmentId = environmentId, componentId = componentId);
            return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }

        types:Task[] result = check storage:getTasksByEnvironmentAndComponent(environmentId, componentId);
        if result.length() == 0 {
            return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }
        map<map<types:ArtifactStateField>> sm = check storage:queryArtifactState(componentId, environmentId);
        foreach types:Task a in result {
            types:ArtifactStateField? s = stateOf(sm, a.name, "task", "status");
            if s is types:ArtifactStateField {
                a.state = <types:ArtifactState>s.value;
                a.stateInSync = s.inSync;
            }
        }
        [int, int, types:PageInfo] [sliceFrom, sliceTo, pageInfo] = buildPageResult(result.length(), pagination);
        return {items: result.slice(sliceFrom, sliceTo), pageInfo};
    }

    // Get Templates for a specific environment and component
    isolated resource function get templatesByEnvironmentAndComponent(graphql:Context context, string environmentId, string componentId, types:PaginationInput? pagination = ()) returns types:TemplatesPage|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Get project ID for the component (lightweight query for access control)
        string projectId = check storage:getProjectIdByComponentId(componentId);

        // Build scope with project, integration, and environment
        types:AccessScope scope = {
            orgUuid: 1,
            projectUuid: projectId,
            integrationUuid: componentId,
            envUuid: environmentId
        };

        // Verify user has view, edit, or manage permission
        if !check auth:hasAnyPermission(userContext.userId, [auth:PERMISSION_INTEGRATION_VIEW, auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
            log:printWarn("Attempt to access component templates without permission", userId = userContext.userId, environmentId = environmentId, componentId = componentId);
            return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }

        types:Template[] result = check storage:getTemplatesByEnvironmentAndComponent(environmentId, componentId);
        [int, int, types:PageInfo] [sliceFrom, sliceTo, pageInfo] = buildPageResult(result.length(), pagination);
        return {items: result.slice(sliceFrom, sliceTo), pageInfo};
    }

    // Get Message Stores for a specific environment and component
    isolated resource function get messageStoresByEnvironmentAndComponent(graphql:Context context, string environmentId, string componentId, types:PaginationInput? pagination = ()) returns types:MessageStoresPage|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Get project ID for the component (lightweight query for access control)
        string projectId = check storage:getProjectIdByComponentId(componentId);

        // Build scope with project, integration, and environment
        types:AccessScope scope = {
            orgUuid: 1,
            projectUuid: projectId,
            integrationUuid: componentId,
            envUuid: environmentId
        };

        // Verify user has view, edit, or manage permission
        if !check auth:hasAnyPermission(userContext.userId, [auth:PERMISSION_INTEGRATION_VIEW, auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
            log:printWarn("Attempt to access component message stores without permission", userId = userContext.userId, environmentId = environmentId, componentId = componentId);
            return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }

        types:MessageStore[] result = check storage:getMessageStoresByEnvironmentAndComponent(environmentId, componentId);
        if result.length() == 0 {
            return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }
        map<map<types:ArtifactStateField>> sm = check storage:queryArtifactState(componentId, environmentId);
        foreach types:MessageStore a in result {
            types:ArtifactStateField? s = stateOf(sm, a.name, "message-store", "status");
            if s is types:ArtifactStateField {
                a.state = <types:ArtifactState>s.value;
                a.stateInSync = s.inSync;
            }
        }
        [int, int, types:PageInfo] [sliceFrom, sliceTo, pageInfo] = buildPageResult(result.length(), pagination);
        return {items: result.slice(sliceFrom, sliceTo), pageInfo};
    }

    // Get Message Processors for a specific environment and component
    isolated resource function get messageProcessorsByEnvironmentAndComponent(graphql:Context context, string environmentId, string componentId, types:PaginationInput? pagination = ()) returns types:MessageProcessorsPage|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Get project ID for the component (lightweight query for access control)
        string projectId = check storage:getProjectIdByComponentId(componentId);

        // Build scope with project, integration, and environment
        types:AccessScope scope = {
            orgUuid: 1,
            projectUuid: projectId,
            integrationUuid: componentId,
            envUuid: environmentId
        };

        // Verify user has view, edit, or manage permission
        if !check auth:hasAnyPermission(userContext.userId, [auth:PERMISSION_INTEGRATION_VIEW, auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
            log:printWarn("Attempt to access component message processors without permission", userId = userContext.userId, environmentId = environmentId, componentId = componentId);
            return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }

        types:MessageProcessor[] result = check storage:getMessageProcessorsByEnvironmentAndComponent(environmentId, componentId);
        if result.length() == 0 {
            return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }
        map<map<types:ArtifactStateField>> sm = check storage:queryArtifactState(componentId, environmentId);
        foreach types:MessageProcessor a in result {
            types:ArtifactStateField? s = stateOf(sm, a.name, "message-processor", "status");
            if s is types:ArtifactStateField {
                a.state = <types:ArtifactState>s.value;
                a.stateInSync = s.inSync;
            }
        }
        [int, int, types:PageInfo] [sliceFrom, sliceTo, pageInfo] = buildPageResult(result.length(), pagination);
        return {items: result.slice(sliceFrom, sliceTo), pageInfo};
    }

    // Get Local Entries for a specific environment and component
    isolated resource function get localEntriesByEnvironmentAndComponent(graphql:Context context, string environmentId, string componentId, types:PaginationInput? pagination = ()) returns types:LocalEntriesPage|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Get project ID for the component (lightweight query for access control)
        string projectId = check storage:getProjectIdByComponentId(componentId);

        // Build scope with project, integration, and environment
        types:AccessScope scope = {
            orgUuid: 1,
            projectUuid: projectId,
            integrationUuid: componentId,
            envUuid: environmentId
        };

        // Verify user has view, edit, or manage permission
        if !check auth:hasAnyPermission(userContext.userId, [auth:PERMISSION_INTEGRATION_VIEW, auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
            log:printWarn("Attempt to access component local entries without permission", userId = userContext.userId, environmentId = environmentId, componentId = componentId);
            return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }

        types:LocalEntry[] result = check storage:getLocalEntriesByEnvironmentAndComponent(environmentId, componentId);
        if result.length() == 0 {
            return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }
        map<map<types:ArtifactStateField>> sm = check storage:queryArtifactState(componentId, environmentId);
        foreach types:LocalEntry a in result {
            types:ArtifactStateField? s = stateOf(sm, a.name, "local-entry", "status");
            if s is types:ArtifactStateField {
                a.state = <types:ArtifactState>s.value;
                a.stateInSync = s.inSync;
            }
        }
        [int, int, types:PageInfo] [sliceFrom, sliceTo, pageInfo] = buildPageResult(result.length(), pagination);
        return {items: result.slice(sliceFrom, sliceTo), pageInfo};
    }

    // Get Data Services for a specific environment and component
    isolated resource function get dataServicesByEnvironmentAndComponent(graphql:Context context, string environmentId, string componentId, types:PaginationInput? pagination = ()) returns types:DataServicesPage|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Get project ID for the component (lightweight query for access control)
        string projectId = check storage:getProjectIdByComponentId(componentId);

        // Build scope with project, integration, and environment
        types:AccessScope scope = {
            orgUuid: 1,
            projectUuid: projectId,
            integrationUuid: componentId,
            envUuid: environmentId
        };

        // Verify user has view, edit, or manage permission
        if !check auth:hasAnyPermission(userContext.userId, [auth:PERMISSION_INTEGRATION_VIEW, auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
            log:printWarn("Attempt to access component data services without permission", userId = userContext.userId, environmentId = environmentId, componentId = componentId);
            return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }

        // Data services report their deployment state ("Active"/"Faulty") directly in the
        // heartbeat, exactly like Composite Apps. The state is stored (normalized) on the
        // artifact record, so it is returned as-is without reconcile overriding it.
        types:DataService[] result = check storage:getDataServicesByEnvironmentAndComponent(environmentId, componentId);
        if result.length() == 0 {
            return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }
        [int, int, types:PageInfo] [sliceFrom, sliceTo, pageInfo] = buildPageResult(result.length(), pagination);
        return {items: result.slice(sliceFrom, sliceTo), pageInfo};
    }

    // Get Data Sources for a specific environment and component
    isolated resource function get dataSourcesByEnvironmentAndComponent(graphql:Context context, string environmentId, string componentId, types:PaginationInput? pagination = ()) returns types:DataSourcesPage|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Get project ID for the component (lightweight query for access control)
        string projectId = check storage:getProjectIdByComponentId(componentId);

        // Build scope with project, integration, and environment
        types:AccessScope scope = {
            orgUuid: 1,
            projectUuid: projectId,
            integrationUuid: componentId,
            envUuid: environmentId
        };

        // Verify user has view, edit, or manage permission
        if !check auth:hasAnyPermission(userContext.userId, [auth:PERMISSION_INTEGRATION_VIEW, auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
            log:printWarn("Attempt to access component data sources without permission", userId = userContext.userId, environmentId = environmentId, componentId = componentId);
            return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }

        types:DataSource[] result = check storage:getDataSourcesByEnvironmentAndComponent(environmentId, componentId);
        [int, int, types:PageInfo] [sliceFrom, sliceTo, pageInfo] = buildPageResult(result.length(), pagination);
        return {items: result.slice(sliceFrom, sliceTo), pageInfo};
    }

    // Get Registry Resources for a specific environment and component
    isolated resource function get registryResourcesByEnvironmentAndComponent(graphql:Context context, string environmentId, string componentId, types:PaginationInput? pagination = ()) returns types:RegistryResourcesPage|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Get project ID for the component (lightweight query for access control)
        string projectId = check storage:getProjectIdByComponentId(componentId);

        // Build scope with project, integration, and environment
        types:AccessScope scope = {
            orgUuid: 1,
            projectUuid: projectId,
            integrationUuid: componentId,
            envUuid: environmentId
        };

        // Verify user has view, edit, or manage permission
        if !check auth:hasAnyPermission(userContext.userId, [auth:PERMISSION_INTEGRATION_VIEW, auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
            log:printWarn("Attempt to access component registry resources without permission", userId = userContext.userId, environmentId = environmentId, componentId = componentId);
            return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }

        types:RegistryResource[] result = check storage:getRegistryResourcesByEnvironmentAndComponent(environmentId, componentId);
        [int, int, types:PageInfo] [sliceFrom, sliceTo, pageInfo] = buildPageResult(result.length(), pagination);
        return {items: result.slice(sliceFrom, sliceTo), pageInfo};
    }

    // Get Connectors for a specific environment and component
    isolated resource function get connectorsByEnvironmentAndComponent(graphql:Context context, string environmentId, string componentId, types:PaginationInput? pagination = ()) returns types:ConnectorsPage|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Get project ID for the component (lightweight query for access control)
        string projectId = check storage:getProjectIdByComponentId(componentId);

        // Build scope with project, integration, and environment
        types:AccessScope scope = {
            orgUuid: 1,
            projectUuid: projectId,
            integrationUuid: componentId,
            envUuid: environmentId
        };

        // Verify user has view, edit, or manage permission
        if !check auth:hasAnyPermission(userContext.userId, [auth:PERMISSION_INTEGRATION_VIEW, auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
            log:printWarn("Attempt to access component connectors without permission", userId = userContext.userId, environmentId = environmentId, componentId = componentId);
            return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }

        types:Connector[] result = check storage:getConnectorsByEnvironmentAndComponent(environmentId, componentId);
        if result.length() == 0 {
            return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }
        map<map<types:ArtifactStateField>> sm = check storage:queryArtifactState(componentId, environmentId);
        foreach types:Connector a in result {
            types:ArtifactStateField? s = stateOf(sm, a.name, "connector", "status");
            if s is types:ArtifactStateField {
                a.state = <types:ArtifactState>s.value;
                a.stateInSync = s.inSync;
            }
        }
        [int, int, types:PageInfo] [sliceFrom, sliceTo, pageInfo] = buildPageResult(result.length(), pagination);
        return {items: result.slice(sliceFrom, sliceTo), pageInfo};
    }

    // Get loggers for a specific runtime
    isolated resource function get loggersByRuntime(graphql:Context context, string runtimeId, types:PaginationInput? pagination = ()) returns types:LoggersPage|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Fetch the runtime to get its context for authorization
        types:Runtime? runtime = check storage:getRuntimeById(runtimeId);

        if runtime is () {
            log:printWarn("Runtime not found for loggers query", userId = userContext.userId, runtimeId = runtimeId);
            return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }

        // Build scope from runtime's context
        types:AccessScope scope = auth:buildScopeFromContext(
                runtime.component.projectId,
                runtime.component.id,
                runtime.environment.id
        );

        // Verify user has view, edit, or manage permission
        if !check auth:hasAnyPermission(userContext.userId, [auth:PERMISSION_INTEGRATION_VIEW, auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
            log:printWarn("Attempt to access runtime loggers without permission", userId = userContext.userId, runtimeId = runtimeId);
            return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }

        // Check component type to determine data source
        types:RuntimeType componentType = runtime.component.componentType;

        types:Logger[] result;
        types:Fetchable state = {};
        if componentType == types:MI {
            MILoggerReport reported = check fetchMILoggersByRuntime(runtime);
            if reported.answer.preparing {
                return {...stillFetching(), items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
            }
            result = reported.loggers;
            state = fetchableOf(reported.answer);
        } else {
            // BI: Fetch loggers from database, then overlay reconcile state
            result = check fetchBILoggersByRuntime(runtimeId);
            if result.length() > 0 {
                map<map<types:ArtifactStateField>> sm = check storage:queryArtifactState(
                        runtime.component.id, runtime.environment.id);
                foreach types:Logger lg in result {
                    types:ArtifactStateField? s = stateOf(sm, lg.componentName, "log-level", "logLevel");
                    if s is types:ArtifactStateField {
                        lg.logLevel = <types:LogLevel>s.value;
                    }
                }
            }
        }
        [int, int, types:PageInfo] [sliceFrom, sliceTo, pageInfo] = buildPageResult(result.length(), pagination);
        return {...state, items: result.slice(sliceFrom, sliceTo), pageInfo};
    }

    // Get loggers for a specific environment and component, grouped by component name
    isolated resource function get loggersByEnvironmentAndComponent(graphql:Context context, string environmentId, string componentId, types:PaginationInput? pagination = ()) returns types:LoggerGroupsPage|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Get component to check its type
        types:Component? component = check storage:getComponentById(componentId);
        if component is () {
            log:printWarn("Component not found for loggers query", userId = userContext.userId, componentId = componentId);
            return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }

        // Build scope with project, integration, and environment
        types:AccessScope scope = {
            orgUuid: 1,
            projectUuid: component.projectId,
            integrationUuid: componentId,
            envUuid: environmentId
        };

        // Verify user has view, edit, or manage permission
        if !check auth:hasAnyPermission(userContext.userId, [auth:PERMISSION_INTEGRATION_VIEW, auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
            log:printWarn("Attempt to access component loggers without permission", userId = userContext.userId, environmentId = environmentId, componentId = componentId);
            return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }

        // Check component type to determine data source
        types:RuntimeType componentType = component.componentType;

        types:LoggerGroup[] result;
        types:Fetchable state = {};
        if componentType == types:MI {
            MILoggerGroupReport reported =
                check fetchMILoggersByEnvironmentAndComponent(environmentId, componentId, component.projectId);
            if reported.state.preparing {
                return {...stillFetching(), items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
            }
            result = reported.groups;
            state = reported.state;
        } else {
            // BI: Fetch loggers from database, then overlay reconcile state
            result = check storage:getLoggersByEnvironmentAndComponent(environmentId, componentId);
            if result.length() > 0 {
                map<map<types:ArtifactStateField>> sm = check storage:queryArtifactState(componentId, environmentId);
                foreach types:LoggerGroup lg in result {
                    types:ArtifactStateField? s = stateOf(sm, lg.componentName, "log-level", "logLevel");
                    if s is types:ArtifactStateField {
                        lg.logLevel = <types:LogLevel>s.value;
                        lg.logLevelInSync = s.inSync;
                    }
                }
            }
        }
        [int, int, types:PageInfo] [sliceFrom, sliceTo, pageInfo] = buildPageResult(result.length(), pagination);
        return {...state, items: result.slice(sliceFrom, sliceTo), pageInfo};
    }

    // Get log files for a specific runtime
    isolated resource function get logFilesByRuntime(graphql:Context context, string runtimeId, string? searchKey = (), types:PaginationInput? pagination = ()) returns types:LogFilesResponse|error {
        types:Runtime? runtime = check miVisibleRuntime(context, runtimeId);
        if runtime is () {
            return {count: 0, files: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }
        MIAnswer answer = check miRead(runtime, check mi_management:logFilesPath(searchKey));
        if answer.preparing {
            return {...stillFetching(), count: 0, files: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }
        types:MgmtLogFilesResponse listing = check answer.body.cloneWithType();
        types:LogFile[] logFiles = from var item in listing.list
            select {fileName: item.FileName, size: item.Size};

        int total = logFiles.length();
        [int, int, types:PageInfo] [sliceFrom, sliceTo, pageInfo] = buildPageResult(total, pagination);
        return {
            ...fetchableOf(answer),
            count: total,
            files: logFiles.slice(sliceFrom, sliceTo),
            pageInfo: pageInfo
        };
    }

    // Get log file content for a specific runtime and file name
    isolated resource function get logFileContent(graphql:Context context, string runtimeId, string fileName) returns types:FetchableText|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Validate fileName to prevent path traversal attacks
        string trimmedFileName = fileName.trim();
        if trimmedFileName == "" {
            log:printWarn("Empty file name provided for log file content", userId = userContext.userId, runtimeId = runtimeId);
            return error("Invalid file name");
        }
        if trimmedFileName.includes("/") || trimmedFileName.includes("\\") {
            log:printWarn("File name contains path separator", userId = userContext.userId, runtimeId = runtimeId, fileName = fileName);
            return error("Invalid file name");
        }
        if trimmedFileName.includes("..") {
            log:printWarn("File name contains path traversal segment", userId = userContext.userId, runtimeId = runtimeId, fileName = fileName);
            return error("Invalid file name");
        }
        // Check for Windows drive letters (e.g., "C:", "D:")
        if trimmedFileName.length() >= 2 && trimmedFileName[1] == ":" {
            string firstChar = trimmedFileName[0];
            if (firstChar >= "A" && firstChar <= "Z") || (firstChar >= "a" && firstChar <= "z") {
                log:printWarn("File name contains drive letter", userId = userContext.userId, runtimeId = runtimeId, fileName = fileName);
                return error("Invalid file name");
            }
        }

        types:Runtime runtime = check miRuntimeById(context, runtimeId, MI_VIEW_PERMISSIONS,
                "Unable to retrieve log file content");
        return fetchableText(check miRead(runtime,
                check mi_management:logFilePath(trimmedFileName)));
    }

    isolated resource function get registryDirectory(graphql:Context context, string runtimeId, string path, boolean? expand = ()) returns types:RegistryDirectoryResponse|error {
        types:UserContextV2 userContext = check extractUserContext(context);
        types:ValidatedRegistryAccess validated = check validateRegistryResourceAccess(userContext, runtimeId, path, "registry directory");
        MIAnswer answer = check miRead(validated.runtime,
                check mi_management:registryPath(validated.trimmedPath));
        if answer.preparing {
            return {...stillFetching()};
        }
        types:RegistryDirectoryResponse listing =
            check mi_management:registryDirectory(answer.body);
        return {...fetchableOf(answer), count: listing.count, items: listing.items};
    }

    isolated resource function get registryFileContent(graphql:Context context, string runtimeId, string path) returns types:FetchableText|error {
        types:UserContextV2 userContext = check extractUserContext(context);
        types:ValidatedRegistryAccess validated = check validateRegistryResourceAccess(userContext, runtimeId, path, "registry file content");
        return fetchableText(check miRead(validated.runtime,
                check mi_management:registrySubPath("content", validated.trimmedPath)));
    }

    isolated resource function get registryResourceMetadata(graphql:Context context, string runtimeId, string path) returns types:RegistryResourceMetadata|error {
        types:UserContextV2 userContext = check extractUserContext(context);
        types:ValidatedRegistryAccess validated = check validateRegistryResourceAccess(userContext, runtimeId, path, "registry resource metadata");
        MIAnswer answer = check miRead(validated.runtime,
                check mi_management:registrySubPath("metadata", validated.trimmedPath));
        if answer.preparing {
            return {...stillFetching()};
        }
        types:RegistryResourceMetadata metadata =
            check mi_management:registryMetadata(answer.body);
        return {...fetchableOf(answer), name: metadata.name, mediaType: metadata.mediaType};
    }

    isolated resource function get registryResourceProperties(graphql:Context context, string runtimeId, string path) returns types:RegistryPropertiesResponse|error {
        types:UserContextV2 userContext = check extractUserContext(context);
        types:ValidatedRegistryAccess validated = check validateRegistryResourceAccess(userContext, runtimeId, path, "registry resource properties");
        MIAnswer answer = check miRead(validated.runtime,
                check mi_management:registrySubPath("properties", validated.trimmedPath));
        if answer.preparing {
            return {...stillFetching()};
        }
        types:RegistryPropertiesResponse described =
            check mi_management:registryProperties(answer.body);
        return {
            ...fetchableOf(answer),
            count: described.count,
            properties: described.properties
        };
    }

    // Delete a runtime by ID
    isolated remote function deleteRuntime(graphql:Context context, string runtimeId, boolean? revokeSecret = ()) returns types:DeleteRuntimeResult|error {
        types:UserContextV2 userContext = check extractUserContext(context);
        log:printDebug(string `deleteRuntime: runtimeId=${runtimeId}, revokeSecret=${revokeSecret ?: false}, user=${userContext.userId}`);

        types:Runtime? runtime = check storage:getRuntimeById(runtimeId);
        if runtime is () {
            return error("Runtime not found");
        }

        types:AccessScope scope = auth:buildScopeFromContext(
                runtime.component.projectId,
                runtime.component.id,
                runtime.environment.id
        );
        if !check auth:hasPermission(userContext.userId, auth:PERMISSION_INTEGRATION_MANAGE, scope) {
            return error("Access denied: insufficient permissions to delete runtime");
        }

        // Check if this runtime's secret becomes orphaned after deletion.
        string? keyId = check storage:getKeyIdByRuntimeId(runtimeId);
        string? orphanedKeyId = ();
        if keyId is string {
            int count = check storage:countRuntimesByKeyId(keyId);
            if count <= 1 {
                orphanedKeyId = keyId;
            }
        }

        check storage:deleteRuntime(runtimeId);
        check sync:reconcileDeleteRuntime(runtimeId);
        log:printInfo(string `deleteRuntime: deleted runtimeId=${runtimeId}`, userId = userContext.userId);
        storage:logAuditEvent(storage:AUDIT_RUNTIME_DELETE, userId = userContext.userId,
                resourceType = storage:AUDIT_RESOURCE_RUNTIME, resourceId = runtimeId,
                details = string `Runtime '${runtimeId}' deleted by '${userContext.username}'`,
                clientIp = userContext.clientIp, userAgent = userContext.userAgent);

        boolean secretRevoked = false;
        if revokeSecret == true && orphanedKeyId is string {
            check storage:revokeOrgSecret(orphanedKeyId);
            secretRevoked = true;
            log:printInfo(string `deleteRuntime: also revoked orphaned secret keyId=${orphanedKeyId}`, userId = userContext.userId);
        }

        return {deleted: true, orphanedKeyId: orphanedKeyId, secretRevoked: secretRevoked};
    }

    // Update listener state (enable/disable) via reconcile engine
    remote function updateListenerState(graphql:Context context, types:ListenerControlInput input) returns types:ListenerControlResponse|error {
        types:UserContextV2 userContext = check extractUserContext(context);
        log:printInfo(string `Processing listener state change request for listener ${input.listenerName} to ${input.action}`);

        if input.runtimeIds.length() == 0 {
            return error("At least one runtime ID must be provided");
        }
        if input.listenerName.trim().length() == 0 {
            return error("Listener name cannot be empty");
        }
        if input.action != types:START && input.action != types:STOP {
            return error(string `Unsupported listener action: ${input.action}`);
        }

        // Validate permissions and write desired state per (component, env)
        map<boolean> processed = {};
        foreach string runtimeId in input.runtimeIds {
            types:Runtime? runtime = check storage:getRuntimeById(runtimeId);
            if runtime is () {
                continue;
            }

            types:AccessScope scope = auth:buildScopeFromContext(
                    runtime.component.projectId, runtime.component.id, runtime.environment.id);
            if !check auth:hasPermission(userContext.userId, auth:PERMISSION_INTEGRATION_MANAGE, scope) {
                return error(string `Access denied: insufficient permissions to control listener on runtime ${runtimeId}`);
            }

            string componentId = runtime.component.id;
            string envId = runtime.environment.id;
            string key = componentId + ":" + envId;
            if !processed.hasKey(key) {
                processed[key] = true;
                string qualName = types:qualifiedArtifactName(input.listenerName, input.listenerPackage);
                types:ReconcileArtifactKey artifact = {artifactName: qualName, artifactType: "listener"};
                log:printDebug("upsertReconcileDesiredState for listener", componentId = componentId, envId = envId);
                check storage:upsertReconcileDesiredState(componentId, envId, artifact,
                        {"status": input.action == types:START ? "enabled" : "disabled"});
            }
        }

        int? listenerPort = input.port;
        string portSuffix = listenerPort is int ? string ` (port ${listenerPort})` : "";
        storage:logAuditEvent(storage:AUDIT_LISTENER_STATE_CHANGE, userId = userContext.userId,
                resourceType = storage:AUDIT_RESOURCE_LISTENER, resourceId = input.listenerName,
                details = string `Listener '${input.listenerName}'${portSuffix} state changed to '${input.action}' by '${userContext.username}'`,
                clientIp = userContext.clientIp, userAgent = userContext.userAgent);
        return {
            success: true,
            message: string `Listener ${input.listenerName} state change dispatched to ${input.runtimeIds.length()} runtime(s)`,
            commandIds: []
        };
    }

    isolated remote function deleteLogger(graphql:Context context, types:DeleteLoggerInput input) returns types:DeleteLoggerResponse|error {
        types:UserContextV2 userContext = check extractUserContext(context);
        log:printDebug("deleteLogger request received", userId = userContext.userId, loggerName = input.loggerName, runtimeCount = input.runtimeIds.length());

        if input.runtimeIds.length() == 0 {
            return error("At least one runtime ID must be provided");
        }
        if input.loggerName.trim().length() == 0 {
            log:printWarn("Empty logger name provided", userId = userContext.userId);
            return error("Logger name is required");
        }

        string[] nonMiIds = [];
        foreach string runtimeId in input.runtimeIds {
            types:Runtime? runtime = check storage:getRuntimeById(runtimeId);
            if runtime is () {
                continue;
            }
            if runtime.component.componentType != types:MI {
                nonMiIds.push(runtimeId);
            }
        }
        if nonMiIds.length() > 0 {
            return error(string `Only MI runtimes supported, invalid runtimeIds: ${nonMiIds.toString()}`);
        }

        return check deleteLoggerMI(userContext, input);
    }

    isolated remote function updateLogLevel(graphql:Context context, types:UpdateLogLevelInput input) returns types:UpdateLogLevelResponse|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        if input.runtimeIds.length() == 0 {
            return error("At least one runtime ID must be provided");
        }

        // Determine component type - use input if provided, otherwise lookup from first runtime
        types:RuntimeType componentType;
        types:RuntimeType? inputComponentType = input?.componentType;
        if inputComponentType is types:RuntimeType {
            componentType = inputComponentType;
        } else {
            types:Runtime? firstRuntime = check storage:getRuntimeById(input.runtimeIds[0]);
            if firstRuntime is () {
                return error(string `Runtime ${input.runtimeIds[0]} not found`);
            }
            componentType = firstRuntime.component.componentType;
            log:printDebug(string `Inferred component type ${componentType} from runtime ${input.runtimeIds[0]}`);
        }

        // Validate based on component type
        if componentType == types:MI {
            // MI validation: loggerName is required
            string? loggerName = input?.loggerName;
            if loggerName is () || loggerName.trim().length() == 0 {
                return error("Logger name is required for MI components");
            }
        } else {
            // BI validation: componentName is required
            string? componentName = input?.componentName;
            if componentName is () || componentName.trim().length() == 0 {
                return error("Component name is required for BI components");
            }
        }

        // Branch to BI or MI implementation
        types:UpdateLogLevelResponse levelResponse;
        if componentType == types:MI {
            levelResponse = check updateLogLevelMI(userContext, input);
        } else {
            levelResponse = check updateLogLevelBI(userContext, input);
        }
        // BI only: an MI write audits itself where it is made (mi_access.bal), once, and
        // the same way whichever transport carried it. Auditing here as well recorded a
        // tunneled log level change twice and a direct one under different wording.
        if componentType != types:MI {
            string componentLabel = input?.componentName ?: "";
            storage:logAuditEvent(storage:AUDIT_LOG_LEVEL_CHANGE, userId = userContext.userId,
                    resourceType = storage:AUDIT_RESOURCE_LOGGER, resourceId = componentLabel,
                    details = string `Log level changed for '${componentLabel}' to '${input.logLevel}' by '${userContext.username}'`,
                    clientIp = userContext.clientIp, userAgent = userContext.userAgent);
        }
        return levelResponse;
    }

    // ----------- Environment Resources
    // Create a new environment (super admin only)
    isolated remote function createEnvironment(graphql:Context context, types:EnvironmentInput environment) returns types:Environment|error? {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Build org-level scope for permission check
        types:AccessScope scope = {orgUuid: storage:DEFAULT_ORG_ID};

        // Check if user can manage environments based on production status
        if environment.critical {
            // Production environment requires full management permission
            if !check auth:hasPermission(userContext.userId, auth:PERMISSION_ENVIRONMENT_MANAGE, scope) {
                return error("Access denied: insufficient permissions to create production environments");
            }
        } else {
            // Non-production environment requires manage_nonprod or manage permission
            if !check auth:hasAnyPermission(userContext.userId, [auth:PERMISSION_ENVIRONMENT_MANAGE_NONPROD, auth:PERMISSION_ENVIRONMENT_MANAGE], scope) {
                return error("Access denied: insufficient permissions to create environments");
            }
        }

        // Set created_by to the current user's ID
        environment.createdBy = userContext.userId;

        // Call storage layer to insert environments
        types:Environment? created = check storage:createEnvironment(environment);
        if created is types:Environment {
            storage:logAuditEvent(storage:AUDIT_ENVIRONMENT_CREATE, userId = userContext.userId,
                    resourceType = storage:AUDIT_RESOURCE_ENVIRONMENT, resourceId = created.id,
                    details = string `Environment '${environment.name}' created by '${userContext.username}'`,
                    clientIp = userContext.clientIp, userAgent = userContext.userAgent);
        }
        return created;
    }

    // Get all environments (filtered by user's accessible environments via RBAC)
    // Note: orgUuid, type, and projectId parameters are accepted for frontend compatibility
    // but ignored since environments are global (not org-specific)
    isolated resource function get environments(graphql:Context context, string? orgUuid, string? 'type, string? projectId, types:PaginationInput? pagination = ()) returns types:EnvironmentsPage|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Get user's accessible environments (filtered by role mappings)
        // If user has any role mapping, they can see environments within their scope
        types:UserEnvironmentAccess[] accessibleEnvs =
            check storage:getUserEnvironmentRestrictions(userContext.userId);

        // Check if user has any access at all
        if accessibleEnvs.length() == 0 {
            log:printWarn("Attempt to access environments without role mappings", userId = userContext.userId);
            return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }

        // Build environment ID list from access mappings:
        // If ANY mapping has env_uuid = NULL, user gets all environments
        // Otherwise, collect specific env_uuid values

        boolean hasUnrestrictedAccess = false;
        string[] envIds = [];

        foreach types:UserEnvironmentAccess envAccess in accessibleEnvs {
            if envAccess.envUuid is () {
                // env_uuid is NULL = unrestricted access to all environments
                hasUnrestrictedAccess = true;
                break;
            } else if envAccess.envUuid is string {
                // Specific environment access
                string envId = <string>envAccess.envUuid;
                if envIds.indexOf(envId) is () {
                    envIds.push(envId);
                }
            }
        }

        // Fetch environments based on access type
        types:Environment[] environments = [];
        if hasUnrestrictedAccess {
            // User has unrestricted access - fetch all environments
            environments = check storage:getAllEnvironments();
        } else {
            // User has access to specific environments only (envIds must have at least one item)
            environments = check storage:getEnvironmentsByIds(envIds);
        }

        // Filter by type if provided (prod = critical, non-prod = non-critical)
        if 'type is string {
            if 'type == "prod" {
                environments = environments.filter(env => env.critical);
            } else if 'type == "non-prod" {
                environments = environments.filter(env => !env.critical);
            }
        }

        [int, int, types:PageInfo] [sliceFrom, sliceTo, pageInfo] = buildPageResult(environments.length(), pagination);
        return {items: environments.slice(sliceFrom, sliceTo), pageInfo};
    }

    // Delete an environment (requires management permission based on environment type)
    isolated remote function deleteEnvironment(graphql:Context context, string environmentId) returns boolean|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Fetch environment to check its production status
        types:Environment? env = check storage:getEnvironmentById(environmentId);
        if env is () {
            return error("Environment not found");
        }

        // Build org-level scope for permission check
        types:AccessScope scope = {orgUuid: storage:DEFAULT_ORG_ID};

        // Check permission based on production status
        if env.critical {
            // Production environment requires full management permission
            if !check auth:hasPermission(userContext.userId, auth:PERMISSION_ENVIRONMENT_MANAGE, scope) {
                return error("Access denied: insufficient permissions to delete production environments");
            }
        } else {
            // Non-production environment requires manage_nonprod or manage permission
            boolean canManageNonProd = check auth:hasPermission(userContext.userId, auth:PERMISSION_ENVIRONMENT_MANAGE_NONPROD, scope);
            boolean canManageFull = check auth:hasPermission(userContext.userId, auth:PERMISSION_ENVIRONMENT_MANAGE, scope);
            if !canManageNonProd && !canManageFull {
                return error("Access denied: insufficient permissions to delete environments");
            }
        }

        check storage:deleteEnvironment(environmentId);
        check sync:reconcileDeleteEnvironment(environmentId);
        storage:logAuditEvent(storage:AUDIT_ENVIRONMENT_DELETE, userId = userContext.userId,
                resourceType = storage:AUDIT_RESOURCE_ENVIRONMENT, resourceId = environmentId,
                details = string `Environment '${env.name}' deleted by '${userContext.username}'`,
                clientIp = userContext.clientIp, userAgent = userContext.userAgent);
        return true;
    }

    // Update environment name, description, and/or critical status (requires management permission)
    isolated remote function updateEnvironment(graphql:Context context, string environmentId, string? name, string? handler, string? description, boolean? critical) returns types:Environment?|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Fetch current environment to check its production status
        types:Environment? currentEnv = check storage:getEnvironmentById(environmentId);
        if currentEnv is () {
            return error("Environment not found");
        }

        // Build org-level scope for permission check
        types:AccessScope scope = {orgUuid: storage:DEFAULT_ORG_ID};

        // If changing critical flag, check permission for the target state
        // Otherwise, check permission for the current state
        boolean targetIsCritical = critical ?: currentEnv.critical;

        if targetIsCritical {
            // Production environment requires full management permission
            if !check auth:hasPermission(userContext.userId, auth:PERMISSION_ENVIRONMENT_MANAGE, scope) {
                return error("Access denied: insufficient permissions to update production environments");
            }
        } else {
            // Non-production environment requires manage_nonprod or manage permission
            boolean canManageNonProd = check auth:hasPermission(userContext.userId, auth:PERMISSION_ENVIRONMENT_MANAGE_NONPROD, scope);
            boolean canManageFull = check auth:hasPermission(userContext.userId, auth:PERMISSION_ENVIRONMENT_MANAGE, scope);
            if !canManageNonProd && !canManageFull {
                return error("Access denied: insufficient permissions to update environments");
            }
        }

        check storage:updateEnvironment(environmentId, name, handler, description, critical);
        types:Environment? updated = check storage:getEnvironmentById(environmentId);
        storage:logAuditEvent(storage:AUDIT_ENVIRONMENT_UPDATE, userId = userContext.userId,
                resourceType = storage:AUDIT_RESOURCE_ENVIRONMENT, resourceId = environmentId,
                details = string `Environment '${currentEnv.name}' updated by '${userContext.username}'`,
                clientIp = userContext.clientIp, userAgent = userContext.userAgent);
        return updated;
    }

    // Update environment production status (requires full management permission)
    // This is a critical operation that always requires the highest permission level
    isolated remote function updateEnvironmentProductionStatus(graphql:Context context, string environmentId, boolean isProduction) returns types:Environment?|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Verify environment exists
        types:Environment? env = check storage:getEnvironmentById(environmentId);
        if env is () {
            return error("Environment not found");
        }

        // Build org-level scope for permission check
        types:AccessScope scope = {orgUuid: storage:DEFAULT_ORG_ID};

        // Changing production status is a critical operation - always requires full management permission
        if !check auth:hasPermission(userContext.userId, auth:PERMISSION_ENVIRONMENT_MANAGE, scope) {
            return error("Access denied: full environment management permission required to change production status");
        }

        check storage:updateEnvironmentProductionStatus(environmentId, isProduction);
        storage:logAuditEvent(storage:AUDIT_ENVIRONMENT_UPDATE, userId = userContext.userId,
                resourceType = storage:AUDIT_RESOURCE_ENVIRONMENT, resourceId = environmentId,
                details = string `Environment '${env.name}' production status changed to ${isProduction} by '${userContext.username}'`,
                clientIp = userContext.clientIp, userAgent = userContext.userAgent);
        return check storage:getEnvironmentById(environmentId);
    }

    // Get a specific environment by handler
    isolated resource function get environmentByHandler(graphql:Context context, string environmentHandler) returns types:Environment?|error {
        log:printDebug("Fetching environment by handler", environmentHandler = environmentHandler);
        types:UserContextV2 userContext = check extractUserContext(context);

        types:Environment|error env = storage:getEnvironmentByHandler(environmentHandler);
        if env is error {
            log:printError("Error getting environment by handler", env, environmentHandler = environmentHandler);
            return ();
        }

        // Check if user has access to this environment via RBAC
        types:UserEnvironmentAccess[] accessibleEnvs =
            check storage:getUserEnvironmentRestrictions(userContext.userId);

        // Check if user has any access at all
        if accessibleEnvs.length() == 0 {
            log:printWarn("Attempt to access environment without role mappings", userId = userContext.userId, environmentHandler = environmentHandler);
            return (); // No access - return null
        }

        // Check if user has unrestricted access or access to this specific environment
        boolean hasAccess = false;
        foreach types:UserEnvironmentAccess envAccess in accessibleEnvs {
            if envAccess.envUuid is () {
                // env_uuid is NULL = unrestricted access to all environments
                hasAccess = true;
                break;
            } else if envAccess.envUuid is string {
                // Specific environment access
                if <string>envAccess.envUuid == env.id {
                    hasAccess = true;
                    break;
                }
            }
        }

        if !hasAccess {
            log:printWarn("Attempt to access environment without permission", userId = userContext.userId, environmentHandler = environmentHandler);
            return (); // No access - return null
        }

        log:printDebug("Successfully retrieved environment", environmentId = env.id, environmentHandler = environmentHandler);
        return env;
    }

    // Check environment handler availability
    isolated resource function get environmentHandlerAvailability(graphql:Context context, string environmentHandlerCandidate) returns types:EnvironmentHandlerAvailability|error {
        // Note: This endpoint might not require authentication depending on business requirements
        // For now, we'll allow it without strict authentication to enable checking before creation

        // Call storage layer to check handler availability
        return check storage:checkEnvironmentHandlerAvailability(environmentHandlerCandidate);
    }

    //------------- Project Resources
    // Create a new project
    isolated remote function createProject(graphql:Context context, types:ProjectInput project) returns types:Project|error? {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Build org-level scope for permission check
        types:AccessScope scope = {orgUuid: storage:DEFAULT_ORG_ID};
        // Check permission at org level - requires project_mgt:manage
        if !check auth:hasPermission(userContext.userId, auth:PERMISSION_PROJECT_MANAGE, scope) {
            return error("Insufficient permissions to create projects");
        }

        // Create project and auto-assign creator to project admin group
        types:Project? createdProject = check storage:createProject(project, userContext);
        if createdProject is types:Project {
            storage:logAuditEvent(storage:AUDIT_PROJECT_CREATE, userId = userContext.userId,
                    resourceType = storage:AUDIT_RESOURCE_PROJECT, resourceId = createdProject.id,
                    details = string `Project '${project.name}' created by '${userContext.username}'`,
                    clientIp = userContext.clientIp, userAgent = userContext.userAgent);
        }
        return createdProject;
    }

    // Get all projects (filtered by user's accessible projects via RBAC v2)
    isolated resource function get projects(graphql:Context context, int? orgId, types:PaginationInput? pagination) returns types:ProjectsPage|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Get accessible projects via access resolver
        // This returns all projects where user has ANY role assignment (any permission domain)
        // Includes users who only have observability_mgt:view_logs or other non-project permissions
        types:UserProjectAccess[] accessibleProjects =
            check auth:getAccessibleProjects(userContext.userId);

        if accessibleProjects.length() == 0 {
            return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}}; // User has no project access
        }

        string[] accessibleProjectIds = accessibleProjects.map(p => p.projectUuid);

        // Fetch only accessible projects with SQL IN clause (efficient DB filtering)
        types:Project[] filteredProjects =
            check storage:getProjectsByIds(accessibleProjectIds, orgId);

        [int, int, types:PageInfo] [sliceFrom, sliceTo, pageInfo] = buildPageResult(filteredProjects.length(), pagination);
        return {items: filteredProjects.slice(sliceFrom, sliceTo), pageInfo};
    }

    // Get a specific project by ID with optional orgId filter
    isolated resource function get project(graphql:Context context, int? orgId, string projectId) returns types:Project?|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Use access resolver to check project access (handles ANY role assignment)
        auth:ProjectAccessInfo accessInfo = check auth:resolveProjectAccess(userContext.userId, projectId);

        if !accessInfo.hasAccess {
            log:printWarn("Attempt to access project without permission", userId = userContext.userId, projectId = projectId);
            return (); // No access - return null (404 pattern for queries)
        }

        types:Project? project = check storage:getProjectById(projectId);

        if project is () {
            return (); // Project not found
        }

        // If orgId is specified, verify it matches the project's orgId
        if orgId is int && project.orgId != orgId {
            return (); // Project doesn't belong to the specified organization
        }

        return project;
    }

    // Get a specific project by handler (orgId is required for this lookup)
    isolated resource function get projectByHandler(graphql:Context context, int orgId, string projectHandler) returns types:Project?|error {
        log:printDebug("Fetching project by handler", orgId = orgId, projectHandler = projectHandler);
        types:UserContextV2 userContext = check extractUserContext(context);
        string|error projectId = storage:getProjectIdByHandler(projectHandler, orgId);
        if projectId is error {
            log:printError("Error getting projectId from handle", projectId, orgId = orgId, projectHandler = projectHandler);
            return ();
        }
        // Use access resolver to check project access (handles ANY role assignment)
        auth:ProjectAccessInfo accessInfo = check auth:resolveProjectAccess(userContext.userId, projectId);

        if !accessInfo.hasAccess {
            log:printWarn("Attempt to access project without permission", userId = userContext.userId, projectId = projectId);
            return (); // No access - return null (404 pattern for queries)
        }
        log:printDebug("Successfully retrieved project", projectId = projectId);
        return check storage:getProjectById(projectId);
    }

    // Check project creation eligibility for an organization
    isolated resource function get projectCreationEligibility(graphql:Context context, int orgId, string orgHandler) returns types:ProjectCreationEligibility|error {
        // Call storage layer to check eligibility
        types:UserContextV2 userContext = check extractUserContext(context);
        types:AccessScope scope = {orgUuid: orgId};
        boolean isEligible = check auth:hasPermission(userContext.userId, auth:PERMISSION_PROJECT_MANAGE, scope);
        return {
            isProjectCreationAllowed: isEligible
        };
    }

    // Check project handler availability for an organization
    isolated resource function get projectHandlerAvailability(graphql:Context context, int orgId, string projectHandlerCandidate) returns types:ProjectHandlerAvailability|error {
        // Note: This endpoint might not require authentication depending on business requirements
        // For now, we'll allow it without authentication to match the example
        // value:Cloneable|error|isolated object {} authHeader = context.get("Authorization");
        // if authHeader !is string {
        //     return error("Authorization header missing in request");
        // }

        // Call storage layer to check handler availability
        return check storage:checkProjectHandlerAvailability(orgId, projectHandlerCandidate);
    }

    // Delete a project
    isolated remote function deleteProject(graphql:Context context, int orgId, string projectId) returns types:DeleteResponse|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Build org-level scope for permission check
        types:AccessScope scope = {orgUuid: orgId, projectUuid: projectId};
        // Check permission at project level - requires project_mgt:manage 
        if !check auth:hasPermission(userContext.userId, auth:PERMISSION_PROJECT_MANAGE, scope) {
            return error("Insufficient permissions to delete project");
        }

        // Check if the project has any components
        boolean hasComponents = check storage:hasProjectComponents(projectId);
        if hasComponents {
            return {
                status: "failed",
                details: "Cannot delete project. Project contains components that must be deleted first."
            };
        }

        // Proceed with deletion if no components exist
        check storage:deleteProject(projectId);
        storage:logAuditEvent(storage:AUDIT_PROJECT_DELETE, userId = userContext.userId,
                resourceType = storage:AUDIT_RESOURCE_PROJECT, resourceId = projectId,
                details = string `Project '${projectId}' deleted by '${userContext.username}'`,
                clientIp = userContext.clientIp, userAgent = userContext.userAgent);
        return {
            status: "success",
            details: string `Deleted project with ID: ${projectId}`
        };
    }

    // Update project name and/or description
    isolated remote function updateProject(graphql:Context context, types:ProjectUpdateInput project) returns types:Project|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Build project-level scope for permission check
        types:AccessScope scope = {orgUuid: storage:DEFAULT_ORG_ID, projectUuid: project.id};
        // Check permission at project level - requires project_mgt:edit or project_mgt:manage
        if !check auth:hasAnyPermission(userContext.userId, [auth:PERMISSION_PROJECT_EDIT, auth:PERMISSION_PROJECT_MANAGE], scope) {
            return error("Insufficient permissions to update project");
        }

        check storage:updateProjectWithInput(project);
        types:Project? updatedProject = check storage:getProjectById(project.id);
        if updatedProject is () {
            return error("Project not found after update");
        }
        storage:logAuditEvent(storage:AUDIT_PROJECT_UPDATE, userId = userContext.userId,
                resourceType = storage:AUDIT_RESOURCE_PROJECT, resourceId = project.id,
                details = string `Project '${project.id}' updated by '${userContext.username}'`,
                clientIp = userContext.clientIp, userAgent = userContext.userAgent);
        return updatedProject;
    }

    // ----------- Component Resources
    // Create a new component
    isolated remote function createComponent(graphql:Context context, types:ComponentInput component) returns types:Component|error? {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Build scope at project level (creating integration in a project)
        types:AccessScope scope = auth:buildScopeFromContext(component.projectId);

        // Check if user has permission to manage integrations in this project
        if !check auth:hasPermission(userContext.userId, auth:PERMISSION_INTEGRATION_MANAGE, scope) {
            return error("Insufficient permissions to create component in this project");
        }

        // Validate component name format (3-64 characters, alphanumeric, hyphens, underscores)
        if component.name.length() < 3 || component.name.length() > 64 {
            return error("Component name must be between 3 and 64 characters");
        }

        // Set displayName (use provided or fallback to name)
        if component.displayName is () || component.displayName == "" {
            component.displayName = component.name;
        }

        // Set default description if not provided
        if component.description is () {
            component.description = "";
        }

        // Set the createdBy field to the current user's ID
        component.createdBy = userContext.userId;

        types:Component|error? result = storage:createComponent(component);
        if result is error {
            string errMsg = result.message();
            if errMsg.includes("Unique index") || errMsg.includes("unique index") || errMsg.includes("23505") {
                return error(string `The name "${component.name}" is already taken in this project. Try a different name.`);
            }
            return result;
        }
        if result is types:Component {
            storage:logAuditEvent(storage:AUDIT_COMPONENT_CREATE, userId = userContext.userId,
                    resourceType = storage:AUDIT_RESOURCE_COMPONENT, resourceId = result.id,
                    details = string `Component '${component.name}' created in project '${component.projectId}' by '${userContext.username}'`,
                    clientIp = userContext.clientIp, userAgent = userContext.userAgent);
        }
        return result;
    }

    // Get all components with optional project filter
    isolated resource function get components(graphql:Context context, string orgHandler, string? projectId, types:ComponentOptionsInput? options) returns types:ComponentsPage|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Get accessible integrations (with optional project filter)
        // This returns integrations where user has ANY role assignment (permission-agnostic)
        types:UserIntegrationAccess[] accessibleIntegrations =
            check storage:getUserAccessibleIntegrations(userContext.userId, projectId);

        // Extract integration IDs
        string[] integrationIds = accessibleIntegrations.map(i => i.integrationUuid);

        // Return empty if no access
        if integrationIds.length() == 0 {
            return {items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }

        types:Component[] allComponents = check storage:getComponentsByIds(integrationIds);
        [int, int, types:PageInfo] [sliceFrom, sliceTo, pageInfo] = buildPageResult(allComponents.length(), options?.pagination);
        return {items: allComponents.slice(sliceFrom, sliceTo), pageInfo};
    }

    // Get a specific component by ID or by projectId + componentHandler
    isolated resource function get component(graphql:Context context, string? componentId, string? projectId, string? componentHandler) returns types:Component?|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        types:Component? component = ();

        // Fetch component by ID or by projectId + componentHandler
        if componentId is string {
            component = check storage:getComponentById(componentId);
        } else if projectId is string && componentHandler is string {
            component = check storage:getComponentByProjectAndHandler(projectId, componentHandler);
        } else {
            return error("Either componentId or (projectId and componentHandler) must be provided");
        }

        if component is () {
            return (); // Integration not found
        }

        // Build scope with project and integration context
        types:AccessScope scope = auth:buildScopeFromContext(component.projectId, integrationId = component.id);

        // Check if user has permission to view this integration
        // Users with edit or manage permissions should also be able to view
        if !check auth:hasAnyPermission(userContext.userId,
                [auth:PERMISSION_INTEGRATION_VIEW, auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
            log:printWarn("Attempt to access component without permission", userId = userContext.userId, componentId = component.id);
            return (); // Return null for no access (404 pattern for queries)
        }

        return component;
    }

    // Report whether an integration (project + component combo) has had its Moesif metrics
    // dashboard created/linked. Resolves the component by componentId OR by projectId +
    // componentHandler, then returns the `dashboardsCreated` flag that drives the UI.
    isolated resource function get moesifMetricsConfig(graphql:Context context, string environmentId, string? componentId, string? projectId, string? componentHandler) returns types:MoesifMetricsConfigStatus|error {
        if !moesifEnabled {
            return error("Moesif metrics integration is disabled");
        }
        types:UserContextV2 userContext = check extractUserContext(context);

        if environmentId.trim().length() == 0 {
            return error("Environment id must be provided");
        }

        types:Component? component = ();
        if componentId is string {
            component = check storage:getComponentById(componentId);
        } else if projectId is string && componentHandler is string {
            component = check storage:getComponentByProjectAndHandler(projectId, componentHandler);
        } else {
            return error("Either componentId or (projectId and componentHandler) must be provided");
        }

        if component is () {
            return error("Integration not found");
        }

        // Users with view, edit or manage permissions can read the configuration status.
        // The config is environment-keyed, so scope the check to the environment too.
        types:AccessScope scope = auth:buildScopeFromContext(component.projectId, integrationId = component.id, envId = environmentId.trim());
        if !check auth:hasAnyPermission(userContext.userId,
                [auth:PERMISSION_INTEGRATION_VIEW, auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
            log:printWarn("Attempt to read Moesif metrics config without permission", userId = userContext.userId, componentId = component.id);
            return error("Insufficient permissions to view this integration");
        }

        // The stored Management API key is what the canvas is loaded with, so its
        // presence is what "configured" means. The key is environment-wide, so a
        // key supplied from either the metrics or the logs setup flow configures
        // both views and the user is never asked for it twice.
        string? managementKey = check storage:getEnvironmentMoesifManagementKey(environmentId.trim());
        boolean dashboardsCreated = managementKey is string && managementKey.trim().length() > 0;
        return {dashboardsCreated};
    }

    // Build the Moesif canvas embed descriptor so the UI can render the metrics
    // canvas in an iframe. Reads the environment's stored Management API key and
    // returns the canvas iframe src plus the short-lived auth token minted from
    // that key, which the UI delivers to the canvas over postMessage (SET_TOKEN).
    // Requires view, edit or manage permission.
    isolated resource function get moesifDashboardEmbed(graphql:Context context, string componentId, string environmentId) returns types:MoesifDashboardEmbed|error {
        if !moesifEnabled {
            return error("Moesif metrics integration is disabled");
        }
        types:UserContextV2 userContext = check extractUserContext(context);

        if environmentId.trim().length() == 0 {
            return error("Environment id must be provided");
        }

        types:Component? component = check storage:getComponentById(componentId);
        if component is () {
            return error("Integration not found");
        }

        types:AccessScope scope = auth:buildScopeFromContext(component.projectId, integrationId = componentId, envId = environmentId.trim());
        if !check auth:hasAnyPermission(userContext.userId,
                [auth:PERMISSION_INTEGRATION_VIEW, auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
            return error("Insufficient permissions to view Moesif metrics for this integration");
        }

        // The environment's Management API key is the only stored credential the
        // canvas needs: the canvas resolves the Moesif organization + application
        // from the claims of the token minted from it.
        string? managementKey = check storage:getEnvironmentMoesifManagementKey(environmentId.trim());
        if managementKey is () || managementKey.trim().length() == 0 {
            return error("Moesif Management API key has not been configured for this environment yet");
        }

        // Mint a short-lived, restricted canvas token from the stored Management
        // API key for this embed rather than serving a long-lived stored token.
        types:MoesifDashboardEmbed|error embed = buildMoesifCanvasEmbed(managementKey);
        if embed is error {
            log:printError("Failed to build Moesif canvas embed", 'error = embed, componentId = componentId);
            return error(string `Failed to generate Moesif dashboard embed: ${embed.message()}`);
        }
        return embed;
    }

    // Report whether an integration (project + component combo) has had its Moesif application
    // logs dashboard/canvas linked. Resolves the component by componentId OR by projectId +
    // componentHandler, then returns the `logsConfigured` flag that drives the UI.
    isolated resource function get moesifLogsConfig(graphql:Context context, string environmentId, string? componentId, string? projectId, string? componentHandler) returns types:MoesifLogsConfigStatus|error {
        if !moesifEnabled {
            return error("Moesif logs integration is disabled");
        }
        types:UserContextV2 userContext = check extractUserContext(context);

        if environmentId.trim().length() == 0 {
            return error("Environment id must be provided");
        }

        types:Component? component = ();
        if componentId is string {
            component = check storage:getComponentById(componentId);
        } else if projectId is string && componentHandler is string {
            component = check storage:getComponentByProjectAndHandler(projectId, componentHandler);
        } else {
            return error("Either componentId or (projectId and componentHandler) must be provided");
        }

        if component is () {
            return error("Integration not found");
        }

        // Users with view, edit or manage permissions can read the configuration status.
        // The config is environment-keyed, so scope the check to the environment too.
        types:AccessScope scope = auth:buildScopeFromContext(component.projectId, integrationId = component.id, envId = environmentId.trim());
        if !check auth:hasAnyPermission(userContext.userId,
                [auth:PERMISSION_INTEGRATION_VIEW, auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
            log:printWarn("Attempt to read Moesif logs config without permission", userId = userContext.userId, componentId = component.id);
            return error("Insufficient permissions to view this integration");
        }

        // Same rule as the metrics view: the environment's stored Management API
        // key is the only credential the logs canvas needs, so a key supplied from
        // either setup flow configures this view too.
        string? managementKey = check storage:getEnvironmentMoesifManagementKey(environmentId.trim());
        boolean logsConfigured = managementKey is string && managementKey.trim().length() > 0;
        return {logsConfigured};
    }

    // Build the Moesif canvas embed descriptor so the UI can render the application
    // logs canvas in an iframe. Reads the environment's stored Management API key
    // (shared with metrics) and returns the canvas iframe src plus the short-lived
    // auth token minted from it, which the UI delivers to the canvas over
    // postMessage (SET_TOKEN). The frontend posts the logs canvas layout separately
    // as the CANVAS_INIT template. Requires view, edit or manage permission.
    isolated resource function get moesifLogsEmbed(graphql:Context context, string componentId, string environmentId) returns types:MoesifDashboardEmbed|error {
        if !moesifEnabled {
            return error("Moesif logs integration is disabled");
        }
        types:UserContextV2 userContext = check extractUserContext(context);

        if environmentId.trim().length() == 0 {
            return error("Environment id must be provided");
        }

        types:Component? component = check storage:getComponentById(componentId);
        if component is () {
            return error("Integration not found");
        }

        types:AccessScope scope = auth:buildScopeFromContext(component.projectId, integrationId = componentId, envId = environmentId.trim());
        if !check auth:hasAnyPermission(userContext.userId,
                [auth:PERMISSION_INTEGRATION_VIEW, auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
            return error("Insufficient permissions to view Moesif logs for this integration");
        }

        // Shares the environment's Management API key with the metrics view; the
        // logs canvas differs only in the template the frontend posts at
        // CANVAS_INIT.
        string? managementKey = check storage:getEnvironmentMoesifManagementKey(environmentId.trim());
        if managementKey is () || managementKey.trim().length() == 0 {
            return error("Moesif Management API key has not been configured for this environment yet");
        }

        // Mint a short-lived, restricted canvas token from the stored Management
        // API key for this embed rather than serving a long-lived stored token.
        types:MoesifDashboardEmbed|error embed = buildMoesifCanvasEmbed(managementKey);
        if embed is error {
            log:printError("Failed to build Moesif logs canvas embed", 'error = embed, componentId = componentId);
            return error(string `Failed to generate Moesif logs embed: ${embed.message()}`);
        }
        return embed;
    }

    // List the Moesif applications the supplied Management API key can access. Requires edit or manage permission on the integration to read the API key.
    isolated resource function get moesifApplications(graphql:Context context, string componentId, string managementApiKey) returns types:MoesifApplication[]|error {
        if !moesifEnabled {
            return error("Moesif metrics integration is disabled");
        }
        types:UserContextV2 userContext = check extractUserContext(context);

        types:Component? component = check storage:getComponentById(componentId);
        if component is () {
            return error("Integration not found");
        }

        types:AccessScope scope = auth:buildScopeFromContext(component.projectId, integrationId = componentId);
        if !check auth:hasAnyPermission(userContext.userId,
                [auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
            return error("Insufficient permissions to list Moesif applications for this integration");
        }

        string trimmedToken = stripBearerPrefix(managementApiKey.trim());
        if trimmedToken.length() == 0 {
            return error("Moesif Management API token must not be empty");
        }

        types:MoesifApplication[]|error applications = listMoesifApplications(trimmedToken);
        if applications is error {
            log:printError("Failed to list Moesif applications", 'error = applications, componentId = componentId);
            return error(string `Failed to list Moesif applications: ${applications.message()}`);
        }
        return applications;
    }

    // Link an integration to its Moesif metrics canvas. The user imports the ICP
    // metrics dashboard template into their Moesif account (so the underlying
    // charts/metrics exist) and supplies their Moesif Management API key. The
    // Management API key is a Moesif-issued JWT scoped to an organization +
    // application, so both the Organization id (`org` claim) and the Collector
    // Application id (`app` claim) are derived from it here instead of being
    // entered separately. The canvas auth token is no longer supplied by the
    // user: it is minted on demand from this key when the embed is rendered. This
    // call records the org/app id + Management API key against the component so the
    // embed can render the canvas via the postMessage handshake. Requires edit or
    // manage permission.
    isolated remote function createMoesifDashboards(graphql:Context context, string componentId, string environmentId, string managementApiKey) returns types:MoesifMetricsConfigStatus|error {
        if !moesifEnabled {
            return error("Moesif metrics integration is disabled");
        }
        types:UserContextV2 userContext = check extractUserContext(context);

        if environmentId.trim().length() == 0 {
            return error("Environment id must be provided");
        }

        types:Component? component = check storage:getComponentById(componentId);
        if component is () {
            return error("Integration not found");
        }

        types:AccessScope scope = auth:buildScopeFromContext(component.projectId, integrationId = componentId, envId = environmentId.trim());
        if !check auth:hasAnyPermission(userContext.userId,
                [auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
            return error("Insufficient permissions to create Moesif dashboards for this component");
        }

        string trimmedToken = stripBearerPrefix(managementApiKey.trim());
        if trimmedToken.length() == 0 {
            return error("Moesif Management API token must not be empty");
        }

        // Derive the Moesif organization id + Collector Application id from the
        // Management API key (a Moesif-issued JWT with `org` and `app` claims)
        // instead of asking the user to paste or select them separately.
        string trimmedOrgId = check decodeMoesifOrgId(trimmedToken);
        string trimmedAppId = check decodeMoesifAppId(trimmedToken);

        // Validate the Management API key can mint a canvas token before storing
        // it, so an invalid key or one missing the required scope is surfaced now
        // rather than only when the embed is later rendered.
        _ = check mintMoesifCanvasToken(trimmedToken);

        // Persist the canvas org id + app id and the Management API key so the UI
        // can later build the canvas embed URL and mint a short-lived canvas token
        // to render the metrics canvas. The component is already resolved above, so
        // a zero affected-row count (a MySQL no-op update with unchanged values)
        // still counts as success.
        _ = check storage:updateComponentMoesifDashboardDetails(environmentId.trim(), trimmedOrgId, trimmedAppId, trimmedToken);

        storage:logAuditEvent(storage:AUDIT_COMPONENT_UPDATE, userId = userContext.userId,
                resourceType = storage:AUDIT_RESOURCE_COMPONENT, resourceId = componentId,
                details = string `Moesif metrics dashboards created for component '${component.name}' for environment '${environmentId.trim()}' by '${userContext.username}'`,
                clientIp = userContext.clientIp, userAgent = userContext.userAgent);

        return {dashboardsCreated: true};
    }

    // Link an integration to its Moesif application logs canvas. The user imports the
    // ICP logs dashboard template into their Moesif account (so the underlying log
    // charts exist) and supplies their Moesif Management API key. The Management API
    // key is a Moesif-issued JWT scoped to an organization + application, so both the
    // Organization id (`org` claim) and the Collector Application id (`app` claim) are
    // derived from it here. The canvas auth token is no longer supplied by the user:
    // it is minted on demand from this key when the embed is rendered. The org/app id
    // + Management API key are shared with the metrics config; this call records them
    // and flips the `logs_configured` flag so the logs canvas embed can render via the
    // postMessage handshake. Requires edit or manage permission.
    isolated remote function createMoesifLogsDashboards(graphql:Context context, string componentId, string environmentId, string managementApiKey) returns types:MoesifLogsConfigStatus|error {
        if !moesifEnabled {
            return error("Moesif logs integration is disabled");
        }
        types:UserContextV2 userContext = check extractUserContext(context);

        if environmentId.trim().length() == 0 {
            return error("Environment id must be provided");
        }

        types:Component? component = check storage:getComponentById(componentId);
        if component is () {
            return error("Integration not found");
        }

        types:AccessScope scope = auth:buildScopeFromContext(component.projectId, integrationId = componentId, envId = environmentId.trim());
        if !check auth:hasAnyPermission(userContext.userId,
                [auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
            return error("Insufficient permissions to configure Moesif logs for this component");
        }

        string trimmedToken = stripBearerPrefix(managementApiKey.trim());
        if trimmedToken.length() == 0 {
            return error("Moesif Management API token must not be empty");
        }

        // Derive the Moesif organization id + Collector Application id from the
        // Management API key (a Moesif-issued JWT with `org` and `app` claims)
        // instead of asking the user to paste or select them separately.
        string trimmedOrgId = check decodeMoesifOrgId(trimmedToken);
        string trimmedAppId = check decodeMoesifAppId(trimmedToken);

        // Validate the Management API key can mint a canvas token before storing
        // it, so an invalid key or one missing the required scope is surfaced now
        // rather than only when the embed is later rendered.
        _ = check mintMoesifCanvasToken(trimmedToken);

        // Persist the canvas org id + app id and the Management API key (shared with
        // the metrics config) and flip logs_configured so the UI can later build the
        // canvas embed URL and mint a short-lived canvas token to render the logs
        // canvas. The component is already resolved above, so a zero affected-row
        // count (a MySQL no-op update with unchanged values) still counts as success.
        _ = check storage:updateComponentMoesifLogsDetails(environmentId.trim(), trimmedOrgId, trimmedAppId, trimmedToken);

        storage:logAuditEvent(storage:AUDIT_COMPONENT_UPDATE, userId = userContext.userId,
                resourceType = storage:AUDIT_RESOURCE_COMPONENT, resourceId = componentId,
                details = string `Moesif logs canvas configured for component '${component.name}' for environment '${environmentId.trim()}' by '${userContext.username}'`,
                clientIp = userContext.clientIp, userAgent = userContext.userAgent);

        return {logsConfigured: true};
    }

    // Delete a component V2 - with detailed response
    isolated remote function deleteComponentV2(graphql:Context context, string orgHandler, string componentId, string projectId) returns types:DeleteComponentV2Response|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // 1. Check if component exists and belongs to the specified project
        types:Component? component = check storage:getComponentById(componentId);
        if component is () {
            return {
                status: "FAILED",
                canDelete: false,
                message: "Integration not found",
                encodedData: ""
            };
        }

        // Verify the component belongs to the specified project
        if component.projectId != projectId {
            return {
                status: "FAILED",
                canDelete: false,
                message: "Component does not belong to the specified project",
                encodedData: ""
            };
        }

        // 2. Build scope and check if user has permission to manage this integration
        types:AccessScope scope = auth:buildScopeFromContext(component.projectId, integrationId = componentId);

        if !check auth:hasPermission(userContext.userId, auth:PERMISSION_INTEGRATION_MANAGE, scope) {
            return {
                status: "FAILED",
                canDelete: false,
                message: "Insufficient permissions to delete this component",
                encodedData: ""
            };
        }

        // 3. Check for active runtimes/deployments
        string[] environmentsWithRuntimes = check storage:getEnvironmentIdsWithRuntimes(componentId);

        if environmentsWithRuntimes.length() > 0 {
            // Check if user has manage permission in ALL environments where the component has runtimes
            foreach string envId in environmentsWithRuntimes {
                types:AccessScope envScope = auth:buildScopeFromContext(component.projectId, integrationId = componentId, envId = envId);
                if !check auth:hasPermission(userContext.userId, auth:PERMISSION_INTEGRATION_MANAGE, envScope) {
                    return {
                        status: "FAILED",
                        canDelete: false,
                        message: string `Cannot delete component: it has runtimes in environment ${envId} where you don't have manage permission`,
                        encodedData: ""
                    };
                }
            }

            return {
                status: "FAILED",
                canDelete: false,
                message: string `Cannot delete component: ${environmentsWithRuntimes.length()} registered runtime(s) found. Please delete all runtimes before deleting.`,
                encodedData: ""
            };
        }

        // 4. Perform deletion
        error? deleteResult = storage:deleteComponent(componentId);
        if deleteResult is error {
            return {
                status: "FAILED",
                canDelete: false,
                message: string `Deletion failed: ${deleteResult.message()}`,
                encodedData: ""
            };
        }

        // 5. Clean up orphaned reconcile state for all linked environments
        string[] reconcileEnvIds = check storage:getReconcileEnvIdsForComponent(componentId);
        foreach string envId in reconcileEnvIds {
            check sync:reconcileDeleteComponent(componentId, envId);
        }

        storage:logAuditEvent(storage:AUDIT_COMPONENT_DELETE, userId = userContext.userId,
                resourceType = storage:AUDIT_RESOURCE_COMPONENT, resourceId = componentId,
                details = string `Component '${component.name}' deleted from project '${projectId}' by '${userContext.username}'`,
                clientIp = userContext.clientIp, userAgent = userContext.userAgent);
        return {
            status: "SUCCESS",
            canDelete: true,
            message: "Component deleted successfully",
            encodedData: ""
        };
    }

    // Update component using ComponentUpdateInput object
    isolated remote function updateComponent(graphql:Context context, types:ComponentUpdateInput component) returns types:Component|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Extract values from ComponentUpdateInput
        string targetComponentId = component.id;
        string? targetName = component.name;
        string? targetDisplayName = component.displayName;
        string? targetDescription = component.description;

        // Get project ID for the component (lightweight query for access control)
        string projectId = check storage:getProjectIdByComponentId(targetComponentId);

        // Build scope with project and integration context
        types:AccessScope scope = auth:buildScopeFromContext(projectId, integrationId = targetComponentId);

        // Check if user has permission to edit this integration (edit or manage)
        if !check auth:hasAnyPermission(userContext.userId,
                [auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
            return error("Insufficient permissions to update this component");
        }

        // Call the existing backend method to maintain consistency
        check storage:updateComponent(targetComponentId, targetName, targetDisplayName, targetDescription, userContext.userId,
                component.displayType, component.componentSubType);
        storage:logAuditEvent(storage:AUDIT_COMPONENT_UPDATE, userId = userContext.userId,
                resourceType = storage:AUDIT_RESOURCE_COMPONENT, resourceId = targetComponentId,
                details = string `Component '${targetName ?: targetComponentId}' updated by '${userContext.username}'`,
                clientIp = userContext.clientIp, userAgent = userContext.userAgent);
        return check storage:getComponentById(targetComponentId);
    }

    // Change artifact status (active/inactive) for all MI runtimes of a component
    isolated remote function updateArtifactStatus(graphql:Context context, types:ArtifactStatusChangeInput input) returns types:ArtifactStatusChangeResponse|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        types:Component? component = check storage:getComponentById(input.componentId);
        if component is () {
            return error("Integration not found");
        }

        types:AccessScope scope = auth:buildScopeFromContext(component.projectId, integrationId = input.componentId);
        if !check auth:hasAnyPermission(userContext.userId,
                [auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
            return error("Insufficient permissions to change artifact status");
        }

        // Match, persist and report the same canonical form, so a caller sending "  API  "
        // is not rejected on one spelling and echoed back another, and so the reconcile key
        // agrees with the observed state recorded from heartbeats.
        string artifactType = storage:normalizeArtifactType(input.artifactType);

        // Reject artifact types that cannot support a status change before anything is
        // persisted. MI answers such a request with a 400 and the dispatch path cannot
        // surface that, so proceeding would report SUCCESS, write a desired state that can
        // never converge, and leave the console showing a state the runtime is not in.
        if !storage:supportsStatusChange(artifactType) {
            log:printWarn("Rejected status change for unsupported artifact type",
                    artifactType = artifactType, artifactName = input.artifactName,
                    componentId = input.componentId);
            return {
                status: types:FAILED,
                message: string `Status change is not supported for artifact type '${artifactType}'. Supported types: ${storage:statusChangeSupportedTypes()}.`,
                successCount: 0,
                failedCount: 0,
                details: []
            };
        }

        types:Runtime[] runtimes = check storage:getRuntimes((), "MI", (), component.projectId, input.componentId);
        if runtimes.length() == 0 {
            log:printWarn("No MI runtimes found for component", componentId = input.componentId);
            return {
                status: "FAILED",
                message: "No MI runtimes found for this component",
                successCount: 0,
                failedCount: 0,
                details: []
            };
        }

        // Fold away any desired state left under a non-canonical spelling of this artifact type
        // before writing the canonical one, so replay cannot keep dispatching the stale row.
        artifactType = check canonicalArtifactType(input.componentId, runtimes, input.artifactName,
                input.artifactType);

        types:ReconcileArtifactKey artifact = {artifactName: input.artifactName, artifactType: artifactType};
        map<string> desiredProps = {"status": input.status};
        [int, int] counts = check reconcilePerEnv(runtimes, input.componentId, artifact, desiredProps, sync:dispatchMI);

        storage:logAuditEvent(storage:AUDIT_ARTIFACT_STATUS_CHANGE, userId = userContext.userId,
                resourceType = storage:AUDIT_RESOURCE_ARTIFACT,
                resourceId = string `${input.componentId}/${artifactType}/${input.artifactName}`,
                details = string `Artifact '${input.artifactName}' (${artifactType}) status changed to '${input.status}' by '${userContext.username}'`,
                clientIp = userContext.clientIp, userAgent = userContext.userAgent);
        return {
            status: counts[1] == 0 ? types:SUCCESS : types:FAILED,
            message: string `Artifact status change dispatched to ${counts[0] + counts[1]} runtime(s)`,
            successCount: counts[0],
            failedCount: counts[1],
            details: []
        };
    }

    // Mutation to change artifact tracing (enable/disable)
    isolated remote function updateArtifactTracingStatus(graphql:Context context, types:ArtifactTracingChangeInput input) returns types:ArtifactTracingChangeResponse|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        types:Component? component = check storage:getComponentById(input.componentId);
        if component is () {
            return error("Integration not found");
        }

        types:AccessScope scope = auth:buildScopeFromContext(component.projectId, integrationId = input.componentId);
        if !check auth:hasAnyPermission(userContext.userId,
                [auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
            return error("Insufficient permissions to change artifact tracing");
        }

        types:Runtime[] runtimes = check storage:getRuntimes((), "MI", input.environmentId, component.projectId, input.componentId);
        if runtimes.length() == 0 {
            log:printWarn("No MI runtimes found for component", componentId = input.componentId);
            return {
                status: "FAILED",
                message: "No MI runtimes found for this component",
                successCount: 0,
                failedCount: 0,
                details: []
            };
        }

        string artifactType = check canonicalArtifactType(input.componentId, runtimes,
                input.artifactName, input.artifactType);
        types:ReconcileArtifactKey artifact = {artifactName: input.artifactName, artifactType: artifactType};
        map<string> desiredProps = {"tracing": input.trace};
        [int, int] counts = check reconcilePerEnv(runtimes, input.componentId, artifact, desiredProps, sync:dispatchMI);

        return {
            status: counts[1] == 0 ? types:SUCCESS : types:FAILED,
            message: string `Artifact tracing change dispatched to ${counts[0] + counts[1]} runtime(s)`,
            successCount: counts[0],
            failedCount: counts[1],
            details: []
        };
    }

    // Mutation to change artifact statistics (enable/disable)
    isolated remote function updateArtifactStatisticsStatus(graphql:Context context, types:ArtifactStatisticsChangeInput input) returns types:ArtifactStatisticsChangeResponse|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        types:Component? component = check storage:getComponentById(input.componentId);
        if component is () {
            return error("Integration not found");
        }

        types:AccessScope scope = auth:buildScopeFromContext(component.projectId, integrationId = input.componentId);
        if !check auth:hasAnyPermission(userContext.userId,
                [auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
            return error("Insufficient permissions to change artifact statistics");
        }

        // Validate the canonical spelling, not the caller's. Matching the raw value here would
        // reject a supported type sent as "Proxy-Service" before it could be normalized.
        string normalizedType = storage:normalizeArtifactType(input.artifactType);
        string[] supportedTypes = ["proxy-service", "endpoint", "api", "sequence", "inbound-endpoint"];
        boolean isSupported = supportedTypes.indexOf(normalizedType) != ();
        if !isSupported {
            return error(string `Artifact type '${normalizedType}' does not support statistics. Supported types: ProxyService, Endpoint, RestApi, Sequence, InboundEndpoint`);
        }

        types:Runtime[] runtimes = check storage:getRuntimes((), "MI", input.environmentId, component.projectId, input.componentId);
        if runtimes.length() == 0 {
            log:printWarn("No MI runtimes found for component", componentId = input.componentId);
            return {
                status: "FAILED",
                message: "No MI runtimes found for this component",
                successCount: 0,
                failedCount: 0,
                details: []
            };
        }

        string artifactType = check canonicalArtifactType(input.componentId, runtimes,
                input.artifactName, input.artifactType);
        types:ReconcileArtifactKey artifact = {artifactName: input.artifactName, artifactType: artifactType};
        map<string> desiredProps = {"statistics": input.statistics};
        [int, int] counts = check reconcilePerEnv(runtimes, input.componentId, artifact, desiredProps, sync:dispatchMI);

        return {
            status: counts[1] == 0 ? types:SUCCESS : types:FAILED,
            message: string `Artifact statistics change dispatched to ${counts[0] + counts[1]} runtime(s)`,
            successCount: counts[0],
            failedCount: counts[1],
            details: []
        };
    }

    // ----------- Org-level Secrets (M1)

    isolated resource function get orgSecrets(graphql:Context context, string? environmentId, types:PaginationInput? pagination = ()) returns types:OrgSecretsPage|error {
        types:UserContextV2 userContext = check extractUserContext(context);
        log:printDebug(string `orgSecrets query by user=${userContext.userId}, environmentId=${environmentId ?: "all"}`);

        if environmentId is string {
            check authorizeEnvironmentAccess(userContext.userId, environmentId, "view org secrets");
        } else {
            types:AccessScope scope = {orgUuid: storage:DEFAULT_ORG_ID};
            if !check auth:hasAnyPermission(userContext.userId,
                    [auth:PERMISSION_ENVIRONMENT_MANAGE, auth:PERMISSION_ENVIRONMENT_MANAGE_NONPROD], scope) {
                return error("Access denied: insufficient permissions to view org secrets");
            }
        }

        types:OrgSecretListEntry[] result = check storage:listOrgSecrets(environmentId);
        [int, int, types:PageInfo] [sliceFrom, sliceTo, pageInfo] = buildPageResult(result.length(), pagination);
        return {items: result.slice(sliceFrom, sliceTo), pageInfo};
    }

    isolated resource function get componentSecrets(graphql:Context context, string componentId, string environmentId, types:PaginationInput? pagination = ()) returns types:BoundSecretsPage|error {
        types:UserContextV2 userContext = check extractUserContext(context);
        log:printDebug(string `componentSecrets query by user=${userContext.userId}, componentId=${componentId}, environmentId=${environmentId}`);

        types:Component? component = check storage:getComponentById(componentId);
        if component is () {
            return error("Integration not found");
        }

        types:AccessScope scope = auth:buildScopeFromContext(component.projectId, integrationId = componentId, envId = environmentId);
        if !check auth:hasPermission(userContext.userId, auth:PERMISSION_INTEGRATION_MANAGE, scope) {
            return error("Access denied: insufficient permissions to view component secrets");
        }

        types:BoundSecretEntry[] result = check storage:listBoundSecrets(componentId, environmentId);
        [int, int, types:PageInfo] [sliceFrom, sliceTo, pageInfo] = buildPageResult(result.length(), pagination);
        return {items: result.slice(sliceFrom, sliceTo), pageInfo};
    }

    isolated remote function createOrgSecret(graphql:Context context, string environmentId, string? componentId = ()) returns string|error {
        types:UserContextV2 userContext = check extractUserContext(context);
        log:printDebug(string `createOrgSecret by user=${userContext.userId}, environment=${environmentId}, componentId=${componentId ?: "unbound"}`);

        check authorizeEnvironmentAccess(userContext.userId, environmentId, "create org secrets");

        if componentId is string {
            types:Component? component = check storage:getComponentById(componentId);
            if component is () {
                return error("Integration not found");
            }

            types:AccessScope scope = auth:buildScopeFromContext(component.projectId, integrationId = componentId,
                    envId = environmentId);
            if !check auth:hasPermission(userContext.userId, auth:PERMISSION_INTEGRATION_MANAGE, scope) {
                return error("Access denied: insufficient permissions to create component-bound secrets");
            }

            types:Project? project = check storage:getProjectById(component.projectId);
            if project is () {
                return error("Project not found");
            }

            string secret = check storage:createComponentEnvBoundOrgSecret(environmentId, userContext.userId,
                    component.projectId, componentId, project.handler, component.name,
                    component.componentType.toString());
            log:printInfo(string `Component-bound org secret created for environment=${environmentId}, componentId=${componentId}`,
                    userId = userContext.userId);
            storage:logAuditEvent(storage:AUDIT_ORG_SECRET_CREATE, userId = userContext.userId,
                    resourceType = storage:AUDIT_RESOURCE_SECRET, resourceId = environmentId,
                    details = string `Component-bound org secret created for environment '${environmentId}', component '${componentId}' by '${userContext.username}'`,
                    clientIp = userContext.clientIp, userAgent = userContext.userAgent);
            return secret;
        }

        string secret = check storage:createOrgSecret(environmentId, userContext.userId);
        log:printInfo(string `Org secret created for environment=${environmentId}`, userId = userContext.userId);
        storage:logAuditEvent(storage:AUDIT_ORG_SECRET_CREATE, userId = userContext.userId,
                resourceType = storage:AUDIT_RESOURCE_SECRET, resourceId = environmentId,
                details = string `Org secret created for environment '${environmentId}' by '${userContext.username}'`,
                clientIp = userContext.clientIp, userAgent = userContext.userAgent);
        return secret;
    }

    isolated remote function revokeOrgSecret(graphql:Context context, string keyId) returns boolean|error {
        types:UserContextV2 userContext = check extractUserContext(context);
        log:printDebug(string `revokeOrgSecret by user=${userContext.userId}, keyId=${keyId}`);

        types:OrgSecret secret = check storage:lookupOrgSecretByKeyId(keyId);
        check authorizeEnvironmentAccess(userContext.userId, secret.environmentId, "revoke org secrets");

        check storage:revokeOrgSecret(keyId);
        log:printInfo(string `Org secret revoked keyId=${keyId}`, userId = userContext.userId);
        storage:logAuditEvent(storage:AUDIT_ORG_SECRET_REVOKE, userId = userContext.userId,
                resourceType = storage:AUDIT_RESOURCE_SECRET, resourceId = keyId,
                details = string `Org secret '${keyId}' revoked by '${userContext.username}'`,
                clientIp = userContext.clientIp, userAgent = userContext.userAgent);
        return true;
    }

    // Mutation to trigger a task
    isolated remote function triggerArtifact(graphql:Context context, types:ArtifactTriggerInput input) returns types:ArtifactTriggerResponse|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        types:Component? component = check storage:getComponentById(input.componentId);
        if component is () {
            return error("Integration not found");
        }

        types:AccessScope scope = auth:buildScopeFromContext(component.projectId, integrationId = input.componentId);

        if !check auth:hasAnyPermission(userContext.userId,
                [auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
            log:printWarn("Attempt to trigger task without permission",
                    userId = userContext.userId, componentId = input.componentId, taskName = input.taskName);
            return error("Insufficient permissions to trigger task");
        }

        // Get all MI runtimes for this component
        types:Runtime[] runtimes = check storage:getRuntimes((), "MI", (), component.projectId, input.componentId);

        if runtimes.length() == 0 {
            log:printWarn("No MI runtimes found for component", componentId = input.componentId);
            return {
                status: "FAILED",
                message: "No MI runtimes found for this component",
                successCount: 0,
                failedCount: 0,
                details: []
            };
        }

        log:printInfo("Creating MI control commands for task trigger",
                componentId = input.componentId,
                taskName = input.taskName,
                runtimeCount = runtimes.length());

        types:MIControlAction action = types:ARTIFACT_TRIGGER;

        int successCount = 0;
        int failedCount = 0;
        string[] details = [];

        // Insert MI control command for each runtime
        foreach types:Runtime runtime in runtimes {
            boolean isRunning = runtime.status == types:RUNNING;
            string commandStatus = isRunning ? "sent" : "pending";

            error? result = storage:insertMIControlCommand(
                    runtime.runtimeId,
                    input.componentId,
                    input.taskName,
                    types:TASK,
                    action,
                    commandStatus,
                    userContext.userId
            );

            if result is error {
                failedCount += 1;
                string detail = string `Runtime ${runtime.runtimeId}: FAILED - ${result.message()}`;
                details.push(detail);
                log:printError("Failed to insert MI control command for runtime",
                        runtimeId = runtime.runtimeId,
                        taskName = input.taskName,
                        errorMessage = result.message());
            } else if isRunning {
                // Runtime is online, fire the async HTTP request immediately (fire-and-forget)
                string actionStr = action;
                storage:sendMIControlCommandAsync(
                        runtime.runtimeId,
                        types:TASK,
                        input.taskName,
                        actionStr
                );

                successCount += 1;
                string detail = string `Runtime ${runtime.runtimeId}: Command sent`;
                details.push(detail);
                log:printDebug("MI control command sent for runtime",
                        runtimeId = runtime.runtimeId,
                        taskName = input.taskName);
            } else {
                // Runtime is offline, command queued as pending for delivery on next heartbeat
                successCount += 1;
                string detail = string `Runtime ${runtime.runtimeId}: Command queued (runtime offline)`;
                details.push(detail);
                log:printDebug("MI control command queued for offline runtime",
                        runtimeId = runtime.runtimeId,
                        taskName = input.taskName);
            }
        }

        types:Status overallStatus = successCount > 0 ? "SUCCESS" : "FAILED";
        string message = string `Task trigger sent to ${successCount} out of ${runtimes.length()} runtime(s)`;

        log:printInfo("Task trigger commands sent",
                componentId = input.componentId,
                taskName = input.taskName,
                successCount = successCount,
                failedCount = failedCount);

        return {
            status: overallStatus,
            message: message,
            successCount: successCount,
            failedCount: failedCount,
            details: details
        };
    }

    // Get available artifact types for a component
    isolated resource function get componentArtifactTypes(graphql:Context context, string componentId, string? environmentId = ()) returns types:ArtifactTypeCount[]|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Get component to check access and type
        types:Component? component = check storage:getComponentById(componentId);
        if component is () {
            return error("Integration not found");
        }

        // Build scope with project and integration context (and optional environment)
        types:AccessScope scope = auth:buildScopeFromContext(component.projectId, integrationId = componentId, envId = environmentId);

        // Check if user has permission to view this integration
        // Users with edit or manage permissions should also be able to view artifacts
        if !check auth:hasAnyPermission(userContext.userId,
                [auth:PERMISSION_INTEGRATION_VIEW, auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
            log:printWarn("Attempt to access component artifact types without permission", userId = userContext.userId, componentId = componentId, environmentId = environmentId);
            return [];
        }

        // Return available artifact types based on component (only those with actual data)
        return check storage:getArtifactTypesForComponent(componentId, component.componentType, environmentId);
    }

    isolated resource function get artifactSourceByComponent(
            graphql:Context context,
            string componentId,
            string artifactType,
            string artifactName,
            string? environmentId = (),
            string? runtimeId = (),
            string? packageName = (),
            string? templateType = ()
    ) returns types:FetchableText|error {
        types:Runtime runtime =
            check miRuntimeOfComponent(context, componentId, environmentId, runtimeId);
        MIAnswer answer = check miRead(runtime,
                check mi_management:artifactPath(artifactType, artifactName, templateType));
        return answer.preparing
            ? {...stillFetching()}
            : {...fetchableOf(answer), content: check mi_management:artifactSource(answer.body)};
    }

    // Get WSDL for any supported artifact by type and name via ICP internal API
    // Currently only supported for proxy services, but can be extended to other artifact types in the future if needed (e.g. APIs with OAS)
    isolated resource function get artifactWsdlByComponent(
            graphql:Context context,
            string componentId,
            string artifactType,
            string artifactName,
            string? environmentId = (),
            string? runtimeId = (),
            string? packageName = ()
    ) returns types:FetchableText|error {
        types:Runtime runtime =
            check miRuntimeOfComponent(context, componentId, environmentId, runtimeId);

        // The management API reports the WSDL's URL, not its content, so this takes two
        // steps — and the second is not a management call at all: the URL is on MI's service
        // port, which the ICP dials directly whichever way the first step was served.
        MIAnswer answer = check miRead(runtime,
                check mi_management:artifactPath(mi_management:ARTIFACT_TYPE_PROXY_SERVICE, artifactName));
        if answer.preparing {
            return {...stillFetching()};
        }
        types:MgmtProxyServiceInfo proxyService = check answer.body.cloneWithType();
        string? wsdlUrl = proxyService?.wsdl1_1;
        if wsdlUrl is () {
            return error("WSDL URL not found for this artifact");
        }
        string trustedHost = runtime.managementHostname ?: "";
        if trustedHost == "" {
            return error("Runtime management hostname is not set");
        }
        return {
            ...fetchableOf(answer),
            content: check mi_management:fetchWsdlContent(wsdlUrl, trustedHost,
                    artifactsApiAllowInsecureTLS)
        };
    }

    // Get Local Entry value from a runtime's management API via ICP internal API
    isolated resource function get localEntryValueByComponent(
            graphql:Context context,
            string componentId,
            string entryName,
            string? environmentId = (),
            string? runtimeId = ()
    ) returns types:FetchableText|error {
        types:Runtime runtime =
            check miRuntimeOfComponent(context, componentId, environmentId, runtimeId);
        MIAnswer answer = check miRead(runtime,
                check mi_management:artifactPath(mi_management:ARTIFACT_TYPE_LOCAL_ENTRY, entryName));
        if answer.preparing {
            return {...stillFetching()};
        }
        types:MgmtLocalEntryInfo entry = check answer.body.cloneWithType();
        return {...fetchableOf(answer), content: entry.value};
    }

    // Get Parameters for any artifact type from management API via ICP internal API
    isolated resource function get artifactParametersByComponent(
            graphql:Context context,
            string componentId,
            string artifactType,
            string artifactName,
            string? environmentId = (),
            string? runtimeId = (),
            string? packageName = ()
        ) returns types:FetchableParameters|error {
        // Only these three keep parameters, and each keeps them somewhere else. For any
        // other type there is nothing to ask the runtime for, so the panel shows an empty
        // tab rather than an error about a type the management API would refuse.
        if artifactType != mi_management:ARTIFACT_TYPE_INBOUND_ENDPOINT
                && artifactType != mi_management:ARTIFACT_TYPE_MESSAGE_PROCESSOR
                && artifactType != mi_management:ARTIFACT_TYPE_DATA_SOURCE {
            return {};
        }
        types:Runtime runtime =
            check miRuntimeOfComponent(context, componentId, environmentId, runtimeId);
        MIAnswer answer = check miRead(runtime,
                check mi_management:artifactPath(artifactType, artifactName));
        if answer.preparing {
            return {...stillFetching()};
        }
        if artifactType == mi_management:ARTIFACT_TYPE_INBOUND_ENDPOINT {
            types:MgmtInboundEndpointInfo inbound = check answer.body.cloneWithType();
            return {...fetchableOf(answer), parameters: inbound.parameters ?: []};
        }
        if artifactType == mi_management:ARTIFACT_TYPE_MESSAGE_PROCESSOR {
            types:MgmtMessageProcessorInfo processor = check answer.body.cloneWithType();
            return {...fetchableOf(answer), parameters: namedValues(processor.parameters ?: {})};
        }
        types:MgmtDataSourceInfo dataSource = check answer.body.cloneWithType();
        return {
            ...fetchableOf(answer),
            parameters: namedValues(dataSource.configurationParameters ?: {})
        };
    }

    // Get overview metadata for a data source from the MI Management API.
    // Returns fields: name, type, description, driverClass, userName, url.
    isolated resource function get dataSourceOverviewByComponent(
            graphql:Context context,
            string componentId,
            string dataSourceName,
            string? environmentId = (),
            string? runtimeId = ()
        ) returns types:FetchableParameters|error {
        types:Runtime runtime =
            check miRuntimeOfComponent(context, componentId, environmentId, runtimeId);
        MIAnswer answer = check miRead(runtime,
                check mi_management:artifactPath(mi_management:ARTIFACT_TYPE_DATA_SOURCE, dataSourceName));
        if answer.preparing {
            return {...stillFetching()};
        }
        types:MgmtDataSourceInfo overview = check answer.body.cloneWithType();
        return {
            ...fetchableOf(answer),
            parameters: presentValues([
                ["name", overview.name],
                ["type", overview.'type],
                ["description", overview.description],
                ["driverClass", overview.driverClass],
                ["userName", overview.userName],
                ["url", overview.url]
            ])
        };
    }

    // Get overview metadata for a message store: name, type, container, size.
    isolated resource function get messageStoreOverviewByComponent(
            graphql:Context context,
            string componentId,
            string storeName,
            string? environmentId = (),
            string? runtimeId = ()
        ) returns types:FetchableParameters|error {
        types:Runtime runtime =
            check miRuntimeOfComponent(context, componentId, environmentId, runtimeId);
        MIAnswer answer = check miRead(runtime,
                check mi_management:artifactPath(mi_management:ARTIFACT_TYPE_MESSAGE_STORE, storeName));
        if answer.preparing {
            return {...stillFetching()};
        }
        types:MgmtMessageStoreInfo overview = check answer.body.cloneWithType();
        return {
            ...fetchableOf(answer),
            parameters: presentValues([
                ["name", overview.name],
                ["type", overview.'type],
                ["container", overview.container],
                ["size", overview.size]
            ])
        };
    }

    // Get overview metadata for a message processor: name, type, messageStore, status.
    isolated resource function get messageProcessorOverviewByComponent(
            graphql:Context context,
            string componentId,
            string processorName,
            string? environmentId = (),
            string? runtimeId = ()
        ) returns types:FetchableParameters|error {
        types:Runtime runtime =
            check miRuntimeOfComponent(context, componentId, environmentId, runtimeId);
        MIAnswer answer = check miRead(runtime,
                check mi_management:artifactPath(mi_management:ARTIFACT_TYPE_MESSAGE_PROCESSOR, processorName));
        if answer.preparing {
            return {...stillFetching()};
        }
        types:MgmtMessageProcessorInfo overview = check answer.body.cloneWithType();
        return {
            ...fetchableOf(answer),
            parameters: presentValues([
                ["name", overview.name],
                ["type", overview.'type],
                ["messageStore", overview.messageStore],
                ["status", overview.status]
            ])
        };
    }

    // Get structured overview for a data service: dataSources, queries, resources, operations.
    isolated resource function get dataServiceOverviewByComponent(
            graphql:Context context,
            string componentId,
            string dataServiceName,
            string? environmentId = (),
            string? runtimeId = ()
        ) returns types:FetchableDataService|error {
        types:Runtime runtime =
            check miRuntimeOfComponent(context, componentId, environmentId, runtimeId);
        MIAnswer answer = check miRead(runtime,
                check mi_management:artifactPath(mi_management:ARTIFACT_TYPE_DATA_SERVICE, dataServiceName));
        if answer.preparing {
            return {...stillFetching()};
        }
        return {
            ...fetchableOf(answer),
            dataService: check answer.body.cloneWithType(types:MgmtDataServiceInfo)
        };
    }

    // ============================================================
    // MI Runtime User Management
    // ============================================================

    // Listing a runtime's accounts takes edit rights, not view: who can log in to a
    // production runtime is not a view-level fact.
    isolated resource function get getMIUsers(graphql:Context context, string componentId, string runtimeId, types:PaginationInput? pagination = ()) returns types:MIUsersPage|error {
        types:Runtime runtime = check miRuntimeOfIntegration(context, componentId, runtimeId,
                [auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE],
                "Insufficient permissions to view MI users");

        MIAnswer listed = check miRead(runtime, mi_management:usersPath());
        if listed.preparing {
            return {...stillFetching(), items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }
        json[] userList = [];
        json|error list = listed.body.list;
        if list is json[] {
            userList = list;
        }

        // Paginate before enrichment: whether a user is an admin takes a call of its own, so
        // a page of ten must not cost a call per account in the store.
        [int, int, types:PageInfo] [sliceFrom, sliceTo, pageInfo] =
            buildPageResult(userList.length(), pagination);

        // Every account on the page is asked before any "not yet" is reported: returning at
        // the first unready one would leave the rest unqueued, and a page of ten would take
        // ten heartbeats to fill instead of one.
        types:MIUser[] users = [];
        boolean preparing = false;
        foreach json account in userList.slice(sliceFrom, sliceTo) {
            json|error userId = account.userId;
            if userId is error {
                continue;
            }
            // MI qualifies a non-primary account as `domain/username`.
            string qualified = userId.toString();
            int? separator = qualified.indexOf("/");
            string domain = separator is int ? qualified.substring(0, separator) : "primary";
            string username = separator is int ? qualified.substring(separator + 1) : qualified;

            // One account the runtime will not describe costs that account its admin flag,
            // not everyone else their row: MI answers 404 for an account its list names but
            // its configured store cannot read back, and a page that hides admin, alice and
            // carol because bob is unreadable tells the operator nothing they can act on.
            MIAnswer|error detail = miRead(runtime, check mi_management:userPath(qualified));
            if detail is error {
                log:printWarn("Listing an MI user whose details the runtime would not give",
                        detail, runtimeId = runtimeId, username = username);
                users.push({username, domain, isAdmin: false});
                continue;
            }
            if detail.preparing {
                preparing = true;
                continue;
            }
            json|error isAdmin = detail.body.isAdmin;
            users.push({username, domain, isAdmin: isAdmin is boolean && isAdmin});
        }
        if preparing {
            return {...stillFetching(), items: [], pageInfo: {total: 0, 'limit: 0, offset: 0}};
        }
        return {...fetchableOf(listed), items: users, pageInfo};
    }

    isolated remote function addMIUser(graphql:Context context, string componentId, string runtimeId, string username, string password, boolean isAdmin = false, string domain = "primary", string? requestId = ()) returns types:MIUserOperationResponse|error {
        types:UserContextV2 userContext = check extractUserContext(context);
        types:Runtime runtime = check miRuntimeOfIntegration(context, componentId, runtimeId,
                [auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE],
                "Insufficient permissions to create MI users");

        if username.trim().length() == 0 {
            return error("username must be a non-empty string");
        }
        if password.trim().length() == 0 {
            return error("password must be a non-empty string");
        }

        MIAnswer created = check miWrite(runtime, http:POST, mi_management:usersPath(),
                {userId: username, password, isAdmin, domain}, userContext, requestId);
        if created.preparing {
            return {...stillFetching(), username};
        }

        // The audit record is written where the write is (mi_access.bal), so that both
        // transports leave one and leave the same one.
        log:printInfo("Successfully created MI user on runtime", username = username, runtimeId = runtimeId);
        return {username, status: "Added"};
    }

    isolated remote function deleteMIUser(graphql:Context context, string componentId, string runtimeId, string username, string domain = "primary", string? requestId = ()) returns types:MIUserOperationResponse|error {
        types:UserContextV2 userContext = check extractUserContext(context);
        types:Runtime runtime = check miRuntimeOfIntegration(context, componentId, runtimeId,
                [auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE],
                "Insufficient permissions to delete MI users");

        string trimmedUsername = username.trim();
        if trimmedUsername.length() == 0 {
            return error("username must be a non-empty string");
        }

        MIAnswer deleted = check miWrite(runtime, http:DELETE,
                check mi_management:userPath(trimmedUsername, domain), (),
                userContext, requestId);
        if deleted.preparing {
            return {...stillFetching(), username};
        }

        log:printInfo("Successfully deleted MI user on runtime", username = username, runtimeId = runtimeId);
        return {username, status: "Deleted"};
    }

    // Returns ICP server version information
    isolated resource function get systemInfo(graphql:Context context) returns types:SystemInfo|error {
        _ = check extractUserContext(context);
        return {version: icpVersion};
    }

    // Reports whether the OpenSearch-backed observability metrics backend is
    // configured and reachable. The UI uses this to decide the default metrics
    // provider: when OpenSearch is unavailable it defaults to Moesif and shows
    // OpenSearch as the secondary option.
    isolated resource function get observabilityMetricsConfig(graphql:Context context) returns types:ObservabilityMetricsConfigStatus|error {
        _ = check extractUserContext(context);
        return {configured: isOpenSearchAvailable()};
    }

}

