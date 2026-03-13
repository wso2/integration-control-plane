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
// (set by the kid-based heartbeat endpoint) — skip name-to-ID validation.
public isolated function processHeartbeat(types:Heartbeat heartbeat, boolean preResolved = false) returns types:HeartbeatResponse|error {
    if !preResolved {
        check validateHeartbeatData(heartbeat);
    }

    boolean isNewRegistration = false;
    boolean fullHeartbeatRequired = false;

    // Upsert runtime record
    isNewRegistration = check upsertRuntime(heartbeat);

    if isNewRegistration {
        log:printInfo(string `Registered new runtime via heartbeat: ${heartbeat.runtime}`);
    } else {
        log:printInfo(string `Updated runtime via heartbeat: ${heartbeat.runtime}`);
    }

    // Start transaction for artifact updates
    transaction {
        // Insert all runtime artifacts
        check insertRuntimeArtifacts(heartbeat);

        // Validate runtime consistency within component (only for new registrations)
        if isNewRegistration {
            error? validationResult = validateComponentRuntimeConsistency(heartbeat.component, heartbeat.artifacts);
            if validationResult is error {
                log:printWarn(string `Component consistency validation failed for runtime ${heartbeat.runtime}`, validationResult);
            }
        }

        // Create audit log entry
        string action = isNewRegistration ? "REGISTER" : "HEARTBEAT";
        int totalArtifacts = countTotalArtifacts(heartbeat.artifacts);
        if (totalArtifacts == 0) {
            fullHeartbeatRequired = true;
            log:printWarn(string `No artifacts reported in heartbeat for runtime ${heartbeat.runtime}`);
        }
        _ = check dbClient->execute(`
            INSERT INTO audit_logs (
                runtime_id, action, details
            ) VALUES (
                ${heartbeat.runtime}, ${action},
                ${string `Runtime ${action.toLowerAscii()} processed with ${totalArtifacts} total artifacts (${heartbeat.artifacts.services.length()} services,
                 ${heartbeat.artifacts.listeners.length()} listeners)`}
            )
        `);
        check commit;
        log:printInfo(string `Successfully processed ${action.toLowerAscii()} for runtime ${heartbeat.runtime} with ${totalArtifacts} total artifacts`);

    } on fail error e {
        log:printError(string `Failed to process heartbeat for runtime ${heartbeat.runtime}`, e);
        return error(string `Failed to process heartbeat for runtime ${heartbeat.runtime}`, e);
    }

    // Write observed state from heartbeat artifacts
    string? componentType = check getComponentTypeByRuntimeId(heartbeat.runtime);
    if componentType == types:MI {
        check writeObservedStateMI(heartbeat.runtime, heartbeat.component, heartbeat.environment, heartbeat.artifacts);
    } else if componentType == types:BI {
        check writeObservedStateBI(heartbeat.runtime, heartbeat.component, heartbeat.environment, heartbeat.artifacts, heartbeat.logLevels);
    }
    types:ControlCommand[] pendingCommands = [];

    // Cache the runtime hash value
    error? cacheResult = hashCache.put(heartbeat.runtime, heartbeat.runtimeHash);
    if cacheResult is error {
        log:printWarn(string `Failed to cache runtime hash for ${heartbeat.runtime}`, cacheResult);
    } else {
        log:printDebug(string `Cached runtime hash for ${heartbeat.runtime}: ${heartbeat.runtimeHash}`);
    }

    return {
        acknowledged: true,
        fullHeartbeatRequired: fullHeartbeatRequired,
        commands: pendingCommands
    };
}

