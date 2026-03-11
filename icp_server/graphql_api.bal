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
import icp_server.storage;
import icp_server.sync;
import icp_server.types;

import ballerina/data.jsondata;
import ballerina/graphql;
import ballerina/http;
import ballerina/lang.value;
import ballerina/log;

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

const string ICP_ARTIFACTS_PATH = "/icp/artifacts";

// Reusable: pick a runtime from a list with optional runtimeId
isolated function selectRuntime(types:Runtime[] runtimes, string componentId, string? environmentId, string? runtimeId) returns types:Runtime|error {
    if runtimes.length() == 0 {
        return error("No runtimes found for this component");
    }
    types:Runtime runtime = runtimes[0];
    if runtimeId is string {
        foreach types:Runtime r in runtimes {
            if r.runtimeId == runtimeId {
                return r;
            }
        }
        return error(string `Runtime ${runtimeId} not found for component ${componentId}${environmentId is string ? string ` in environment ${environmentId}` : ""}`);
    }
    return runtime;
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
        types:ReconcileArtifactKey artifact, map<json> desiredProps,
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

// GraphQL service for runtime details
@graphql:ServiceConfig {
    contextInit,
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

        // If projectId is still empty, we cannot proceed
        if actualProjectId == "" {
            return error("Either projectId or componentId must be provided");
        }

        // Step 2: If environmentId is specified, check access to that specific environment
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

        // Step 3: If environmentId is NOT specified, resolve accessible environments
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
            types:ArtifactStateField? s = stateOf(sm, a.name, "service", "status");
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
            types:ArtifactStateField? s = stateOf(sm, a.name, "listener", "status");
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

        // Get log levels for runtime and convert to Logger type
        types:RuntimeLogLevelRecord[] logLevels = check storage:getLogLevelsForRuntime(runtimeId);
        types:Logger[] loggers = [];
        foreach types:RuntimeLogLevelRecord logLevel in logLevels {
            loggers.push({
                componentName: logLevel.componentName,
                logLevel: <types:LogLevel>logLevel.logLevel,
                runtimeId: runtimeId
            });
        }

        return loggers;
    }

    // Get loggers for a specific environment and component, grouped by component name
    isolated resource function get loggersByEnvironmentAndComponent(graphql:Context context, string environmentId, string componentId) returns types:LoggerGroup[]|error {
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
            log:printWarn("Attempt to access component loggers without permission", userId = userContext.userId, environmentId = environmentId, componentId = componentId);
            return [];
        }

        return check storage:getLoggersByEnvironmentAndComponent(environmentId, componentId);
    }

    // Delete a runtime by ID
    isolated remote function deleteRuntime(graphql:Context context, string runtimeId) returns boolean|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        // Fetch the runtime to get its context
        types:Runtime? runtime = check storage:getRuntimeById(runtimeId);

        if runtime is () {
            return error("Runtime not found");
        }

        // Build scope from runtime's context
        types:AccessScope scope = auth:buildScopeFromContext(
                runtime.component.projectId,
                runtime.component.id,
                runtime.environment.id
        );

        // Check permission to delete this integration's runtime (mutation = explicit error)
        if !check auth:hasPermission(userContext.userId, auth:PERMISSION_INTEGRATION_MANAGE, scope) {
            return error("Access denied: insufficient permissions to delete runtime");
        }

        check storage:deleteRuntime(runtimeId);
        return true;
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
                types:ReconcileArtifactKey artifact = {artifactName: input.listenerName, artifactType: "listener"};
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

    // Update log level for BI runtimes via reconcile engine
    remote function updateLogLevel(graphql:Context context, types:UpdateLogLevelInput input) returns types:UpdateLogLevelResponse|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        if input.runtimeIds.length() == 0 {
            return error("At least one runtime ID must be provided");
        }
        if input.componentName.trim().length() == 0 {
            return error("Component name cannot be empty");
        }
        // Enforces this upper bound to fit the cluster index limit in MSSQL 
        if input.componentName.length() > 432 {
            return error("Component name must not exceed 432 characters");
        }

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
                types:ReconcileArtifactKey artifact = {artifactName: input.componentName, artifactType: "log-level"};
                log:printDebug("upsertReconcileDesiredState for log-level", componentId = componentId, envId = envId);
                check storage:upsertReconcileDesiredState(componentId, envId, artifact,
                    {"logLevel": logLevelStr});
            }
        }

        return {
            success: true,
            message: string `Log level for ${input.componentName} set to ${logLevelStr}`,
            commandIds: []
        };
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
                message: string `Cannot delete component: ${environmentsWithRuntimes.length()} active runtime(s) found. Please stop all runtimes before deleting.`,
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
            return {status: "failed", message: "No MI runtimes found for this component", successCount: 0, failedCount: 0, details: []};
        }

        types:ReconcileArtifactKey artifact = {artifactName: input.artifactName, artifactType: input.artifactType};
        map<json> desiredProps = {"status": input.status == "active" ? "enabled" : "disabled"};
        [int, int] counts = check reconcilePerEnv(runtimes, input.componentId, artifact, desiredProps, sync:dispatchMI);

        return {
            status: counts[1] == 0 ? "success" : "failed",
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
            return {status: "failed", message: "No MI runtimes found for this component", successCount: 0, failedCount: 0, details: []};
        }

        types:ReconcileArtifactKey artifact = {artifactName: input.artifactName, artifactType: input.artifactType};
        map<json> desiredProps = {"tracing": input.trace == "enable" ? "enabled" : "disabled"};
        [int, int] counts = check reconcilePerEnv(runtimes, input.componentId, artifact, desiredProps, sync:dispatchMI);

        return {
            status: counts[1] == 0 ? "success" : "failed",
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
            return {status: "failed", message: "No MI runtimes found for this component", successCount: 0, failedCount: 0, details: []};
        }

        types:ReconcileArtifactKey artifact = {artifactName: input.artifactName, artifactType: input.artifactType};
        map<json> desiredProps = {"statistics": input.statistics == "enable" ? "enabled" : "disabled"};
        [int, int] counts = check reconcilePerEnv(runtimes, input.componentId, artifact, desiredProps, sync:dispatchMI);

        return {
            status: counts[1] == 0 ? "success" : "failed",
            message: string `Artifact statistics change dispatched to ${counts[0] + counts[1]} runtime(s)`,
            successCount: counts[0],
            failedCount: counts[1],
            details: []
        };
    }

    // Get (or provision on first call) the JWT HMAC secret for a component+environment pair.
    // Safe to call every time the "Configure Runtime" dialog opens — returns the existing
    // secret when already provisioned, generates a new one only when none exists yet.
    isolated remote function generateComponentEnvironmentJwtSecret(
            graphql:Context context, string componentId, string environmentId
    ) returns string|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        string projectId = check storage:getProjectIdByComponentId(componentId);
        types:AccessScope scope = auth:buildScopeFromContext(projectId, integrationId = componentId, envId = environmentId);

        if !check auth:hasPermission(userContext.userId, auth:PERMISSION_INTEGRATION_MANAGE, scope) {
            return error("Insufficient permissions to view or provision this component's JWT secret");
        }

        return check storage:getOrGenerateComponentEnvironmentSecret(componentId, environmentId);
    }

    // Rotate (replace) the JWT HMAC secret for a component+environment pair.
    // All runtimes for this component+environment must be reconfigured with the new secret.
    isolated remote function rotateComponentEnvironmentJwtSecret(
            graphql:Context context, string componentId, string environmentId
    ) returns string|error {
        types:UserContextV2 userContext = check extractUserContext(context);

        string projectId = check storage:getProjectIdByComponentId(componentId);
        types:AccessScope scope = auth:buildScopeFromContext(projectId, integrationId = componentId, envId = environmentId);

        if !check auth:hasPermission(userContext.userId, auth:PERMISSION_INTEGRATION_MANAGE, scope) {
            return error("Insufficient permissions to rotate this component's JWT secret");
        }

        log:printInfo(string `JWT secret rotation requested for component: ${componentId}, environment: ${environmentId}`, userId = userContext.userId);
        return check storage:generateComponentEnvironmentSecret(componentId, environmentId);
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
                status: "failed",
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

        string overallStatus = successCount > 0 ? "success" : "failed";
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

        // Verify user has the permisions
        types:AccessScope scope = auth:buildScopeFromContext(component.projectId, integrationId = componentId, envId = environmentId);
        if !check auth:hasAnyPermission(userContext.userId,
                ["integration_mgt:view", "integration_mgt:edit", "integration_mgt:manage"], scope) {
            return error("Insufficient permissions to view component artifacts");
        }

        // Get runtimes and select one using shared helper
        types:Runtime[] runtimes = check storage:getRuntimes((), (), environmentId, component.projectId, componentId);
        types:Runtime runtime = check selectRuntime(runtimes, componentId, environmentId, runtimeId);

        // Build management API base URL
        string baseUrl = check storage:buildManagementBaseUrl(runtime.managementHostname, runtime.managementPort);

        log:printInfo("Fetching artifact from runtime management API",
                runtimeId = runtime.runtimeId,
                managementUrl = baseUrl,
                artifactType = artifactType,
                artifactName = artifactName);

        // Create management API client (toggle insecure TLS via configuration)
        http:Client|error mgmtClient = artifactsApiAllowInsecureTLS
            ? new (baseUrl, {secureSocket: {enable: false}})
            : new (baseUrl);
        if mgmtClient is error {
            log:printError("Failed to create management API client", mgmtClient);
            return error("Failed to create management API client");
        }
        // Generate an HMAC JWT (same mechanism as heartbeat) to call the ICP internal API
        string hmacToken = check storage:issueRuntimeHmacToken(runtime.runtimeId);

        // Fetch artifact source via ICP Internal API (/icp/artifacts)
        string artifactPath = string `${ICP_ARTIFACTS_PATH}?type=${artifactType}&name=${artifactName}`;
        // Log outbound request details (truncate token for safety)
        log:printDebug("Sending ICP internal API artifact request",
                runtimeId = runtime.runtimeId,
                managementUrl = baseUrl,
                artifactPath = artifactPath,
                accept = "application/json"
        );
        http:Response|error artifactResponse = mgmtClient->get(artifactPath, {
            "Authorization": string `Bearer ${hmacToken}`,
            "Accept": "application/json"
        });

        if artifactResponse is error {
            log:printError("Failed to fetch artifact from management API", artifactResponse);
            return error("Failed to fetch artifact from management API");
        }

        if artifactResponse.statusCode != http:STATUS_OK {
            string|error errPayload = artifactResponse.getTextPayload();
            if errPayload is error {
                log:printError("ICP internal API artifact fetch returned non-OK status",
                        status = artifactResponse.statusCode.toString(),
                        runtimeId = runtime.runtimeId,
                        artifactType = artifactType,
                        artifactName = artifactName);
                return error(string `ICP internal API artifact fetch failed with status ${artifactResponse.statusCode}`);
            }
            log:printError("ICP internal API artifact fetch returned non-OK status",
                    status = artifactResponse.statusCode.toString(),
                    runtimeId = runtime.runtimeId,
                    artifactType = artifactType,
                    artifactName = artifactName,
                    response = errPayload);
            return error(string `ICP internal API artifact fetch failed with status ${artifactResponse.statusCode}: ${errPayload}`);
        }

        // Parse JSON body and extract only the `configuration` field
        json artifactConfigJson = check artifactResponse.getJsonPayload();
        types:ArtifactResponse artifactConfig = check jsondata:parseAsType(artifactConfigJson);

        log:printInfo("Successfully fetched artifact source",
                runtimeId = runtime.runtimeId,
                artifactType = artifactConfig.'type,
                artifactName = artifactConfig.name,
                sourceLength = artifactConfig.configuration.length());
        return artifactConfig.configuration;
    }

    // Get WSDL for any supported artifact by type and name via ICP internal API
    isolated resource function get artifactWsdlByComponent(
            graphql:Context context,
            string componentId,
            string artifactType,
            string artifactName,
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

        // Select runtime using shared helper
        types:Runtime runtime = check selectRuntime(runtimes, componentId, environmentId, runtimeId);

        // Build management API base URL
        string baseUrl = check storage:buildManagementBaseUrl(runtime.managementHostname, runtime.managementPort);

        // Normalize artifact type
        string t = artifactType.toLowerAscii();
        string artifactPath;
        if t == "dataservice" || t == "data-service" || t == "datasvc" {
            // Data Services use 'service' param in ICP API
            artifactPath = string `${ICP_ARTIFACTS_PATH}/wsdl?service=${artifactName}`;
        } else if t == "proxy-service" {
            artifactPath = string `${ICP_ARTIFACTS_PATH}/wsdl?proxy=${artifactName}`;
        } else {
            // Generic pattern for future artifact types
            artifactPath = string `${ICP_ARTIFACTS_PATH}/wsdl?type=${t}&name=${artifactName}`;
        }

        log:printInfo("Fetching artifact WSDL from management API",
                runtimeId = runtime.runtimeId,
                managementUrl = baseUrl,
                artifactType = artifactType,
                artifactName = artifactName,
                path = artifactPath);

        // Create management API client (toggle insecure TLS via configuration)
        http:Client|error mgmtClient = artifactsApiAllowInsecureTLS
            ? new (baseUrl, {secureSocket: {enable: false}})
            : new (baseUrl);
        if mgmtClient is error {
            log:printError("Failed to create management API client", mgmtClient);
            return error("Failed to create management API client");
        }

        // Generate an HMAC JWT to call the ICP internal API
        string hmacToken = check storage:issueRuntimeHmacToken(runtime.runtimeId);

        http:Response|error wsdlResponse = mgmtClient->get(artifactPath, {
            "Authorization": string `Bearer ${hmacToken}`,
            "Accept": "application/xml"
        });

        if wsdlResponse is error {
            log:printError("Failed to fetch WSDL from management API", wsdlResponse);
            return error("Failed to fetch WSDL from management API");
        }

        if wsdlResponse.statusCode != http:STATUS_OK {
            string|error errPayload = wsdlResponse.getTextPayload();
            if errPayload is error {
                log:printError("ICP internal API WSDL fetch returned non-OK status",
                        status = wsdlResponse.statusCode.toString(),
                        runtimeId = runtime.runtimeId,
                        artifactType = artifactType,
                        artifactName = artifactName);
                return error(string `ICP internal API WSDL fetch failed with status ${wsdlResponse.statusCode}`);
            }
            log:printError("ICP internal API WSDL fetch returned non-OK status",
                    status = wsdlResponse.statusCode.toString(),
                    runtimeId = runtime.runtimeId,
                    artifactType = artifactType,
                    artifactName = artifactName,
                    response = errPayload);
            return error(string `ICP internal API WSDL fetch failed with status ${wsdlResponse.statusCode}: ${errPayload}`);
        }

        // Return raw XML as string
        string|error wsdlXml = wsdlResponse.getTextPayload();
        if wsdlXml is error {
            log:printError("Failed to read WSDL text payload", wsdlXml);
            return error("Failed to read WSDL payload");
        }

        log:printInfo("Successfully fetched artifact WSDL",
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
        types:Runtime runtime = check selectRuntime(runtimes, componentId, environmentId, runtimeId);
        // Build management API base URL
        string baseUrl = check storage:buildManagementBaseUrl(runtime.managementHostname, runtime.managementPort);

        log:printInfo("Fetching local entry from runtime management API",
                runtimeId = runtime.runtimeId,
                managementUrl = baseUrl,
                entryName = entryName);

        // Create management API client (toggle insecure TLS via configuration)
        http:Client|error mgmtClient = artifactsApiAllowInsecureTLS
            ? new (baseUrl, {secureSocket: {enable: false}})
            : new (baseUrl);
        if mgmtClient is error {
            log:printError("Failed to create management API client", mgmtClient);
            return error("Failed to create management API client");
        }

        // Generate an HMAC JWT (same mechanism as heartbeat) to call the ICP internal API
        string hmacToken = check storage:issueRuntimeHmacToken(runtime.runtimeId);

        // Fetch local entry via ICP Internal API (/icp/artifacts/local-entry)
        string artifactPath = string `${ICP_ARTIFACTS_PATH}/local-entry?name=${entryName}`;
        log:printDebug("Sending ICP internal API local entry request",
                runtimeId = runtime.runtimeId,
                managementUrl = baseUrl,
                artifactPath = artifactPath,
                accept = "application/json"
        );
        http:Response|error leResponse = mgmtClient->get(artifactPath, {
            "Authorization": string `Bearer ${hmacToken}`,
            "Accept": "application/json"
        });

        if leResponse is error {
            log:printError("Failed to fetch local entry from management API", leResponse);
            return error("Failed to fetch local entry from management API");
        }

        if leResponse.statusCode != http:STATUS_OK {
            string|error errPayload = leResponse.getTextPayload();
            if errPayload is error {
                log:printError("ICP internal API local entry fetch returned non-OK status",
                        status = leResponse.statusCode.toString(),
                        runtimeId = runtime.runtimeId,
                        entryName = entryName);
                return error(string `ICP internal API local entry fetch failed with status ${leResponse.statusCode}`);
            }
            log:printError("ICP internal API local entry fetch returned non-OK status",
                    status = leResponse.statusCode.toString(),
                    runtimeId = runtime.runtimeId,
                    entryName = entryName,
                    response = errPayload);
            return error(string `ICP internal API local entry fetch failed with status ${leResponse.statusCode}: ${errPayload}`);
        }
        json payloadJson = check leResponse.getJsonPayload();
        types:LocalEntryValue payload = check jsondata:parseAsType(payloadJson);
        return payload.value;
    }

    // Get Inbound Endpoint parameters from management API via ICP internal API
    isolated resource function get inboundEndpointParametersByComponent(
            graphql:Context context,
            string componentId,
            string inboundName,
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

        // Select runtime using shared helper
        types:Runtime runtime = check selectRuntime(runtimes, componentId, environmentId, runtimeId);

        // Build management API base URL
        string baseUrl = check storage:buildManagementBaseUrl(runtime.managementHostname, runtime.managementPort);

        log:printInfo("Fetching inbound endpoint parameters from management API",
                runtimeId = runtime.runtimeId,
                managementUrl = baseUrl,
                inboundName = inboundName);

        http:Client|error mgmtClient = artifactsApiAllowInsecureTLS
            ? new (baseUrl, {secureSocket: {enable: false}})
            : new (baseUrl);
        if mgmtClient is error {
            log:printError("Failed to create management API client", mgmtClient);
            return error("Failed to create management API client");
        }

        string hmacToken = check storage:issueRuntimeHmacToken(runtime.runtimeId);
        string artifactPath = string `${ICP_ARTIFACTS_PATH}/inbound/parameters?name=${inboundName}`;
        log:printDebug("Sending ICP internal API inbound parameters request",
                runtimeId = runtime.runtimeId,
                managementUrl = baseUrl,
                artifactPath = artifactPath,
                accept = "application/json"
        );
        http:Response|error resp = mgmtClient->get(artifactPath, {
            "Authorization": string `Bearer ${hmacToken}`,
            "Accept": "application/json"
        });

        if resp is error {
            log:printError("Failed to fetch inbound parameters from management API", resp);
            return error("Failed to fetch inbound parameters from management API");
        }

        if resp.statusCode != http:STATUS_OK {
            string|error errPayload = resp.getTextPayload();
            if errPayload is error {
                log:printError("Inbound parameters fetch returned non-OK status",
                        status = resp.statusCode.toString(),
                        runtimeId = runtime.runtimeId,
                        inboundName = inboundName);
                return error(string `Inbound parameters fetch failed with status ${resp.statusCode}`);
            }
            log:printError("Inbound parameters fetch returned non-OK status",
                    status = resp.statusCode.toString(),
                    runtimeId = runtime.runtimeId,
                    inboundName = inboundName,
                    response = errPayload);
            return error(string `Inbound parameters fetch failed with status ${resp.statusCode}: ${errPayload}`);
        }

        // Parse JSON payload and convert to Parameter[]
        json payload = check resp.getJsonPayload();
        types:Parameter[] params = [];

        if payload is map<json> {
            // Shape: {"param1": "value1", "param2": 123, ...}
            foreach var [k, v] in payload.entries() {
                string valStr;
                if v is string {
                    valStr = v;
                } else {
                    valStr = v.toJsonString();
                }
                params.push({name: k, value: valStr});
            }
        } else if payload is json[] {
            // Shape: [{"key":"...","value":"..."}] or [{"name":"...","paramValue":...}]
            foreach json item in payload {
                if item is map<json> {
                    json kJson = item["key"] ?: item["name"];
                    json vJson = item["value"] ?: item["paramValue"];
                    if kJson is string && vJson != () {
                        string vStr = vJson is string ? vJson : vJson.toJsonString();
                        params.push({name: kJson, value: vStr});
                    }
                }
            }
        } else if payload is string {
            // Edge: payload already a string; expose as a single entry
            params.push({name: "payload", value: payload});
        } else {
            log:printWarn("Unexpected inbound parameters JSON shape", inboundName = inboundName);
            log:printDebug("Processing inbound parameters for GraphQL service", inboundName = inboundName, paramCount = params.length());
        }

        log:printInfo("Successfully fetched inbound endpoint parameters",
                runtimeId = runtime.runtimeId,
                inboundName = inboundName,
                paramCount = params.length());
        return params;
    }

    // Get Parameters for any artifact type from management API via ICP internal API
    isolated resource function get artifactParametersByComponent(
            graphql:Context context,
            string componentId,
            string artifactType,
            string artifactName,
            string? environmentId = (),
            string? runtimeId = ()
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
        types:Runtime runtime = check selectRuntime(runtimes, componentId, environmentId, runtimeId);

        // Build management API base URL
        string baseUrl = check storage:buildManagementBaseUrl(runtime.managementHostname, runtime.managementPort);

        log:printInfo("Fetching artifact parameters from management API",
                runtimeId = runtime.runtimeId,
                managementUrl = baseUrl,
                artifactType = artifactType,
                artifactName = artifactName);

        // Create management API client (toggle insecure TLS via configuration)
        http:Client|error mgmtClient = artifactsApiAllowInsecureTLS
            ? new (baseUrl, {secureSocket: {enable: false}})
            : new (baseUrl);
        if mgmtClient is error {
            log:printError("Failed to create management API client", mgmtClient);
            return error("Failed to create management API client");
        }

        // Generate an HMAC JWT (same mechanism as heartbeat) to call the ICP internal API
        string hmacToken = check storage:issueRuntimeHmacToken(runtime.runtimeId);

        // Fetch parameters via ICP Internal API (/icp/artifacts/parameters)
        string artifactPath = string `${ICP_ARTIFACTS_PATH}/parameters?type=${artifactType}&name=${artifactName}`;
        log:printDebug("Sending ICP internal API artifact parameters request",
                runtimeId = runtime.runtimeId,
                managementUrl = baseUrl,
                artifactPath = artifactPath,
                accept = "application/json");

        http:Response|error resp = mgmtClient->get(artifactPath, {
            "Authorization": string `Bearer ${hmacToken}`,
            "Accept": "application/json"
        });

        if resp is error {
            log:printError("Failed to fetch artifact parameters from management API", resp);
            return error("Failed to fetch artifact parameters from management API");
        }

        if resp.statusCode != http:STATUS_OK {
            string|error errPayload = resp.getTextPayload();
            if errPayload is error {
                log:printError("Artifact parameters fetch returned non-OK status",
                        status = resp.statusCode.toString(),
                        runtimeId = runtime.runtimeId,
                        artifactType = artifactType,
                        artifactName = artifactName);
                return error(string `Artifact parameters fetch failed with status ${resp.statusCode}`);
            }
            log:printError("Artifact parameters fetch returned non-OK status",
                    status = resp.statusCode.toString(),
                    runtimeId = runtime.runtimeId,
                    artifactType = artifactType,
                    artifactName = artifactName,
                    response = errPayload);
            return error(string `Artifact parameters fetch failed with status ${resp.statusCode}: ${errPayload}`);
        }

        // Parse JSON payload and convert to Parameter[] (same logic as inbound)
        json payload = check resp.getJsonPayload();
        types:Parameter[] params = [];

        if payload is map<json> {
            foreach var [k, v] in payload.entries() {
                string valStr;
                if v is string {
                    valStr = v;
                } else {
                    valStr = v.toJsonString();
                }
                params.push({name: k, value: valStr});
            }
        } else if payload is json[] {
            foreach json item in payload {
                if item is map<json> {
                    // 1. Resolve the key using the Elvis operator for fallbacks
                    json kJson = item["key"] ?: item["name"];

                    // 2. Resolve the value (checking "value" then "paramValue")
                    json vJson = item["value"] ?: item["paramValue"];

                    // 3. Process only if we have a valid key and a non-null value
                    if kJson is string && vJson != () {
                        string vStr = vJson is string ? vJson : vJson.toJsonString();
                        params.push({name: kJson, value: vStr});
                    }
                }
            }
        } else if payload is string {
            params.push({name: "payload", value: payload});
        } else {
            log:printWarn("Unexpected artifact parameters JSON shape", artifactType = artifactType, artifactName = artifactName);
            log:printDebug("Processing artifact parameters", artifactType = artifactType, artifactName = artifactName, paramCount = params.length());
        }

        log:printInfo("Successfully fetched artifact parameters",
                runtimeId = runtime.runtimeId,
                artifactType = artifactType,
                artifactName = artifactName,
                paramCount = params.length());
        return params;
    }
}

isolated function extractUserContext(graphql:Context context) returns types:UserContextV2|error {
    value:Cloneable|error|isolated object {} authHeader = context.get("Authorization");
    if authHeader !is string {
        return error("Authorization header missing in request");
    }

    // Extract user context V2 for RBAC
    return check auth:extractUserContextV2(authHeader);
}
