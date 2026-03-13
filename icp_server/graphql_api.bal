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
import ballerina/url;

// GraphQL listener configuration
listener graphql:Listener graphqlListener = new (graphqlPort,
    configuration = {
        host: serverHost,
        secureSocket: {
            key: {
                path: keystorePath,
                password: resolvedKeystorePassword
            }
        }
    }
);

// Reusable: pick a runtime from a list with optional runtimeId

// Extract user context from GraphQL context
isolated function extractUserContext(graphql:Context context) returns types:UserContextV2|error {
    value:Cloneable|error|isolated object {} authHeader = context.get("Authorization");
    if authHeader !is string {
        return error("Authorization header missing in request");
    }
    return check auth:extractUserContextV2(authHeader);
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

// Helper function to fetch MI loggers from management API
isolated function fetchMILoggersByRuntime(string runtimeId, types:Runtime runtime) returns types:Logger[]|error {
    // Build management API base URL
    string baseUrl = check storage:buildManagementBaseUrl(runtime.managementHostname, runtime.managementPort);

    log:printInfo("Fetching loggers from MI runtime management API",
            runtimeId = runtimeId,
            managementUrl = baseUrl);

    // Create management API client (toggle insecure TLS via configuration)
    http:Client|error mgmtClientResult = artifactsApiAllowInsecureTLS
        ? new (baseUrl, {secureSocket: {enable: false}})
        : new (baseUrl);
    if mgmtClientResult is error {
        log:printError("Failed to create management API client", mgmtClientResult);
        return error("Failed to create management API client");
    }

    // Generate an HMAC JWT to call the MI management API
    string hmacToken = check storage:issueRuntimeHmacToken(runtimeId);

    // Fetch loggers via MI Management API (/management/logging)
    log:printDebug("Fetching loggers via MI management API", runtimeId = runtimeId, managementUrl = baseUrl);
    types:MgmtLoggersResponse loggersResponse = check mi_management:fetchLoggers(mgmtClientResult, hmacToken);

    log:printInfo("Successfully fetched loggers from MI management API",
            runtimeId = runtimeId,
            managementUrl = baseUrl,
            loggerCount = loggersResponse.count);

    // Reconcile loggers with intended state before returning
    map<string>|error intendedLogLevels = storage:getMILoggerIntendedStatesForComponent(runtime.component.id);

    if intendedLogLevels is error {
        log:printError("Failed to fetch MI logger intended states for reconciliation",
                componentId = runtime.component.id,
                runtimeId = runtimeId,
                'error = intendedLogLevels);
        return error(string `Failed to fetch intended logger states for component ${runtime.component.id}: ${intendedLogLevels.message()}`);
    }

    if intendedLogLevels.length() > 0 {
        // Compare and update any mismatched loggers
        int updatedCount = 0;

        foreach types:MgmtLoggerInfo loggerInfo in loggersResponse.list {
            string loggerName = loggerInfo.loggerName;

            if intendedLogLevels.hasKey(loggerName) {
                string intendedLevel = intendedLogLevels.get(loggerName);
                string currentLevel = loggerInfo.level.toUpperAscii();

                if currentLevel != intendedLevel.toUpperAscii() {
                    // Logger level mismatch - update it
                    types:MgmtUpdateLoggerRequest updateRequest = {
                        loggerName: loggerName,
                        loggingLevel: intendedLevel
                    };

                    types:MgmtUpdateLoggerResponse|error updateResult = mi_management:updateLogger(
                            mgmtClientResult,
                            hmacToken,
                            updateRequest
                    );

                    if updateResult is error {
                        log:printError("Failed to reconcile MI logger via management API",
                                runtimeId = runtimeId,
                                loggerName = loggerName,
                                intendedLevel = intendedLevel,
                                currentLevel = currentLevel,
                                'error = updateResult);
                    } else {
                        updatedCount += 1;
                        log:printInfo(string `Reconciled MI logger ${loggerName} from ${currentLevel} to ${intendedLevel} on runtime ${runtimeId}`);
                        // Update the logger info in the response so UI sees the updated value
                        loggerInfo.level = intendedLevel;
                    }
                }
            }
        }

        if updatedCount > 0 {
            log:printInfo(string `MI logger reconciliation completed: updated ${updatedCount} logger(s) on runtime ${runtimeId}`);
        }
    }

    // Convert management API response to Logger type
    types:Logger[] loggers = [];
    foreach types:MgmtLoggerInfo loggerInfo in loggersResponse.list {
        types:LogLevel logLevel = check utils:toLogLevel(loggerInfo.level);
        loggers.push({
            loggerName: loggerInfo.loggerName,
            componentName: loggerInfo.componentName,
            logLevel: logLevel,
            "runtimeId": runtimeId
        });
    }

    return loggers;
}

// Look up a single reconcile state field for an artifact.
isolated function stateOf(map<map<types:ArtifactStateField>> sm, string name, string artifactType, string key)
        returns types:ArtifactStateField? {
    map<types:ArtifactStateField>? fields = sm[string `${name}|${artifactType}`];
    return fields is map<types:ArtifactStateField> ? fields[key] : ();
}

// Group runtimes by environment, upsert desired state per env, and reconcile.
// Returns [successCount, failedCount] across all envs.
function reconcilePerEnv(types:Runtime[] runtimes, string componentId,
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
    log:printInfo("Fetching loggers from BI runtime database", runtimeId = runtimeId);

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

    log:printInfo("Successfully fetched loggers from BI runtime database",
            runtimeId = runtimeId,
            loggerCount = loggers.length());

    return loggers;
}

// Helper function to fetch MI loggers from management API for environment and component
isolated function fetchMILoggersByEnvironmentAndComponent(string environmentId, string componentId, string projectId) returns types:LoggerGroup[]|error {
    log:printInfo("Fetching loggers from MI management API for environment and component",
        environmentId = environmentId,
        componentId = componentId);

    // Get all runtimes for this environment and component
    types:Runtime[] runtimes = check storage:getRuntimes((), (), environmentId, projectId, componentId);

    if runtimes.length() == 0 {
        log:printDebug("No runtimes found for environment and component", environmentId = environmentId, componentId = componentId);
        return [];
    }

    // Map to group loggers by (loggerName, componentName) -> runtimeIds
    map<types:LoggerGroup> loggerGroupMap = {};

    // Fetch loggers from each runtime
    foreach types:Runtime runtime in runtimes {
        // Build management API base URL
        string baseUrl = check storage:buildManagementBaseUrl(runtime.managementHostname, runtime.managementPort);

        // Create management API client
        http:Client|error mgmtClientResult = artifactsApiAllowInsecureTLS
            ? new (baseUrl, {secureSocket: {enable: false}})
            : new (baseUrl);

        if mgmtClientResult is error {
            log:printError("Failed to create management API client for runtime",
                runtimeId = runtime.runtimeId,
                'error = mgmtClientResult);
            continue; // Skip this runtime and continue with others
        }

        // Generate HMAC token
        string|error hmacTokenResult = storage:issueRuntimeHmacToken(runtime.runtimeId);

        if hmacTokenResult is error {
            log:printError("Failed to generate HMAC token for runtime",
                runtimeId = runtime.runtimeId,
                'error = hmacTokenResult);
            continue; // Skip this runtime and continue with others
        }

        string hmacToken = hmacTokenResult;

        // Fetch loggers from the runtime
        types:MgmtLoggersResponse|error loggersResponse = mi_management:fetchLoggers(mgmtClientResult, hmacToken);

        if loggersResponse is error {
            log:printError("Failed to fetch loggers from runtime",
                runtimeId = runtime.runtimeId,
                'error = loggersResponse);
            continue; // Skip this runtime and continue with others
        }

        // Reconcile loggers with intended state before processing
        map<string>|error intendedLogLevels = storage:getMILoggerIntendedStatesForComponent(componentId);

        if intendedLogLevels is error {
            log:printError("Failed to fetch MI logger intended states for reconciliation in fetchMILoggersByEnvironmentAndComponent",
                    componentId = componentId,
                    runtimeId = runtime.runtimeId,
                    'error = intendedLogLevels);
            // Continue processing loggers without reconciliation
        } else if intendedLogLevels.length() > 0 {
            // Compare and update any mismatched loggers
            int updatedCount = 0;

            foreach types:MgmtLoggerInfo loggerInfo in loggersResponse.list {
                string loggerName = loggerInfo.loggerName;

                if intendedLogLevels.hasKey(loggerName) {
                    string intendedLevel = intendedLogLevels.get(loggerName);
                    string currentLevel = loggerInfo.level.toUpperAscii();

                    if currentLevel != intendedLevel.toUpperAscii() {
                        // Logger level mismatch - update it
                        types:MgmtUpdateLoggerRequest updateRequest = {
                            loggerName: loggerName,
                            loggingLevel: intendedLevel
                        };

                        types:MgmtUpdateLoggerResponse|error updateResult = mi_management:updateLogger(
                                mgmtClientResult,
                                hmacToken,
                                updateRequest
                        );

                        if updateResult is error {
                            log:printError("Failed to reconcile MI logger via management API",
                                    runtimeId = runtime.runtimeId,
                                    loggerName = loggerName,
                                    intendedLevel = intendedLevel,
                                    currentLevel = currentLevel,
                                    'error = updateResult);
                        } else {
                            updatedCount += 1;
                            log:printInfo(string `Reconciled MI logger ${loggerName} from ${currentLevel} to ${intendedLevel} on runtime ${runtime.runtimeId}`);
                            // Update the logger info so it's grouped correctly
                            loggerInfo.level = intendedLevel;
                        }
                    }
                }
            }

            if updatedCount > 0 {
                log:printInfo(string `MI logger reconciliation completed: updated ${updatedCount} logger(s) on runtime ${runtime.runtimeId}`);
            }
        }

        // Process each logger from this runtime
        foreach types:MgmtLoggerInfo loggerInfo in loggersResponse.list {
            types:LogLevel|error logLevelResult = utils:toLogLevel(loggerInfo.level);
            if logLevelResult is error {
                log:printWarn("Invalid log level, skipping logger",
                    loggerName = loggerInfo.loggerName,
                    logLevel = loggerInfo.level,
                    errorMsg = logLevelResult.message());
                continue;
            }

            // Create a unique key for grouping (loggerName + componentName + logLevel)
            string groupKey = loggerInfo.loggerName + "|" + loggerInfo.componentName + "|" + logLevelResult.toString();

            if loggerGroupMap.hasKey(groupKey) {
                // Logger already exists, add this runtime ID to the group
                types:LoggerGroup existingGroup = loggerGroupMap.get(groupKey);
                existingGroup.runtimeIds.push(runtime.runtimeId);
            } else {
                // Create new logger group
                loggerGroupMap[groupKey] = {
                    loggerName: loggerInfo.loggerName,
                    componentName: loggerInfo.componentName,
                    logLevel: logLevelResult,
                    runtimeIds: [runtime.runtimeId]
                };
            }
        }
    }

    // Convert map to array
    types:LoggerGroup[] loggerGroups = loggerGroupMap.toArray();

    log:printInfo("Successfully fetched and grouped MI loggers from multiple runtimes",
        environmentId = environmentId,
        componentId = componentId,
        runtimeCount = runtimes.length(),
        loggerGroupCount = loggerGroups.length());

    return loggerGroups;
}

// Helper function: Update log level for BI runtimes (database + command queue)
isolated function updateLogLevelBI(types:UserContextV2 userContext, types:UpdateLogLevelInput input) returns types:UpdateLogLevelResponse|error {
    string? componentNameOpt = input?.componentName;
    if componentNameOpt is () {
        return error("Component name is required for BI components");
    }
    string componentName = componentNameOpt;
    string logLevelStr = input.logLevel.toString();
    map<boolean> processed = {};

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
        }
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

    foreach types:ValidatedRuntime validated in validatedRuntimes {
        // Persist intended state via reconcile engine (once per component+env)
        string envId = validated.runtime.environment.id;
        string key = validated.componentId + ":" + envId;
        if !processedComponents.hasKey(key) {
            types:ReconcileArtifactKey artifact = {artifactName: loggerName, artifactType: "mi-logger"};
            check storage:upsertReconcileDesiredState(validated.componentId, envId, artifact,
                {"logLevel": logLevelStr});
            log:printInfo(string `Updated reconcile desired state for MI logger ${loggerName} to ${logLevelStr} in component ${validated.componentId}`);
            processedComponents[key] = true;
        }

        // Build management API base URL
        string baseUrl = check storage:buildManagementBaseUrl(
            validated.runtime.managementHostname,
            validated.runtime.managementPort
        );

        // Create management API client
        http:Client|error mgmtClientResult = artifactsApiAllowInsecureTLS
            ? new (baseUrl, {secureSocket: {enable: false}})
            : new (baseUrl);

        if mgmtClientResult is error {
            log:printError("Failed to create management API client for runtime",
                runtimeId = validated.runtimeId,
                'error = mgmtClientResult);
            failureCount += 1;
            continue;
        }

        // Generate HMAC token
        string|error hmacTokenResult = storage:issueRuntimeHmacToken(validated.runtimeId);

        if hmacTokenResult is error {
            log:printError("Failed to generate HMAC token for runtime",
                runtimeId = validated.runtimeId,
                'error = hmacTokenResult);
            failureCount += 1;
            continue;
        }

        string hmacToken = hmacTokenResult;

        // Build request - only include loggerClass if provided (for adding new logger)
        // If loggerClass is not provided, we're updating an existing logger
        types:MgmtUpdateLoggerRequest request;
        string? loggerClass = input?.loggerClass;
        if loggerClass is string && loggerClass.trim().length() > 0 {
            // Adding new logger - include loggerClass
            request = {
                loggerName: loggerName,
                loggingLevel: logLevelStr,
                loggerClass: loggerClass
            };
        } else {
            // Updating existing logger - don't include loggerClass
            request = {
                loggerName: loggerName,
                loggingLevel: logLevelStr
            };
        }

        // Call MI management API to update logger
        types:MgmtUpdateLoggerResponse|error updateResult = mi_management:updateLogger(
            mgmtClientResult,
            hmacToken,
            request
        );

        if updateResult is error {
            log:printError("Failed to update logger on runtime",
                runtimeId = validated.runtimeId,
                loggerName = loggerName,
                'error = updateResult);
            failureCount += 1;
        } else {
            log:printInfo("Successfully updated logger on runtime",
                runtimeId = validated.runtimeId,
                loggerName = loggerName,
                logLevel = logLevelStr);
            successCount += 1;
        }
    }

    if successCount == 0 {
        return {
            success: false,
            message: string `Failed to update logger ${loggerName} on all ${failureCount} runtime(s)`,
            commandIds: []
        };
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
    cors: {
        allowOrigins: ["*"]
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
        log:printInfo("GraphQL service started at " + serverHost + ":" + graphqlPort.toString());
    }

    // ----------- Runtime Resources
    // Get all runtimes with optional filtering
    // componentId is now optional - if not provided, returns all runtimes in the project
    isolated resource function get runtimes(graphql:Context context, string? status, string? runtimeType, string? environmentId, string? projectId, string? componentId) returns types:Runtime[]|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Step 1: Determine the actual projectId
        string actualProjectId = projectId ?: "";

        // If componentId is provided and projectId is not, infer projectId from componentId
        if componentId is string && actualProjectId == "" {
            string|error projectIdResult = storage:getProjectIdByComponentId(componentId);
            if projectIdResult is error {
                return []; // Component not found
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
                return [];
            }
            return check storage:getRuntimes(status, runtimeType, environmentId, (), componentId);
        }

        // If projectId is still empty and no environmentId, we cannot proceed
        if actualProjectId == "" {
            return error("Either projectId or componentId must be provided");
        }

        // Step 3: If environmentId is specified, check access to that specific environment
        if environmentId is string {
            // Build scope with project, optional integration, and environment
            types:AccessScope scope = auth:buildScopeFromContext(actualProjectId, integrationId = componentId, envId = environmentId);

            // Check if user has permission to view this integration/project in this environment
            if !check auth:hasAnyPermission(userContext.userId,
                    [auth:PERMISSION_INTEGRATION_VIEW, auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
                return []; // No access to this integration/project in this environment
            }

            // Fetch runtimes for the specified environment
            return check storage:getRuntimes(status, runtimeType, environmentId, actualProjectId, componentId);
        }

        // Step 4: If environmentId is NOT specified, resolve accessible environments
        auth:EnvironmentAccessInfo envAccess = check auth:resolveEnvironmentAccess(
                userContext.userId,
                projectId = actualProjectId,
                integrationId = componentId
        );

        // If no restriction, user can access all environments - fetch all runtimes
        if !envAccess.hasRestriction {
            return check storage:getRuntimes(status, runtimeType, (), actualProjectId, componentId);
        }

        // If blocked (empty allowed list), return empty
        string[]? allowedEnvs = envAccess.allowedEnvironments;
        if allowedEnvs is () || allowedEnvs.length() == 0 {
            return [];
        }

        // Fetch runtimes for each allowed environment and combine
        types:Runtime[] allRuntimes = [];
        foreach string envId in allowedEnvs {
            types:Runtime[] envRuntimes = check storage:getRuntimes(status, runtimeType, envId, actualProjectId, componentId);
            allRuntimes.push(...envRuntimes);
        }

        return allRuntimes;
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
    isolated resource function get services(graphql:Context context, string runtimeId) returns types:Service[]|error {
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
            return [];
        }

        return check storage:getServicesForRuntime(runtimeId);
    }

    // Get services for a specific environment and component
    isolated resource function get servicesByEnvironmentAndComponent(graphql:Context context, string environmentId, string componentId) returns types:Service[]|error {
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
            return [];
        }

        types:Service[] result = check storage:getServicesByEnvironmentAndComponent(environmentId, componentId);
        if result.length() == 0 { return result; }
        map<map<types:ArtifactStateField>> sm = check storage:queryArtifactState(componentId, environmentId);
        foreach types:Service a in result {
            string qualName = types:qualifiedArtifactName(a.name, a.package);
            types:ArtifactStateField? s = stateOf(sm, qualName, "service", "status");
            if s is types:ArtifactStateField { a.state = <types:ArtifactState>s.value; a.stateInSync = s.inSync; }
        }
        return result;
    }

    // Get listeners for a specific runtime
    isolated resource function get listeners(graphql:Context context, string runtimeId) returns types:Listener[]|error {
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
            return [];
        }

        return check storage:getListenersForRuntime(runtimeId);
    }

    // Get listeners for a specific environment and component
    isolated resource function get listenersByEnvironmentAndComponent(graphql:Context context, string environmentId, string componentId) returns types:Listener[]|error {
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
            return [];
        }

        types:Listener[] result = check storage:getListenersByEnvironmentAndComponent(environmentId, componentId);
        if result.length() == 0 { return result; }
        map<map<types:ArtifactStateField>> sm = check storage:queryArtifactState(componentId, environmentId);
        foreach types:Listener a in result {
            string qualName = types:qualifiedArtifactName(a.name, a.package);
            types:ArtifactStateField? s = stateOf(sm, qualName, "listener", "status");
            if s is types:ArtifactStateField { a.state = <types:ArtifactState>s.value; a.stateInSync = s.inSync; }
        }
        return result;
    }

    // Get automation artifacts for a specific environment and component
    isolated resource function get automationsByEnvironmentAndComponent(graphql:Context context, string environmentId, string componentId) returns types:Automation[]|error {
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
            return [];
        }

        return check storage:getAutomationsByEnvironmentAndComponent(environmentId, componentId);
    }

    // Get REST APIs for a specific environment and component
    isolated resource function get restApisByEnvironmentAndComponent(graphql:Context context, string environmentId, string componentId) returns types:RestApi[]|error {
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
            return [];
        }

        types:RestApi[] result = check storage:getRestApisByEnvironmentAndComponent(environmentId, componentId);
        if result.length() == 0 { return result; }
        map<map<types:ArtifactStateField>> sm = check storage:queryArtifactState(componentId, environmentId);
        foreach types:RestApi a in result {
            types:ArtifactStateField? s = stateOf(sm, a.name, "api", "status");
            if s is types:ArtifactStateField { a.state = <types:ArtifactState>s.value; a.stateInSync = s.inSync; }
            types:ArtifactStateField? t = stateOf(sm, a.name, "api", "tracing");
            if t is types:ArtifactStateField { a.tracing = t.value; a.tracingInSync = t.inSync; }
            types:ArtifactStateField? st = stateOf(sm, a.name, "api", "statistics");
            if st is types:ArtifactStateField { a.statistics = st.value; a.statisticsInSync = st.inSync; }
        }
        return result;
    }

    // Get Carbon Apps for a specific environment and component
    isolated resource function get carbonAppsByEnvironmentAndComponent(graphql:Context context, string environmentId, string componentId) returns types:CarbonApp[]|error {
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
            log:printWarn("Attempt to access component Carbon Apps without permission", userId = userContext.userId, environmentId = environmentId, componentId = componentId);
            return [];
        }

        return check storage:getCarbonAppsByEnvironmentAndComponent(environmentId, componentId);
    }

    // Get Inbound Endpoints for a specific environment and component
    isolated resource function get inboundEndpointsByEnvironmentAndComponent(graphql:Context context, string environmentId, string componentId) returns types:InboundEndpoint[]|error {
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
            return [];
        }

        types:InboundEndpoint[] result = check storage:getInboundEndpointsByEnvironmentAndComponent(environmentId, componentId);
        if result.length() == 0 { return result; }
        map<map<types:ArtifactStateField>> sm = check storage:queryArtifactState(componentId, environmentId);
        foreach types:InboundEndpoint a in result {
            types:ArtifactStateField? s = stateOf(sm, a.name, "inbound-endpoint", "status");
            if s is types:ArtifactStateField { a.state = <types:ArtifactState>s.value; a.stateInSync = s.inSync; }
            types:ArtifactStateField? t = stateOf(sm, a.name, "inbound-endpoint", "tracing");
            if t is types:ArtifactStateField { a.tracing = t.value; a.tracingInSync = t.inSync; }
            types:ArtifactStateField? st = stateOf(sm, a.name, "inbound-endpoint", "statistics");
            if st is types:ArtifactStateField { a.statistics = st.value; a.statisticsInSync = st.inSync; }
        }
        return result;
    }

    // Get Endpoints for a specific environment and component
    isolated resource function get endpointsByEnvironmentAndComponent(graphql:Context context, string environmentId, string componentId) returns types:Endpoint[]|error {
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
            return [];
        }

        types:Endpoint[] result = check storage:getEndpointsByEnvironmentAndComponent(environmentId, componentId);
        if result.length() == 0 { return result; }
        map<map<types:ArtifactStateField>> sm = check storage:queryArtifactState(componentId, environmentId);
        foreach types:Endpoint a in result {
            types:ArtifactStateField? s = stateOf(sm, a.name, "endpoint", "status");
            if s is types:ArtifactStateField { a.state = <types:ArtifactState>s.value; a.stateInSync = s.inSync; }
            types:ArtifactStateField? t = stateOf(sm, a.name, "endpoint", "tracing");
            if t is types:ArtifactStateField { a.tracing = t.value; a.tracingInSync = t.inSync; }
            types:ArtifactStateField? st = stateOf(sm, a.name, "endpoint", "statistics");
            if st is types:ArtifactStateField { a.statistics = st.value; a.statisticsInSync = st.inSync; }
        }
        return result;
    }

    // Get Sequences for a specific environment and component
    isolated resource function get sequencesByEnvironmentAndComponent(graphql:Context context, string environmentId, string componentId) returns types:Sequence[]|error {
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
            return [];
        }

        types:Sequence[] result = check storage:getSequencesByEnvironmentAndComponent(environmentId, componentId);
        if result.length() == 0 { return result; }
        map<map<types:ArtifactStateField>> sm = check storage:queryArtifactState(componentId, environmentId);
        foreach types:Sequence a in result {
            types:ArtifactStateField? s = stateOf(sm, a.name, "sequence", "status");
            if s is types:ArtifactStateField { a.state = <types:ArtifactState>s.value; a.stateInSync = s.inSync; }
            types:ArtifactStateField? t = stateOf(sm, a.name, "sequence", "tracing");
            if t is types:ArtifactStateField { a.tracing = t.value; a.tracingInSync = t.inSync; }
            types:ArtifactStateField? st = stateOf(sm, a.name, "sequence", "statistics");
            if st is types:ArtifactStateField { a.statistics = st.value; a.statisticsInSync = st.inSync; }
        }
        return result;
    }

    // Get Proxy Services for a specific environment and component
    isolated resource function get proxyServicesByEnvironmentAndComponent(graphql:Context context, string environmentId, string componentId) returns types:ProxyService[]|error {
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
            return [];
        }

        types:ProxyService[] result = check storage:getProxyServicesByEnvironmentAndComponent(environmentId, componentId);
        if result.length() == 0 { return result; }
        map<map<types:ArtifactStateField>> sm = check storage:queryArtifactState(componentId, environmentId);
        foreach types:ProxyService a in result {
            types:ArtifactStateField? s = stateOf(sm, a.name, "proxy-service", "status");
            if s is types:ArtifactStateField { a.state = <types:ArtifactState>s.value; a.stateInSync = s.inSync; }
            types:ArtifactStateField? t = stateOf(sm, a.name, "proxy-service", "tracing");
            if t is types:ArtifactStateField { a.tracing = t.value; a.tracingInSync = t.inSync; }
            types:ArtifactStateField? st = stateOf(sm, a.name, "proxy-service", "statistics");
            if st is types:ArtifactStateField { a.statistics = st.value; a.statisticsInSync = st.inSync; }
        }
        return result;
    }

    // Get Tasks for a specific environment and component
    isolated resource function get tasksByEnvironmentAndComponent(graphql:Context context, string environmentId, string componentId) returns types:Task[]|error {
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
            return [];
        }

        types:Task[] result = check storage:getTasksByEnvironmentAndComponent(environmentId, componentId);
        if result.length() == 0 { return result; }
        map<map<types:ArtifactStateField>> sm = check storage:queryArtifactState(componentId, environmentId);
        foreach types:Task a in result {
            types:ArtifactStateField? s = stateOf(sm, a.name, "task", "status");
            if s is types:ArtifactStateField { a.state = <types:ArtifactState>s.value; a.stateInSync = s.inSync; }
        }
        return result;
    }

    // Get Templates for a specific environment and component
    isolated resource function get templatesByEnvironmentAndComponent(graphql:Context context, string environmentId, string componentId) returns types:Template[]|error {
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
            return [];
        }

        return check storage:getTemplatesByEnvironmentAndComponent(environmentId, componentId);
    }

    // Get Message Stores for a specific environment and component
    isolated resource function get messageStoresByEnvironmentAndComponent(graphql:Context context, string environmentId, string componentId) returns types:MessageStore[]|error {
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
            return [];
        }

        types:MessageStore[] result = check storage:getMessageStoresByEnvironmentAndComponent(environmentId, componentId);
        if result.length() == 0 { return result; }
        map<map<types:ArtifactStateField>> sm = check storage:queryArtifactState(componentId, environmentId);
        foreach types:MessageStore a in result {
            types:ArtifactStateField? s = stateOf(sm, a.name, "message-store", "status");
            if s is types:ArtifactStateField { a.state = <types:ArtifactState>s.value; a.stateInSync = s.inSync; }
        }
        return result;
    }

    // Get Message Processors for a specific environment and component
    isolated resource function get messageProcessorsByEnvironmentAndComponent(graphql:Context context, string environmentId, string componentId) returns types:MessageProcessor[]|error {
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
            return [];
        }

        types:MessageProcessor[] result = check storage:getMessageProcessorsByEnvironmentAndComponent(environmentId, componentId);
        if result.length() == 0 { return result; }
        map<map<types:ArtifactStateField>> sm = check storage:queryArtifactState(componentId, environmentId);
        foreach types:MessageProcessor a in result {
            types:ArtifactStateField? s = stateOf(sm, a.name, "message-processor", "status");
            if s is types:ArtifactStateField { a.state = <types:ArtifactState>s.value; a.stateInSync = s.inSync; }
        }
        return result;
    }

    // Get Local Entries for a specific environment and component
    isolated resource function get localEntriesByEnvironmentAndComponent(graphql:Context context, string environmentId, string componentId) returns types:LocalEntry[]|error {
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
            return [];
        }

        types:LocalEntry[] result = check storage:getLocalEntriesByEnvironmentAndComponent(environmentId, componentId);
        if result.length() == 0 { return result; }
        map<map<types:ArtifactStateField>> sm = check storage:queryArtifactState(componentId, environmentId);
        foreach types:LocalEntry a in result {
            types:ArtifactStateField? s = stateOf(sm, a.name, "local-entry", "status");
            if s is types:ArtifactStateField { a.state = <types:ArtifactState>s.value; a.stateInSync = s.inSync; }
        }
        return result;
    }

    // Get Data Services for a specific environment and component
    isolated resource function get dataServicesByEnvironmentAndComponent(graphql:Context context, string environmentId, string componentId) returns types:DataService[]|error {
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
            return [];
        }

        types:DataService[] result = check storage:getDataServicesByEnvironmentAndComponent(environmentId, componentId);
        if result.length() == 0 { return result; }
        map<map<types:ArtifactStateField>> sm = check storage:queryArtifactState(componentId, environmentId);
        foreach types:DataService a in result {
            types:ArtifactStateField? s = stateOf(sm, a.name, "data-service", "status");
            if s is types:ArtifactStateField { a.state = <types:ArtifactState>s.value; a.stateInSync = s.inSync; }
        }
        return result;
    }

    // Get Data Sources for a specific environment and component
    isolated resource function get dataSourcesByEnvironmentAndComponent(graphql:Context context, string environmentId, string componentId) returns types:DataSource[]|error {
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
            return [];
        }

        return check storage:getDataSourcesByEnvironmentAndComponent(environmentId, componentId);
    }

    // Get Registry Resources for a specific environment and component
    isolated resource function get registryResourcesByEnvironmentAndComponent(graphql:Context context, string environmentId, string componentId) returns types:RegistryResource[]|error {
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
            return [];
        }

        return check storage:getRegistryResourcesByEnvironmentAndComponent(environmentId, componentId);
    }

    // Get Connectors for a specific environment and component
    isolated resource function get connectorsByEnvironmentAndComponent(graphql:Context context, string environmentId, string componentId) returns types:Connector[]|error {
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
            return [];
        }

        types:Connector[] result = check storage:getConnectorsByEnvironmentAndComponent(environmentId, componentId);
        if result.length() == 0 { return result; }
        map<map<types:ArtifactStateField>> sm = check storage:queryArtifactState(componentId, environmentId);
        foreach types:Connector a in result {
            types:ArtifactStateField? s = stateOf(sm, a.name, "connector", "status");
            if s is types:ArtifactStateField { a.state = <types:ArtifactState>s.value; a.stateInSync = s.inSync; }
        }
        return result;
    }

    // Get loggers for a specific runtime
    isolated resource function get loggersByRuntime(graphql:Context context, string runtimeId) returns types:Logger[]|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Fetch the runtime to get its context for authorization
        types:Runtime? runtime = check storage:getRuntimeById(runtimeId);

        if runtime is () {
            log:printWarn("Runtime not found for loggers query", userId = userContext.userId, runtimeId = runtimeId);
            return [];
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
            return [];
        }

        // Check component type to determine data source
        types:RuntimeType componentType = runtime.component.componentType;

        if componentType == types:MI {
            // MI: Fetch loggers from management API
            return check fetchMILoggersByRuntime(runtimeId, runtime);
        } else {
            // BI: Fetch loggers from database
            return check fetchBILoggersByRuntime(runtimeId);
        }
    }

    // Get loggers for a specific environment and component, grouped by component name
    isolated resource function get loggersByEnvironmentAndComponent(graphql:Context context, string environmentId, string componentId) returns types:LoggerGroup[]|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Get component to check its type
        types:Component? component = check storage:getComponentById(componentId);
        if component is () {
            log:printWarn("Component not found for loggers query", userId = userContext.userId, componentId = componentId);
            return [];
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
            return [];
        }

        // Check component type to determine data source
        types:RuntimeType componentType = component.componentType;

        if componentType == types:MI {
            // MI: Fetch loggers from management API for all runtimes
            return check fetchMILoggersByEnvironmentAndComponent(environmentId, componentId, component.projectId);
        } else {
            // BI: Fetch loggers from database for all runtimes
            return check storage:getLoggersByEnvironmentAndComponent(environmentId, componentId);
        }
    }

    // Get log files for a specific runtime
    isolated resource function get logFilesByRuntime(graphql:Context context, string runtimeId, string? searchKey = ()) returns types:LogFilesResponse|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Fetch the runtime to get its context for authorization
        types:Runtime? runtime = check storage:getRuntimeById(runtimeId);

        if runtime is () {
            log:printWarn("Runtime not found for log files query", userId = userContext.userId, runtimeId = runtimeId);
            return {count: 0, files: []};
        }

        // Build scope from runtime's context
        types:AccessScope scope = auth:buildScopeFromContext(
                runtime.component.projectId,
                runtime.component.id,
                runtime.environment.id
        );

        // Verify user has view, edit, or manage permission
        if !check auth:hasAnyPermission(userContext.userId, [auth:PERMISSION_INTEGRATION_VIEW, auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
            log:printWarn("Attempt to access runtime log files without permission", userId = userContext.userId, runtimeId = runtimeId);
            return {count: 0, files: []};
        }

        // Check if runtime is online
        if runtime.status != types:RUNNING {
            log:printWarn("Runtime is not online for log files query", userId = userContext.userId, runtimeId = runtimeId, status = runtime.status);
            return error("Runtime is not online");
        }

        // Create HTTP client for MI management API
        string baseUrl = check storage:buildManagementBaseUrl(runtime.managementHostname, runtime.managementPort);
        http:Client mgmtClient = check (artifactsApiAllowInsecureTLS
            ? new (baseUrl, {secureSocket: {enable: false}})
            : new (baseUrl));

        // Generate HMAC token for authentication
        string hmacToken = check storage:issueRuntimeHmacToken(runtimeId);

        // Fetch log files from MI management API
        types:MgmtLogFilesResponse mgmtResponse = check mi_management:fetchLogFiles(mgmtClient, hmacToken, searchKey);

        // Transform to GraphQL response format
        types:LogFile[] logFiles = from var item in mgmtResponse.list
            select {fileName: item.FileName, size: item.Size};

        return {count: mgmtResponse.count, files: logFiles};
    }

    // Get log file content for a specific runtime and file name
    isolated resource function get logFileContent(graphql:Context context, string runtimeId, string fileName) returns string|error {
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
        if trimmedFileName.startsWith("/") {
            log:printWarn("File name starts with absolute path marker", userId = userContext.userId, runtimeId = runtimeId, fileName = fileName);
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

        // Fetch the runtime to get its context for authorization
        types:Runtime? runtime = check storage:getRuntimeById(runtimeId);

        if runtime is () {
            log:printWarn("Runtime not found for log file content query", userId = userContext.userId, runtimeId = runtimeId);
            return error("Unable to retrieve log file content");
        }

        // Build scope from runtime's context
        types:AccessScope scope = auth:buildScopeFromContext(
                runtime.component.projectId,
                runtime.component.id,
                runtime.environment.id
        );

        // Verify user has view, edit, or manage permission
        if !check auth:hasAnyPermission(userContext.userId, [auth:PERMISSION_INTEGRATION_VIEW, auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
            log:printWarn("Attempt to access runtime log file content without permission", userId = userContext.userId, runtimeId = runtimeId, fileName = fileName);
            return error("Unable to retrieve log file content");
        }

        // Check if runtime is online
        if runtime.status != types:RUNNING {
            log:printWarn("Runtime is not online for log file content query", userId = userContext.userId, runtimeId = runtimeId, status = runtime.status);
            return error("Runtime is not online");
        }

        // Create HTTP client for MI management API
        string baseUrl = check storage:buildManagementBaseUrl(runtime.managementHostname, runtime.managementPort);
        http:Client mgmtClient = check (artifactsApiAllowInsecureTLS
            ? new (baseUrl, {secureSocket: {enable: false}})
            : new (baseUrl));

        // Generate HMAC token for authentication
        string hmacToken = check storage:issueRuntimeHmacToken(runtimeId);

        // Fetch log file content from MI management API
        return check mi_management:fetchLogFileContent(mgmtClient, hmacToken, fileName);
    }

    isolated resource function get registryDirectory(graphql:Context context, string runtimeId, string path, boolean? expand = ()) returns types:RegistryDirectoryResponse|error {
        types:UserContextV2 userContext = check extractUserContext(context);
        types:ValidatedRegistryAccess validated = check validateRegistryResourceAccess(userContext, runtimeId, path, "registry directory");
        types:RegistryApiClient apiClient = check mi_management:createRegistryManagementClient(validated.runtime, runtimeId, artifactsApiAllowInsecureTLS);
        return check mi_management:fetchRegistryDirectory(apiClient.mgmtClient, apiClient.hmacToken, validated.trimmedPath, expand);
    }

    isolated resource function get registryFileContent(graphql:Context context, string runtimeId, string path) returns string|error {
        types:UserContextV2 userContext = check extractUserContext(context);
        types:ValidatedRegistryAccess validated = check validateRegistryResourceAccess(userContext, runtimeId, path, "registry file content");
        types:RegistryApiClient apiClient = check mi_management:createRegistryManagementClient(validated.runtime, runtimeId, artifactsApiAllowInsecureTLS);
        return check mi_management:fetchRegistryFileContent(apiClient.mgmtClient, apiClient.hmacToken, validated.trimmedPath);
    }

    isolated resource function get registryResourceMetadata(graphql:Context context, string runtimeId, string path) returns types:RegistryResourceMetadata|error {
        types:UserContextV2 userContext = check extractUserContext(context);
        types:ValidatedRegistryAccess validated = check validateRegistryResourceAccess(userContext, runtimeId, path, "registry resource metadata");
        types:RegistryApiClient apiClient = check mi_management:createRegistryManagementClient(validated.runtime, runtimeId, artifactsApiAllowInsecureTLS);
        return check mi_management:fetchRegistryResourceMetadata(apiClient.mgmtClient, apiClient.hmacToken, validated.trimmedPath);
    }

    isolated resource function get registryResourceProperties(graphql:Context context, string runtimeId, string path) returns types:RegistryPropertiesResponse|error {
        types:UserContextV2 userContext = check extractUserContext(context);
        types:ValidatedRegistryAccess validated = check validateRegistryResourceAccess(userContext, runtimeId, path, "registry resource properties");
        types:RegistryApiClient apiClient = check mi_management:createRegistryManagementClient(validated.runtime, runtimeId, artifactsApiAllowInsecureTLS);
        return check mi_management:fetchRegistryResourceProperties(apiClient.mgmtClient, apiClient.hmacToken, validated.trimmedPath);
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

        check sync:reconcileDeleteRuntime(runtimeId);
        check storage:deleteRuntime(runtimeId);
        log:printInfo(string `deleteRuntime: deleted runtimeId=${runtimeId}`, userId = userContext.userId);

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

        return {
            success: true,
            message: string `Listener ${input.listenerName} state change dispatched to ${input.runtimeIds.length()} runtime(s)`,
            commandIds: []
        };
    }

    // Update log level for BI and MI runtimes
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
        if componentType == types:MI {
            return check updateLogLevelMI(userContext, input);
        } else {
            return check updateLogLevelBI(userContext, input);
        }
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
        return storage:createEnvironment(environment);
    }

    // Get all environments (filtered by user's accessible environments via RBAC)
    // Note: orgUuid, type, and projectId parameters are accepted for frontend compatibility
    // but ignored since environments are global (not org-specific)
    isolated resource function get environments(graphql:Context context, string? orgUuid, string? 'type, string? projectId) returns types:Environment[]|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Get user's accessible environments (filtered by role mappings)
        // If user has any role mapping, they can see environments within their scope
        types:UserEnvironmentAccess[] accessibleEnvs =
            check storage:getUserEnvironmentRestrictions(userContext.userId);

        // Check if user has any access at all
        if accessibleEnvs.length() == 0 {
            log:printWarn("Attempt to access environments without role mappings", userId = userContext.userId);
            return [];
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

        return environments;
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

        check sync:reconcileDeleteEnvironment(environmentId);
        check storage:deleteEnvironment(environmentId);
        return true;
    }

    // Update environment name, description, and/or critical status (requires management permission)
    isolated remote function updateEnvironment(graphql:Context context, string environmentId, string? name, string? description, boolean? critical) returns types:Environment?|error {
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

        check storage:updateEnvironment(environmentId, name, description, critical);
        return check storage:getEnvironmentById(environmentId);
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
        return check storage:getEnvironmentById(environmentId);
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
        return check storage:createProject(project, userContext);
    }

    // Get all projects (filtered by user's accessible projects via RBAC v2)
    isolated resource function get projects(graphql:Context context, int? orgId) returns types:Project[]|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Get accessible projects via access resolver
        // This returns all projects where user has ANY role assignment (any permission domain)
        // Includes users who only have observability_mgt:view_logs or other non-project permissions
        types:UserProjectAccess[] accessibleProjects =
            check auth:getAccessibleProjects(userContext.userId);

        if accessibleProjects.length() == 0 {
            return []; // User has no project access
        }

        string[] accessibleProjectIds = accessibleProjects.map(p => p.projectUuid);

        // Fetch only accessible projects with SQL IN clause (efficient DB filtering)
        types:Project[] filteredProjects =
            check storage:getProjectsByIds(accessibleProjectIds, orgId);

        return filteredProjects;
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
        log:printInfo("Fetching project by handler", orgId = orgId, projectHandler = projectHandler);
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
        log:printInfo("Successfully retrieved project", projectId = projectId);
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
        return result;
    }

    // Get all components with optional project filter
    isolated resource function get components(graphql:Context context, string orgHandler, string? projectId, types:ComponentOptionsInput? options) returns types:Component[]|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Get accessible integrations (with optional project filter)
        // This returns integrations where user has ANY role assignment (permission-agnostic)
        types:UserIntegrationAccess[] accessibleIntegrations =
            check storage:getUserAccessibleIntegrations(userContext.userId, projectId);

        // Extract integration IDs
        string[] integrationIds = accessibleIntegrations.map(i => i.integrationUuid);

        // Return empty if no access
        if integrationIds.length() == 0 {
            return [];
        }

        return check storage:getComponentsByIds(integrationIds);
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

        // 4. Clean up orphaned reconcile state for all linked environments
        string[] reconcileEnvIds = check storage:getReconcileEnvIdsForComponent(componentId);
        foreach string envId in reconcileEnvIds {
            check sync:reconcileDeleteComponent(componentId, envId);
        }

        // 5. Perform deletion
        error? deleteResult = storage:deleteComponent(componentId);
        if deleteResult is error {
            return {
                status: "FAILED",
                canDelete: false,
                message: string `Deletion failed: ${deleteResult.message()}`,
                encodedData: ""
            };
        }

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
        check storage:updateComponent(targetComponentId, targetName, targetDisplayName, targetDescription, userContext.userId);
        return check storage:getComponentById(targetComponentId);
    }

    // Change artifact status (active/inactive) for all MI runtimes of a component
    remote function updateArtifactStatus(graphql:Context context, types:ArtifactStatusChangeInput input) returns types:ArtifactStatusChangeResponse|error {
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

        types:ReconcileArtifactKey artifact = {artifactName: input.artifactName, artifactType: input.artifactType};
        map<string> desiredProps = {"status": input.status == "active" ? "enabled" : "disabled"};
        [int, int] counts = check reconcilePerEnv(runtimes, input.componentId, artifact, desiredProps, sync:dispatchMI);

        return {
            status: counts[1] == 0 ? types:SUCCESS : types:FAILED,
            message: string `Artifact status change dispatched to ${counts[0] + counts[1]} runtime(s)`,
            successCount: counts[0],
            failedCount: counts[1],
            details: []
        };
    }

    // Mutation to change artifact tracing (enable/disable)
    remote function updateArtifactTracingStatus(graphql:Context context, types:ArtifactTracingChangeInput input) returns types:ArtifactTracingChangeResponse|error {
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

        types:ReconcileArtifactKey artifact = {artifactName: input.artifactName, artifactType: input.artifactType};
        map<string> desiredProps = {"tracing": input.trace == "enable" ? "enabled" : "disabled"};
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
    remote function updateArtifactStatisticsStatus(graphql:Context context, types:ArtifactStatisticsChangeInput input) returns types:ArtifactStatisticsChangeResponse|error {
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

        string[] supportedTypes = ["proxy-service", "endpoint", "api", "sequence", "inbound-endpoint", "template"];
        boolean isSupported = supportedTypes.indexOf(input.artifactType) != ();
        if !isSupported {
            return error(string `Artifact type '${input.artifactType}' does not support statistics. Supported types: ProxyService, Endpoint, RestApi, Sequence, InboundEndpoint, Template`);
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

        types:ReconcileArtifactKey artifact = {artifactName: input.artifactName, artifactType: input.artifactType};
        map<string> desiredProps = {"statistics": input.statistics == "enable" ? "enabled" : "disabled"};
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

    isolated resource function get orgSecrets(graphql:Context context, string? environmentId) returns types:OrgSecretListEntry[]|error {
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

        return check storage:listOrgSecrets(environmentId);
    }

    isolated resource function get componentSecrets(graphql:Context context, string componentId, string environmentId) returns types:BoundSecretEntry[]|error {
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

        return check storage:listBoundSecrets(componentId, environmentId);
    }

    isolated remote function createOrgSecret(graphql:Context context, string environmentId) returns string|error {
        types:UserContextV2 userContext = check extractUserContext(context);
        log:printDebug(string `createOrgSecret by user=${userContext.userId}, environment=${environmentId}`);

        check authorizeEnvironmentAccess(userContext.userId, environmentId, "create org secrets");

        string secret = check storage:createOrgSecret(environmentId, userContext.userId);
        log:printInfo(string `Org secret created for environment=${environmentId}`, userId = userContext.userId);
        return secret;
    }

    isolated remote function revokeOrgSecret(graphql:Context context, string keyId) returns boolean|error {
        types:UserContextV2 userContext = check extractUserContext(context);
        log:printDebug(string `revokeOrgSecret by user=${userContext.userId}, keyId=${keyId}`);

        types:OrgSecret secret = check storage:lookupOrgSecretByKeyId(keyId);
        check authorizeEnvironmentAccess(userContext.userId, secret.environmentId, "revoke org secrets");

        check storage:revokeOrgSecret(keyId);
        log:printInfo(string `Org secret revoked keyId=${keyId}`, userId = userContext.userId);
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
    ) returns string|error {
        value:Cloneable|error|isolated object {} authHeader = context.get("Authorization");
        if authHeader !is string {
            return error("Authorization header missing in request");
        }

        // Extract user context for RBAC
        types:UserContextV2 userContext = check auth:extractUserContextV2(authHeader);

        // Get component to verify access
        types:Component? component = check storage:getComponentById(componentId);
        if component is () {
            return error("Integration not found");
        }

        // Verify user has the permisions
        types:AccessScope scope = auth:buildScopeFromContext(component.projectId, integrationId = componentId, envId = environmentId);
        if !check auth:hasAnyPermission(userContext.userId,
                ["integration_mgt:view", "integration_mgt:edit", "integration_mgt:manage"], scope) {
            return error("Insufficient permissions to view component artifacts");
        }

        // Get runtimes and select one using shared helper
        types:Runtime[] runtimes = check storage:getRuntimes((), (), environmentId, component.projectId, componentId);
        types:Runtime runtime = check utils:selectRuntime(runtimes, componentId, environmentId, runtimeId);

        // Build management API base URL
        string baseUrl = check storage:buildManagementBaseUrl(runtime.managementHostname, runtime.managementPort);

        log:printInfo("Fetching artifact from runtime management API",
                runtimeId = runtime.runtimeId,
                managementUrl = baseUrl,
                artifactType = artifactType,
                artifactName = artifactName);

        // Create management API client (toggle insecure TLS via configuration)
        http:Client|error mgmtClientResult = artifactsApiAllowInsecureTLS
            ? new (baseUrl, {secureSocket: {enable: false}})
            : new (baseUrl);
        if mgmtClientResult is error {
            log:printError("Failed to create management API client", mgmtClientResult);
            return error("Failed to create management API client");
        }
        // Generate an HMAC JWT (same mechanism as heartbeat) to call the ICP internal API
        string hmacToken = check storage:issueRuntimeHmacToken(runtime.runtimeId);

        // Fetch artifact metadata via MI Management API (/management/...)
        log:printDebug("Fetching artifact details via MI management API",
                runtimeId = runtime.runtimeId,
                managementUrl = baseUrl,
                artifactType = artifactType,
                artifactName = artifactName
        );
        string artifactDetails = check mi_management:getArtifactSource(
                mgmtClientResult, hmacToken, artifactType, artifactName, packageName, templateType);

        log:printInfo("Successfully fetched artifact details from MI management API",
                runtimeId = runtime.runtimeId,
                artifactType = artifactType,
                artifactName = artifactName,
                responseLength = artifactDetails.length());
        return artifactDetails;
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
    ) returns string|error {
        value:Cloneable|error|isolated object {} authHeader = context.get("Authorization");
        if authHeader !is string {
            return error("Authorization header missing in request");
        }

        // Extract user context for RBAC
        types:UserContextV2 userContext = check auth:extractUserContextV2(authHeader);

        // Get component to verify access
        types:Component? component = check storage:getComponentById(componentId);
        if component is () {
            return error("Integration not found");
        }

        // Verify user has the permissions
        types:AccessScope scope = auth:buildScopeFromContext(component.projectId, integrationId = componentId, envId = environmentId);
        if !check auth:hasAnyPermission(userContext.userId,
                ["integration_mgt:view", "integration_mgt:edit", "integration_mgt:manage"], scope) {
            return error("Insufficient permissions to view component artifacts");
        }

        // Get runtimes for this component (optionally filtered by environment if environmentId !is ())
        types:Runtime[] runtimes = check storage:getRuntimes((), (), environmentId, component.projectId, componentId);
        if runtimes.length() == 0 {
            return error("No runtimes found for this component");
        }

        // Select runtime using shared helper
        types:Runtime runtime = check utils:selectRuntime(runtimes, componentId, environmentId, runtimeId);

        // Build management API base URL
        string baseUrl = check storage:buildManagementBaseUrl(runtime.managementHostname, runtime.managementPort);

        // Normalize artifact type
        log:printInfo("Fetching artifact WSDL via MI management API",
                runtimeId = runtime.runtimeId,
                managementUrl = baseUrl,
                artifactType = artifactType,
                artifactName = artifactName);

        // Create MI management API client (toggle insecure TLS via configuration)
        http:Client|error mgmtClientResult = artifactsApiAllowInsecureTLS
            ? new (baseUrl, {secureSocket: {enable: false}})
            : new (baseUrl);
        if mgmtClientResult is error {
            log:printError("Failed to create management API client", mgmtClientResult);
            return error("Failed to create management API client");
        }
        http:Client mgmtClient = mgmtClientResult;
        log:printDebug("Successfully created management API client",
                runtimeId = runtime.runtimeId,
                baseUrl = baseUrl);

        // Generate an HMAC JWT to call the ICP internal API
        string hmacToken = check storage:issueRuntimeHmacToken(runtime.runtimeId);

        // Step 1: Retrieve the WSDL URL from the MI Management API
        // (management API returns wsdl1_1 / wsdl2_0 URLs, not the WSDL content directly)
        types:MgmtProxyServiceInfo fetchProxyServiceArtifact = check mi_management:fetchProxyServiceArtifact(mgmtClient, hmacToken, artifactName);
        string? wsdlUrl = fetchProxyServiceArtifact?.wsdl1_1;
        log:printDebug("Retrieved WSDL URL from MI management API",
                runtimeId = runtime.runtimeId,
                artifactType = artifactType,
                artifactName = artifactName,
                wsdlUrl = wsdlUrl);
        if wsdlUrl is () {
            return error("WSDL URL not found for this artifact");
        }

        // Step 2: Fetch the actual WSDL XML content from the URL
        // The WSDL URL is typically on the MI HTTP service port (e.g. :8290), not the management port
        // Pass the trusted runtime hostname for validation (SSRF protection)
        string trustedHost = runtime.managementHostname ?: "";
        if trustedHost == "" {
            return error("Runtime management hostname is not set");
        }
        string wsdlXml = check mi_management:fetchWsdlContent(wsdlUrl, trustedHost, artifactsApiAllowInsecureTLS);

        log:printInfo("Successfully fetched artifact WSDL via MI management API",
                runtimeId = runtime.runtimeId,
                artifactType = artifactType,
                artifactName = artifactName,
                wsdlLength = wsdlXml.length());
        return wsdlXml;
    }

    // Get Local Entry value from a runtime's management API via ICP internal API
    isolated resource function get localEntryValueByComponent(
            graphql:Context context,
            string componentId,
            string entryName,
            string? environmentId = (),
            string? runtimeId = ()
    ) returns string|error {
        value:Cloneable|error|isolated object {} authHeader = context.get("Authorization");
        if authHeader !is string {
            return error("Authorization header missing in request");
        }

        // Extract user context for RBAC
        types:UserContextV2 userContext = check auth:extractUserContextV2(authHeader);

        // Get component to verify access
        types:Component? component = check storage:getComponentById(componentId);
        if component is () {
            return error("Integration not found");
        }

        // Verify user has the permissions
        types:AccessScope scope = auth:buildScopeFromContext(component.projectId, integrationId = componentId, envId = environmentId);
        if !check auth:hasAnyPermission(userContext.userId,
                ["integration_mgt:view", "integration_mgt:edit", "integration_mgt:manage"], scope) {
            return error("Insufficient permissions to view component artifacts");
        }

        // Get runtimes for this component (optionally filtered by environment if environmentId !is ())
        types:Runtime[] runtimes = check storage:getRuntimes((), (), environmentId, component.projectId, componentId);

        if runtimes.length() == 0 {
            return error("No runtimes found for this component");
        }
        types:Runtime runtime = check utils:selectRuntime(runtimes, componentId, environmentId, runtimeId);
        // Build management API base URL
        string baseUrl = check storage:buildManagementBaseUrl(runtime.managementHostname, runtime.managementPort);

        log:printInfo("Fetching local entry info via MI management API",
                runtimeId = runtime.runtimeId,
                managementUrl = baseUrl,
                entryName = entryName);

        // Create MI management API client (toggle insecure TLS via configuration)
        http:Client|error mgmtClientResult = artifactsApiAllowInsecureTLS
            ? new (baseUrl, {secureSocket: {enable: false}})
            : new (baseUrl);
        if mgmtClientResult is error {
            log:printError("Failed to create management API client", mgmtClientResult);
            return error("Failed to create management API client");
        }
        http:Client mgmtClient = mgmtClientResult;

        // Generate an HMAC JWT (same mechanism as heartbeat) to call the ICP internal API
        string hmacToken = check storage:issueRuntimeHmacToken(runtime.runtimeId);

        // Fetch local entry info via MI Management API (/management/local-entries?name=...)
        types:MgmtLocalEntryInfo entryInfo = check mi_management:fetchLocalEntryArtifact(mgmtClient, hmacToken, entryName);
        log:printInfo("Successfully fetched local entry info from MI management API",
                runtimeId = runtime.runtimeId,
                entryName = entryInfo.name,
                entryType = entryInfo.'type);

        return entryInfo.value;
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
        ) returns types:Parameter[]|error {
        value:Cloneable|error|isolated object {} authHeader = context.get("Authorization");
        if authHeader !is string {
            return error("Authorization header missing in request");
        }

        // Extract user context for RBAC
        types:UserContextV2 userContext = check auth:extractUserContextV2(authHeader);

        // Get component to verify access
        types:Component? component = check storage:getComponentById(componentId);
        if component is () {
            return error("Integration not found");
        }

        // Verify user has the permissions
        types:AccessScope scope = auth:buildScopeFromContext(component.projectId, integrationId = componentId, envId = environmentId);
        if !check auth:hasAnyPermission(userContext.userId, ["integration_mgt:view", "integration_mgt:edit", "integration_mgt:manage"], scope) {
            return error("Insufficient permissions to view component artifacts");
        }

        // Get runtimes for this component (optionally filtered by environment if environmentId !is ())
        types:Runtime[] runtimes = check storage:getRuntimes((), (), environmentId, component.projectId, componentId);
        if runtimes.length() == 0 {
            return error("No runtimes found for this component");
        }

        // Select runtime using shared helper
        types:Runtime runtime = check utils:selectRuntime(runtimes, componentId, environmentId, runtimeId);

        log:printInfo("Fetching artifact parameters via MI management API",
                runtimeId = runtime.runtimeId,
                artifactType = artifactType,
                artifactName = artifactName);

        // Build management API base URL
        string baseUrl = check storage:buildManagementBaseUrl(runtime.managementHostname, runtime.managementPort);

        // Create management API client
        http:Client|error mgmtClientResult = artifactsApiAllowInsecureTLS
            ? new (baseUrl, {secureSocket: {enable: false}})
            : new (baseUrl);
        if mgmtClientResult is error {
            log:printError("Failed to create management API client", mgmtClientResult);
            return error("Failed to create management API client");
        }
        http:Client mgmtClient = mgmtClientResult;
        string hmacToken = check storage:issueRuntimeHmacToken(runtime.runtimeId);

        // Fetch artifact and extract parameters based on artifact type
        types:Parameter[] params = [];

        if artifactType == mi_management:ARTIFACT_TYPE_INBOUND_ENDPOINT {
            types:MgmtInboundEndpointInfo inboundInfo = check mi_management:fetchInboundEndpointArtifact(mgmtClient, hmacToken, artifactName);
            // Append parameters from the management API response
            params = inboundInfo.parameters ?: [];
        } else if artifactType == mi_management:ARTIFACT_TYPE_MESSAGE_PROCESSOR {
            types:MgmtMessageProcessorInfo processorInfo = check mi_management:fetchMessageProcessorArtifact(
                    mgmtClient, hmacToken, artifactName);

            // Append parameters from the map
            map<string>? parameters = processorInfo.parameters;
            if parameters is map<string> {
                foreach var [key, value] in parameters.entries() {
                    params.push({name: key, value: value});
                }
            }
        } else if artifactType == mi_management:ARTIFACT_TYPE_DATA_SOURCE {
            types:MgmtDataSourceInfo dataSourceInfo = check mi_management:fetchDataSourceArtifact(
                    mgmtClient, hmacToken, artifactName);

            // Append configuration parameters from the management API response
            map<json>? configParams = dataSourceInfo.configurationParameters;
            log:printDebug("Data source configurationParameters check",
                    artifactName = artifactName,
                    hasConfigParams = configParams is map<json>,
                    configParamsValue = configParams);

            if configParams is map<json> {
                log:printDebug("Adding data source configuration parameters",
                        artifactName = artifactName,
                        parameterCount = configParams.length());
                foreach var [key, value] in configParams.entries() {
                    params.push({name: key, value: value.toString()});
                }
            }
        }
        // Add more artifact types here as needed

        log:printInfo("Successfully fetched artifact parameters from MI management API",
                runtimeId = runtime.runtimeId,
                artifactType = artifactType,
                artifactName = artifactName,
                paramCount = params.length());

        return params;
    }

    // Get overview metadata for a data source from the MI Management API.
    // Returns fields: name, type, description, driverClass, userName, url.
    isolated resource function get dataSourceOverviewByComponent(
            graphql:Context context,
            string componentId,
            string dataSourceName,
            string? environmentId = (),
            string? runtimeId = ()
        ) returns types:Parameter[]|error {
        value:Cloneable|error|isolated object {} authHeader = context.get("Authorization");
        if authHeader !is string {
            return error("Authorization header missing in request");
        }

        types:UserContextV2 userContext = check auth:extractUserContextV2(authHeader);

        types:Component? component = check storage:getComponentById(componentId);
        if component is () {
            return error("Integration not found");
        }

        types:AccessScope scope = auth:buildScopeFromContext(component.projectId, integrationId = componentId, envId = environmentId);
        if !check auth:hasAnyPermission(userContext.userId, ["integration_mgt:view", "integration_mgt:edit", "integration_mgt:manage"], scope) {
            return error("Insufficient permissions to view component artifacts");
        }

        types:Runtime[] runtimes = check storage:getRuntimes((), (), environmentId, component.projectId, componentId);
        if runtimes.length() == 0 {
            return error("No runtimes found for this component");
        }

        types:Runtime runtime = check utils:selectRuntime(runtimes, componentId, environmentId, runtimeId);
        string baseUrl = check storage:buildManagementBaseUrl(runtime.managementHostname, runtime.managementPort);

        log:printInfo("Fetching data source overview via MI management API",
                runtimeId = runtime.runtimeId,
                managementUrl = baseUrl,
                dataSourceName = dataSourceName);

        http:Client|error mgmtClientResult = artifactsApiAllowInsecureTLS
            ? new (baseUrl, {secureSocket: {enable: false}})
            : new (baseUrl);
        if mgmtClientResult is error {
            log:printError("Failed to create management API client", mgmtClientResult);
            return error("Failed to create management API client");
        }
        http:Client mgmtClient = mgmtClientResult;

        string hmacToken = check storage:issueRuntimeHmacToken(runtime.runtimeId);

        types:MgmtDataSourceInfo overview = check mi_management:fetchDataSourceArtifact(
                mgmtClient, hmacToken, dataSourceName);

        types:Parameter[] result = [];
        result.push({name: "name", value: overview.name});
        if overview.'type is string {
            result.push({name: "type", value: <string>overview.'type});
        }
        if overview.description is string {
            result.push({name: "description", value: <string>overview.description});
        }
        if overview.driverClass is string {
            result.push({name: "driverClass", value: <string>overview.driverClass});
        }
        if overview.userName is string {
            result.push({name: "userName", value: <string>overview.userName});
        }
        if overview.url is string {
            result.push({name: "url", value: <string>overview.url});
        }

        log:printInfo("Successfully fetched data source overview from MI management API",
                runtimeId = runtime.runtimeId,
                dataSourceName = dataSourceName,
                totalParamCount = result.length());

        return result;
    }

    // Get overview metadata for a message store: name, type, container, size.
    isolated resource function get messageStoreOverviewByComponent(
            graphql:Context context,
            string componentId,
            string storeName,
            string? environmentId = (),
            string? runtimeId = ()
        ) returns types:Parameter[]|error {
        value:Cloneable|error|isolated object {} authHeader = context.get("Authorization");
        if authHeader !is string {
            return error("Authorization header missing in request");
        }

        types:UserContextV2 userContext = check auth:extractUserContextV2(authHeader);

        types:Component? component = check storage:getComponentById(componentId);
        if component is () {
            return error("Integration not found");
        }

        types:AccessScope scope = auth:buildScopeFromContext(component.projectId, integrationId = componentId, envId = environmentId);
        if !check auth:hasAnyPermission(userContext.userId, ["integration_mgt:view", "integration_mgt:edit", "integration_mgt:manage"], scope) {
            return error("Insufficient permissions to view component artifacts");
        }

        types:Runtime[] runtimes = check storage:getRuntimes((), (), environmentId, component.projectId, componentId);
        if runtimes.length() == 0 {
            return error("No runtimes found for this component");
        }

        types:Runtime runtime = check utils:selectRuntime(runtimes, componentId, environmentId, runtimeId);
        string baseUrl = check storage:buildManagementBaseUrl(runtime.managementHostname, runtime.managementPort);

        log:printInfo("Fetching message store overview via MI management API",
                runtimeId = runtime.runtimeId,
                managementUrl = baseUrl,
                storeName = storeName);

        http:Client|error mgmtClientResult = artifactsApiAllowInsecureTLS
            ? new (baseUrl, {secureSocket: {enable: false}})
            : new (baseUrl);
        if mgmtClientResult is error {
            log:printError("Failed to create management API client", mgmtClientResult);
            return error("Failed to create management API client");
        }
        http:Client mgmtClient = mgmtClientResult;

        string hmacToken = check storage:issueRuntimeHmacToken(runtime.runtimeId);

        types:MgmtMessageStoreInfo overview = check mi_management:fetchMessageStoreArtifact(
                mgmtClient, hmacToken, storeName);

        types:Parameter[] result = [];
        result.push({name: "name", value: overview.name});
        if overview.'type is string {
            result.push({name: "type", value: <string>overview.'type});
        }
        if overview.container is string {
            result.push({name: "container", value: <string>overview.container});
        }
        if overview.size is int {
            result.push({name: "size", value: (<int>overview.size).toString()});
        }
        return result;
    }

    // Get overview metadata for a message processor: name, type, messageStore, status.
    isolated resource function get messageProcessorOverviewByComponent(
            graphql:Context context,
            string componentId,
            string processorName,
            string? environmentId = (),
            string? runtimeId = ()
        ) returns types:Parameter[]|error {
        value:Cloneable|error|isolated object {} authHeader = context.get("Authorization");
        if authHeader !is string {
            return error("Authorization header missing in request");
        }

        types:UserContextV2 userContext = check auth:extractUserContextV2(authHeader);

        types:Component? component = check storage:getComponentById(componentId);
        if component is () {
            return error("Integration not found");
        }

        types:AccessScope scope = auth:buildScopeFromContext(component.projectId, integrationId = componentId, envId = environmentId);
        if !check auth:hasAnyPermission(userContext.userId, ["integration_mgt:view", "integration_mgt:edit", "integration_mgt:manage"], scope) {
            return error("Insufficient permissions to view component artifacts");
        }

        types:Runtime[] runtimes = check storage:getRuntimes((), (), environmentId, component.projectId, componentId);
        if runtimes.length() == 0 {
            return error("No runtimes found for this component");
        }

        types:Runtime runtime = check utils:selectRuntime(runtimes, componentId, environmentId, runtimeId);
        string baseUrl = check storage:buildManagementBaseUrl(runtime.managementHostname, runtime.managementPort);

        log:printInfo("Fetching message processor overview via MI management API",
                runtimeId = runtime.runtimeId,
                managementUrl = baseUrl,
                processorName = processorName);

        http:Client|error mgmtClientResult = artifactsApiAllowInsecureTLS
            ? new (baseUrl, {secureSocket: {enable: false}})
            : new (baseUrl);
        if mgmtClientResult is error {
            log:printError("Failed to create management API client", mgmtClientResult);
            return error("Failed to create management API client");
        }
        http:Client mgmtClient = mgmtClientResult;

        string hmacToken = check storage:issueRuntimeHmacToken(runtime.runtimeId);

        types:MgmtMessageProcessorInfo overview = check mi_management:fetchMessageProcessorArtifact(
                mgmtClient, hmacToken, processorName);

        types:Parameter[] result = [];
        result.push({name: "name", value: overview.name});
        if overview.'type is string {
            result.push({name: "type", value: <string>overview.'type});
        }
        if overview.messageStore is string {
            result.push({name: "messageStore", value: <string>overview.messageStore});
        }
        if overview.status is string {
            result.push({name: "status", value: <string>overview.status});
        }
        return result;
    }

    // Get structured overview for a data service: dataSources, queries, resources, operations.
    isolated resource function get dataServiceOverviewByComponent(
            graphql:Context context,
            string componentId,
            string dataServiceName,
            string? environmentId = (),
            string? runtimeId = ()
        ) returns types:MgmtDataServiceInfo|error {
        value:Cloneable|error|isolated object {} authHeader = context.get("Authorization");
        if authHeader !is string {
            return error("Authorization header missing in request");
        }

        types:UserContextV2 userContext = check auth:extractUserContextV2(authHeader);

        types:Component? component = check storage:getComponentById(componentId);
        if component is () {
            return error("Integration not found");
        }

        types:AccessScope scope = auth:buildScopeFromContext(component.projectId, integrationId = componentId, envId = environmentId);
        if !check auth:hasAnyPermission(userContext.userId, ["integration_mgt:view", "integration_mgt:edit", "integration_mgt:manage"], scope) {
            return error("Insufficient permissions to view component artifacts");
        }

        types:Runtime[] runtimes = check storage:getRuntimes((), (), environmentId, component.projectId, componentId);
        if runtimes.length() == 0 {
            return error("No runtimes found for this component");
        }

        types:Runtime runtime = check utils:selectRuntime(runtimes, componentId, environmentId, runtimeId);
        string baseUrl = check storage:buildManagementBaseUrl(runtime.managementHostname, runtime.managementPort);

        log:printInfo("Fetching data service overview via MI management API",
                runtimeId = runtime.runtimeId,
                managementUrl = baseUrl,
                dataServiceName = dataServiceName);

        http:Client|error mgmtClientResult = artifactsApiAllowInsecureTLS
            ? new (baseUrl, {secureSocket: {enable: false}})
            : new (baseUrl);
        if mgmtClientResult is error {
            log:printError("Failed to create management API client", mgmtClientResult);
            return error("Failed to create management API client");
        }
        http:Client mgmtClient = mgmtClientResult;
        string hmacToken = check storage:issueRuntimeHmacToken(runtime.runtimeId);
        types:MgmtDataServiceInfo dataServiceInfo = check mi_management:fetchDataServiceArtifact(mgmtClient, hmacToken, dataServiceName);
        return dataServiceInfo;
    }

    // ============================================================
    // MI Runtime User Management
    // ============================================================

    isolated resource function get getMIUsers(graphql:Context context, string componentId, string runtimeId) returns types:MIUsersResponse|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        types:Runtime? runtime = check storage:getRuntimeById(runtimeId);
        if runtime is () {
            return error("Runtime not found");
        }
        if runtime.component.id != componentId {
            return error("Runtime does not belong to the specified integration");
        }

        types:AccessScope scope = auth:buildScopeFromContext(runtime.component.projectId, integrationId = componentId, envId = runtime.environment.id);
        if !check auth:hasAnyPermission(userContext.userId,
                [auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
            return error("Insufficient permissions to view MI users");
        }

        string baseUrl = check storage:buildManagementBaseUrl(runtime.managementHostname, runtime.managementPort);
        http:Client|error mgmtClient = artifactsApiAllowInsecureTLS
            ? new (baseUrl, {secureSocket: {enable: false}})
            : new (baseUrl);
        if mgmtClient is error {
            log:printError("Failed to create management API client", mgmtClient);
            return error("Failed to create management API client");
        }

        string bearerToken = check storage:issueRuntimeHmacToken(runtimeId);
        log:printInfo("Fetching MI users from runtime management API", runtimeId = runtimeId);

        http:Response|error listResponse = mgmtClient->get("/management/users", {
            "Authorization": string `Bearer ${bearerToken}`,
            "Accept": "application/json"
        });
        if listResponse is error {
            log:printError("Failed to fetch MI users from runtime management API", listResponse, runtimeId = runtimeId);
            return error("Failed to fetch users from runtime");
        }
        if listResponse.statusCode != http:STATUS_OK {
            return error(string `MI management API returned status ${listResponse.statusCode}`);
        }

        json listBody = check listResponse.getJsonPayload();
        json[] userList = [];
        json|error listField = listBody.list;
        if listField is json[] {
            userList = listField;
        }

        types:MIUser[] enrichedUsers = [];
        foreach json u in userList {
            json|error userIdJson = u.userId;
            if userIdJson is error {
                continue;
            }
            string userIdStr = userIdJson.toString();
            string encodedUsername = check url:encode(userIdStr, "UTF-8");

            boolean isAdmin = false;
            http:Response|error detailResponse = mgmtClient->get(string `/management/users/${encodedUsername}`, {
                "Authorization": string `Bearer ${bearerToken}`,
                "Accept": "application/json"
            });
            if detailResponse is http:Response && detailResponse.statusCode == http:STATUS_OK {
                json|error detailBody = detailResponse.getJsonPayload();
                if detailBody is json {
                    json|error isAdminField = detailBody.isAdmin;
                    if isAdminField is boolean {
                        isAdmin = isAdminField;
                    }
                }
            }
            enrichedUsers.push({username: userIdStr, isAdmin});
        }

        log:printInfo("Successfully fetched MI users from runtime", runtimeId = runtimeId, userCount = enrichedUsers.length());
        return {users: enrichedUsers};
    }

    isolated remote function addMIUser(graphql:Context context, string componentId, string runtimeId, string username, string password, boolean isAdmin = false) returns types:MIUserOperationResponse|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        types:Runtime? runtime = check storage:getRuntimeById(runtimeId);
        if runtime is () {
            return error("Runtime not found");
        }
        if runtime.component.id != componentId {
            return error("Runtime does not belong to the specified integration");
        }

        types:AccessScope scope = auth:buildScopeFromContext(runtime.component.projectId, integrationId = componentId, envId = runtime.environment.id);
        if !check auth:hasAnyPermission(userContext.userId,
                [auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
            return error("Insufficient permissions to create MI users");
        }

        if username.trim().length() == 0 {
            return error("username must be a non-empty string");
        }
        if password.trim().length() == 0 {
            return error("password must be a non-empty string");
        }

        string baseUrl = check storage:buildManagementBaseUrl(runtime.managementHostname, runtime.managementPort);
        http:Client|error mgmtClient = artifactsApiAllowInsecureTLS
            ? new (baseUrl, {secureSocket: {enable: false}})
            : new (baseUrl);
        if mgmtClient is error {
            log:printError("Failed to create management API client", mgmtClient);
            return error("Failed to create management API client");
        }

        string bearerToken = check storage:issueRuntimeHmacToken(runtimeId);
        json createPayload = {userId: username, password, isAdmin};
        log:printInfo("Creating MI user on runtime management API", runtimeId = runtimeId, username = username, isAdmin = isAdmin);

        http:Response|error createResponse = mgmtClient->post("/management/users", createPayload, {
            "Authorization": string `Bearer ${bearerToken}`,
            "Content-Type": "application/json"
        });
        if createResponse is error {
            log:printError("Failed to create MI user on runtime management API", createResponse, runtimeId = runtimeId, username = username);
            return error("Failed to create user on runtime");
        }

        if createResponse.statusCode == http:STATUS_BAD_REQUEST {
            json|error errBody = createResponse.getJsonPayload();
            string message = "Invalid user creation request";
            if errBody is json {
                json|error msgField = errBody.message;
                if msgField is string {
                    message = msgField;
                }
            }
            return error(message);
        }
        if createResponse.statusCode != http:STATUS_OK {
            return error(string `MI management API returned status ${createResponse.statusCode}`);
        }

        log:printInfo("Successfully created MI user on runtime", username = username, runtimeId = runtimeId);
        return {username, status: "Added"};
    }

    isolated remote function deleteMIUser(graphql:Context context, string componentId, string runtimeId, string username) returns types:MIUserOperationResponse|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        types:Runtime? runtime = check storage:getRuntimeById(runtimeId);
        if runtime is () {
            return error("Runtime not found");
        }
        if runtime.component.id != componentId {
            return error("Runtime does not belong to the specified integration");
        }

        types:AccessScope scope = auth:buildScopeFromContext(runtime.component.projectId, integrationId = componentId, envId = runtime.environment.id);
        if !check auth:hasAnyPermission(userContext.userId,
                [auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope) {
            return error("Insufficient permissions to delete MI users");
        }

        string baseUrl = check storage:buildManagementBaseUrl(runtime.managementHostname, runtime.managementPort);
        http:Client|error mgmtClient = artifactsApiAllowInsecureTLS
            ? new (baseUrl, {secureSocket: {enable: false}})
            : new (baseUrl);
        if mgmtClient is error {
            log:printError("Failed to create management API client", mgmtClient);
            return error("Failed to create management API client");
        }

        string trimmedUsername = username.trim();
        if trimmedUsername.length() == 0 {
            return error("username must be a non-empty string");
        }
        string encodedUsername = check url:encode(trimmedUsername, "UTF-8");

        string bearerToken = check storage:issueRuntimeHmacToken(runtimeId);
        log:printInfo("Deleting MI user on runtime management API", runtimeId = runtimeId, username = trimmedUsername);

        http:Response|error deleteResponse = mgmtClient->delete(string `/management/users/${encodedUsername}`, (), {
            "Authorization": string `Bearer ${bearerToken}`
        });
        if deleteResponse is error {
            log:printError("Failed to delete MI user on runtime management API", deleteResponse, runtimeId = runtimeId, username = username);
            return error("Failed to delete user on runtime");
        }

        if deleteResponse.statusCode == http:STATUS_NOT_FOUND {
            return error(string `User '${username}' not found on runtime`);
        }
        if deleteResponse.statusCode != http:STATUS_OK {
            return error(string `MI management API returned status ${deleteResponse.statusCode}`);
        }

        log:printInfo("Successfully deleted MI user on runtime", username = username, runtimeId = runtimeId);
        return {username, status: "Deleted"};
    }
}


