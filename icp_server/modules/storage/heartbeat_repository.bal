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

import ballerina/cache;
import ballerina/log;
import ballerina/sql;
import ballerina/time;
import ballerina/uuid;

// Runtime hash cache for delta heartbeat optimization
final cache:Cache hashCache = new (capacity = 1000, evictionFactor = 0.2);

// Process full heartbeat.
// When preResolved=true, heartbeat.environment/.project/.component are already UUIDs
// (set by the kid-based heartbeat endpoint) — skip name-to-ID resolution.
public isolated function processHeartbeat(types:Heartbeat heartbeat, boolean preResolved = false) returns types:HeartbeatResponse|error {
    check validateHeartbeatProtocolAndRuntime(heartbeat);
    if !preResolved {
        check validateHeartbeatResolution(heartbeat);
    }

    string? previousStatus = ();
    boolean isNewRegistration = false;
    boolean fullHeartbeatRequired = false;
    string runtimeId = heartbeat.runtimeId;

    transaction {
        previousStatus = check upsertRuntime(heartbeat);
        isNewRegistration = previousStatus is ();

        // After upsertRuntime, use runtimeId for all operations
        if isNewRegistration {
            log:printInfo(string `Registered new runtime via heartbeat: ${runtimeId}`);
        } else {
            log:printDebug(string `Updated runtime via heartbeat: ${runtimeId}`);
        }

        // Insert all runtime artifacts
        check insertRuntimeArtifacts(runtimeId, heartbeat);

        // Validate runtime consistency within component (only for new registrations)
        if isNewRegistration {
            error? validationResult = validateComponentRuntimeConsistency(heartbeat.component, heartbeat.artifacts);
            if validationResult is error {
                log:printWarn(string `Component consistency validation failed for runtime ${runtimeId}`, validationResult);
            }
        }

        // Create audit log entry
        string action = isNewRegistration ? "REGISTER" : "HEARTBEAT";
        int totalArtifacts = countTotalArtifacts(heartbeat.artifacts);
        if (totalArtifacts == 0) {
            fullHeartbeatRequired = true;
            log:printWarn(string `No artifacts reported in heartbeat for runtime ${runtimeId}`);
        }
        _ = check dbClient->execute(`
            INSERT INTO audit_logs (
                runtime_id, action, details
            ) VALUES (
                ${runtimeId}, ${action},
                ${string `Runtime ${action.toLowerAscii()} processed with ${totalArtifacts} total artifacts (${heartbeat.artifacts.services.length()} services,
                 ${heartbeat.artifacts.listeners.length()} listeners)`}
            )
        `);
        check commit;
        log:printDebug(string `Successfully processed ${action.toLowerAscii()} for runtime ${runtimeId} with ${totalArtifacts} total artifacts`);

    } on fail error e {
        log:printError(string `Failed to process heartbeat for runtime ${runtimeId}`, e);
        return error(string `Failed to process heartbeat for runtime ${runtimeId}`, e);
    }

    // Notify WebSocket subscribers only when status actually changes (or on first registration).
    // Suppress events for steady-state heartbeats to avoid duplicate notifications.
    if previousStatus is () || previousStatus != heartbeat.status {
        string|error envNameResult = getEnvironmentNameById(heartbeat.environment);
        string environmentName = envNameResult is string ? envNameResult : heartbeat.environment;
        runtimeBroadcaster.publish(heartbeat.environment, environmentName, runtimeId, heartbeat.status);
    }

    // Write observed state from heartbeat artifacts (skip for incomplete heartbeats to avoid pruning valid state)
    if !fullHeartbeatRequired {
        string? componentType = check getComponentTypeByRuntimeId(runtimeId);
        log:printDebug(string `Resolved component type: ${componentType ?: "unknown"} for runtime ${runtimeId}`);
        if componentType == types:MI {
            check writeObservedStateMI(runtimeId, heartbeat.component, heartbeat.environment, heartbeat.artifacts);
        } else if componentType == types:BI {
            check writeObservedStateBI(runtimeId, heartbeat.component, heartbeat.environment, heartbeat.artifacts, heartbeat.logLevels);
        }
    } else {
        log:printDebug(string `Skipping observed state write for runtime ${runtimeId}: heartbeat marked incomplete`);
    }
    types:ControlCommand[] pendingCommands = [];

    // Cache the runtime hash value
    error? cacheResult = hashCache.put(runtimeId, heartbeat.runtimeHash);
    if cacheResult is error {
        log:printWarn(string `Failed to cache runtime hash for ${runtimeId}`, cacheResult);
    } else {
        log:printDebug(string `Cached runtime hash for ${runtimeId}: ${heartbeat.runtimeHash}`);
    }

    return {
        acknowledged: true,
        fullHeartbeatRequired: fullHeartbeatRequired,
        commands: pendingCommands
    };
}

// Process delta heartbeat with hash validation
public isolated function processDeltaHeartbeat(types:DeltaHeartbeat deltaHeartbeat) returns types:HeartbeatResponse|error {
    if deltaHeartbeat.heartbeatVersion != "v1.0" {
        return error(string `Unsupported delta heartbeat version: ${deltaHeartbeat.heartbeatVersion}. Only version v1.0 is supported.`);
    }
    string runtimeId = deltaHeartbeat.runtimeId;
    if runtimeId.trim().length() == 0 {
        return error("Runtime ID cannot be empty");
    }
    log:printDebug(string `Processing delta heartbeat v${deltaHeartbeat.heartbeatVersion} for runtime: ${runtimeId}`);

    time:Utc currentTime = time:utcNow();
    string currentTimeStr = check convertUtcToDbDateTime(currentTime);
    boolean hashMatches = false;

    if hashCache.hasKey(runtimeId) {
        any|error cachedHash = hashCache.get(runtimeId);
        hashMatches = cachedHash is string && cachedHash == deltaHeartbeat.runtimeHash;
        log:printDebug(string `Hash for runtime ${runtimeId} matches: ${hashMatches}`);
    }

    if !hashMatches {
        // Hash doesn't match or runtime not in cache, request full heartbeat
        log:printInfo(string `Hash mismatch for runtime ${runtimeId}, requesting full heartbeat`);

        // Still update the timestamp to show runtime is alive
        sql:ExecutionResult|error result = dbClient->execute(`
            UPDATE runtimes
            SET last_heartbeat = CURRENT_TIMESTAMP, status = 'RUNNING'
            WHERE runtime_id = ${runtimeId}
        `);

        if result is error {
            log:printError(string `Failed to update timestamp for runtime ${runtimeId}`, result);
        }

        return {
            acknowledged: true,
            fullHeartbeatRequired: true,
            commands: []
        };
    }

    // Hash matches, process delta heartbeat

    // Update the heartbeat timestamp
    sql:ExecutionResult|error timestampResult = dbClient->execute(`
        UPDATE runtimes
        SET last_heartbeat = CURRENT_TIMESTAMP, status = 'RUNNING'
        WHERE runtime_id = ${runtimeId}
    `);

    boolean runtimeExists = true;
    if timestampResult is error {
        log:printError(string `Failed to update timestamp for runtime ${runtimeId}`, timestampResult);
        runtimeExists = false;
        log:printDebug(string `Runtime ${runtimeId} marked as non-existent due to UPDATE error`);
    } else {
        runtimeExists = (timestampResult.affectedRowCount ?: 0) > 0;
        log:printDebug(string `Runtime ${runtimeId} existence check: ${runtimeExists} (affected rows: ${timestampResult.affectedRowCount ?: 0})`);
    }

    // Audit logging
    transaction {
        if runtimeExists {
            sql:ParameterizedQuery auditQuery = sql:queryConcat(
                    `INSERT INTO audit_logs (
                    runtime_id, action, details, timestamp
                ) VALUES (
                    ${runtimeId}, 'DELTA_HEARTBEAT',
                    ${string `Delta heartbeat processed with hash ${deltaHeartbeat.runtimeHash}`},
                    `, sql:queryConcat(sqlQueryFromString(timestampCast(currentTimeStr)), `)`)
            );
            _ = check dbClient->execute(auditQuery);
        } else {
            sql:ParameterizedQuery auditQuery = sql:queryConcat(
                    `INSERT INTO audit_logs (
                    action, details, timestamp
                ) VALUES (
                    'DELTA_HEARTBEAT',
                    ${string `Delta heartbeat received for missing runtime ${runtimeId} with hash ${deltaHeartbeat.runtimeHash}`},
                    `, sql:queryConcat(sqlQueryFromString(timestampCast(currentTimeStr)), `)`)
            );
            _ = check dbClient->execute(auditQuery);
        }

        check commit;
        log:printDebug(string `Successfully processed delta heartbeat for runtime ${runtimeId}`);

    } on fail error e {
        log:printError(string `Failed to process delta heartbeat for runtime ${runtimeId}`, e);
        return error(string `Failed to process delta heartbeat for runtime ${runtimeId}`, e);
    }

    if !runtimeExists {
        log:printDebug(string `Runtime ${runtimeId} does not exist, requesting full heartbeat`);
    }

    return {
        acknowledged: true,
        fullHeartbeatRequired: !runtimeExists,
        commands: []
    };
}