// Process delta heartbeat with hash validation
public isolated function processDeltaHeartbeat(types:DeltaHeartbeat deltaHeartbeat) returns types:HeartbeatResponse|error {
    // Validate delta heartbeat data
    if deltaHeartbeat.runtime.trim().length() == 0 {
        return error("Runtime ID cannot be empty");
    }

    time:Utc currentTime = time:utcNow();
    string currentTimeStr = check convertUtcToDbDateTime(currentTime);
    boolean hashMatches = false;

    if hashCache.hasKey(deltaHeartbeat.runtime) {
        any|error cachedHash = hashCache.get(deltaHeartbeat.runtime);
        hashMatches = cachedHash is string && cachedHash == deltaHeartbeat.runtimeHash;
        log:printInfo(string `Hash for runtime ${deltaHeartbeat.runtime} matches: ${hashMatches}`);
    }

    if !hashMatches {
        // Hash doesn't match or runtime not in cache, request full heartbeat
        log:printInfo(string `Hash mismatch for runtime ${deltaHeartbeat.runtime}, requesting full heartbeat`);

        // Still update the timestamp to show runtime is alive
        sql:ExecutionResult|error result = dbClient->execute(`
            UPDATE runtimes
            SET last_heartbeat = CURRENT_TIMESTAMP, status = 'RUNNING'
            WHERE runtime_id = ${deltaHeartbeat.runtime}
        `);

        if result is error {
            log:printError(string `Failed to update timestamp for runtime ${deltaHeartbeat.runtime}`, result);
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
        WHERE runtime_id = ${deltaHeartbeat.runtime}
    `);

    boolean runtimeExists = true;
    if timestampResult is error {
        log:printError(string `Failed to update timestamp for runtime ${deltaHeartbeat.runtime}`, timestampResult);
        runtimeExists = false;
    } else {
        runtimeExists = (timestampResult.affectedRowCount ?: 0) > 0;
    }

    // Audit logging
    transaction {
        if runtimeExists {
            sql:ParameterizedQuery auditQuery = sql:queryConcat(
                    `INSERT INTO audit_logs (
                    runtime_id, action, details, timestamp
                ) VALUES (
                    ${deltaHeartbeat.runtime}, 'DELTA_HEARTBEAT',
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
                    ${string `Delta heartbeat received for missing runtime ${deltaHeartbeat.runtime} with hash ${deltaHeartbeat.runtimeHash}`},
                    `, sql:queryConcat(sqlQueryFromString(timestampCast(currentTimeStr)), `)`)
            );
            _ = check dbClient->execute(auditQuery);
        }

        check commit;
        log:printInfo(string `Successfully processed delta heartbeat for runtime ${deltaHeartbeat.runtime}`);

    } on fail error e {
        log:printError(string `Failed to process delta heartbeat for runtime ${deltaHeartbeat.runtime}`, e);
        return error(string `Failed to process delta heartbeat for runtime ${deltaHeartbeat.runtime}`, e);
    }

    return {
        acknowledged: true,
        fullHeartbeatRequired: false,
        commands: []
    };
}

// Validate heartbeat data
isolated function validateHeartbeatData(types:Heartbeat heartbeat) returns error? {
    if heartbeat.runtime.trim().length() == 0 {
        return error("Runtime ID cannot be empty");
    }

    if heartbeat.runtime.length() > 100 {
        return error("Runtime ID cannot exceed 100 characters");
    }

    if heartbeat.component.trim().length() == 0 {
        return error("Component name cannot be empty");
    }

    if heartbeat.project.trim().length() == 0 {
        return error("Project name cannot be empty");
    }

    string|error envId = getEnvironmentIdByName(heartbeat.environment);
    if envId is error {
        return error(string `Invalid environment configuration detected: ${heartbeat.environment}`, envId);
    }
    heartbeat.environment = envId;

    string|error projectId = getProjectIdByHandler(heartbeat.project, DEFAULT_ORG_ID);
    if projectId is error {
        return error(string `Invalid project configuration detected: ${heartbeat.project}`, projectId);
    }
    heartbeat.project = projectId;

    string|error componentId = getComponentIdByName(heartbeat.component);
    if componentId is error {
        return error(string `Invalid component configuration detected: ${heartbeat.component}`, componentId);
    }
    heartbeat.component = componentId;

    types:Component|error componentById = getComponentById(componentId);
    if componentById is error {
        return error(string `Invalid component configuration detected: ${heartbeat.component}`, componentById);
    }
    if componentById.componentType != heartbeat.runtimeType {
        return error(string `Component type mismatch for component ${heartbeat.component}. Expected: ${componentById.componentType}, Got: ${heartbeat.runtimeType}`);
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
        entries.push([{artifactName: api.name, artifactType: "api"},
            {"status": api.state, "tracing": api.tracing, "statistics": api.statistics}]);
    }
    foreach types:ProxyService proxy in <types:ProxyService[]>artifacts.proxyServices {
        entries.push([{artifactName: proxy.name, artifactType: "proxy-service"},
            {"status": proxy.state, "tracing": proxy.tracing, "statistics": proxy.statistics}]);
    }
    foreach types:Endpoint ep in <types:Endpoint[]>artifacts.endpoints {
        entries.push([{artifactName: ep.name, artifactType: "endpoint"},
            {"status": ep.state, "tracing": ep.tracing, "statistics": ep.statistics}]);
    }
    foreach types:InboundEndpoint ie in <types:InboundEndpoint[]>artifacts.inboundEndpoints {
        entries.push([{artifactName: ie.name, artifactType: "inbound-endpoint"},
            {"status": ie.state, "tracing": ie.tracing, "statistics": ie.statistics ?: "disabled"}]);
    }
    foreach types:Sequence seq in <types:Sequence[]>artifacts.sequences {
        entries.push([{artifactName: seq.name, artifactType: "sequence"},
            {"status": seq.state, "tracing": seq.tracing, "statistics": seq.statistics}]);
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
        entries.push([{artifactName: ds.name, artifactType: "data-service"}, {"status": ds.state}]);
    }
    foreach types:Connector conn in <types:Connector[]>artifacts.connectors {
        entries.push([{artifactName: conn.name, artifactType: "connector"}, {"status": conn.state}]);
    }
    foreach types:MessageStore store in <types:MessageStore[]>artifacts.messageStores {
        entries.push([{artifactName: store.name, artifactType: "message-store"}, {"status": store.state}]);
    }
    check batchUpsertReconcileObservedState(runtimeId, componentId, envId, entries);
}

isolated function writeObservedStateBI(string runtimeId, string componentId, string envId,
        types:Artifacts artifacts, map<log:Level>? logLevels) returns error? {
    log:printDebug(string `Writing BI observed state for runtime ${runtimeId}, component ${componentId}, environment ${envId}`);
    [types:ReconcileArtifactKey, map<string>][] entries = [];
    foreach types:Service svc in artifacts.services {
        string qualName = types:qualifiedArtifactName(svc.name, svc.package);
        entries.push([{artifactName: qualName, artifactType: "service"},
            {"status": svc.state.toLowerAscii()}]);
    }
    foreach types:Listener 'listener in artifacts.listeners {
        string qualName = types:qualifiedArtifactName('listener.name, 'listener.package);
        entries.push([{artifactName: qualName, artifactType: "listener"},
            {"status": 'listener.state.toLowerAscii()}]);
    }
    if logLevels is map<log:Level> {
        foreach var [componentName, logLevel] in logLevels.entries() {
            entries.push([{artifactName: componentName, artifactType: "log-level"},
                {"logLevel": logLevel.toString()}]);
        }
    }
    check batchUpsertReconcileObservedState(runtimeId, componentId, envId, entries);
}


// Upsert runtime record
isolated function upsertRuntime(types:Heartbeat heartbeat) returns boolean|error {
    // Use default values if management hostname and port are not provided
    string runtimeHostname = heartbeat.runtimeHostname ?: "";
    string runtimePort = heartbeat.runtimePort ?: "";

    sql:ExecutionResult|error insertRes = dbClient->execute(`
        INSERT INTO runtimes (
            runtime_id, name, runtime_type, status, version,
            runtime_hostname, runtime_port,
            environment_id, project_id, component_id,
            platform_name, platform_version, platform_home,
            os_name, os_version,
            carbon_home, java_vendor, java_version, 
            total_memory, free_memory, max_memory, used_memory,
            os_arch, server_name, last_heartbeat
        ) VALUES (
            ${heartbeat.runtime}, ${heartbeat.runtime}, ${heartbeat.runtimeType}, ${heartbeat.status}, ${heartbeat.version},
            ${runtimeHostname}, ${runtimePort},
            ${heartbeat.environment}, ${heartbeat.project}, ${heartbeat.component},
            ${heartbeat.nodeInfo.platformName}, ${heartbeat.nodeInfo.platformVersion}, ${heartbeat.nodeInfo.platformHome},
            ${heartbeat.nodeInfo.osName}, ${heartbeat.nodeInfo.osVersion},
            ${heartbeat.nodeInfo.carbonHome}, ${heartbeat.nodeInfo.javaVendor}, ${heartbeat.nodeInfo.javaVersion}, 
            ${heartbeat.nodeInfo.totalMemory}, ${heartbeat.nodeInfo.freeMemory}, ${heartbeat.nodeInfo.maxMemory}, ${heartbeat.nodeInfo.usedMemory},
            ${heartbeat.nodeInfo.osArch}, ${heartbeat.nodeInfo.platformName}, CURRENT_TIMESTAMP
        )
    `);

    if insertRes is sql:ExecutionResult {
        int? rows = insertRes.affectedRowCount;
        return rows == 1;
    }

    _ = check dbClient->execute(`
        UPDATE runtimes SET
            name = ${heartbeat.runtime},
            runtime_type = ${heartbeat.runtimeType},
            status = ${heartbeat.status},
            version = ${heartbeat.version},
            runtime_hostname = ${runtimeHostname},
            runtime_port = ${runtimePort},
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
        WHERE runtime_id = ${heartbeat.runtime}
    `);

    return false;
}

// Insert all runtime artifacts
isolated function insertRuntimeArtifacts(types:Heartbeat heartbeat) returns error? {
    // Delete existing BI services and resources for this runtime before inserting
    _ = check dbClient->execute(`DELETE FROM bi_service_resource_artifacts WHERE runtime_id = ${heartbeat.runtime}`);
    _ = check dbClient->execute(`DELETE FROM bi_service_artifacts WHERE runtime_id = ${heartbeat.runtime}`);

    // Insert services
    foreach types:Service serviceDetail in heartbeat.artifacts.services {
        _ = check dbClient->execute(`
            INSERT INTO bi_service_artifacts (
                runtime_id, service_name, service_package, base_path, state
            ) VALUES (
                ${heartbeat.runtime}, ${serviceDetail.name},
                ${serviceDetail.package}, ${serviceDetail.basePath},
                ${serviceDetail.state}
            )
        `);

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
                        ${heartbeat.runtime}, ${serviceDetail.name},
                        ${url}, ${methodsJson}::jsonb
                    )
                `);
            } else {
                _ = check dbClient->execute(`
                    INSERT INTO bi_service_resource_artifacts (
                        runtime_id, service_name, resource_url, methods
                    ) VALUES (
                        ${heartbeat.runtime}, ${serviceDetail.name},
                        ${url}, ${methodsJson}
                    )
                `);
            }
        }
    }

    // Delete existing BI listeners for this runtime before inserting
    _ = check dbClient->execute(`DELETE FROM bi_runtime_listener_artifacts WHERE runtime_id = ${heartbeat.runtime}`);

    // Insert listeners
    foreach types:Listener listenerDetail in heartbeat.artifacts.listeners {
        string? host = listenerDetail?.host;
        int? port = listenerDetail?.port;
        _ = check dbClient->execute(`
            INSERT INTO bi_runtime_listener_artifacts (
                runtime_id, listener_name, listener_package, protocol, listener_host, listener_port, state
            ) VALUES (
                ${heartbeat.runtime}, ${listenerDetail.name},
                ${listenerDetail.package}, ${listenerDetail.protocol},
                ${host}, ${port},
                ${listenerDetail.state}
            )
        `);
    }

    // Handle automation artifacts for BI integrations (main function)
    // Delete existing automation artifacts first
    _ = check dbClient->execute(`DELETE FROM bi_automation_artifacts WHERE runtime_id = ${heartbeat.runtime}`);

    // Only store automation when runtime type is BI, there are no listeners or services, and main artifact exists
    if heartbeat.runtimeType == "BI" && heartbeat.artifacts.listeners.length() == 0 && heartbeat.artifacts.services.length() == 0 {
        types:Main? mainArtifact = heartbeat.artifacts.main;
        if mainArtifact is types:Main {
            string executionTimeStr = check convertUtcToDbDateTime(heartbeat.timestamp);
            if dbType == POSTGRESQL {
                _ = check dbClient->execute(`
                    INSERT INTO bi_automation_artifacts (
                        runtime_id, package_org, package_name, package_version, execution_timestamp
                    ) VALUES (
                        ${heartbeat.runtime}, ${mainArtifact.packageOrg}, ${mainArtifact.packageName},
                        ${mainArtifact.packageVersion}, ${executionTimeStr}::timestamp
                    )
                `);
            } else {
                _ = check dbClient->execute(`
                    INSERT INTO bi_automation_artifacts (
                        runtime_id, package_org, package_name, package_version, execution_timestamp
                    ) VALUES (
                        ${heartbeat.runtime}, ${mainArtifact.packageOrg}, ${mainArtifact.packageName},
                        ${mainArtifact.packageVersion}, ${executionTimeStr}
                    )
                `);
            }
        }
    }

    check insertMIArtifacts(heartbeat);
    check insertAdditionalMIArtifacts(heartbeat);
    check insertRuntimeLogLevels(heartbeat);
}