// Validate heartbeat version, runtime name, and runtimeId. Always called regardless of preResolved.
public isolated function validateHeartbeatProtocolAndRuntime(types:Heartbeat heartbeat) returns error? {
    if heartbeat.heartbeatVersion != "v1.0" {
        return error(string `Unsupported heartbeat version: ${heartbeat.heartbeatVersion}. Only version v1.0 is supported.`);
    }

    string? runtimeOpt = heartbeat.runtime;
    if runtimeOpt is string {
        if runtimeOpt.length() > 100 {
            return error("Runtime name cannot exceed 100 characters");
        }
    }

    if heartbeat.runtimeId.trim().length() == 0 {
        return error("Runtime ID cannot be empty");
    }
    if heartbeat.runtimeId.length() != 36 {
        return error("Runtime ID must be a valid UUID (36 characters)");
    }
    log:printDebug(string `Processing heartbeat v${heartbeat.heartbeatVersion}: id=${heartbeat.runtimeId}, name=${heartbeat.runtime ?: "null"}`);
}

// Resolve heartbeat name fields to IDs and validate component consistency. Only called when preResolved=false.
isolated function validateHeartbeatResolution(types:Heartbeat heartbeat) returns error? {
    if heartbeat.component.trim().length() == 0 {
        return error("Component name cannot be empty");
    }

    if heartbeat.project.trim().length() == 0 {
        return error("Project name cannot be empty");
    }

    string|error envId = getEnvironmentIdByHandler(heartbeat.environment);
    if envId is error {
        return error(string `Invalid environment configuration detected: ${heartbeat.environment}`, envId);
    }
    heartbeat.environment = envId;

    string|error projectHandler = toHandler(heartbeat.project);
    if projectHandler is error {
        return error(string `Invalid project name '${heartbeat.project}': ${projectHandler.message()}`);
    }
    log:printDebug(string `Normalized project name '${heartbeat.project}' to handler '${projectHandler}'`);

    string|error componentHandler = toHandler(heartbeat.component);
    if componentHandler is error {
        return error(string `Invalid component name '${heartbeat.component}': ${componentHandler.message()}`);
    }
    log:printDebug(string `Normalized component name '${heartbeat.component}' to handler '${componentHandler}'`);

    string|error projectId = resolveOrCreateProject(projectHandler, ());
    if projectId is error {
        return error(string `Failed to resolve or create project: ${heartbeat.project}`, projectId);
    }
    heartbeat.project = projectId;

    string|error componentId = resolveOrCreateComponent(projectId, componentHandler, heartbeat.runtimeType, ());
    if componentId is error {
        return error(string `Failed to resolve or create component: ${heartbeat.component}`, componentId);
    }
    heartbeat.component = componentId;

    types:Component|error componentById = getComponentById(componentId);
    if componentById is error {
        return error(string `Failed to retrieve component details: ${componentId}`, componentById);
    }
    if componentById.componentType != heartbeat.runtimeType {
        return error(string `Component type mismatch for component ${componentId}. Expected: ${componentById.componentType}, Got: ${heartbeat.runtimeType}`);
    }
}

// Validate component runtime consistency
isolated function validateComponentRuntimeConsistency(string componentId, types:Artifacts newArtifacts) returns error? {
    stream<record {|string runtime_id;|}, sql:Error?> runtimeStream = dbClient->query(`
        SELECT runtime_id FROM runtimes WHERE component_id = ${componentId}
    `);

    record {|string runtime_id;|}[] existingRuntimes = check from record {|string runtime_id;|} runtime in runtimeStream
        select runtime;

    if existingRuntimes.length() == 0 {
        return;
    }

    string referenceRuntimeId = existingRuntimes[0].runtime_id;
    types:Service[] referenceServices = check getServicesForRuntime(referenceRuntimeId);
    types:Listener[] referenceListeners = check getListenersForRuntime(referenceRuntimeId);

    error? servicesValidation = validateServicesConsistency(referenceServices, newArtifacts.services);
    if servicesValidation is error {
        return error(string `Service inconsistency detected in component ${componentId}: ${servicesValidation.message()}`);
    }

    error? listenersValidation = validateListenersConsistency(referenceListeners, newArtifacts.listeners);
    if listenersValidation is error {
        return error(string `Listener inconsistency detected in component ${componentId}: ${listenersValidation.message()}`);
    }
}

// Validate services consistency
isolated function validateServicesConsistency(types:Service[] referenceServices, types:Service[] newServices) returns error? {
    if referenceServices.length() != newServices.length() {
        return error(string `Expected ${referenceServices.length()} services, but got ${newServices.length()}`);
    }

    map<types:Service> referenceServiceMap = {};
    foreach types:Service svc in referenceServices {
        referenceServiceMap[svc.name] = svc;
    }

    foreach types:Service newService in newServices {
        if !referenceServiceMap.hasKey(newService.name) {
            return error(string `Service '${newService.name}' not found in reference runtime`);
        }

        types:Service? refServiceOpt = referenceServiceMap[newService.name];
        if refServiceOpt is () {
            return error(string `Service '${newService.name}' not found in reference runtime`);
        }
        types:Service refService = refServiceOpt;

        if refService.package != newService.package {
            return error(string `Service '${newService.name}' package mismatch. Expected: ${refService.package}, Got: ${newService.package}`);
        }

        if refService.basePath != newService.basePath {
            return error(string `Service '${newService.name}' base path mismatch. Expected: ${refService.basePath}, Got: ${newService.basePath}`);
        }

        error? resourceValidation = validateResourcesConsistency(refService.resources, newService.resources);
        if resourceValidation is error {
            return error(string `Service '${newService.name}' resource mismatch: ${resourceValidation.message()}`);
        }
    }
}

// Validate listeners consistency
isolated function validateListenersConsistency(types:Listener[] referenceListeners, types:Listener[] newListeners) returns error? {
    if referenceListeners.length() != newListeners.length() {
        return error(string `Expected ${referenceListeners.length()} listeners, but got ${newListeners.length()}`);
    }

    map<types:Listener> referenceListenerMap = {};
    foreach types:Listener listenerItem in referenceListeners {
        referenceListenerMap[listenerItem.name] = listenerItem;
    }

    foreach types:Listener newListener in newListeners {
        if !referenceListenerMap.hasKey(newListener.name) {
            return error(string `Listener '${newListener.name}' not found in reference runtime`);
        }

        types:Listener? refListenerOpt = referenceListenerMap[newListener.name];
        if refListenerOpt is () {
            return error(string `Listener '${newListener.name}' not found in reference runtime`);
        }
        types:Listener refListener = refListenerOpt;

        if refListener.package != newListener.package {
            return error(string `Listener '${newListener.name}' package mismatch. Expected: ${refListener.package}, Got: ${newListener.package}`);
        }

        if refListener.protocol != newListener.protocol {
            return error(string `Listener '${newListener.name}' protocol mismatch. Expected: ${refListener.protocol}, Got: ${newListener.protocol}`);
        }
    }
}

// Validate resources consistency
isolated function validateResourcesConsistency(types:Resource[] referenceResources, types:Resource[] newResources) returns error? {
    if referenceResources.length() != newResources.length() {
        return error(string `Expected ${referenceResources.length()} resources, but got ${newResources.length()}`);
    }

    map<types:Resource> referenceResourceMap = {};
    foreach types:Resource resourceItem in referenceResources {
        referenceResourceMap[resourceItem.url] = resourceItem;
    }

    foreach types:Resource newResource in newResources {
        if !referenceResourceMap.hasKey(newResource.url) {
            return error(string `Resource with URL '${newResource.url}' not found in reference runtime`);
        }

        types:Resource? refResourceOpt = referenceResourceMap[newResource.url];
        if refResourceOpt is () {
            return error(string `Resource with URL '${newResource.url}' not found in reference runtime`);
        }
        types:Resource refResource = refResourceOpt;

        if refResource.methods.length() != newResource.methods.length() {
            return error(string `Resource '${newResource.url}' methods count mismatch. Expected: ${refResource.methods.length()}, Got: ${newResource.methods.length()}`);
        }

        map<boolean> refMethodsSet = {};
        foreach string method in refResource.methods {
            refMethodsSet[method] = true;
        }

        foreach string method in newResource.methods {
            if !refMethodsSet.hasKey(method) {
                return error(string `Resource '${newResource.url}' has unexpected method '${method}'`);
            }
        }
    }

    return ();
}