// Delete existing artifacts
isolated function deleteExistingArtifacts(string runtimeId) returns error? {
    _ = check dbClient->execute(`DELETE FROM bi_service_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM bi_runtime_listener_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM bi_service_resource_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM bi_automation_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM bi_runtime_log_levels WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM mi_api_resource_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM mi_api_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM mi_proxy_service_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM mi_proxy_service_endpoint_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM mi_endpoint_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM mi_endpoint_attribute_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM mi_inbound_endpoint_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM mi_sequence_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM mi_task_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM mi_template_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM mi_message_store_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM mi_message_processor_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM mi_local_entry_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM mi_data_service_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM mi_carbon_app_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM mi_data_source_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM mi_connector_artifacts WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM mi_registry_resource_artifacts WHERE runtime_id = ${runtimeId}`);
}

// Insert MI artifacts
isolated function insertMIArtifacts(types:Heartbeat heartbeat) returns error? {
    foreach types:RestApi api in <types:RestApi[]>heartbeat.artifacts.apis {
        string artifactId = uuid:createType4AsString();
        string? carbonApp = api?.carbonApp;
        string urlsJson = api.urls.toJsonString();
        if dbType == MSSQL {
            _ = check dbClient->execute(`
                MERGE INTO mi_api_artifacts AS target
                USING (VALUES (${heartbeat.runtime}, ${api.name}, ${artifactId}, ${api.url}, ${urlsJson}, ${api.context},
                       ${api.version}, ${api.state}, ${api.tracing}, ${api.statistics}, ${carbonApp}))
                       AS source (runtime_id, api_name, artifact_id, url, urls, context, version, state, tracing, [statistics], carbon_app)
                ON (target.runtime_id = source.runtime_id AND target.api_name = source.api_name)
                WHEN MATCHED THEN
                    UPDATE SET url = source.url, urls = source.urls, context = source.context, version = source.version,
                               state = source.state, tracing = source.tracing, [statistics] = source.[statistics], carbon_app = source.carbon_app, updated_at = CURRENT_TIMESTAMP
                WHEN NOT MATCHED THEN
                    INSERT (runtime_id, api_name, artifact_id, url, urls, context, version, state, tracing, [statistics], carbon_app)
                    VALUES (source.runtime_id, source.api_name, source.artifact_id, source.url, source.urls, source.context, source.version, source.state, source.tracing, source.[statistics], source.carbon_app);
            `);
        } else if dbType == POSTGRESQL {
            _ = check dbClient->execute(`
                INSERT INTO mi_api_artifacts (
                    runtime_id, api_name, url, urls, context, version, state, tracing, statistics, carbon_app
                ) VALUES (
                    ${heartbeat.runtime}, ${api.name}, ${api.url}, ${urlsJson},
                    ${api.context}, ${api.version}, ${api.state}, ${api.tracing}, ${api.statistics}, ${carbonApp}
                )
                ON CONFLICT (runtime_id, api_name) DO UPDATE SET
                    url = EXCLUDED.url,
                    urls = EXCLUDED.urls,
                    context = EXCLUDED.context,
                    version = EXCLUDED.version,
                    state = EXCLUDED.state,
                    tracing = EXCLUDED.tracing,
                    statistics = EXCLUDED.statistics,
                    carbon_app = EXCLUDED.carbon_app,
                    updated_at = CURRENT_TIMESTAMP
            `);
        } else {
            _ = check dbClient->execute(`
                INSERT INTO mi_api_artifacts (
                    runtime_id, api_name, artifact_id, url, urls, context, version, state, tracing, statistics, carbon_app
                ) VALUES (
                    ${heartbeat.runtime}, ${api.name}, ${artifactId}, ${api.url}, ${urlsJson},
                    ${api.context}, ${api.version}, ${api.state}, ${api.tracing}, ${api.statistics}, ${carbonApp}
                )
                ON DUPLICATE KEY UPDATE
                    url = VALUES(url),
                    urls = VALUES(urls),
                    context = VALUES(context),
                    version = VALUES(version),
                    state = VALUES(state),
                    tracing = VALUES(tracing),
                    statistics = VALUES(statistics),
                    carbon_app = VALUES(carbon_app),
                    updated_at = CURRENT_TIMESTAMP
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
                    MERGE INTO mi_api_resource_artifacts AS target
                    USING (VALUES (${heartbeat.runtime}, ${api.name}, ${path}, ${methods}))
                           AS source (runtime_id, api_name, resource_path, methods)
                    ON (target.runtime_id = source.runtime_id AND target.api_name = source.api_name
                        AND target.resource_path = source.resource_path)
                    WHEN MATCHED THEN
                        UPDATE SET methods = source.methods, updated_at = CURRENT_TIMESTAMP
                    WHEN NOT MATCHED THEN
                        INSERT (runtime_id, api_name, resource_path, methods)
                        VALUES (source.runtime_id, source.api_name, source.resource_path, source.methods);
                `);
            } else if dbType == POSTGRESQL {
                _ = check dbClient->execute(`
                    INSERT INTO mi_api_resource_artifacts (
                        runtime_id, api_name, resource_path, methods
                    ) VALUES (
                        ${heartbeat.runtime}, ${api.name},
                        ${path}, ${methods}
                    )
                    ON CONFLICT (runtime_id, api_name, resource_path) DO UPDATE SET
                        methods = EXCLUDED.methods,
                        updated_at = CURRENT_TIMESTAMP
                `);
            } else {
                _ = check dbClient->execute(`
                    INSERT INTO mi_api_resource_artifacts (
                        runtime_id, api_name, resource_path, methods
                    ) VALUES (
                        ${heartbeat.runtime}, ${api.name},
                        ${path}, ${methods}
                    )
                    ON DUPLICATE KEY UPDATE
                        methods = VALUES(methods),
                        updated_at = CURRENT_TIMESTAMP
                `);
            }
        }
    }

    foreach types:ProxyService proxy in <types:ProxyService[]>heartbeat.artifacts.proxyServices {
        string artifactId = uuid:createType4AsString();
        string? carbonApp = proxy?.carbonApp;
        if isMSSQL() {
            _ = check dbClient->execute(`
                MERGE INTO mi_proxy_service_artifacts AS target
                USING (VALUES (${heartbeat.runtime}, ${proxy.name}, ${artifactId}, ${proxy.state}, ${proxy.tracing}, ${proxy.statistics}, ${carbonApp}))
                       AS source (runtime_id, proxy_name, artifact_id, state, tracing, [statistics], carbon_app)
                ON (target.runtime_id = source.runtime_id AND target.proxy_name = source.proxy_name)
                WHEN MATCHED THEN
                    UPDATE SET state = source.state, tracing = source.tracing, [statistics] = source.[statistics], carbon_app = source.carbon_app, updated_at = CURRENT_TIMESTAMP
                WHEN NOT MATCHED THEN
                    INSERT (runtime_id, proxy_name, artifact_id, state, tracing, [statistics], carbon_app)
                    VALUES (source.runtime_id, source.proxy_name, source.artifact_id, source.state, source.tracing, source.[statistics], source.carbon_app);
            `);
        } else if dbType == POSTGRESQL {
            _ = check dbClient->execute(`
                INSERT INTO mi_proxy_service_artifacts (
                    runtime_id, proxy_name, artifact_id, state, tracing, statistics, carbon_app
                ) VALUES (
                    ${heartbeat.runtime}, ${proxy.name}, ${artifactId}, ${proxy.state}, ${proxy.tracing}, ${proxy.statistics}, ${carbonApp}
                )
                ON CONFLICT (runtime_id, proxy_name) DO UPDATE SET
                    state = EXCLUDED.state,
                    tracing = EXCLUDED.tracing,
                    statistics = EXCLUDED.statistics,
                    carbon_app = EXCLUDED.carbon_app,
                    updated_at = CURRENT_TIMESTAMP
            `);
        } else {
            _ = check dbClient->execute(`
                INSERT INTO mi_proxy_service_artifacts (
                    runtime_id, proxy_name, artifact_id, state, tracing, statistics, carbon_app
                ) VALUES (
                    ${heartbeat.runtime}, ${proxy.name}, ${artifactId}, ${proxy.state}, ${proxy.tracing}, ${proxy.statistics}, ${carbonApp}
                )
                ON DUPLICATE KEY UPDATE
                    state = VALUES(state),
                    tracing = VALUES(tracing),
                    statistics = VALUES(statistics),
                    carbon_app = VALUES(carbon_app),
                    updated_at = CURRENT_TIMESTAMP
            `);
        }

        // Persist endpoints if present
        if proxy.endpoints is string[] {
            foreach string ep in <string[]>proxy.endpoints {
                if isMSSQL() {
                    _ = check dbClient->execute(`
                        MERGE INTO mi_proxy_service_endpoint_artifacts AS target
                        USING (VALUES (${heartbeat.runtime}, ${proxy.name}, ${ep}))
                               AS source (runtime_id, proxy_name, endpoint_url)
                        ON (target.runtime_id = source.runtime_id AND target.proxy_name = source.proxy_name AND target.endpoint_url = source.endpoint_url)
                        WHEN MATCHED THEN
                            UPDATE SET updated_at = CURRENT_TIMESTAMP
                        WHEN NOT MATCHED THEN
                            INSERT (runtime_id, proxy_name, endpoint_url)
                            VALUES (source.runtime_id, source.proxy_name, source.endpoint_url);
                    `);
                } else if dbType == POSTGRESQL {
                    _ = check dbClient->execute(`
                        INSERT INTO mi_proxy_service_endpoint_artifacts (
                            runtime_id, proxy_name, endpoint_url
                        ) VALUES (
                            ${heartbeat.runtime}, ${proxy.name}, ${ep}
                        )
                        ON CONFLICT (runtime_id, proxy_name, endpoint_url) DO UPDATE SET
                            updated_at = CURRENT_TIMESTAMP
                    `);
                } else {
                    _ = check dbClient->execute(`
                        INSERT INTO mi_proxy_service_endpoint_artifacts (
                            runtime_id, proxy_name, endpoint_url
                        ) VALUES (
                            ${heartbeat.runtime}, ${proxy.name}, ${ep}
                        )
                        ON DUPLICATE KEY UPDATE
                            updated_at = CURRENT_TIMESTAMP
                    `);
                }
            }
        }
    }

    foreach types:Endpoint endpoint in <types:Endpoint[]>heartbeat.artifacts.endpoints {
        string artifactId = uuid:createType4AsString();
        string? carbonApp = endpoint?.carbonApp;
        if isMSSQL() {
            _ = check dbClient->execute(`
                MERGE INTO mi_endpoint_artifacts AS target
                USING (VALUES (${heartbeat.runtime}, ${endpoint.name}, ${artifactId}, ${endpoint.'type}, ${endpoint.state}, ${endpoint.tracing}, ${endpoint.statistics}, ${carbonApp}))
                       AS source (runtime_id, endpoint_name, artifact_id, endpoint_type, state, tracing, [statistics], carbon_app)
                ON (target.runtime_id = source.runtime_id AND target.endpoint_name = source.endpoint_name)
                WHEN MATCHED THEN
                    UPDATE SET endpoint_type = source.endpoint_type, state = source.state, tracing = source.tracing, [statistics] = source.[statistics], carbon_app = source.carbon_app, updated_at = CURRENT_TIMESTAMP
                WHEN NOT MATCHED THEN
                    INSERT (runtime_id, endpoint_name, artifact_id, endpoint_type, state, tracing, [statistics], carbon_app)
                    VALUES (source.runtime_id, source.endpoint_name, source.artifact_id, source.endpoint_type, source.state, source.tracing, source.[statistics], source.carbon_app);
            `);
        } else if dbType == POSTGRESQL {
            _ = check dbClient->execute(`
                INSERT INTO mi_endpoint_artifacts (
                    runtime_id, endpoint_name, artifact_id, endpoint_type, state, tracing, statistics, carbon_app
                ) VALUES (
                    ${heartbeat.runtime}, ${endpoint.name}, ${artifactId}, ${endpoint.'type},
                    ${endpoint.state}, ${endpoint.tracing}, ${endpoint.statistics}, ${carbonApp}
                )
                ON CONFLICT (runtime_id, endpoint_name) DO UPDATE SET
                    endpoint_type = EXCLUDED.endpoint_type,
                    state = EXCLUDED.state,
                    tracing = EXCLUDED.tracing,
                    statistics = EXCLUDED.statistics,
                    carbon_app = EXCLUDED.carbon_app,
                    updated_at = CURRENT_TIMESTAMP
            `);
        } else {
            _ = check dbClient->execute(`
                INSERT INTO mi_endpoint_artifacts (
                    runtime_id, endpoint_name, artifact_id, endpoint_type, state, tracing, statistics, carbon_app
                ) VALUES (
                    ${heartbeat.runtime}, ${endpoint.name}, ${artifactId}, ${endpoint.'type},
                    ${endpoint.state}, ${endpoint.tracing}, ${endpoint.statistics}, ${carbonApp}
                )
                ON DUPLICATE KEY UPDATE
                    endpoint_type = VALUES(endpoint_type),
                    state = VALUES(state),
                    tracing = VALUES(tracing),
                    statistics = VALUES(statistics),
                    carbon_app = VALUES(carbon_app),
                    updated_at = CURRENT_TIMESTAMP
            `);
        }

        // Persist endpoint attributes if present
        var attrsVal = endpoint?.attributes;
        if attrsVal is types:EndpointAttribute[] {
            foreach types:EndpointAttribute attr in attrsVal {
                if isMSSQL() {
                    _ = check dbClient->execute(`
                        MERGE INTO mi_endpoint_attribute_artifacts AS target
                        USING (VALUES (${heartbeat.runtime}, ${endpoint.name}, ${attr.name}, ${attr?.value}))
                               AS source (runtime_id, endpoint_name, attribute_name, attribute_value)
                        ON (target.runtime_id = source.runtime_id AND target.endpoint_name = source.endpoint_name AND target.attribute_name = source.attribute_name)
                        WHEN MATCHED THEN
                            UPDATE SET attribute_value = source.attribute_value, updated_at = CURRENT_TIMESTAMP
                        WHEN NOT MATCHED THEN
                            INSERT (runtime_id, endpoint_name, attribute_name, attribute_value)
                            VALUES (source.runtime_id, source.endpoint_name, source.attribute_name, source.attribute_value);
                    `);
                } else if dbType == POSTGRESQL {
                    _ = check dbClient->execute(`
                        INSERT INTO mi_endpoint_attribute_artifacts (
                            runtime_id, endpoint_name, attribute_name, attribute_value
                        ) VALUES (
                            ${heartbeat.runtime}, ${endpoint.name}, ${attr.name}, ${attr?.value}
                        )
                        ON CONFLICT (runtime_id, endpoint_name, attribute_name) DO UPDATE SET
                            attribute_value = EXCLUDED.attribute_value,
                            updated_at = CURRENT_TIMESTAMP
                    `);
                } else {
                    _ = check dbClient->execute(`
                        INSERT INTO mi_endpoint_attribute_artifacts (
                            runtime_id, endpoint_name, attribute_name, attribute_value
                        ) VALUES (
                            ${heartbeat.runtime}, ${endpoint.name}, ${attr.name}, ${attr?.value}
                        )
                        ON DUPLICATE KEY UPDATE
                            attribute_value = VALUES(attribute_value),
                            updated_at = CURRENT_TIMESTAMP
                    `);
                }
            }
        }
    }
}