isolated function writeObservedStateMI(string runtimeId, string componentId, string envId,
        types:Artifacts artifacts) returns error? {
    log:printDebug(string `Writing MI observed state for runtime ${runtimeId}, component ${componentId}, environment ${envId}`);
    [types:ReconcileArtifactKey, map<string>][] entries = [];
    foreach types:RestApi api in <types:RestApi[]>artifacts.apis {
        entries.push([
            {artifactName: api.name, artifactType: "api"},
            {"status": api.state, "tracing": api.tracing, "statistics": api.statistics}
        ]);
    }
    foreach types:ProxyService proxy in <types:ProxyService[]>artifacts.proxyServices {
        entries.push([
            {artifactName: proxy.name, artifactType: "proxy-service"},
            {"status": proxy.state, "tracing": proxy.tracing, "statistics": proxy.statistics}
        ]);
    }
    foreach types:Endpoint ep in <types:Endpoint[]>artifacts.endpoints {
        entries.push([
            {artifactName: ep.name, artifactType: "endpoint"},
            {"status": ep.state, "tracing": ep.tracing, "statistics": ep.statistics}
        ]);
    }
    foreach types:InboundEndpoint ie in <types:InboundEndpoint[]>artifacts.inboundEndpoints {
        entries.push([
            {artifactName: ie.name, artifactType: "inbound-endpoint"},
            {"status": ie.state, "tracing": ie.tracing, "statistics": ie.statistics ?: "disabled"}
        ]);
    }
    foreach types:Sequence seq in <types:Sequence[]>artifacts.sequences {
        entries.push([
            {artifactName: seq.name, artifactType: "sequence"},
            {"status": seq.state, "tracing": seq.tracing, "statistics": seq.statistics}
        ]);
    }
    foreach types:Task task in <types:Task[]>artifacts.tasks {
        entries.push([{artifactName: task.name, artifactType: "task"}, {"status": task.state}]);
    }
    foreach types:MessageProcessor mp in <types:MessageProcessor[]>artifacts.messageProcessors {
        entries.push([{artifactName: mp.name, artifactType: "message-processor"}, {"status": mp.state}]);
    }
    foreach types:LocalEntry le in <types:LocalEntry[]>artifacts.localEntries {
        entries.push([{artifactName: le.name, artifactType: "local-entry"}, {"status": le.state}]);
    }
    foreach types:DataService ds in <types:DataService[]>artifacts.dataServices {
        entries.push([{artifactName: ds.name, artifactType: "data-service"}, {"status": normalizeDataServiceState(ds.state)}]);
    }
    foreach types:Connector conn in <types:Connector[]>artifacts.connectors {
        entries.push([{artifactName: conn.name, artifactType: "connector"}, {"status": conn.state}]);
    }
    foreach types:MessageStore store in <types:MessageStore[]>artifacts.messageStores {
        entries.push([{artifactName: store.name, artifactType: "message-store"}, {"status": store.state}]);
    }
    foreach types:CompositeApp app in <types:CompositeApp[]>artifacts.carbonApps {
        string appState = normalizeCompositeAppState(app.status ?: app.state);
        log:printDebug(string `Processing composite app: ${app.name} with state: ${appState}`);
        entries.push([{artifactName: app.name, artifactType: "composite-app"}, {"status": appState}]);
    }
    check batchUpsertReconcileObservedState(runtimeId, componentId, envId, entries);
}

isolated function writeObservedStateBI(string runtimeId, string componentId, string envId,
        types:Artifacts artifacts, map<log:Level>? logLevels) returns error? {
    log:printDebug(string `Writing BI observed state for runtime ${runtimeId}, component ${componentId}, environment ${envId}`);
    [types:ReconcileArtifactKey, map<string>][] entries = [];
    foreach types:Service svc in artifacts.services {
        string qualName = types:qualifiedArtifactName(svc.name, svc.package);
        entries.push([
            {artifactName: qualName, artifactType: "service"},
            {"status": svc.state.toLowerAscii()}
        ]);
    }
    foreach types:Listener 'listener in artifacts.listeners {
        string qualName = types:qualifiedArtifactName('listener.name, 'listener.package);
        entries.push([
            {artifactName: qualName, artifactType: "listener"},
            {"status": 'listener.state.toLowerAscii()}
        ]);
    }
    if logLevels is map<log:Level> {
        foreach var [componentName, logLevel] in logLevels.entries() {
            entries.push([
                {artifactName: componentName, artifactType: "log-level"},
                {"logLevel": logLevel.toString()}
            ]);
        }
    }
    check batchUpsertReconcileObservedState(runtimeId, componentId, envId, entries);
}

// Upsert runtime record
isolated function upsertRuntime(types:Heartbeat heartbeat) returns string?|error {
    string? runtimeName = heartbeat.runtime;
    string runtimeId = heartbeat.runtimeId;
    log:printDebug(string `Upserting runtime: id=${runtimeId}, name=${runtimeName ?: "null"}`);

    // Use default values if management hostname and port are not provided
    string runtimeHostname = heartbeat.runtimeHostname ?: "";
    string runtimePort = heartbeat.runtimePort ?: "";
    // Workflow management service base URL reported by the runtime bridge (optional; NULL when absent)
    string? callbackUrl = heartbeat?.workflowCallbackUrl;
    // Bare, reachable host/IP for this runtime process (optional; NULL when absent) - used by the Try-It proxy
    string? tryItHost = heartbeat?.tryItHost;

    // Check if a runtime with the same component/env/name but a different ID already exists.
    // A restarting runtime generally comes back with a fresh ID (containers lose the persisted
    // ID with their filesystem), so the old row has to be cleared out before the upsert.
    stream<record {|string runtime_id;|}, sql:Error?> existingByName;
    if runtimeName is string {
        // Named runtimes are covered by uq_runtime_identity (component_id, environment_id, name),
        // so at most one row can hold this name and it cannot belong to a live sibling replica.
        // A differing ID here is therefore always a restarted instance. Matching only OFFLINE rows
        // would leave a fast restart - a rolling update, eviction or reschedule - unable to
        // register until the old row times out, because the INSERT below hits that constraint.
        existingByName = dbClient->query(`
            SELECT runtime_id FROM runtimes
            WHERE component_id = ${heartbeat.component} AND environment_id = ${heartbeat.environment} AND name = ${runtimeName}
        `);
    } else {
        // Unnamed runtimes are NOT covered by that constraint - NULLs compare as distinct - so
        // live sibling replicas can legitimately share a NULL name here. Keep the OFFLINE guard
        // so they are not mistaken for old restarted instances and deleted.
        existingByName = dbClient->query(`
            SELECT runtime_id FROM runtimes
            WHERE component_id = ${heartbeat.component} AND environment_id = ${heartbeat.environment} AND name IS NULL AND status = 'OFFLINE'
        `);
    }
    record {|string runtime_id;|}[] existingByNameRows = check from record {|string runtime_id;|} r in existingByName
        select r;

    if existingByNameRows.length() > 0 {
        string oldId = existingByNameRows[0].runtime_id;
        if oldId != runtimeId {
            log:printInfo(string `Runtime ID changed from ${oldId} to ${runtimeId} for ${runtimeName ?: "null"}`);
            log:printDebug(string `Deleting old runtime ${oldId} via reconcile cleanup flow`);
            check deleteExistingArtifacts(oldId);
            check deleteReconcileRuntime(oldId);
            check deleteRuntime(oldId);
        }
    }

    // Determine new-vs-existing and capture previous status before the upsert
    stream<record {|string runtime_id; string status;|}, sql:Error?> existingById = dbClient->query(`
        SELECT runtime_id, status FROM runtimes WHERE runtime_id = ${runtimeId}
    `);
    record {|string runtime_id; string status;|}[] existingByIdRows = check from var r in existingById
        select r;
    boolean isNewRegistration = existingByIdRows.length() == 0;
    string? previousStatus = isNewRegistration ? () : existingByIdRows[0].status;

    // Atomic upsert for PostgreSQL, fallback to INSERT/UPDATE for others
    if dbType == POSTGRESQL {
        _ = check dbClient->execute(`
            INSERT INTO runtimes (
                runtime_id, name, runtime_type, status, version,
                runtime_hostname, runtime_port, callback_url, try_it_host,
                environment_id, project_id, component_id,
                platform_name, platform_version, platform_home,
                os_name, os_version,
                carbon_home, java_vendor, java_version,
                total_memory, free_memory, max_memory, used_memory,
                os_arch, server_name, last_heartbeat
            ) VALUES (
                ${runtimeId}, ${runtimeName}, ${heartbeat.runtimeType}, ${heartbeat.status}, ${heartbeat.version},
                ${runtimeHostname}, ${runtimePort}, ${callbackUrl}, ${tryItHost},
                ${heartbeat.environment}, ${heartbeat.project}, ${heartbeat.component},
                ${heartbeat.nodeInfo.platformName}, ${heartbeat.nodeInfo.platformVersion}, ${heartbeat.nodeInfo.platformHome},
                ${heartbeat.nodeInfo.osName}, ${heartbeat.nodeInfo.osVersion},
                ${heartbeat.nodeInfo.carbonHome}, ${heartbeat.nodeInfo.javaVendor}, ${heartbeat.nodeInfo.javaVersion},
                ${heartbeat.nodeInfo.totalMemory}, ${heartbeat.nodeInfo.freeMemory}, ${heartbeat.nodeInfo.maxMemory}, ${heartbeat.nodeInfo.usedMemory},
                ${heartbeat.nodeInfo.osArch}, ${heartbeat.nodeInfo.platformName}, CURRENT_TIMESTAMP
            )
            ON CONFLICT (runtime_id) DO UPDATE SET
                name = EXCLUDED.name,
                runtime_type = EXCLUDED.runtime_type,
                status = EXCLUDED.status,
                version = EXCLUDED.version,
                runtime_hostname = EXCLUDED.runtime_hostname,
                runtime_port = EXCLUDED.runtime_port,
                callback_url = EXCLUDED.callback_url,
                try_it_host = EXCLUDED.try_it_host,
                environment_id = EXCLUDED.environment_id,
                project_id = EXCLUDED.project_id,
                component_id = EXCLUDED.component_id,
                platform_name = EXCLUDED.platform_name,
                platform_version = EXCLUDED.platform_version,
                platform_home = EXCLUDED.platform_home,
                os_name = EXCLUDED.os_name,
                os_version = EXCLUDED.os_version,
                carbon_home = EXCLUDED.carbon_home,
                java_vendor = EXCLUDED.java_vendor,
                java_version = EXCLUDED.java_version,
                total_memory = EXCLUDED.total_memory,
                free_memory = EXCLUDED.free_memory,
                max_memory = EXCLUDED.max_memory,
                used_memory = EXCLUDED.used_memory,
                os_arch = EXCLUDED.os_arch,
                server_name = EXCLUDED.server_name,
                last_heartbeat = CURRENT_TIMESTAMP
        `);
    } else if isNewRegistration {
        _ = check dbClient->execute(`
            INSERT INTO runtimes (
                runtime_id, name, runtime_type, status, version,
                runtime_hostname, runtime_port, callback_url, try_it_host,
                environment_id, project_id, component_id,
                platform_name, platform_version, platform_home,
                os_name, os_version,
                carbon_home, java_vendor, java_version,
                total_memory, free_memory, max_memory, used_memory,
                os_arch, server_name, last_heartbeat
            ) VALUES (
                ${runtimeId}, ${runtimeName}, ${heartbeat.runtimeType}, ${heartbeat.status}, ${heartbeat.version},
                ${runtimeHostname}, ${runtimePort}, ${callbackUrl}, ${tryItHost},
                ${heartbeat.environment}, ${heartbeat.project}, ${heartbeat.component},
                ${heartbeat.nodeInfo.platformName}, ${heartbeat.nodeInfo.platformVersion}, ${heartbeat.nodeInfo.platformHome},
                ${heartbeat.nodeInfo.osName}, ${heartbeat.nodeInfo.osVersion},
                ${heartbeat.nodeInfo.carbonHome}, ${heartbeat.nodeInfo.javaVendor}, ${heartbeat.nodeInfo.javaVersion},
                ${heartbeat.nodeInfo.totalMemory}, ${heartbeat.nodeInfo.freeMemory}, ${heartbeat.nodeInfo.maxMemory}, ${heartbeat.nodeInfo.usedMemory},
                ${heartbeat.nodeInfo.osArch}, ${heartbeat.nodeInfo.platformName}, CURRENT_TIMESTAMP
            )
        `);
    } else {
        _ = check dbClient->execute(`
            UPDATE runtimes SET
                name = ${runtimeName},
                runtime_type = ${heartbeat.runtimeType},
                status = ${heartbeat.status},
                version = ${heartbeat.version},
                runtime_hostname = ${runtimeHostname},
                runtime_port = ${runtimePort},
                callback_url = ${callbackUrl},
                try_it_host = ${tryItHost},
                environment_id = ${heartbeat.environment},
                project_id = ${heartbeat.project},
                component_id = ${heartbeat.component},
                platform_name = ${heartbeat.nodeInfo.platformName},
                platform_version = ${heartbeat.nodeInfo.platformVersion},
                platform_home = ${heartbeat.nodeInfo.platformHome},
                os_name = ${heartbeat.nodeInfo.osName},
                os_version = ${heartbeat.nodeInfo.osVersion},
                carbon_home = ${heartbeat.nodeInfo.carbonHome},
                java_vendor = ${heartbeat.nodeInfo.javaVendor},
                java_version = ${heartbeat.nodeInfo.javaVersion},
                total_memory = ${heartbeat.nodeInfo.totalMemory},
                free_memory = ${heartbeat.nodeInfo.freeMemory},
                max_memory = ${heartbeat.nodeInfo.maxMemory},
                used_memory = ${heartbeat.nodeInfo.usedMemory},
                os_arch = ${heartbeat.nodeInfo.osArch},
                server_name = ${heartbeat.nodeInfo.platformName},
                last_heartbeat = CURRENT_TIMESTAMP
            WHERE runtime_id = ${runtimeId}
        `);
    }
    return previousStatus;
}

// Insert all runtime artifacts
isolated function insertRuntimeArtifacts(string runtimeId, types:Heartbeat heartbeat) returns error? {
    // Delete existing BI services and resources for this runtime before inserting
    _ = check dbClient->execute(`DELETE FROM bi_service_resource_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM bi_service_listener_bindings WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM bi_service_artifacts WHERE runtime_id = ${runtimeId}`);

    // Insert services
    foreach types:Service serviceDetail in heartbeat.artifacts.services {
        _ = check dbClient->execute(`
            INSERT INTO bi_service_artifacts (
                runtime_id, service_name, service_package, base_path, state
            ) VALUES (
                ${runtimeId}, ${serviceDetail.name},
                ${serviceDetail.package}, ${serviceDetail.basePath},
                ${serviceDetail.state}
            )
        `);

        // Persist which listener(s) this service is attached to (dedup by name).
        // The heartbeat sends serviceDetail.listeners as name-only entries; we key
        // them to bi_runtime_listener_artifacts by (runtime_id, listener_name).
        string[] boundListenerNames = [];
        foreach types:Listener boundListener in serviceDetail.listeners {
            if boundListenerNames.indexOf(boundListener.name) is () {
                boundListenerNames.push(boundListener.name);
                _ = check dbClient->execute(`
                    INSERT INTO bi_service_listener_bindings (
                        runtime_id, service_name, service_package, listener_name
                    ) VALUES (
                        ${runtimeId}, ${serviceDetail.name},
                        ${serviceDetail.package}, ${boundListener.name}
                    )
                `);
            }
        }

        // Group resources by URL and merge methods to handle duplicates
        map<string[]> resourcesByUrl = {};
        foreach types:Resource resourceDetail in serviceDetail.resources {
            string url = resourceDetail.url;
            if resourcesByUrl.hasKey(url) {
                // Merge methods - combine with existing methods
                string[] existingMethods = resourcesByUrl.get(url);
                foreach string method in resourceDetail.methods {
                    // Add method if not already present
                    if existingMethods.indexOf(method) is () {
                        existingMethods.push(method);
                    }
                }
            } else {
                // First occurrence of this URL
                resourcesByUrl[url] = resourceDetail.methods.clone();
            }
        }

        // Insert deduplicated resources
        foreach [string, string[]] [url, methods] in resourcesByUrl.entries() {
            string methodsJson = methods.toJsonString();
            if dbType == POSTGRESQL {
                _ = check dbClient->execute(`
                    INSERT INTO bi_service_resource_artifacts (
                        runtime_id, service_name, resource_url, methods
                    ) VALUES (
                        ${runtimeId}, ${serviceDetail.name},
                        ${url}, ${methodsJson}::jsonb
                    )
                `);
            } else {
                _ = check dbClient->execute(`
                    INSERT INTO bi_service_resource_artifacts (
                        runtime_id, service_name, resource_url, methods
                    ) VALUES (
                        ${runtimeId}, ${serviceDetail.name},
                        ${url}, ${methodsJson}
                    )
                `);
            }
        }
    }

    // Delete existing BI listeners for this runtime before inserting
    _ = check dbClient->execute(`DELETE FROM bi_runtime_listener_artifacts WHERE runtime_id = ${runtimeId}`);

    // Insert listeners
    foreach types:Listener listenerDetail in heartbeat.artifacts.listeners {
        string? host = listenerDetail?.host;
        int? port = listenerDetail?.port;
        _ = check dbClient->execute(`
            INSERT INTO bi_runtime_listener_artifacts (
                runtime_id, listener_name, listener_package, protocol, listener_host, listener_port, state
            ) VALUES (
                ${runtimeId}, ${listenerDetail.name},
                ${listenerDetail.package}, ${listenerDetail.protocol},
                ${host}, ${port},
                ${listenerDetail.state}
            )
        `);
    }

    // Handle automation artifacts for BI integrations (main function)
    // Delete existing automation artifacts first
    _ = check dbClient->execute(`DELETE FROM bi_automation_artifacts WHERE runtime_id = ${runtimeId}`);

    // Only store automation when runtime type is BI, there are no listeners or services, and main artifact exists
    if heartbeat.runtimeType == "BI" && heartbeat.artifacts.listeners.length() == 0 && heartbeat.artifacts.services.length() == 0 {
        types:Main? mainArtifact = heartbeat.artifacts.main;
        if mainArtifact is types:Main {
            string executionTimeStr = check convertUtcToDbDateTime(heartbeat.timestamp);
            string executionId = uuid:createType4AsString();
            if dbType == POSTGRESQL {
                _ = check dbClient->execute(`
                    INSERT INTO bi_automation_artifacts (
                        runtime_id, package_org, package_name, package_version, execution_timestamp
                    ) VALUES (
                        ${runtimeId}, ${mainArtifact.packageOrg}, ${mainArtifact.packageName},
                        ${mainArtifact.packageVersion}, ${executionTimeStr}::timestamp
                    )
                `);
                _ = check dbClient->execute(`
                    INSERT INTO bi_automation_execution_history (
                        execution_id, runtime_id, package_org, package_name, package_version, execution_timestamp
                    ) VALUES (
                        ${executionId}, ${runtimeId}, ${mainArtifact.packageOrg}, ${mainArtifact.packageName},
                        ${mainArtifact.packageVersion}, ${executionTimeStr}::timestamp
                    )
                `);
            } else {
                _ = check dbClient->execute(`
                    INSERT INTO bi_automation_artifacts (
                        runtime_id, package_org, package_name, package_version, execution_timestamp
                    ) VALUES (
                        ${runtimeId}, ${mainArtifact.packageOrg}, ${mainArtifact.packageName},
                        ${mainArtifact.packageVersion}, ${executionTimeStr}
                    )
                `);
                _ = check dbClient->execute(`
                    INSERT INTO bi_automation_execution_history (
                        execution_id, runtime_id, package_org, package_name, package_version, execution_timestamp
                    ) VALUES (
                        ${executionId}, ${runtimeId}, ${mainArtifact.packageOrg}, ${mainArtifact.packageName},
                        ${mainArtifact.packageVersion}, ${executionTimeStr}
                    )
                `);
            }
        }
    }

    check insertMIArtifacts(runtimeId, heartbeat);
    check insertAdditionalMIArtifacts(runtimeId, heartbeat);
    check insertRuntimeLogLevels(runtimeId, heartbeat);
    check upsertOpenApiDefinitions(runtimeId, heartbeat);
}