// Insert additional MI artifacts
isolated function insertAdditionalMIArtifacts(types:Heartbeat heartbeat) returns error? {
    foreach types:InboundEndpoint inbound in <types:InboundEndpoint[]>heartbeat.artifacts.inboundEndpoints {
        string artifactId = uuid:createType4AsString();
        string? carbonApp = inbound?.carbonApp;
        if isMSSQL() {
            _ = check dbClient->execute(`
                MERGE INTO mi_inbound_endpoint_artifacts AS target
                USING (VALUES (${heartbeat.runtime}, ${inbound.name}, ${artifactId}, ${inbound.protocol}, ${inbound.sequence}, ${inbound.state}, ${inbound.statistics}, ${inbound.onError}, ${inbound.tracing}, ${carbonApp}))
                       AS source (runtime_id, inbound_name, artifact_id, protocol, sequence, state, [statistics], on_error, tracing, carbon_app)
                ON (target.runtime_id = source.runtime_id AND target.inbound_name = source.inbound_name)
                WHEN MATCHED THEN
                    UPDATE SET protocol = source.protocol, sequence = source.sequence, state = source.state, [statistics] = source.[statistics], on_error = source.on_error, tracing = source.tracing, carbon_app = source.carbon_app, updated_at = CURRENT_TIMESTAMP
                WHEN NOT MATCHED THEN
                    INSERT (runtime_id, inbound_name, artifact_id, protocol, sequence, state, [statistics], on_error, tracing, carbon_app)
                    VALUES (source.runtime_id, source.inbound_name, source.artifact_id, source.protocol, source.sequence, source.state, source.[statistics], source.on_error, source.tracing, source.carbon_app);
            `);
        } else if dbType == POSTGRESQL {
            _ = check dbClient->execute(`
                INSERT INTO mi_inbound_endpoint_artifacts (
                    runtime_id, inbound_name, protocol, sequence, state, statistics, on_error, tracing, carbon_app
                ) VALUES (
                    ${heartbeat.runtime}, ${inbound.name}, ${inbound.protocol},
                    ${inbound.sequence}, ${inbound.state}, ${inbound.statistics}, ${inbound.onError}, ${inbound.tracing}, ${carbonApp}
                )
                ON CONFLICT (runtime_id, inbound_name) DO UPDATE SET
                    protocol = EXCLUDED.protocol,
                    sequence = EXCLUDED.sequence,
                    state = EXCLUDED.state,
                    statistics = EXCLUDED.statistics,
                    on_error = EXCLUDED.on_error,
                    tracing = EXCLUDED.tracing,
                    carbon_app = EXCLUDED.carbon_app,
                    updated_at = CURRENT_TIMESTAMP
            `);
        } else {
            _ = check dbClient->execute(`
                INSERT INTO mi_inbound_endpoint_artifacts (
                    runtime_id, inbound_name, artifact_id, protocol, sequence, state, statistics, on_error, tracing, carbon_app
                ) VALUES (
                    ${heartbeat.runtime}, ${inbound.name}, ${artifactId}, ${inbound.protocol},
                    ${inbound.sequence}, ${inbound.state}, ${inbound.statistics}, ${inbound.onError}, ${inbound.tracing}, ${carbonApp}
                )
                ON DUPLICATE KEY UPDATE
                    protocol = VALUES(protocol),
                    sequence = VALUES(sequence),
                    state = VALUES(state),
                    statistics = VALUES(statistics),
                    on_error = VALUES(on_error),
                    tracing = VALUES(tracing),
                    carbon_app = VALUES(carbon_app),
                    updated_at = CURRENT_TIMESTAMP
            `);
        }
    }

    foreach types:Sequence sequence in <types:Sequence[]>heartbeat.artifacts.sequences {
        string artifactId = uuid:createType4AsString();
        string? carbonApp = sequence?.carbonApp;
        if isMSSQL() {
            _ = check dbClient->execute(`
                MERGE INTO mi_sequence_artifacts AS target
                USING (VALUES (${heartbeat.runtime}, ${sequence.name}, ${artifactId}, ${sequence.'type}, ${sequence.container}, ${sequence.state}, ${sequence.tracing}, ${sequence.statistics}, ${carbonApp}))
                       AS source (runtime_id, sequence_name, artifact_id, sequence_type, container, state, tracing, [statistics], carbon_app)
                ON (target.runtime_id = source.runtime_id AND target.sequence_name = source.sequence_name)
                WHEN MATCHED THEN
                    UPDATE SET sequence_type = source.sequence_type, container = source.container, state = source.state, tracing = source.tracing, [statistics] = source.[statistics], carbon_app = source.carbon_app, updated_at = CURRENT_TIMESTAMP
                WHEN NOT MATCHED THEN
                    INSERT (runtime_id, sequence_name, artifact_id, sequence_type, container, state, tracing, [statistics], carbon_app)
                    VALUES (source.runtime_id, source.sequence_name, source.artifact_id, source.sequence_type, source.container, source.state, source.tracing, source.[statistics], source.carbon_app);
            `);
        } else if dbType == POSTGRESQL {
            _ = check dbClient->execute(`
                INSERT INTO mi_sequence_artifacts (
                    runtime_id, sequence_name, sequence_type, container, state, tracing, statistics, carbon_app
                ) VALUES (
                    ${heartbeat.runtime}, ${sequence.name}, ${sequence.'type},
                    ${sequence.container}, ${sequence.state}, ${sequence.tracing}, ${sequence.statistics}, ${carbonApp}
                )
                ON CONFLICT (runtime_id, sequence_name) DO UPDATE SET
                    sequence_type = EXCLUDED.sequence_type,
                    container = EXCLUDED.container,
                    state = EXCLUDED.state,
                    tracing = EXCLUDED.tracing,
                    statistics = EXCLUDED.statistics,
                    carbon_app = EXCLUDED.carbon_app,
                    updated_at = CURRENT_TIMESTAMP
            `);
        } else {
            _ = check dbClient->execute(`
                INSERT INTO mi_sequence_artifacts (
                    runtime_id, sequence_name, artifact_id, sequence_type, container, state, tracing, statistics, carbon_app
                ) VALUES (
                    ${heartbeat.runtime}, ${sequence.name}, ${artifactId}, ${sequence.'type},
                    ${sequence.container}, ${sequence.state}, ${sequence.tracing}, ${sequence.statistics}, ${carbonApp}
                )
                ON DUPLICATE KEY UPDATE
                    sequence_type = VALUES(sequence_type),
                    container = VALUES(container),
                    state = VALUES(state),
                    tracing = VALUES(tracing),
                    statistics = VALUES(statistics),
                    carbon_app = VALUES(carbon_app),
                    updated_at = CURRENT_TIMESTAMP
            `);
        }
    }

    foreach types:Task task in <types:Task[]>heartbeat.artifacts.tasks {
        string artifactId = uuid:createType4AsString();
        string? carbonApp = task?.carbonApp;
        if isMSSQL() {
            _ = check dbClient->execute(`
                MERGE INTO mi_task_artifacts AS target
                USING (VALUES (${heartbeat.runtime}, ${task.name}, ${artifactId}, ${task.'class}, ${task.group}, ${task.state}, ${carbonApp}))
                       AS source (runtime_id, task_name, artifact_id, task_class, task_group, state, carbon_app)
                ON (target.runtime_id = source.runtime_id AND target.task_name = source.task_name)
                WHEN MATCHED THEN
                    UPDATE SET task_class = source.task_class, task_group = source.task_group, state = source.state, carbon_app = source.carbon_app, updated_at = CURRENT_TIMESTAMP
                WHEN NOT MATCHED THEN
                    INSERT (runtime_id, task_name, artifact_id, task_class, task_group, state, carbon_app)
                    VALUES (source.runtime_id, source.task_name, source.artifact_id, source.task_class, source.task_group, source.state, source.carbon_app);
            `);
        } else if dbType == POSTGRESQL {
            _ = check dbClient->execute(`
                INSERT INTO mi_task_artifacts (
                    runtime_id, task_name, task_class, task_group, state, carbon_app
                ) VALUES (
                    ${heartbeat.runtime}, ${task.name}, ${task.'class},
                    ${task.group}, ${task.state}, ${carbonApp}
                )
                ON CONFLICT (runtime_id, task_name) DO UPDATE SET
                    task_class = EXCLUDED.task_class,
                    task_group = EXCLUDED.task_group,
                    state = EXCLUDED.state,
                    carbon_app = EXCLUDED.carbon_app,
                    updated_at = CURRENT_TIMESTAMP
            `);
        } else {
            _ = check dbClient->execute(`
                INSERT INTO mi_task_artifacts (
                    runtime_id, task_name, artifact_id, task_class, task_group, state, carbon_app
                ) VALUES (
                    ${heartbeat.runtime}, ${task.name}, ${artifactId}, ${task.'class},
                    ${task.group}, ${task.state}, ${carbonApp}
                )
                ON DUPLICATE KEY UPDATE
                    task_class = VALUES(task_class),
                    task_group = VALUES(task_group),
                    state = VALUES(state),
                    carbon_app = VALUES(carbon_app),
                    updated_at = CURRENT_TIMESTAMP
            `);
        }
    }

    foreach types:Template template in <types:Template[]>heartbeat.artifacts.templates {
        string? carbonApp = template?.carbonApp;
        if isMSSQL() {
            _ = check dbClient->execute(`
                MERGE INTO mi_template_artifacts AS target
                USING (VALUES (${heartbeat.runtime}, ${template.name}, ${template.'type}, ${template.tracing}, ${template.statistics}, ${carbonApp}))
                       AS source (runtime_id, template_name, template_type, tracing, statistics, carbon_app)
                ON (target.runtime_id = source.runtime_id AND target.template_name = source.template_name)
                WHEN MATCHED THEN
                    UPDATE SET template_type = source.template_type, tracing = source.tracing, statistics = source.statistics, carbon_app = source.carbon_app, updated_at = CURRENT_TIMESTAMP
                WHEN NOT MATCHED THEN
                    INSERT (runtime_id, template_name, template_type, tracing, statistics, carbon_app)
                    VALUES (source.runtime_id, source.template_name, source.template_type, source.tracing, source.statistics, source.carbon_app);
            `);
        } else if dbType == POSTGRESQL {
            _ = check dbClient->execute(`
                INSERT INTO mi_template_artifacts (
                    runtime_id, template_name, template_type, tracing, statistics, carbon_app
                ) VALUES (
                    ${heartbeat.runtime}, ${template.name}, ${template.'type}, ${template.tracing}, ${template.statistics}, ${carbonApp}
                )
                ON CONFLICT (runtime_id, template_name) DO UPDATE SET
                    template_type = EXCLUDED.template_type,
                    tracing = EXCLUDED.tracing,
                    statistics = EXCLUDED.statistics,
                    carbon_app = EXCLUDED.carbon_app,
                    updated_at = CURRENT_TIMESTAMP
            `);
        } else {
            _ = check dbClient->execute(`
                INSERT INTO mi_template_artifacts (
                    runtime_id, template_name, template_type, tracing, statistics, carbon_app
                ) VALUES (
                    ${heartbeat.runtime}, ${template.name}, ${template.'type}, ${template.tracing}, ${template.statistics}, ${carbonApp}
                )
                ON DUPLICATE KEY UPDATE
                    template_type = VALUES(template_type),
                    tracing = VALUES(tracing),
                    statistics = VALUES(statistics),
                    carbon_app = VALUES(carbon_app),
                    updated_at = CURRENT_TIMESTAMP
            `);
        }
    }

    foreach types:MessageStore store in <types:MessageStore[]>heartbeat.artifacts.messageStores {
        string? carbonApp = store?.carbonApp;
        if isMSSQL() {
            _ = check dbClient->execute(`
                MERGE INTO mi_message_store_artifacts AS target
                USING (VALUES (${heartbeat.runtime}, ${store.name}, ${store.'type}, ${store.size}, ${carbonApp}))
                       AS source (runtime_id, store_name, store_type, size, carbon_app)
                ON (target.runtime_id = source.runtime_id AND target.store_name = source.store_name)
                WHEN MATCHED THEN
                    UPDATE SET store_type = source.store_type, size = source.size, carbon_app = source.carbon_app, updated_at = CURRENT_TIMESTAMP
                WHEN NOT MATCHED THEN
                    INSERT (runtime_id, store_name, store_type, size, carbon_app)
                    VALUES (source.runtime_id, source.store_name, source.store_type, source.size, source.carbon_app);
            `);
        } else if dbType == POSTGRESQL {
            _ = check dbClient->execute(`
                INSERT INTO mi_message_store_artifacts (
                    runtime_id, store_name, store_type, size, carbon_app
                ) VALUES (
                    ${heartbeat.runtime}, ${store.name}, ${store.'type}, ${store.size}, ${carbonApp}
                )
                ON CONFLICT (runtime_id, store_name) DO UPDATE SET
                    store_type = EXCLUDED.store_type,
                    size = EXCLUDED.size,
                    carbon_app = EXCLUDED.carbon_app,
                    updated_at = CURRENT_TIMESTAMP
            `);
        } else {
            _ = check dbClient->execute(`
                INSERT INTO mi_message_store_artifacts (
                    runtime_id, store_name, store_type, size, carbon_app
                ) VALUES (
                    ${heartbeat.runtime}, ${store.name}, ${store.'type}, ${store.size}, ${carbonApp}
                )
                ON DUPLICATE KEY UPDATE
                    store_type = VALUES(store_type),
                    size = VALUES(size),
                    carbon_app = VALUES(carbon_app),
                    updated_at = CURRENT_TIMESTAMP
            `);
        }
    }

    foreach types:MessageProcessor processor in <types:MessageProcessor[]>heartbeat.artifacts.messageProcessors {
        string artifactId = uuid:createType4AsString();
        string? carbonApp = processor?.carbonApp;
        if isMSSQL() {
            _ = check dbClient->execute(`
                MERGE INTO mi_message_processor_artifacts AS target
                USING (VALUES (${heartbeat.runtime}, ${processor.name}, ${artifactId}, ${processor.'type}, ${processor.'class}, ${processor.state}, ${carbonApp}))
                       AS source (runtime_id, processor_name, artifact_id, processor_type, processor_class, state, carbon_app)
                ON (target.runtime_id = source.runtime_id AND target.processor_name = source.processor_name)
                WHEN MATCHED THEN
                    UPDATE SET processor_type = source.processor_type, processor_class = source.processor_class, state = source.state, carbon_app = source.carbon_app, updated_at = CURRENT_TIMESTAMP
                WHEN NOT MATCHED THEN
                    INSERT (runtime_id, processor_name, artifact_id, processor_type, processor_class, state, carbon_app)
                    VALUES (source.runtime_id, source.processor_name, source.artifact_id, source.processor_type, source.processor_class, source.state, source.carbon_app);
            `);
        } else if dbType == POSTGRESQL {
            _ = check dbClient->execute(`
                INSERT INTO mi_message_processor_artifacts (
                    runtime_id, processor_name, processor_type, processor_class, state, carbon_app
                ) VALUES (
                    ${heartbeat.runtime}, ${processor.name}, ${processor.'type},
                    ${processor.'class}, ${processor.state}, ${carbonApp}
                )
                ON CONFLICT (runtime_id, processor_name) DO UPDATE SET
                    processor_type = EXCLUDED.processor_type,
                    processor_class = EXCLUDED.processor_class,
                    state = EXCLUDED.state,
                    carbon_app = EXCLUDED.carbon_app,
                    updated_at = CURRENT_TIMESTAMP
            `);
        } else {
            _ = check dbClient->execute(`
                INSERT INTO mi_message_processor_artifacts (
                    runtime_id, processor_name, artifact_id, processor_type, processor_class, state, carbon_app
                ) VALUES (
                    ${heartbeat.runtime}, ${processor.name}, ${artifactId}, ${processor.'type},
                    ${processor.'class}, ${processor.state}, ${carbonApp}
                )
                ON DUPLICATE KEY UPDATE
                    processor_type = VALUES(processor_type),
                    processor_class = VALUES(processor_class),
                    state = VALUES(state),
                    carbon_app = VALUES(carbon_app),
                    updated_at = CURRENT_TIMESTAMP
            `);
        }
    }

    foreach types:LocalEntry entry in <types:LocalEntry[]>heartbeat.artifacts.localEntries {
        string artifactId = uuid:createType4AsString();
        string? carbonApp = entry?.carbonApp;
        if isMSSQL() {
            _ = check dbClient->execute(`
                MERGE INTO mi_local_entry_artifacts AS target
                USING (VALUES (${heartbeat.runtime}, ${entry.name}, ${artifactId}, ${entry.'type}, ${entry.value}, ${entry.state}, ${carbonApp}))
                       AS source (runtime_id, entry_name, artifact_id, entry_type, entry_value, state, carbon_app)
                ON (target.runtime_id = source.runtime_id AND target.entry_name = source.entry_name)
                WHEN MATCHED THEN
                    UPDATE SET entry_type = source.entry_type, entry_value = source.entry_value, state = source.state, carbon_app = source.carbon_app, updated_at = CURRENT_TIMESTAMP
                WHEN NOT MATCHED THEN
                    INSERT (runtime_id, entry_name, artifact_id, entry_type, entry_value, state, carbon_app)
                    VALUES (source.runtime_id, source.entry_name, source.artifact_id, source.entry_type, source.entry_value, source.state, source.carbon_app);
            `);
        } else if dbType == POSTGRESQL {
            _ = check dbClient->execute(`
                INSERT INTO mi_local_entry_artifacts (
                    runtime_id, entry_name, entry_type, entry_value, state, carbon_app
                ) VALUES (
                    ${heartbeat.runtime}, ${entry.name}, ${entry.'type},
                    ${entry.value}, ${entry.state}, ${carbonApp}
                )
                ON CONFLICT (runtime_id, entry_name) DO UPDATE SET
                    entry_type = EXCLUDED.entry_type,
                    entry_value = EXCLUDED.entry_value,
                    state = EXCLUDED.state,
                    carbon_app = EXCLUDED.carbon_app,
                    updated_at = CURRENT_TIMESTAMP
            `);
        } else {
            _ = check dbClient->execute(`
                INSERT INTO mi_local_entry_artifacts (
                    runtime_id, entry_name, artifact_id, entry_type, entry_value, state, carbon_app
                ) VALUES (
                    ${heartbeat.runtime}, ${entry.name}, ${artifactId}, ${entry.'type},
                    ${entry.value}, ${entry.state}, ${carbonApp}
                )
                ON DUPLICATE KEY UPDATE
                    entry_type = VALUES(entry_type),
                    entry_value = VALUES(entry_value),
                    state = VALUES(state),
                    carbon_app = VALUES(carbon_app),
                    updated_at = CURRENT_TIMESTAMP
            `);
        }
    }

    foreach types:DataService dataService in <types:DataService[]>heartbeat.artifacts.dataServices {
        string artifactId = uuid:createType4AsString();
        string? carbonApp = dataService?.carbonApp;
        if isMSSQL() {
            _ = check dbClient->execute(`
                MERGE INTO mi_data_service_artifacts AS target
                USING (VALUES (${heartbeat.runtime}, ${dataService.name}, ${artifactId}, ${dataService.description}, ${dataService.wsdl}, ${dataService.state}, ${carbonApp}))
                       AS source (runtime_id, service_name, artifact_id, description, wsdl, state, carbon_app)
                ON (target.runtime_id = source.runtime_id AND target.service_name = source.service_name)
                WHEN MATCHED THEN
                    UPDATE SET description = source.description, wsdl = source.wsdl, state = source.state, carbon_app = source.carbon_app, updated_at = CURRENT_TIMESTAMP
                WHEN NOT MATCHED THEN
                    INSERT (runtime_id, service_name, artifact_id, description, wsdl, state, carbon_app)
                    VALUES (source.runtime_id, source.service_name, source.artifact_id, source.description, source.wsdl, source.state, source.carbon_app);
            `);
        } else if dbType == POSTGRESQL {
            _ = check dbClient->execute(`
                INSERT INTO mi_data_service_artifacts (
                    runtime_id, service_name, description, wsdl, state, carbon_app
                ) VALUES (
                    ${heartbeat.runtime}, ${dataService.name}, ${dataService.description},
                    ${dataService.wsdl}, ${dataService.state}, ${carbonApp}
                )
                ON CONFLICT (runtime_id, service_name) DO UPDATE SET
                    description = EXCLUDED.description,
                    wsdl = EXCLUDED.wsdl,
                    state = EXCLUDED.state,
                    carbon_app = EXCLUDED.carbon_app,
                    updated_at = CURRENT_TIMESTAMP
            `);
        } else {
            _ = check dbClient->execute(`
                INSERT INTO mi_data_service_artifacts (
                    runtime_id, service_name, artifact_id, description, wsdl, state, carbon_app
                ) VALUES (
                    ${heartbeat.runtime}, ${dataService.name}, ${artifactId}, ${dataService.description},
                    ${dataService.wsdl}, ${dataService.state}, ${carbonApp}
                )
                ON DUPLICATE KEY UPDATE
                    description = VALUES(description),
                    wsdl = VALUES(wsdl),
                    state = VALUES(state),
                    carbon_app = VALUES(carbon_app),
                    updated_at = CURRENT_TIMESTAMP
            `);
        }
    }

    foreach types:CarbonApp app in <types:CarbonApp[]>heartbeat.artifacts.carbonApps {
        string? artifactsJson = app.artifacts is types:CarbonAppArtifact[]
            ? (<types:CarbonAppArtifact[]>app.artifacts).toJsonString()
            : ();
        if isMSSQL() {
            _ = check dbClient->execute(`
                MERGE INTO mi_carbon_app_artifacts AS target
                USING (VALUES (${heartbeat.runtime}, ${app.name}, ${app.version}, ${app.state}, ${artifactsJson}))
                       AS source (runtime_id, app_name, version, state, artifacts)
                ON (target.runtime_id = source.runtime_id AND target.app_name = source.app_name)
                WHEN MATCHED THEN
                    UPDATE SET version = source.version, state = source.state, artifacts = source.artifacts, updated_at = CURRENT_TIMESTAMP
                WHEN NOT MATCHED THEN
                    INSERT (runtime_id, app_name, version, state, artifacts)
                    VALUES (source.runtime_id, source.app_name, source.version, source.state, source.artifacts);
            `);
        } else if dbType == POSTGRESQL {
            _ = check dbClient->execute(`
                INSERT INTO mi_carbon_app_artifacts (
                    runtime_id, app_name, version, state, artifacts
                ) VALUES (
                    ${heartbeat.runtime}, ${app.name}, ${app.version}, ${app.state}, ${artifactsJson}
                )
                ON CONFLICT (runtime_id, app_name) DO UPDATE SET
                    version = EXCLUDED.version,
                    state = EXCLUDED.state,
                    artifacts = EXCLUDED.artifacts,
                    updated_at = CURRENT_TIMESTAMP
            `);
        } else {
            _ = check dbClient->execute(`
                INSERT INTO mi_carbon_app_artifacts (
                    runtime_id, app_name, version, state, artifacts
                ) VALUES (
                    ${heartbeat.runtime}, ${app.name}, ${app.version}, ${app.state}, ${artifactsJson}
                )
                ON DUPLICATE KEY UPDATE
                    version = VALUES(version),
                    state = VALUES(state),
                    artifacts = VALUES(artifacts),
                    updated_at = CURRENT_TIMESTAMP
            `);
        }
    }

    foreach types:DataSource dataSource in <types:DataSource[]>heartbeat.artifacts.dataSources {
        if isMSSQL() {
            _ = check dbClient->execute(`
                MERGE INTO mi_data_source_artifacts AS target
                USING (VALUES (${heartbeat.runtime}, ${dataSource.name}, ${dataSource.'type}, ${dataSource.driver}, ${dataSource.url}, ${dataSource.username}, ${dataSource.state}))
                       AS source (runtime_id, datasource_name, datasource_type, driver, url, username, state)
                ON (target.runtime_id = source.runtime_id AND target.datasource_name = source.datasource_name)
                WHEN MATCHED THEN
                    UPDATE SET datasource_type = source.datasource_type, driver = source.driver, url = source.url, username = source.username, state = source.state, updated_at = CURRENT_TIMESTAMP
                WHEN NOT MATCHED THEN
                    INSERT (runtime_id, datasource_name, datasource_type, driver, url, username, state)
                    VALUES (source.runtime_id, source.datasource_name, source.datasource_type, source.driver, source.url, source.username, source.state);
            `);
        } else if dbType == POSTGRESQL {
            _ = check dbClient->execute(`
                INSERT INTO mi_data_source_artifacts (
                    runtime_id, datasource_name, datasource_type, driver, url, username, state
                ) VALUES (
                    ${heartbeat.runtime}, ${dataSource.name}, ${dataSource.'type}, ${dataSource.driver},
                    ${dataSource.url}, ${dataSource.username}, ${dataSource.state}
                )
                ON CONFLICT (runtime_id, datasource_name) DO UPDATE SET
                    datasource_type = EXCLUDED.datasource_type,
                    driver = EXCLUDED.driver,
                    url = EXCLUDED.url,
                    username = EXCLUDED.username,
                    state = EXCLUDED.state,
                    updated_at = CURRENT_TIMESTAMP
            `);
        } else {
            _ = check dbClient->execute(`
                INSERT INTO mi_data_source_artifacts (
                    runtime_id, datasource_name, datasource_type, driver, url, username, state
                ) VALUES (
                    ${heartbeat.runtime}, ${dataSource.name}, ${dataSource.'type}, ${dataSource.driver},
                    ${dataSource.url}, ${dataSource.username}, ${dataSource.state}
                )
                ON DUPLICATE KEY UPDATE
                    datasource_type = VALUES(datasource_type),
                    driver = VALUES(driver),
                    url = VALUES(url),
                    username = VALUES(username),
                    state = VALUES(state),
                    updated_at = CURRENT_TIMESTAMP
            `);
        }
    }

    foreach types:Connector connector in <types:Connector[]>heartbeat.artifacts.connectors {
        string artifactId = uuid:createType4AsString();
        if isMSSQL() {
            _ = check dbClient->execute(`
                MERGE INTO mi_connector_artifacts AS target
                USING (VALUES (${heartbeat.runtime}, ${connector.name}, ${artifactId}, ${connector.package}, ${connector.version}, ${connector.description}, ${connector.state}))
                       AS source (runtime_id, connector_name, artifact_id, package, version, description, state)
                ON (target.runtime_id = source.runtime_id AND target.connector_name = source.connector_name AND target.package = source.package)
                WHEN MATCHED THEN
                    UPDATE SET version = source.version, description = source.description, state = source.state, updated_at = CURRENT_TIMESTAMP
                WHEN NOT MATCHED THEN
                    INSERT (runtime_id, connector_name, artifact_id, package, version, description, state)
                    VALUES (source.runtime_id, source.connector_name, source.artifact_id, source.package, source.version, source.description, source.state);
            `);
        } else if dbType == POSTGRESQL {
            _ = check dbClient->execute(`
                INSERT INTO mi_connector_artifacts (
                    runtime_id, connector_name, package, version, description, state
                ) VALUES (
                    ${heartbeat.runtime}, ${connector.name}, ${connector.package},
                    ${connector.version}, ${connector.description}, ${connector.state}
                )
                ON CONFLICT (runtime_id, connector_name, package) DO UPDATE SET
                    version = EXCLUDED.version,
                    description = EXCLUDED.description,
                    state = EXCLUDED.state,
                    updated_at = CURRENT_TIMESTAMP
            `);
        } else {
            _ = check dbClient->execute(`
                INSERT INTO mi_connector_artifacts (
                    runtime_id, connector_name, artifact_id, package, version, description, state
                ) VALUES (
                    ${heartbeat.runtime}, ${connector.name}, ${artifactId}, ${connector.package},
                    ${connector.version}, ${connector.description}, ${connector.state}
                )
                ON DUPLICATE KEY UPDATE
                    version = VALUES(version),
                    description = VALUES(description),
                    state = VALUES(state),
                    updated_at = CURRENT_TIMESTAMP
            `);
            log:printDebug(string `Successfully processed connector artifact: ${connector.name} version: ${connector.version.toString()}`);
        }
    }

    foreach types:RegistryResource registryResource in <types:RegistryResource[]>heartbeat.artifacts.registryResources {
        if isMSSQL() {
            _ = check dbClient->execute(`
                MERGE INTO mi_registry_resource_artifacts AS target
                USING (VALUES (${heartbeat.runtime}, ${registryResource.name}, ${registryResource.'type}))
                       AS source (runtime_id, resource_name, resource_type)
                ON (target.runtime_id = source.runtime_id AND target.resource_name = source.resource_name)
                WHEN MATCHED THEN
                    UPDATE SET updated_at = CURRENT_TIMESTAMP
                WHEN NOT MATCHED THEN
                    INSERT (runtime_id, resource_name, resource_type)
                    VALUES (source.runtime_id, source.resource_name, source.resource_type);
            `);
        } else if dbType == POSTGRESQL {
            _ = check dbClient->execute(`
                INSERT INTO mi_registry_resource_artifacts (
                    runtime_id, resource_name, resource_type
                ) VALUES (
                    ${heartbeat.runtime}, ${registryResource.name}, ${registryResource.'type}
                )
                ON CONFLICT (runtime_id, resource_name) DO UPDATE SET
                    updated_at = CURRENT_TIMESTAMP
            `);
        } else {
            _ = check dbClient->execute(`
                INSERT INTO mi_registry_resource_artifacts (
                    runtime_id, resource_name, resource_type
                ) VALUES (
                    ${heartbeat.runtime}, ${registryResource.name}, ${registryResource.'type}
                )
                ON DUPLICATE KEY UPDATE
                    updated_at = CURRENT_TIMESTAMP
            `);
        }
    }
}