// Delete existing packed OpenAPI (Swagger) definitions for this runtime and insert the ones
// from this heartbeat, if any. Runtimes that don't report any (remoteManagement disabled, no
// HTTP services, or non-BI runtime types) simply end up with no rows, same as before.
isolated function upsertOpenApiDefinitions(string runtimeId, types:Heartbeat heartbeat) returns error? {
    _ = check dbClient->execute(`DELETE FROM bi_service_openapi_definitions WHERE runtime_id = ${runtimeId}`);

    map<json>? openApiDefinitions = heartbeat?.openApiDefinitions;
    if openApiDefinitions is () {
        return;
    }

    foreach [string, json] [fileName, definition] in openApiDefinitions.entries() {
        string definitionJson = definition.toJsonString();
        if dbType == POSTGRESQL {
            _ = check dbClient->execute(`
                INSERT INTO bi_service_openapi_definitions (
                    runtime_id, file_name, definition
                ) VALUES (
                    ${runtimeId}, ${fileName}, ${definitionJson}::jsonb
                )
            `);
        } else {
            _ = check dbClient->execute(`
                INSERT INTO bi_service_openapi_definitions (
                    runtime_id, file_name, definition
                ) VALUES (
                    ${runtimeId}, ${fileName}, ${definitionJson}
                )
            `);
        }
    }
}

isolated function deleteMIArtifacts(string runtimeId) returns error? {
    log:printDebug(string `Deleting MI artifacts for runtime: ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM mi_api_resource_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM mi_api_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM mi_proxy_service_endpoint_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM mi_proxy_service_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM mi_endpoint_attribute_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM mi_endpoint_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM mi_inbound_endpoint_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM mi_sequence_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM mi_task_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM mi_template_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM mi_message_store_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM mi_message_processor_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM mi_local_entry_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM mi_data_service_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM mi_composite_app_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM mi_data_source_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM mi_connector_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM mi_registry_resource_artifacts WHERE runtime_id = ${runtimeId}`);
}

// Delete existing artifacts
isolated function deleteExistingArtifacts(string runtimeId) returns error? {
    _ = check dbClient->execute(`DELETE FROM bi_service_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM bi_runtime_listener_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM bi_service_resource_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM bi_automation_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM bi_automation_execution_history WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM bi_runtime_log_levels WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM bi_service_openapi_definitions WHERE runtime_id = ${runtimeId}`);
    check deleteMIArtifacts(runtimeId);
}

// Insert MI artifacts
isolated function insertMIArtifacts(string runtimeId, types:Heartbeat heartbeat) returns error? {
    check deleteMIArtifacts(runtimeId);
    
    log:printDebug(string `Inserting MI artifacts for runtime: ${runtimeId}`);
    foreach types:RestApi api in <types:RestApi[]>heartbeat.artifacts.apis {
        string artifactId = uuid:createType4AsString();
        string? compositeApp = api?.compositeApp;
        string urlsJson = api.urls.toJsonString();
        if dbType == MSSQL {
            _ = check dbClient->execute(`
                INSERT INTO mi_api_artifacts (runtime_id, api_name, artifact_id, url, urls, context, version, state, tracing, [statistics], composite_app)
                VALUES (${runtimeId}, ${api.name}, ${artifactId}, ${api.url}, ${urlsJson}, ${api.context},
                        ${api.version}, ${api.state}, ${api.tracing}, ${api.statistics}, ${compositeApp});
            `);
        } else if dbType == POSTGRESQL {
            _ = check dbClient->execute(`
                INSERT INTO mi_api_artifacts (
                    runtime_id, api_name, url, urls, context, version, state, tracing, statistics, composite_app
                ) VALUES (
                    ${runtimeId}, ${api.name}, ${api.url}, ${urlsJson},
                    ${api.context}, ${api.version}, ${api.state}, ${api.tracing}, ${api.statistics}, ${compositeApp}
                )
            `);
        } else {
            _ = check dbClient->execute(`
                INSERT INTO mi_api_artifacts (
                    runtime_id, api_name, artifact_id, url, urls, context, version, state, tracing, statistics, composite_app
                ) VALUES (
                    ${runtimeId}, ${api.name}, ${artifactId}, ${api.url}, ${urlsJson},
                    ${api.context}, ${api.version}, ${api.state}, ${api.tracing}, ${api.statistics}, ${compositeApp}
                )
            `);
        }

        // Group resources by path and merge methods to handle duplicates
        map<string> resourcesByPath = {};
        foreach types:ApiResource apiResource in api.resources {
            string path = apiResource.path;
            if resourcesByPath.hasKey(path) {
                string existingMethods = resourcesByPath.get(path);
                string[] methodsList = [existingMethods, apiResource.methods];
                resourcesByPath[path] = string:'join(",", ...methodsList);
            } else {
                resourcesByPath[path] = apiResource.methods;
            }
        }

        // Insert deduplicated API resources
        foreach [string, string] [path, methods] in resourcesByPath.entries() {
            if dbType == MSSQL {
                _ = check dbClient->execute(`
                    INSERT INTO mi_api_resource_artifacts (runtime_id, api_name, resource_path, methods)
                    VALUES (${runtimeId}, ${api.name}, ${path}, ${methods});
                `);
            } else if dbType == POSTGRESQL {
                _ = check dbClient->execute(`
                    INSERT INTO mi_api_resource_artifacts (
                        runtime_id, api_name, resource_path, methods
                    ) VALUES (
                        ${runtimeId}, ${api.name},
                        ${path}, ${methods}
                    )
                `);
            } else {
                _ = check dbClient->execute(`
                    INSERT INTO mi_api_resource_artifacts (
                        runtime_id, api_name, resource_path, methods
                    ) VALUES (
                        ${runtimeId}, ${api.name},
                        ${path}, ${methods}
                    )
                `);
            }
        }
    }

    foreach types:ProxyService proxy in <types:ProxyService[]>heartbeat.artifacts.proxyServices {
        string artifactId = uuid:createType4AsString();
        string? compositeApp = proxy?.compositeApp;
        if isMSSQL() {
            _ = check dbClient->execute(`
                INSERT INTO mi_proxy_service_artifacts (runtime_id, proxy_name, artifact_id, state, tracing, [statistics], composite_app)
                VALUES (${runtimeId}, ${proxy.name}, ${artifactId}, ${proxy.state}, ${proxy.tracing}, ${proxy.statistics}, ${compositeApp});
            `);
        } else if dbType == POSTGRESQL {
            _ = check dbClient->execute(`
                INSERT INTO mi_proxy_service_artifacts (
                    runtime_id, proxy_name, artifact_id, state, tracing, statistics, composite_app
                ) VALUES (
                    ${runtimeId}, ${proxy.name}, ${artifactId}, ${proxy.state}, ${proxy.tracing}, ${proxy.statistics}, ${compositeApp}
                )
            `);
        } else {
            _ = check dbClient->execute(`
                INSERT INTO mi_proxy_service_artifacts (
                    runtime_id, proxy_name, artifact_id, state, tracing, statistics, composite_app
                ) VALUES (
                    ${runtimeId}, ${proxy.name}, ${artifactId}, ${proxy.state}, ${proxy.tracing}, ${proxy.statistics}, ${compositeApp}
                )
            `);
        }

        // Persist endpoints if present
        if proxy.endpoints is string[] {
            foreach string ep in <string[]>proxy.endpoints {
                if isMSSQL() {
                    _ = check dbClient->execute(`
                        INSERT INTO mi_proxy_service_endpoint_artifacts (runtime_id, proxy_name, endpoint_url)
                        VALUES (${runtimeId}, ${proxy.name}, ${ep});
                    `);
                } else if dbType == POSTGRESQL {
                    _ = check dbClient->execute(`
                        INSERT INTO mi_proxy_service_endpoint_artifacts (
                            runtime_id, proxy_name, endpoint_url
                        ) VALUES (
                            ${runtimeId}, ${proxy.name}, ${ep}
                        )
                    `);
                } else {
                    _ = check dbClient->execute(`
                        INSERT INTO mi_proxy_service_endpoint_artifacts (
                            runtime_id, proxy_name, endpoint_url
                        ) VALUES (
                            ${runtimeId}, ${proxy.name}, ${ep}
                        )
                    `);
                }
            }
        }
    }

    foreach types:Endpoint endpoint in <types:Endpoint[]>heartbeat.artifacts.endpoints {
        string artifactId = uuid:createType4AsString();
        string? compositeApp = endpoint?.compositeApp;
        if isMSSQL() {
            _ = check dbClient->execute(`
                INSERT INTO mi_endpoint_artifacts (runtime_id, endpoint_name, artifact_id, endpoint_type, state, tracing, [statistics], composite_app)
                VALUES (${runtimeId}, ${endpoint.name}, ${artifactId}, ${endpoint.'type},
                        ${endpoint.state}, ${endpoint.tracing}, ${endpoint.statistics}, ${compositeApp});
            `);
        } else if dbType == POSTGRESQL {
            _ = check dbClient->execute(`
                INSERT INTO mi_endpoint_artifacts (
                    runtime_id, endpoint_name, artifact_id, endpoint_type, state, tracing, statistics, composite_app
                ) VALUES (
                    ${runtimeId}, ${endpoint.name}, ${artifactId}, ${endpoint.'type},
                    ${endpoint.state}, ${endpoint.tracing}, ${endpoint.statistics}, ${compositeApp}
                )
            `);
        } else {
            _ = check dbClient->execute(`
                INSERT INTO mi_endpoint_artifacts (
                    runtime_id, endpoint_name, artifact_id, endpoint_type, state, tracing, statistics, composite_app
                ) VALUES (
                    ${runtimeId}, ${endpoint.name}, ${artifactId}, ${endpoint.'type},
                    ${endpoint.state}, ${endpoint.tracing}, ${endpoint.statistics}, ${compositeApp}
                )
            `);
        }

        // Persist endpoint attributes if present
        var attrsVal = endpoint?.attributes;
        if attrsVal is types:EndpointAttribute[] {
            foreach types:EndpointAttribute attr in attrsVal {
                if isMSSQL() {
                    _ = check dbClient->execute(`
                        INSERT INTO mi_endpoint_attribute_artifacts (runtime_id, endpoint_name, attribute_name, attribute_value)
                        VALUES (${runtimeId}, ${endpoint.name}, ${attr.name}, ${attr?.value});
                    `);
                } else if dbType == POSTGRESQL {
                    _ = check dbClient->execute(`
                        INSERT INTO mi_endpoint_attribute_artifacts (
                            runtime_id, endpoint_name, attribute_name, attribute_value
                        ) VALUES (
                            ${runtimeId}, ${endpoint.name}, ${attr.name}, ${attr?.value}
                        )
                    `);
                } else {
                    _ = check dbClient->execute(`
                        INSERT INTO mi_endpoint_attribute_artifacts (
                            runtime_id, endpoint_name, attribute_name, attribute_value
                        ) VALUES (
                            ${runtimeId}, ${endpoint.name}, ${attr.name}, ${attr?.value}
                        )
                    `);
                }
            }
        }
    }
}