// Insert runtime log levels for BI components
isolated function insertRuntimeLogLevels(types:Heartbeat heartbeat) returns error? {
    // Only process log levels if they exist in the heartbeat
    map<log:Level>? logLevels = heartbeat.logLevels;
    if logLevels is () {
        return;
    }

    // Delete all existing log levels for this runtime to remove stale entries
    if dbType == MSSQL {
        _ = check dbClient->execute(`
            DELETE FROM bi_runtime_log_levels WHERE runtime_id = ${heartbeat.runtime}
        `);
    } else if dbType == POSTGRESQL {
        _ = check dbClient->execute(`
            DELETE FROM bi_runtime_log_levels WHERE runtime_id = ${heartbeat.runtime}
        `);
    } else {
        _ = check dbClient->execute(`
            DELETE FROM bi_runtime_log_levels WHERE runtime_id = ${heartbeat.runtime}
        `);
    }

    // Iterate through each component and its log level
    foreach var [componentName, logLevel] in logLevels.entries() {
        string logLevelStr = logLevel.toString();
        if dbType == MSSQL {
            _ = check dbClient->execute(`
                MERGE INTO bi_runtime_log_levels AS target
                USING (VALUES (${heartbeat.runtime}, ${componentName}, ${logLevelStr}))
                       AS source (runtime_id, component_name, log_level)
                ON (target.runtime_id = source.runtime_id AND target.component_name = source.component_name)
                WHEN MATCHED THEN
                    UPDATE SET log_level = source.log_level, updated_at = GETDATE()
                WHEN NOT MATCHED THEN
                    INSERT (runtime_id, component_name, log_level)
                    VALUES (source.runtime_id, source.component_name, source.log_level);
            `);
        } else if dbType == POSTGRESQL {
            _ = check dbClient->execute(`
                INSERT INTO bi_runtime_log_levels (
                    runtime_id, component_name, log_level
                ) VALUES (
                    ${heartbeat.runtime}, ${componentName}, ${logLevelStr}
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
                    ${heartbeat.runtime}, ${componentName}, ${logLevelStr}
                )
                ON DUPLICATE KEY UPDATE
                    log_level = VALUES(log_level),
                    updated_at = CURRENT_TIMESTAMP
            `);
        }
    }
}