// Insert additional MI artifacts
isolated function insertAdditionalMIArtifacts(string runtimeId, types:Heartbeat heartbeat) returns error? {
    foreach types:InboundEndpoint inbound in <types:InboundEndpoint[]>heartbeat.artifacts.inboundEndpoints {
        string artifactId = uuid:createType4AsString();
        string? compositeApp = inbound?.compositeApp;
        if isMSSQL() {
            _ = check dbClient->execute(`
                INSERT INTO mi_inbound_endpoint_artifacts (runtime_id, inbound_name, artifact_id, protocol, sequence, state, [statistics], on_error, tracing, composite_app)
                VALUES (${runtimeId}, ${inbound.name}, ${artifactId}, ${inbound.protocol}, ${inbound.sequence},
                        ${inbound.state}, ${inbound.statistics}, ${inbound.onError}, ${inbound.tracing}, ${compositeApp});
            `);
        } else if dbType == POSTGRESQL {
            _ = check dbClient->execute(`
                INSERT INTO mi_inbound_endpoint_artifacts (
                    runtime_id, inbound_name, protocol, sequence, state, statistics, on_error, tracing, composite_app
                ) VALUES (
                    ${runtimeId}, ${inbound.name}, ${inbound.protocol},
                    ${inbound.sequence}, ${inbound.state}, ${inbound.statistics}, ${inbound.onError}, ${inbound.tracing}, ${compositeApp}
                )
            `);
        } else {
            _ = check dbClient->execute(`
                INSERT INTO mi_inbound_endpoint_artifacts (
                    runtime_id, inbound_name, artifact_id, protocol, sequence, state, statistics, on_error, tracing, composite_app
                ) VALUES (
                    ${runtimeId}, ${inbound.name}, ${artifactId}, ${inbound.protocol},
                    ${inbound.sequence}, ${inbound.state}, ${inbound.statistics}, ${inbound.onError}, ${inbound.tracing}, ${compositeApp}
                )
            `);
        }
    }

    foreach types:Sequence sequence in <types:Sequence[]>heartbeat.artifacts.sequences {
        string artifactId = uuid:createType4AsString();
        string? compositeApp = sequence?.compositeApp;
        if isMSSQL() {
            _ = check dbClient->execute(`
                INSERT INTO mi_sequence_artifacts (runtime_id, sequence_name, artifact_id, sequence_type, container, state, tracing, [statistics], composite_app)
                VALUES (${runtimeId}, ${sequence.name}, ${artifactId}, ${sequence.'type},
                        ${sequence.container}, ${sequence.state}, ${sequence.tracing}, ${sequence.statistics}, ${compositeApp});
            `);
        } else if dbType == POSTGRESQL {
            _ = check dbClient->execute(`
                INSERT INTO mi_sequence_artifacts (
                    runtime_id, sequence_name, sequence_type, container, state, tracing, statistics, composite_app
                ) VALUES (
                    ${runtimeId}, ${sequence.name}, ${sequence.'type},
                    ${sequence.container}, ${sequence.state}, ${sequence.tracing}, ${sequence.statistics}, ${compositeApp}
                )
            `);
        } else {
            _ = check dbClient->execute(`
                INSERT INTO mi_sequence_artifacts (
                    runtime_id, sequence_name, artifact_id, sequence_type, container, state, tracing, statistics, composite_app
                ) VALUES (
                    ${runtimeId}, ${sequence.name}, ${artifactId}, ${sequence.'type},
                    ${sequence.container}, ${sequence.state}, ${sequence.tracing}, ${sequence.statistics}, ${compositeApp}
                )
            `);
        }
    }

    foreach types:Task task in <types:Task[]>heartbeat.artifacts.tasks {
        string artifactId = uuid:createType4AsString();
        string? compositeApp = task?.compositeApp;
        if isMSSQL() {
            _ = check dbClient->execute(`
                INSERT INTO mi_task_artifacts (runtime_id, task_name, artifact_id, task_class, task_group, state, composite_app)
                VALUES (${runtimeId}, ${task.name}, ${artifactId}, ${task.'class}, ${task.group}, ${task.state}, ${compositeApp});
            `);
        } else if dbType == POSTGRESQL {
            _ = check dbClient->execute(`
                INSERT INTO mi_task_artifacts (
                    runtime_id, task_name, task_class, task_group, state, composite_app
                ) VALUES (
                    ${runtimeId}, ${task.name}, ${task.'class},
                    ${task.group}, ${task.state}, ${compositeApp}
                )
            `);
        } else {
            _ = check dbClient->execute(`
                INSERT INTO mi_task_artifacts (
                    runtime_id, task_name, artifact_id, task_class, task_group, state, composite_app
                ) VALUES (
                    ${runtimeId}, ${task.name}, ${artifactId}, ${task.'class},
                    ${task.group}, ${task.state}, ${compositeApp}
                )
            `);
        }
    }

    foreach types:Template template in <types:Template[]>heartbeat.artifacts.templates {
        string? compositeApp = template?.compositeApp;
        if isMSSQL() {
            _ = check dbClient->execute(`
                INSERT INTO mi_template_artifacts (runtime_id, template_name, template_type, tracing, [statistics], composite_app)
                VALUES (${runtimeId}, ${template.name}, ${template.'type}, ${template.tracing}, ${template.statistics}, ${compositeApp});
            `);
        } else if dbType == POSTGRESQL {
            _ = check dbClient->execute(`
                INSERT INTO mi_template_artifacts (
                    runtime_id, template_name, template_type, tracing, statistics, composite_app
                ) VALUES (
                    ${runtimeId}, ${template.name}, ${template.'type}, ${template.tracing}, ${template.statistics}, ${compositeApp}
                )
            `);
        } else {
            _ = check dbClient->execute(`
                INSERT INTO mi_template_artifacts (
                    runtime_id, template_name, template_type, tracing, statistics, composite_app
                ) VALUES (
                    ${runtimeId}, ${template.name}, ${template.'type}, ${template.tracing}, ${template.statistics}, ${compositeApp}
                )
            `);
        }
    }

    foreach types:MessageStore store in <types:MessageStore[]>heartbeat.artifacts.messageStores {
        string? compositeApp = store?.compositeApp;
        if isMSSQL() {
            _ = check dbClient->execute(`
                INSERT INTO mi_message_store_artifacts (runtime_id, store_name, store_type, size, composite_app)
                VALUES (${runtimeId}, ${store.name}, ${store.'type}, ${store.size}, ${compositeApp});
            `);
        } else if dbType == POSTGRESQL {
            _ = check dbClient->execute(`
                INSERT INTO mi_message_store_artifacts (
                    runtime_id, store_name, store_type, size, composite_app
                ) VALUES (
                    ${runtimeId}, ${store.name}, ${store.'type}, ${store.size}, ${compositeApp}
                )
            `);
        } else if dbType == ORACLE {
            // SIZE is a reserved word in Oracle; the column is created as quoted "SIZE"
            _ = check dbClient->execute(`
                INSERT INTO mi_message_store_artifacts (
                    runtime_id, store_name, store_type, "SIZE", composite_app
                ) VALUES (
                    ${runtimeId}, ${store.name}, ${store.'type}, ${store.size}, ${compositeApp}
                )
            `);
        } else {
            _ = check dbClient->execute(`
                INSERT INTO mi_message_store_artifacts (
                    runtime_id, store_name, store_type, size, composite_app
                ) VALUES (
                    ${runtimeId}, ${store.name}, ${store.'type}, ${store.size}, ${compositeApp}
                )
            `);
        }
    }

    foreach types:MessageProcessor processor in <types:MessageProcessor[]>heartbeat.artifacts.messageProcessors {
        string artifactId = uuid:createType4AsString();
        string? compositeApp = processor?.compositeApp;
        if isMSSQL() {
            _ = check dbClient->execute(`
                INSERT INTO mi_message_processor_artifacts (runtime_id, processor_name, artifact_id, processor_type, processor_class, state, composite_app)
                VALUES (${runtimeId}, ${processor.name}, ${artifactId}, ${processor.'type}, ${processor.'class}, ${processor.state}, ${compositeApp});
            `);
        } else if dbType == POSTGRESQL {
            _ = check dbClient->execute(`
                INSERT INTO mi_message_processor_artifacts (
                    runtime_id, processor_name, processor_type, processor_class, state, composite_app
                ) VALUES (
                    ${runtimeId}, ${processor.name}, ${processor.'type},
                    ${processor.'class}, ${processor.state}, ${compositeApp}
                )
            `);
        } else {
            _ = check dbClient->execute(`
                INSERT INTO mi_message_processor_artifacts (
                    runtime_id, processor_name, artifact_id, processor_type, processor_class, state, composite_app
                ) VALUES (
                    ${runtimeId}, ${processor.name}, ${artifactId}, ${processor.'type},
                    ${processor.'class}, ${processor.state}, ${compositeApp}
                )
            `);
        }
    }

    foreach types:LocalEntry entry in <types:LocalEntry[]>heartbeat.artifacts.localEntries {
        string artifactId = uuid:createType4AsString();
        string? compositeApp = entry?.compositeApp;
        if isMSSQL() {
            _ = check dbClient->execute(`
                INSERT INTO mi_local_entry_artifacts (runtime_id, entry_name, artifact_id, entry_type, entry_value, state, composite_app)
                VALUES (${runtimeId}, ${entry.name}, ${artifactId}, ${entry.'type}, ${entry.value}, ${entry.state}, ${compositeApp});
            `);
        } else if dbType == POSTGRESQL {
            _ = check dbClient->execute(`
                INSERT INTO mi_local_entry_artifacts (
                    runtime_id, entry_name, entry_type, entry_value, state, composite_app
                ) VALUES (
                    ${runtimeId}, ${entry.name}, ${entry.'type},
                    ${entry.value}, ${entry.state}, ${compositeApp}
                )
            `);
        } else {
            _ = check dbClient->execute(`
                INSERT INTO mi_local_entry_artifacts (
                    runtime_id, entry_name, artifact_id, entry_type, entry_value, state, composite_app
                ) VALUES (
                    ${runtimeId}, ${entry.name}, ${artifactId}, ${entry.'type},
                    ${entry.value}, ${entry.state}, ${compositeApp}
                )
            `);
        }
    }

    foreach types:DataService dataService in <types:DataService[]>heartbeat.artifacts.dataServices {
        string artifactId = uuid:createType4AsString();
        string? compositeApp = dataService?.compositeApp;
        string? errorMessage = dataService?.errorMessage;
        string dsState = normalizeDataServiceState(dataService.status ?: dataService.state);
        if isMSSQL() {
            _ = check dbClient->execute(`
                INSERT INTO mi_data_service_artifacts (runtime_id, service_name, artifact_id, description, wsdl, state, composite_app, error_message)
                VALUES (${runtimeId}, ${dataService.name}, ${artifactId}, ${dataService.description},
                        ${dataService.wsdl}, ${dsState}, ${compositeApp}, ${errorMessage});
            `);
        } else if dbType == POSTGRESQL {
            _ = check dbClient->execute(`
                INSERT INTO mi_data_service_artifacts (
                    runtime_id, service_name, description, wsdl, state, composite_app, error_message
                ) VALUES (
                    ${runtimeId}, ${dataService.name}, ${dataService.description},
                    ${dataService.wsdl}, ${dsState}, ${compositeApp}, ${errorMessage}
                )
            `);
        } else {
            _ = check dbClient->execute(`
                INSERT INTO mi_data_service_artifacts (
                    runtime_id, service_name, artifact_id, description, wsdl, state, composite_app, error_message
                ) VALUES (
                    ${runtimeId}, ${dataService.name}, ${artifactId}, ${dataService.description},
                    ${dataService.wsdl}, ${dsState}, ${compositeApp}, ${errorMessage}
                )
            `);
        }
    }

    foreach types:CompositeApp app in <types:CompositeApp[]>heartbeat.artifacts.carbonApps {
        string appState = normalizeCompositeAppState(app.status ?: app.state);
        log:printDebug(string `Inserting/updating composite app artifact: ${app.name}, version: ${app.version ?: ""}, state: ${appState}`);
        string? artifactsJson = app.artifacts is types:CompositeAppArtifact[]
            ? (<types:CompositeAppArtifact[]>app.artifacts).toJsonString()
            : ();
        string? errorMessage = app?.errorMessage;
        if isMSSQL() {
            _ = check dbClient->execute(`
                INSERT INTO mi_composite_app_artifacts (runtime_id, app_name, version, state, error_message, artifacts)
                VALUES (${runtimeId}, ${app.name}, ${app.version}, ${appState}, ${errorMessage}, ${artifactsJson});
            `);
        } else if dbType == POSTGRESQL {
            _ = check dbClient->execute(`
                INSERT INTO mi_composite_app_artifacts (
                    runtime_id, app_name, version, state, error_message, artifacts
                ) VALUES (
                    ${runtimeId}, ${app.name}, ${app.version}, ${appState}, ${errorMessage}, ${artifactsJson}
                )
            `);
        } else {
            _ = check dbClient->execute(`
                INSERT INTO mi_composite_app_artifacts (
                    runtime_id, app_name, version, state, error_message, artifacts
                ) VALUES (
                    ${runtimeId}, ${app.name}, ${app.version}, ${appState}, ${errorMessage}, ${artifactsJson}
                )
            `);
        }
    }
    foreach types:DataSource dataSource in <types:DataSource[]>heartbeat.artifacts.dataSources {
        if isMSSQL() {
            _ = check dbClient->execute(`
                INSERT INTO mi_data_source_artifacts (runtime_id, datasource_name, datasource_type, driver, url, username, state)
                VALUES (${runtimeId}, ${dataSource.name}, ${dataSource.'type}, ${dataSource.driver},
                        ${dataSource.url}, ${dataSource.username}, ${dataSource.state});
            `);
        } else if dbType == POSTGRESQL {
            _ = check dbClient->execute(`
                INSERT INTO mi_data_source_artifacts (
                    runtime_id, datasource_name, datasource_type, driver, url, username, state
                ) VALUES (
                    ${runtimeId}, ${dataSource.name}, ${dataSource.'type}, ${dataSource.driver},
                    ${dataSource.url}, ${dataSource.username}, ${dataSource.state}
                )
            `);
        } else {
            _ = check dbClient->execute(`
                INSERT INTO mi_data_source_artifacts (
                    runtime_id, datasource_name, datasource_type, driver, url, username, state
                ) VALUES (
                    ${runtimeId}, ${dataSource.name}, ${dataSource.'type}, ${dataSource.driver},
                    ${dataSource.url}, ${dataSource.username}, ${dataSource.state}
                )
            `);
        }
    }

    foreach types:Connector connector in <types:Connector[]>heartbeat.artifacts.connectors {
        string artifactId = uuid:createType4AsString();
        if isMSSQL() {
            _ = check dbClient->execute(`
                INSERT INTO mi_connector_artifacts (runtime_id, connector_name, artifact_id, package, version, description, state)
                VALUES (${runtimeId}, ${connector.name}, ${artifactId}, ${connector.package},
                        ${connector.version}, ${connector.description}, ${connector.state});
            `);
        } else if dbType == POSTGRESQL {
            _ = check dbClient->execute(`
                INSERT INTO mi_connector_artifacts (
                    runtime_id, connector_name, package, version, description, state
                ) VALUES (
                    ${runtimeId}, ${connector.name}, ${connector.package},
                    ${connector.version}, ${connector.description}, ${connector.state}
                )
            `);
        } else {
            _ = check dbClient->execute(`
                INSERT INTO mi_connector_artifacts (
                    runtime_id, connector_name, artifact_id, package, version, description, state
                ) VALUES (
                    ${runtimeId}, ${connector.name}, ${artifactId}, ${connector.package},
                    ${connector.version}, ${connector.description}, ${connector.state}
                )
            `);
            log:printDebug(string `Successfully processed connector artifact: ${connector.name} version: ${connector.version.toString()}`);
        }
    }

    foreach types:RegistryResource registryResource in <types:RegistryResource[]>heartbeat.artifacts.registryResources {
        if isMSSQL() {
            _ = check dbClient->execute(`
                INSERT INTO mi_registry_resource_artifacts (runtime_id, resource_name, resource_type)
                VALUES (${runtimeId}, ${registryResource.name}, ${registryResource.'type});
            `);
        } else if dbType == POSTGRESQL {
            _ = check dbClient->execute(`
                INSERT INTO mi_registry_resource_artifacts (
                    runtime_id, resource_name, resource_type
                ) VALUES (
                    ${runtimeId}, ${registryResource.name}, ${registryResource.'type}
                )
            `);
        } else {
            _ = check dbClient->execute(`
                INSERT INTO mi_registry_resource_artifacts (
                    runtime_id, resource_name, resource_type
                ) VALUES (
                    ${runtimeId}, ${registryResource.name}, ${registryResource.'type}
                )
            `);
        }
    }
}

isolated function normalizeCompositeAppState(string state) returns string {
    string trimmed = state.trim();
    string normalized = trimmed.toLowerAscii();
    if normalized == "faulty" {
        return "Faulty";
    }
    if normalized == "active" {
        return "Active";
    }
    return trimmed == "" ? "Unknown" : trimmed;
}

// Normalize a data service state reported by the runtime bridge to the values
// exposed by the control plane: "Active" or "Faulty".
isolated function normalizeDataServiceState(string state) returns string {
    string trimmed = state.trim();
    string normalized = trimmed.toLowerAscii();
    if normalized == "faulty" {
        return "Faulty";
    }
    return "Active";
}

// Insert runtime log levels for BI components
isolated function insertRuntimeLogLevels(string runtimeId, types:Heartbeat heartbeat) returns error? {
    // Only process log levels if they exist in the heartbeat
    map<log:Level>? logLevels = heartbeat.logLevels;
    if logLevels is () {
        return;
    }

    // Delete all existing log levels for this runtime to remove stale entries
    if dbType == MSSQL {
        _ = check dbClient->execute(`
            DELETE FROM bi_runtime_log_levels WHERE runtime_id = ${runtimeId}
        `);
    } else if dbType == POSTGRESQL {
        _ = check dbClient->execute(`
            DELETE FROM bi_runtime_log_levels WHERE runtime_id = ${runtimeId}
        `);
    } else {
        _ = check dbClient->execute(`
            DELETE FROM bi_runtime_log_levels WHERE runtime_id = ${runtimeId}
        `);
    }

    // Iterate through each component and its log level
    foreach var [componentName, logLevel] in logLevels.entries() {
        string logLevelStr = logLevel.toString();
        if dbType == MSSQL {
            _ = check dbClient->execute(`
                MERGE INTO bi_runtime_log_levels AS target
                USING (VALUES (${runtimeId}, ${componentName}, ${logLevelStr}))
                       AS source (runtime_id, component_name, log_level)
                ON (target.runtime_id = source.runtime_id AND target.component_name = source.component_name)
                WHEN MATCHED THEN
                    UPDATE SET log_level = source.log_level, updated_at = GETDATE()
                WHEN NOT MATCHED THEN
                    INSERT (runtime_id, component_name, log_level)
                    VALUES (source.runtime_id, source.component_name, source.log_level);
            `);
        } else if dbType == ORACLE {
            _ = check dbClient->execute(`
                MERGE INTO bi_runtime_log_levels target
                USING (SELECT ${runtimeId} AS runtime_id, ${componentName} AS component_name, ${logLevelStr} AS log_level FROM dual) source
                ON (target.runtime_id = source.runtime_id AND target.component_name = source.component_name)
                WHEN MATCHED THEN
                    UPDATE SET log_level = source.log_level, updated_at = CURRENT_TIMESTAMP
                WHEN NOT MATCHED THEN
                    INSERT (runtime_id, component_name, log_level)
                    VALUES (source.runtime_id, source.component_name, source.log_level)
            `);
        } else if dbType == POSTGRESQL {
            _ = check dbClient->execute(`
                INSERT INTO bi_runtime_log_levels (
                    runtime_id, component_name, log_level
                ) VALUES (
                    ${runtimeId}, ${componentName}, ${logLevelStr}
                )
                ON CONFLICT (runtime_id, component_name) DO UPDATE SET
                    log_level = EXCLUDED.log_level,
                    updated_at = CURRENT_TIMESTAMP
            `);
        } else {
            _ = check dbClient->execute(`
                INSERT INTO bi_runtime_log_levels (
                    runtime_id, component_name, log_level
                ) VALUES (
                    ${runtimeId}, ${componentName}, ${logLevelStr}
                )
                ON DUPLICATE KEY UPDATE
                    log_level = VALUES(log_level),
                    updated_at = CURRENT_TIMESTAMP
            `);
        }
    }
}
