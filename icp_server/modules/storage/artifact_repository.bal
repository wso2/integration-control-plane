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

import icp_server.types;

import ballerina/crypto;
import ballerina/log;
import ballerina/sql;

// Helper function to get runtime IDs for a specific environment and component
isolated function getRuntimeIdsByEnvironmentAndComponent(string environmentId, string componentId) returns string[]|error {
    stream<types:RuntimeDBRecord, sql:Error?> runtimeStream = dbClient->query(`
        SELECT runtime_id 
        FROM runtimes 
        WHERE environment_id = ${environmentId} AND component_id = ${componentId}
    `);

    string[] runtimeIds = [];
    check from types:RuntimeDBRecord runtime in runtimeStream
        do {
            runtimeIds.push(runtime.runtime_id);
        };

    return runtimeIds;
}

isolated function getRuntimeStatusMap(string[] runtimeIds) returns map<types:RuntimeInfo>|error {
    map<types:RuntimeInfo> runtimeMap = {};
    if runtimeIds.length() == 0 {
        return runtimeMap;
    }

    // Build IN clause for runtime IDs
    sql:ParameterizedQuery inClause = `(`;
    foreach int i in 0 ..< runtimeIds.length() {
        if i > 0 {
            inClause = sql:queryConcat(inClause, `, `);
        }
        inClause = sql:queryConcat(inClause, `${runtimeIds[i]}`);
    }
    inClause = sql:queryConcat(inClause, `)`);

    sql:ParameterizedQuery query = sql:queryConcat(`SELECT runtime_id, status, name FROM runtimes WHERE runtime_id IN `, inClause);
    stream<record {|string runtime_id; string status; string? name;|}, sql:Error?> rs = dbClient->query(query);
    check from record {|string runtime_id; string status; string? name;|} row in rs
        do {
            runtimeMap[row.runtime_id] = {status: row.status, name: row.name ?: "-"};
        };

    return runtimeMap;
}

isolated function shouldReplaceArtifact(string newRuntimeId, string existingRuntimeId, map<types:RuntimeInfo> runtimeMap) returns boolean {
    types:RuntimeInfo? newInfo = runtimeMap[newRuntimeId];
    types:RuntimeInfo? existingInfo = runtimeMap[existingRuntimeId];
    string newStatus = newInfo is types:RuntimeInfo ? newInfo.status : "UNKNOWN";
    string existingStatus = existingInfo is types:RuntimeInfo ? existingInfo.status : "UNKNOWN";
    log:printDebug("Evaluating artifact replacement - New runtime: " + newRuntimeId + " (" + newStatus + "), Existing runtime: " + existingRuntimeId + " (" + existingStatus + ")");
    return newStatus == "RUNNING" && existingStatus != "RUNNING";
}

isolated function resolveRuntimeInfos(string[] rids, map<types:RuntimeInfo> statusMap) returns types:ArtifactRuntimeInfo[] {
    return from string rid in rids
        let types:RuntimeInfo? info = statusMap[rid]
        select {
            runtimeId: rid,
            runtimeName: info is types:RuntimeInfo ? (info.name ?: "-") : "-",
            status: info is types:RuntimeInfo ? info.status : "UNKNOWN"
        };
}

// Helper function to calculate a hash for a service based on its key properties
isolated function calculateServiceHash(types:Service 'service) returns string {
    // Create a unique string representation of the service including resources
    // Note: name is excluded as it may vary across runtimes for the same service
    string serviceKey = string `${('service.package)}-${('service.basePath)}-${('service.'type)}`;

    // Add resources to the hash calculation - use url and methods instead of path/method
    foreach types:Resource 'resource in 'service.resources {
        string? url = 'resource?.url;
        string[]? methodsOpt = 'resource?.methods;
        string[] methods = methodsOpt ?: [];
        string methodsStr = string:'join(",", ...methods);
        serviceKey = serviceKey + string `-${url ?: ""}-${methodsStr}`;
    }

    // Calculate SHA-256 hash
    byte[] hashBytes = crypto:hashSha256(serviceKey.toBytes());
    log:printDebug("Service Key: " + serviceKey + " | Hash: " + hashBytes.toBase16());
    return hashBytes.toBase16();
}

// Helper function to calculate a hash for a listener based on its key properties
isolated function calculateListenerHash(types:Listener listenerRecord) returns string {
    // Create a unique string representation of the listener
    // Note: name is excluded as it may vary across runtimes for the same listener
    string listenerKey = string `${listenerRecord.package}-${listenerRecord.protocol}`;

    // Add optional fields if present
    string? host = listenerRecord?.host;
    if host is string {
        listenerKey = listenerKey + string `-${host}`;
    }
    int? port = listenerRecord?.port;
    if port is int {
        listenerKey = listenerKey + string `-${port}`;
    }
    string? destination = listenerRecord?.destination;
    if destination is string {
        listenerKey = listenerKey + string `-${destination}`;
    }
    string? queue = listenerRecord?.queue;
    if queue is string {
        listenerKey = listenerKey + string `-${queue}`;
    }
    string? path = listenerRecord?.path;
    if path is string {
        listenerKey = listenerKey + string `-${path}`;
    }

    // Calculate SHA-256 hash
    byte[] hashBytes = crypto:hashSha256(listenerKey.toBytes());
    log:printDebug("Listener Key: " + listenerKey + " | Hash: " + hashBytes.toBase16());
    return hashBytes.toBase16();
}

// Get services for a specific environment and component
public isolated function getServicesByEnvironmentAndComponent(string environmentId, string componentId) returns types:Service[]|error {
    map<types:Service> serviceMap = {};
    map<string[]> serviceRuntimeMap = {};
    map<string> serviceSourceRuntime = {}; // Tracks which runtime provided the artifact

    // Get all runtime IDs for this environment and component
    string[] runtimeIds = check getRuntimeIdsByEnvironmentAndComponent(environmentId, componentId);

    // If no runtimes found, return empty array
    if runtimeIds.length() == 0 {
        return [];
    }

    map<types:RuntimeInfo> statusMap = check getRuntimeStatusMap(runtimeIds);

    // Get all services for these runtimes, ensuring uniqueness and prioritizing RUNNING runtimes
    foreach string runtimeId in runtimeIds {
        types:Service[] runtimeServices = check getServicesForRuntime(runtimeId);
        foreach types:Service 'service in runtimeServices {
            string hash = calculateServiceHash('service);
            if !serviceRuntimeMap.hasKey(hash) {
                // First time seeing this artifact
                serviceMap[hash] = 'service;
                serviceRuntimeMap[hash] = [runtimeId];
                serviceSourceRuntime[hash] = runtimeId;
            } else {
                // Duplicate artifact - add runtime ID to list
                string[] existing = <string[]>serviceRuntimeMap[hash];
                existing.push(runtimeId);
                serviceRuntimeMap[hash] = existing;

                // Replace artifact instance if new runtime is RUNNING and existing source is not
                string sourceRuntimeId = serviceSourceRuntime[hash] ?: "";
                if shouldReplaceArtifact(runtimeId, sourceRuntimeId, statusMap) {
                    log:printDebug("Replacing service artifact from runtime " + sourceRuntimeId + " with runtime " + runtimeId);
                    serviceMap[hash] = 'service;
                    serviceSourceRuntime[hash] = runtimeId;
                }
            }
        }
    }

    // Convert map to array and attach runtime info
    types:Service[] serviceList = [];
    foreach [string, types:Service] [hash, s] in serviceMap.entries() {
        string[] rids = serviceRuntimeMap[hash] ?: [];
        s.runtimeIds = rids;
        types:ArtifactRuntimeInfo[] infos = resolveRuntimeInfos(rids, statusMap);
        s.runtimes = infos;
        serviceList.push(s);
    }
    log:printDebug("Services processed: " + serviceList.length().toString());
    return serviceList;
}

// Get listeners for a specific environment and component
public isolated function getListenersByEnvironmentAndComponent(string environmentId, string componentId) returns types:Listener[]|error {
    map<types:Listener> listenerMap = {};
    map<string[]> listenerRuntimeMap = {};
    map<string> listenerSourceRuntime = {}; // Tracks which runtime provided the artifact

    // Get all runtime IDs for this environment and component
    string[] runtimeIds = check getRuntimeIdsByEnvironmentAndComponent(environmentId, componentId);

    // If no runtimes found, return empty array
    if runtimeIds.length() == 0 {
        return [];
    }

    map<types:RuntimeInfo> statusMap = check getRuntimeStatusMap(runtimeIds);

    // Get all listeners for these runtimes, ensuring uniqueness and prioritizing RUNNING runtimes
    foreach string runtimeId in runtimeIds {
        types:Listener[] runtimeListeners = check getListenersForRuntime(runtimeId);
        foreach types:Listener listenerRecord in runtimeListeners {
            string hash = calculateListenerHash(listenerRecord);
            if !listenerRuntimeMap.hasKey(hash) {
                // First time seeing this artifact
                listenerMap[hash] = listenerRecord;
                listenerRuntimeMap[hash] = [runtimeId];
                listenerSourceRuntime[hash] = runtimeId;
            } else {
                // Duplicate artifact - add runtime ID to list
                string[] existing = <string[]>listenerRuntimeMap[hash];
                existing.push(runtimeId);
                listenerRuntimeMap[hash] = existing;

                // Replace artifact instance if new runtime is RUNNING and existing source is not
                string sourceRuntimeId = listenerSourceRuntime[hash] ?: "";
                if shouldReplaceArtifact(runtimeId, sourceRuntimeId, statusMap) {
                    log:printInfo("Replacing listener artifact from runtime " + sourceRuntimeId + " with runtime " + runtimeId);
                    listenerMap[hash] = listenerRecord;
                    listenerSourceRuntime[hash] = runtimeId;
                }
            }
        }
    }

    // Convert map to array and attach runtime info
    types:Listener[] listenerList = [];
    foreach [string, types:Listener] [hash, l] in listenerMap.entries() {
        string[] rids = listenerRuntimeMap[hash] ?: [];
        l.runtimeIds = rids;
        types:ArtifactRuntimeInfo[] infos = resolveRuntimeInfos(rids, statusMap);
        l.runtimes = infos;
        listenerList.push(l);
    }
    log:printDebug("Listeners processed: " + listenerList.length().toString());
    return listenerList;
}

// Get automation artifacts for a specific environment and component
public isolated function getAutomationsByEnvironmentAndComponent(string environmentId, string componentId) returns types:Automation[]|error {
    map<types:Automation> automationMap = {};

    // Get all runtime IDs for this environment and component
    string[] runtimeIds = check getRuntimeIdsByEnvironmentAndComponent(environmentId, componentId);

    // If no runtimes found, return empty array
    if runtimeIds.length() == 0 {
        return [];
    }

    map<types:RuntimeInfo> statusMap = check getRuntimeStatusMap(runtimeIds);

    // Build IN clause for runtime IDs
    sql:ParameterizedQuery inClause = `(`;
    foreach int i in 0 ..< runtimeIds.length() {
        if i > 0 {
            inClause = sql:queryConcat(inClause, `, `);
        }
        inClause = sql:queryConcat(inClause, `${runtimeIds[i]}`);
    }
    inClause = sql:queryConcat(inClause, `)`);

    // Query for all automation artifacts and collect data in one pass
    sql:ParameterizedQuery snapshotQuery = sql:queryConcat(`
        SELECT 
            runtime_id,
            package_org,
            package_name,
            package_version,
            execution_timestamp
        FROM bi_automation_artifacts
        WHERE runtime_id IN `, inClause, `
        ORDER BY package_org, package_name, package_version, execution_timestamp DESC
    `);

    // Use a record type that includes runtime_id to capture all fields
    stream<record {|string runtime_id; string package_org; string package_name; string package_version; string execution_timestamp;|}, sql:Error?> snapshotStream = dbClient->query(snapshotQuery);

    sql:ParameterizedQuery historyQuery = sql:queryConcat(`
        SELECT
            runtime_id,
            package_org,
            package_name,
            package_version,
            execution_timestamp
        FROM bi_automation_execution_history
        WHERE runtime_id IN `, inClause, `
        ORDER BY package_org, package_name, package_version, execution_timestamp DESC
    `);

    stream<record {|string runtime_id; string package_org; string package_name; string package_version; string execution_timestamp;|}, sql:Error?> historyStream = dbClient->query(historyQuery);

    // Build nested map: automationKey -> runtimeId -> execution_timestamps[]
    map<map<string[]>> automationRuntimeExecutions = {};

    check from record {|string runtime_id; string package_org; string package_name; string package_version; string execution_timestamp;|} row in snapshotStream
        do {
            // Create a unique key for each package (org + name + version)
            string key = string `${row.package_org}:${row.package_name}:${row.package_version}`;

            // Store the first occurrence as the representative automation
            if !automationMap.hasKey(key) {
                automationMap[key] = {
                    packageOrg: row.package_org,
                    packageName: row.package_name,
                    packageVersion: row.package_version,
                    executionTimestamp: convertDbDateTimeToISO8601(row.execution_timestamp)
                };
                automationRuntimeExecutions[key] = {};
            }

            // Get or create the runtime executions map for this automation
            map<string[]> runtimeExecs = automationRuntimeExecutions[key] ?: {};
            string[] existingTimestamps = runtimeExecs[row.runtime_id] ?: [];
            string isoTimestamp = convertDbDateTimeToISO8601(row.execution_timestamp);
            if existingTimestamps.indexOf(isoTimestamp) is () {
                existingTimestamps.push(isoTimestamp);
            }
            runtimeExecs[row.runtime_id] = existingTimestamps;
            automationRuntimeExecutions[key] = runtimeExecs;
        };

    check from record {|string runtime_id; string package_org; string package_name; string package_version; string execution_timestamp;|} row in historyStream
        do {
            string key = string `${row.package_org}:${row.package_name}:${row.package_version}`;

            if automationMap.hasKey(key) {
                map<string[]> runtimeExecs = automationRuntimeExecutions[key] ?: {};
                string[] existingTimestamps = runtimeExecs[row.runtime_id] ?: [];
                string isoTimestamp = convertDbDateTimeToISO8601(row.execution_timestamp);
                if existingTimestamps.indexOf(isoTimestamp) is () {
                    existingTimestamps.push(isoTimestamp);
                }
                runtimeExecs[row.runtime_id] = existingTimestamps;
                automationRuntimeExecutions[key] = runtimeExecs;
            }
        };

    // Convert map to array and attach runtime info using the pre-collected data
    types:Automation[] automationList = [];
    foreach [string, types:Automation] [key, automation] in automationMap.entries() {
        map<string[]> runtimeExecs = automationRuntimeExecutions[key] ?: {};
        string[] rids = runtimeExecs.keys();

        automation.runtimeIds = rids;
        types:AutomationRuntimeInfo[] infos = [];
        foreach string rid in rids {
            types:RuntimeInfo? info = statusMap[rid];
            string status = info is types:RuntimeInfo ? info.status : "UNKNOWN";
            string name = info is types:RuntimeInfo ? (info.name ?: "-") : "-";
            string[] execTimestamps = runtimeExecs[rid] ?: [];
            infos.push({runtimeId: rid, runtimeName: name, status, executionTimestamps: execTimestamps});
        }
        automation.runtimes = infos;
        automationList.push(automation);
    }

    log:printDebug("Automations processed: " + automationList.length().toString());
    return automationList;
}

// Get REST APIs for a specific environment and component
public isolated function getRestApisByEnvironmentAndComponent(string environmentId, string componentId) returns types:RestApi[]|error {
    map<types:RestApi> apiMap = {};
    map<string[]> apiRuntimeMap = {};
    map<string> apiSourceRuntime = {}; // Tracks which runtime provided the artifact

    // Get all runtime IDs for this environment and component
    string[] runtimeIds = check getRuntimeIdsByEnvironmentAndComponent(environmentId, componentId);

    // If no runtimes found, return empty array
    if runtimeIds.length() == 0 {
        return [];
    }

    map<types:RuntimeInfo> statusMap = check getRuntimeStatusMap(runtimeIds);

    // Get all REST APIs for these runtimes, ensuring uniqueness and prioritizing RUNNING runtimes
    foreach string runtimeId in runtimeIds {
        types:RestApi[] runtimeApis = check getApisForRuntime(runtimeId);
        foreach types:RestApi api in runtimeApis {
            string key = api.name;
            if !apiRuntimeMap.hasKey(key) {
                // First time seeing this artifact
                apiMap[key] = api;
                apiRuntimeMap[key] = [runtimeId];
                apiSourceRuntime[key] = runtimeId;
            } else {
                // Duplicate artifact - add runtime ID to list
                string[] existing = <string[]>apiRuntimeMap[key];
                existing.push(runtimeId);
                apiRuntimeMap[key] = existing;

                // Replace artifact instance if new runtime is RUNNING and existing source is not
                string sourceRuntimeId = apiSourceRuntime[key] ?: "";
                if shouldReplaceArtifact(runtimeId, sourceRuntimeId, statusMap) {
                    log:printInfo("Replacing REST API artifact from runtime " + sourceRuntimeId + " with runtime " + runtimeId);
                    apiMap[key] = api;
                    apiSourceRuntime[key] = runtimeId;
                }
            }
        }
    }

    // Convert map to array and attach runtime info
    types:RestApi[] apiList = [];
    foreach [string, types:RestApi] [key, api] in apiMap.entries() {
        string[] rids = apiRuntimeMap[key] ?: [];
        api.runtimeIds = rids;
        types:ArtifactRuntimeInfo[] infos = resolveRuntimeInfos(rids, statusMap);
        api.runtimes = infos;
        apiList.push(api);
    }

    return apiList;
}

// Get Composite Apps for a specific environment and component
public isolated function getCompositeAppsByEnvironmentAndComponent(string environmentId, string componentId) returns types:CompositeApp[]|error {
    map<types:CompositeApp> appMap = {};
    map<string[]> appRuntimeMap = {};
    map<string> appSourceRuntime = {}; // Tracks which runtime provided the artifact

    // Get all runtime IDs for this environment and component
    string[] runtimeIds = check getRuntimeIdsByEnvironmentAndComponent(environmentId, componentId);

    // If no runtimes found, return empty array
    if runtimeIds.length() == 0 {
        return [];
    }

    map<types:RuntimeInfo> statusMap = check getRuntimeStatusMap(runtimeIds);

    // Get all Composite Apps for these runtimes, ensuring uniqueness and prioritizing RUNNING runtimes
    foreach string runtimeId in runtimeIds {
        types:CompositeApp[] runtimeApps = check getCompositeAppsForRuntime(runtimeId);
        foreach types:CompositeApp app in runtimeApps {
            string key = types:qualifiedCompositeAppName(app.name, app.version);
            if !appRuntimeMap.hasKey(key) {
                // First time seeing this artifact
                appMap[key] = app;
                appRuntimeMap[key] = [runtimeId];
                appSourceRuntime[key] = runtimeId;
            } else {
                // Duplicate artifact - add runtime ID to list
                string[] existing = <string[]>appRuntimeMap[key];
                existing.push(runtimeId);
                appRuntimeMap[key] = existing;

                // Replace artifact instance if new runtime is RUNNING and existing source is not
                string sourceRuntimeId = appSourceRuntime[key] ?: "";
                if shouldReplaceArtifact(runtimeId, sourceRuntimeId, statusMap) {
                    log:printInfo("Replacing Composite App artifact from runtime " + sourceRuntimeId + " with runtime " + runtimeId);
                    appMap[key] = app;
                    appSourceRuntime[key] = runtimeId;
                }
            }
        }
    }

    // Convert map to array and attach runtime info
    types:CompositeApp[] appList = [];
    foreach [string, types:CompositeApp] [key, app] in appMap.entries() {
        string[] rids = appRuntimeMap[key] ?: [];
        app.runtimeIds = rids;
        types:ArtifactRuntimeInfo[] infos = resolveRuntimeInfos(rids, statusMap);
        app.runtimes = infos;
        appList.push(app);
    }

    return appList;
}

// Get Inbound Endpoints for a specific environment and component
public isolated function getInboundEndpointsByEnvironmentAndComponent(string environmentId, string componentId) returns types:InboundEndpoint[]|error {
    map<types:InboundEndpoint> inboundMap = {};
    map<string[]> inboundRuntimeMap = {};
    map<string> inboundSourceRuntime = {}; // Tracks which runtime provided the artifact

    // Get all runtime IDs for this environment and component
    string[] runtimeIds = check getRuntimeIdsByEnvironmentAndComponent(environmentId, componentId);

    // If no runtimes found, return empty array
    if runtimeIds.length() == 0 {
        return [];
    }

    map<types:RuntimeInfo> statusMap = check getRuntimeStatusMap(runtimeIds);

    // Get all Inbound Endpoints for these runtimes, ensuring uniqueness and prioritizing RUNNING runtimes
    foreach string runtimeId in runtimeIds {
        types:InboundEndpoint[] runtimeInbounds = check getInboundEndpointsForRuntime(runtimeId);
        foreach types:InboundEndpoint inbound in runtimeInbounds {
            string key = inbound.name;
            if !inboundRuntimeMap.hasKey(key) {
                // First time seeing this artifact
                inboundMap[key] = inbound;
                inboundRuntimeMap[key] = [runtimeId];
                inboundSourceRuntime[key] = runtimeId;
            } else {
                // Duplicate artifact - add runtime ID to list
                string[] existing = <string[]>inboundRuntimeMap[key];
                existing.push(runtimeId);
                inboundRuntimeMap[key] = existing;

                // Replace artifact instance if new runtime is RUNNING and existing source is not
                string sourceRuntimeId = inboundSourceRuntime[key] ?: "";
                if shouldReplaceArtifact(runtimeId, sourceRuntimeId, statusMap) {
                    log:printInfo("Replacing inbound endpoint artifact from runtime " + sourceRuntimeId + " with runtime " + runtimeId);
                    inboundMap[key] = inbound;
                    inboundSourceRuntime[key] = runtimeId;
                }
            }
        }
    }

    // Convert map to array and attach runtime info
    types:InboundEndpoint[] inboundList = [];
    foreach [string, types:InboundEndpoint] [key, inbound] in inboundMap.entries() {
        string[] rids = inboundRuntimeMap[key] ?: [];
        inbound.runtimeIds = rids;
        types:ArtifactRuntimeInfo[] infos = resolveRuntimeInfos(rids, statusMap);
        inbound.runtimes = infos;
        inboundList.push(inbound);
    }

    return inboundList;
}

// Get Endpoints for a specific environment and component
public isolated function getEndpointsByEnvironmentAndComponent(string environmentId, string componentId) returns types:Endpoint[]|error {
    map<types:Endpoint> endpointMap = {};
    map<string[]> endpointRuntimeMap = {};
    map<string> endpointSourceRuntime = {}; // Tracks which runtime provided the artifact

    // Get all runtime IDs for this environment and component
    string[] runtimeIds = check getRuntimeIdsByEnvironmentAndComponent(environmentId, componentId);

    // If no runtimes found, return empty array
    if runtimeIds.length() == 0 {
        return [];
    }

    map<types:RuntimeInfo> statusMap = check getRuntimeStatusMap(runtimeIds);

    // Get all Endpoints for these runtimes, ensuring uniqueness and prioritizing RUNNING runtimes
    foreach string runtimeId in runtimeIds {
        types:Endpoint[] runtimeEndpoints = check getEndpointsForRuntime(runtimeId);
        foreach types:Endpoint endpoint in runtimeEndpoints {
            string key = endpoint.name;
            if !endpointRuntimeMap.hasKey(key) {
                // First time seeing this artifact
                endpointMap[key] = endpoint;
                endpointRuntimeMap[key] = [runtimeId];
                endpointSourceRuntime[key] = runtimeId;
            } else {
                // Duplicate artifact - add runtime ID to list
                string[] existing = <string[]>endpointRuntimeMap[key];
                existing.push(runtimeId);
                endpointRuntimeMap[key] = existing;

                // Replace artifact instance if new runtime is RUNNING and existing source is not
                string sourceRuntimeId = endpointSourceRuntime[key] ?: "";
                if shouldReplaceArtifact(runtimeId, sourceRuntimeId, statusMap) {
                    log:printInfo("Replacing endpoint artifact from runtime " + sourceRuntimeId + " with runtime " + runtimeId);
                    endpointMap[key] = endpoint;
                    endpointSourceRuntime[key] = runtimeId;
                }
            }
        }
    }

    // Convert map to array and attach runtime info
    types:Endpoint[] endpointList = [];
    foreach [string, types:Endpoint] [key, endpoint] in endpointMap.entries() {
        string[] rids = endpointRuntimeMap[key] ?: [];
        endpoint.runtimeIds = rids;
        types:ArtifactRuntimeInfo[] infos = resolveRuntimeInfos(rids, statusMap);
        endpoint.runtimes = infos;
        endpointList.push(endpoint);
    }

    return endpointList;
}

// Get Sequences for a specific environment and component
public isolated function getSequencesByEnvironmentAndComponent(string environmentId, string componentId) returns types:Sequence[]|error {
    map<types:Sequence> sequenceMap = {};
    map<string[]> sequenceRuntimeMap = {};
    map<string> sequenceSourceRuntime = {}; // Tracks which runtime provided the artifact

    // Get all runtime IDs for this environment and component
    string[] runtimeIds = check getRuntimeIdsByEnvironmentAndComponent(environmentId, componentId);

    // If no runtimes found, return empty array
    if runtimeIds.length() == 0 {
        return [];
    }

    map<types:RuntimeInfo> statusMap = check getRuntimeStatusMap(runtimeIds);

    // Get all Sequences for these runtimes, ensuring uniqueness and prioritizing RUNNING runtimes
    foreach string runtimeId in runtimeIds {
        types:Sequence[] runtimeSequences = check getSequencesForRuntime(runtimeId);
        foreach types:Sequence sequence in runtimeSequences {
            string key = sequence.name;
            if !sequenceRuntimeMap.hasKey(key) {
                // First time seeing this artifact
                sequenceMap[key] = sequence;
                sequenceRuntimeMap[key] = [runtimeId];
                sequenceSourceRuntime[key] = runtimeId;
            } else {
                // Duplicate artifact - add runtime ID to list
                string[] existing = <string[]>sequenceRuntimeMap[key];
                existing.push(runtimeId);
                sequenceRuntimeMap[key] = existing;

                // Replace artifact instance if new runtime is RUNNING and existing source is not
                string sourceRuntimeId = sequenceSourceRuntime[key] ?: "";
                if shouldReplaceArtifact(runtimeId, sourceRuntimeId, statusMap) {
                    log:printInfo("Replacing sequence artifact from runtime " + sourceRuntimeId + " with runtime " + runtimeId);
                    sequenceMap[key] = sequence;
                    sequenceSourceRuntime[key] = runtimeId;
                }
            }
        }
    }

    // Convert map to array and attach runtime info
    types:Sequence[] sequenceList = [];
    foreach [string, types:Sequence] [key, sequence] in sequenceMap.entries() {
        string[] rids = sequenceRuntimeMap[key] ?: [];
        sequence.runtimeIds = rids;
        types:ArtifactRuntimeInfo[] infos = resolveRuntimeInfos(rids, statusMap);
        sequence.runtimes = infos;
        sequenceList.push(sequence);
    }

    return sequenceList;
}

// Get Proxy Services for a specific environment and component
public isolated function getProxyServicesByEnvironmentAndComponent(string environmentId, string componentId) returns types:ProxyService[]|error {
    map<types:ProxyService> proxyMap = {};
    map<string[]> proxyRuntimeMap = {};
    map<string> proxySourceRuntime = {}; // Tracks which runtime provided the artifact

    // Get all runtime IDs for this environment and component
    string[] runtimeIds = check getRuntimeIdsByEnvironmentAndComponent(environmentId, componentId);

    // If no runtimes found, return empty array
    if runtimeIds.length() == 0 {
        return [];
    }

    map<types:RuntimeInfo> statusMap = check getRuntimeStatusMap(runtimeIds);

    // Get all Proxy Services for these runtimes, ensuring uniqueness and prioritizing RUNNING runtimes
    foreach string runtimeId in runtimeIds {
        types:ProxyService[] runtimeProxies = check getProxyServicesForRuntime(runtimeId);
        foreach types:ProxyService proxy in runtimeProxies {
            string key = proxy.name;
            if !proxyRuntimeMap.hasKey(key) {
                // First time seeing this artifact
                proxyMap[key] = proxy;
                proxyRuntimeMap[key] = [runtimeId];
                proxySourceRuntime[key] = runtimeId;
            } else {
                // Duplicate artifact - add runtime ID to list
                string[] existing = <string[]>proxyRuntimeMap[key];
                existing.push(runtimeId);
                proxyRuntimeMap[key] = existing;

                // Merge endpoints across all runtimes
                types:ProxyService existingProxy = proxyMap[key] ?: proxy;
                string[] existingEndpoints = existingProxy.endpoints ?: [];
                string[] newEndpoints = proxy.endpoints ?: [];
                // Union endpoints
                map<boolean> seen = {};
                string[] merged = [];
                foreach string ep in existingEndpoints {
                    if !seen.hasKey(ep) {
                        seen[ep] = true;
                        merged.push(ep);
                    }
                }
                foreach string ep in newEndpoints {
                    if !seen.hasKey(ep) {
                        seen[ep] = true;
                        merged.push(ep);
                    }
                }

                // Replace artifact instance if new runtime is RUNNING and existing source is not
                string sourceRuntimeId = proxySourceRuntime[key] ?: "";
                if shouldReplaceArtifact(runtimeId, sourceRuntimeId, statusMap) {
                    log:printInfo("Replacing proxy service artifact from runtime " + sourceRuntimeId + " with runtime " + runtimeId);
                    proxy.endpoints = merged;
                    proxyMap[key] = proxy;
                    proxySourceRuntime[key] = runtimeId;
                } else {
                    existingProxy.endpoints = merged;
                    proxyMap[key] = existingProxy;
                }
            }
        }
    }

    // Convert map to array and attach runtime info
    types:ProxyService[] proxyList = [];
    foreach [string, types:ProxyService] [key, proxy] in proxyMap.entries() {
        string[] rids = proxyRuntimeMap[key] ?: [];
        proxy.runtimeIds = rids;
        types:ArtifactRuntimeInfo[] infos = resolveRuntimeInfos(rids, statusMap);
        proxy.runtimes = infos;
        proxyList.push(proxy);
    }

    return proxyList;
}

// Get Tasks for a specific environment and component
public isolated function getTasksByEnvironmentAndComponent(string environmentId, string componentId) returns types:Task[]|error {
    map<types:Task> taskMap = {};
    map<string[]> taskRuntimeMap = {};
    map<string> taskSourceRuntime = {}; // Tracks which runtime provided the artifact

    // Get all runtime IDs for this environment and component
    string[] runtimeIds = check getRuntimeIdsByEnvironmentAndComponent(environmentId, componentId);

    // If no runtimes found, return empty array
    if runtimeIds.length() == 0 {
        return [];
    }

    map<types:RuntimeInfo> statusMap = check getRuntimeStatusMap(runtimeIds);

    // Get all Tasks for these runtimes, ensuring uniqueness and prioritizing RUNNING runtimes
    foreach string runtimeId in runtimeIds {
        types:Task[] runtimeTasks = check getTasksForRuntime(runtimeId);
        foreach types:Task task in runtimeTasks {
            string key = task.name;
            if !taskRuntimeMap.hasKey(key) {
                // First time seeing this artifact
                taskMap[key] = task;
                taskRuntimeMap[key] = [runtimeId];
                taskSourceRuntime[key] = runtimeId;
            } else {
                // Duplicate artifact - add runtime ID to list
                string[] existing = <string[]>taskRuntimeMap[key];
                existing.push(runtimeId);
                taskRuntimeMap[key] = existing;

                // Replace artifact instance if new runtime is RUNNING and existing source is not
                string sourceRuntimeId = taskSourceRuntime[key] ?: "";
                if shouldReplaceArtifact(runtimeId, sourceRuntimeId, statusMap) {
                    log:printInfo("Replacing task artifact from runtime " + sourceRuntimeId + " with runtime " + runtimeId);
                    taskMap[key] = task;
                    taskSourceRuntime[key] = runtimeId;
                }
            }
        }
    }

    // Convert map to array and attach runtime info
    types:Task[] taskList = [];
    foreach [string, types:Task] [key, task] in taskMap.entries() {
        string[] rids = taskRuntimeMap[key] ?: [];
        task.runtimeIds = rids;
        types:ArtifactRuntimeInfo[] infos = resolveRuntimeInfos(rids, statusMap);
        task.runtimes = infos;
        taskList.push(task);
    }

    return taskList;
}

// Get Templates for a specific environment and component
public isolated function getTemplatesByEnvironmentAndComponent(string environmentId, string componentId) returns types:Template[]|error {
    map<types:Template> templateMap = {};
    map<string[]> templateRuntimeMap = {};
    map<string> templateSourceRuntime = {}; // Tracks which runtime provided the artifact

    // Get all runtime IDs for this environment and component
    string[] runtimeIds = check getRuntimeIdsByEnvironmentAndComponent(environmentId, componentId);

    // If no runtimes found, return empty array
    if runtimeIds.length() == 0 {
        return [];
    }

    map<types:RuntimeInfo> statusMap = check getRuntimeStatusMap(runtimeIds);

    // Get all Templates for these runtimes, ensuring uniqueness and prioritizing RUNNING runtimes
    foreach string runtimeId in runtimeIds {
        types:Template[] runtimeTemplates = check getTemplatesForRuntime(runtimeId);
        foreach types:Template template in runtimeTemplates {
            string key = template.name;
            if !templateRuntimeMap.hasKey(key) {
                // First time seeing this artifact
                templateMap[key] = template;
                templateRuntimeMap[key] = [runtimeId];
                templateSourceRuntime[key] = runtimeId;
            } else {
                // Duplicate artifact - add runtime ID to list
                string[] existing = <string[]>templateRuntimeMap[key];
                existing.push(runtimeId);
                templateRuntimeMap[key] = existing;

                // Replace artifact instance if new runtime is RUNNING and existing source is not
                string sourceRuntimeId = templateSourceRuntime[key] ?: "";
                if shouldReplaceArtifact(runtimeId, sourceRuntimeId, statusMap) {
                    log:printInfo("Replacing template artifact from runtime " + sourceRuntimeId + " with runtime " + runtimeId);
                    templateMap[key] = template;
                    templateSourceRuntime[key] = runtimeId;
                }
            }
        }
    }

    // Convert map to array and attach runtime info
    types:Template[] templateList = [];
    foreach [string, types:Template] [key, template] in templateMap.entries() {
        string[] rids = templateRuntimeMap[key] ?: [];
        template.runtimeIds = rids;
        types:ArtifactRuntimeInfo[] infos = resolveRuntimeInfos(rids, statusMap);
        template.runtimes = infos;
        templateList.push(template);
    }

    return templateList;
}

// Get Message Stores for a specific environment and component
public isolated function getMessageStoresByEnvironmentAndComponent(string environmentId, string componentId) returns types:MessageStore[]|error {
    map<types:MessageStore> storeMap = {};
    map<string[]> storeRuntimeMap = {};
    map<string> storeSourceRuntime = {}; // Tracks which runtime provided the artifact

    // Get all runtime IDs for this environment and component
    string[] runtimeIds = check getRuntimeIdsByEnvironmentAndComponent(environmentId, componentId);

    // If no runtimes found, return empty array
    if runtimeIds.length() == 0 {
        return [];
    }

    map<types:RuntimeInfo> statusMap = check getRuntimeStatusMap(runtimeIds);

    // Get all Message Stores for these runtimes, ensuring uniqueness and prioritizing RUNNING runtimes
    foreach string runtimeId in runtimeIds {
        types:MessageStore[] runtimeStores = check getMessageStoresForRuntime(runtimeId);
        foreach types:MessageStore store in runtimeStores {
            string key = store.name;
            if !storeRuntimeMap.hasKey(key) {
                // First time seeing this artifact
                storeMap[key] = store;
                storeRuntimeMap[key] = [runtimeId];
                storeSourceRuntime[key] = runtimeId;
            } else {
                // Duplicate artifact - add runtime ID to list
                string[] existing = <string[]>storeRuntimeMap[key];
                existing.push(runtimeId);
                storeRuntimeMap[key] = existing;

                // Replace artifact instance if new runtime is RUNNING and existing source is not
                string sourceRuntimeId = storeSourceRuntime[key] ?: "";
                if shouldReplaceArtifact(runtimeId, sourceRuntimeId, statusMap) {
                    log:printInfo("Replacing message store artifact from runtime " + sourceRuntimeId + " with runtime " + runtimeId);
                    storeMap[key] = store;
                    storeSourceRuntime[key] = runtimeId;
                }
            }
        }
    }

    // Convert map to array and attach runtime info
    types:MessageStore[] storeList = [];
    foreach [string, types:MessageStore] [key, store] in storeMap.entries() {
        string[] rids = storeRuntimeMap[key] ?: [];
        store.runtimeIds = rids;
        types:ArtifactRuntimeInfo[] infos = resolveRuntimeInfos(rids, statusMap);
        store.runtimes = infos;
        storeList.push(store);
    }

    return storeList;
}

// Get Message Processors for a specific environment and component
public isolated function getMessageProcessorsByEnvironmentAndComponent(string environmentId, string componentId) returns types:MessageProcessor[]|error {
    map<types:MessageProcessor> processorMap = {};
    map<string[]> processorRuntimeMap = {};
    map<string> processorSourceRuntime = {}; // Tracks which runtime provided the artifact

    // Get all runtime IDs for this environment and component
    string[] runtimeIds = check getRuntimeIdsByEnvironmentAndComponent(environmentId, componentId);

    // If no runtimes found, return empty array
    if runtimeIds.length() == 0 {
        return [];
    }

    map<types:RuntimeInfo> statusMap = check getRuntimeStatusMap(runtimeIds);

    // Get all Message Processors for these runtimes, ensuring uniqueness and prioritizing RUNNING runtimes
    foreach string runtimeId in runtimeIds {
        types:MessageProcessor[] runtimeProcessors = check getMessageProcessorsForRuntime(runtimeId);
        foreach types:MessageProcessor proc in runtimeProcessors {
            string key = proc.name;
            if !processorRuntimeMap.hasKey(key) {
                // First time seeing this artifact
                processorMap[key] = proc;
                processorRuntimeMap[key] = [runtimeId];
                processorSourceRuntime[key] = runtimeId;
            } else {
                // Duplicate artifact - add runtime ID to list
                string[] existing = <string[]>processorRuntimeMap[key];
                existing.push(runtimeId);
                processorRuntimeMap[key] = existing;

                // Replace artifact instance if new runtime is RUNNING and existing source is not
                string sourceRuntimeId = processorSourceRuntime[key] ?: "";
                if shouldReplaceArtifact(runtimeId, sourceRuntimeId, statusMap) {
                    log:printInfo("Replacing message processor artifact from runtime " + sourceRuntimeId + " with runtime " + runtimeId);
                    processorMap[key] = proc;
                    processorSourceRuntime[key] = runtimeId;
                }
            }
        }
    }

    // Convert map to array and attach runtime info
    types:MessageProcessor[] processorList = [];
    foreach [string, types:MessageProcessor] [key, proc] in processorMap.entries() {
        string[] rids = processorRuntimeMap[key] ?: [];
        proc.runtimeIds = rids;
        types:ArtifactRuntimeInfo[] infos = resolveRuntimeInfos(rids, statusMap);
        proc.runtimes = infos;
        processorList.push(proc);
    }

    return processorList;
}

// Get Local Entries for a specific environment and component
public isolated function getLocalEntriesByEnvironmentAndComponent(string environmentId, string componentId) returns types:LocalEntry[]|error {
    map<types:LocalEntry> entryMap = {};
    map<string[]> entryRuntimeMap = {};
    map<string> entrySourceRuntime = {}; // Tracks which runtime provided the artifact

    // Get all runtime IDs for this environment and component
    string[] runtimeIds = check getRuntimeIdsByEnvironmentAndComponent(environmentId, componentId);

    // If no runtimes found, return empty array
    if runtimeIds.length() == 0 {
        return [];
    }

    map<types:RuntimeInfo> statusMap = check getRuntimeStatusMap(runtimeIds);

    // Get all Local Entries for these runtimes, ensuring uniqueness and prioritizing RUNNING runtimes
    foreach string runtimeId in runtimeIds {
        types:LocalEntry[] runtimeEntries = check getLocalEntriesForRuntime(runtimeId);
        foreach types:LocalEntry entry in runtimeEntries {
            string key = entry.name;
            if !entryRuntimeMap.hasKey(key) {
                // First time seeing this artifact
                entryMap[key] = entry;
                entryRuntimeMap[key] = [runtimeId];
                entrySourceRuntime[key] = runtimeId;
            } else {
                // Duplicate artifact - add runtime ID to list
                string[] existing = <string[]>entryRuntimeMap[key];
                existing.push(runtimeId);
                entryRuntimeMap[key] = existing;

                // Replace artifact instance if new runtime is RUNNING and existing source is not
                string sourceRuntimeId = entrySourceRuntime[key] ?: "";
                if shouldReplaceArtifact(runtimeId, sourceRuntimeId, statusMap) {
                    log:printInfo("Replacing local entry artifact from runtime " + sourceRuntimeId + " with runtime " + runtimeId);
                    entryMap[key] = entry;
                    entrySourceRuntime[key] = runtimeId;
                }
            }
        }
    }

    // Convert map to array and attach runtime info
    types:LocalEntry[] entryList = [];
    foreach [string, types:LocalEntry] [key, entry] in entryMap.entries() {
        string[] rids = entryRuntimeMap[key] ?: [];
        entry.runtimeIds = rids;
        types:ArtifactRuntimeInfo[] infos = resolveRuntimeInfos(rids, statusMap);
        entry.runtimes = infos;
        entryList.push(entry);
    }

    return entryList;
}

// Get Data Services for a specific environment and component
public isolated function getDataServicesByEnvironmentAndComponent(string environmentId, string componentId) returns types:DataService[]|error {
    map<types:DataService> dataServiceMap = {};
    map<string[]> dsRuntimeMap = {};
    map<string> dsSourceRuntime = {}; // Tracks which runtime provided the artifact

    // Get all runtime IDs for this environment and component
    string[] runtimeIds = check getRuntimeIdsByEnvironmentAndComponent(environmentId, componentId);

    // If no runtimes found, return empty array
    if runtimeIds.length() == 0 {
        return [];
    }

    map<types:RuntimeInfo> statusMap = check getRuntimeStatusMap(runtimeIds);

    // Get all Data Services for these runtimes, ensuring uniqueness and prioritizing RUNNING runtimes
    foreach string runtimeId in runtimeIds {
        types:DataService[] runtimeDataServices = check getDataServicesForRuntime(runtimeId);
        foreach types:DataService ds in runtimeDataServices {
            string key = ds.name;
            if !dsRuntimeMap.hasKey(key) {
                // First time seeing this artifact
                dataServiceMap[key] = ds;
                dsRuntimeMap[key] = [runtimeId];
                dsSourceRuntime[key] = runtimeId;
            } else {
                // Duplicate artifact - add runtime ID to list
                string[] existing = <string[]>dsRuntimeMap[key];
                existing.push(runtimeId);
                dsRuntimeMap[key] = existing;

                // Replace artifact instance if new runtime is RUNNING and existing source is not
                string sourceRuntimeId = dsSourceRuntime[key] ?: "";
                if shouldReplaceArtifact(runtimeId, sourceRuntimeId, statusMap) {
                    log:printInfo("Replacing data service artifact from runtime " + sourceRuntimeId + " with runtime " + runtimeId);
                    dataServiceMap[key] = ds;
                    dsSourceRuntime[key] = runtimeId;
                }
            }
        }
    }

    // Convert map to array and attach runtime info
    types:DataService[] dataServiceList = [];
    foreach [string, types:DataService] [key, ds] in dataServiceMap.entries() {
        string[] rids = dsRuntimeMap[key] ?: [];
        ds.runtimeIds = rids;
        types:ArtifactRuntimeInfo[] infos = resolveRuntimeInfos(rids, statusMap);
        ds.runtimes = infos;
        dataServiceList.push(ds);
    }

    return dataServiceList;
}

// Get Data Sources for a specific environment and component
public isolated function getDataSourcesByEnvironmentAndComponent(string environmentId, string componentId) returns types:DataSource[]|error {
    map<types:DataSource> sourceMap = {};
    map<string[]> sourceRuntimeMap = {};
    map<string> sourceSourceRuntime = {}; // Tracks which runtime provided the artifact

    // Get all runtime IDs for this environment and component
    string[] runtimeIds = check getRuntimeIdsByEnvironmentAndComponent(environmentId, componentId);

    // If no runtimes found, return empty array
    if runtimeIds.length() == 0 {
        return [];
    }

    map<types:RuntimeInfo> statusMap = check getRuntimeStatusMap(runtimeIds);

    // Get all Data Sources for these runtimes, ensuring uniqueness and prioritizing RUNNING runtimes
    foreach string runtimeId in runtimeIds {
        types:DataSource[] runtimeSources = check getDataSourcesForRuntime(runtimeId);
        foreach types:DataSource ds in runtimeSources {
            string key = ds.name;
            if !sourceRuntimeMap.hasKey(key) {
                // First time seeing this artifact
                sourceMap[key] = ds;
                sourceRuntimeMap[key] = [runtimeId];
                sourceSourceRuntime[key] = runtimeId;
            } else {
                // Duplicate artifact - add runtime ID to list
                string[] existing = <string[]>sourceRuntimeMap[key];
                existing.push(runtimeId);
                sourceRuntimeMap[key] = existing;

                // Replace artifact instance if new runtime is RUNNING and existing source is not
                string sourceRuntimeId = sourceSourceRuntime[key] ?: "";
                if shouldReplaceArtifact(runtimeId, sourceRuntimeId, statusMap) {
                    log:printInfo("Replacing data source artifact from runtime " + sourceRuntimeId + " with runtime " + runtimeId);
                    sourceMap[key] = ds;
                    sourceSourceRuntime[key] = runtimeId;
                }
            }
        }
    }

    // Convert map to array and attach runtime info
    types:DataSource[] sourceList = [];
    foreach [string, types:DataSource] [key, ds] in sourceMap.entries() {
        string[] rids = sourceRuntimeMap[key] ?: [];
        ds.runtimeIds = rids;
        types:ArtifactRuntimeInfo[] infos = resolveRuntimeInfos(rids, statusMap);
        ds.runtimes = infos;
        sourceList.push(ds);
    }

    return sourceList;
}

// Get Registry Resources for a specific environment and component
public isolated function getRegistryResourcesByEnvironmentAndComponent(string environmentId, string componentId) returns types:RegistryResource[]|error {
    map<types:RegistryResource> resourceMap = {};
    map<string[]> resourceRuntimeMap = {};
    map<string> resourceSourceRuntime = {}; // Tracks which runtime provided the artifact

    // Get all runtime IDs for this environment and component
    string[] runtimeIds = check getRuntimeIdsByEnvironmentAndComponent(environmentId, componentId);

    // If no runtimes found, return empty array
    if runtimeIds.length() == 0 {
        return [];
    }

    map<types:RuntimeInfo> statusMap = check getRuntimeStatusMap(runtimeIds);

    // Get all Registry Resources for these runtimes, ensuring uniqueness and prioritizing RUNNING runtimes
    foreach string runtimeId in runtimeIds {
        types:RegistryResource[] runtimeResources = check getRegistryResourcesForRuntime(runtimeId);
        foreach types:RegistryResource res in runtimeResources {
            string key = res.name;
            if !resourceRuntimeMap.hasKey(key) {
                // First time seeing this artifact
                resourceMap[key] = res;
                resourceRuntimeMap[key] = [runtimeId];
                resourceSourceRuntime[key] = runtimeId;
            } else {
                // Duplicate artifact - add runtime ID to list
                string[] existing = <string[]>resourceRuntimeMap[key];
                existing.push(runtimeId);
                resourceRuntimeMap[key] = existing;

                // Replace artifact instance if new runtime is RUNNING and existing source is not
                string sourceRuntimeId = resourceSourceRuntime[key] ?: "";
                if shouldReplaceArtifact(runtimeId, sourceRuntimeId, statusMap) {
                    log:printInfo("Replacing registry resource artifact from runtime " + sourceRuntimeId + " with runtime " + runtimeId);
                    resourceMap[key] = res;
                    resourceSourceRuntime[key] = runtimeId;
                }
            }
        }
    }
    // Convert map to array and attach runtime info
    types:RegistryResource[] resourceList = [];
    foreach [string, types:RegistryResource] [key, res] in resourceMap.entries() {
        string[] rids = resourceRuntimeMap[key] ?: [];
        res.runtimeIds = rids;
        types:ArtifactRuntimeInfo[] infos = resolveRuntimeInfos(rids, statusMap);
        res.runtimes = infos;
        resourceList.push(res);
    }

    return resourceList;
}

// Get Connectors for a specific environment and component
public isolated function getConnectorsByEnvironmentAndComponent(string environmentId, string componentId) returns types:Connector[]|error {
    map<types:Connector> connectorMap = {};
    map<string[]> connectorRuntimeMap = {};
    map<string> connectorSourceRuntime = {}; // Tracks which runtime provided the artifact

    // Get all runtime IDs for this environment and component
    string[] runtimeIds = check getRuntimeIdsByEnvironmentAndComponent(environmentId, componentId);

    // If no runtimes found, return empty array
    if runtimeIds.length() == 0 {
        return [];
    }

    map<types:RuntimeInfo> statusMap = check getRuntimeStatusMap(runtimeIds);

    // Get all Connectors for these runtimes, ensuring uniqueness and prioritizing RUNNING runtimes
    foreach string runtimeId in runtimeIds {
        types:Connector[] runtimeConnectors = check getConnectorsForRuntime(runtimeId);
        foreach types:Connector conn in runtimeConnectors {
            // Use name + package + version as uniqueness key across runtimes
            string key = string `${conn.name}|${conn.'package}|${conn.version ?: ""}`;
            if !connectorRuntimeMap.hasKey(key) {
                // First time seeing this artifact
                connectorMap[key] = conn;
                connectorRuntimeMap[key] = [runtimeId];
                connectorSourceRuntime[key] = runtimeId;
            } else {
                // Duplicate artifact - add runtime ID to list
                string[] existing = <string[]>connectorRuntimeMap[key];
                existing.push(runtimeId);
                connectorRuntimeMap[key] = existing;

                // Replace artifact instance if new runtime is RUNNING and existing source is not
                string sourceRuntimeId = connectorSourceRuntime[key] ?: "";
                if shouldReplaceArtifact(runtimeId, sourceRuntimeId, statusMap) {
                    log:printInfo("Replacing connector artifact from runtime " + sourceRuntimeId + " with runtime " + runtimeId);
                    connectorMap[key] = conn;
                    connectorSourceRuntime[key] = runtimeId;
                }
            }
        }
    }

    // Convert map to array and attach runtime info
    types:Connector[] connectorList = [];
    foreach [string, types:Connector] [key, conn] in connectorMap.entries() {
        string[] rids = connectorRuntimeMap[key] ?: [];
        conn.runtimeIds = rids;
        types:ArtifactRuntimeInfo[] infos = resolveRuntimeInfos(rids, statusMap);
        conn.runtimes = infos;
        connectorList.push(conn);
    }

    return connectorList;
}

// Get loggers for a specific environment and component, grouped by component name
public isolated function getLoggersByEnvironmentAndComponent(string environmentId, string componentId) returns types:LoggerGroup[]|error {
    // Get all runtime IDs for this environment and component
    string[] runtimeIds = check getRuntimeIdsByEnvironmentAndComponent(environmentId, componentId);

    // If no runtimes found, return empty array
    if runtimeIds.length() == 0 {
        return [];
    }

    map<record {map<int> levelCounts; string[] runtimeIds;}> loggerGroupMap = {};

    foreach string runtimeId in runtimeIds {
        types:RuntimeLogLevelRecord[] logLevels = check getLogLevelsForRuntime(runtimeId);
        foreach types:RuntimeLogLevelRecord logLevel in logLevels {
            if loggerGroupMap.hasKey(logLevel.componentName) {
                record {map<int> levelCounts; string[] runtimeIds;} entry = <record {map<int> levelCounts; string[] runtimeIds;}>loggerGroupMap[logLevel.componentName];
                entry.runtimeIds.push(runtimeId);
                entry.levelCounts[logLevel.logLevel] = (entry.levelCounts[logLevel.logLevel] ?: 0) + 1;
            } else {
                map<int> counts = {};
                counts[logLevel.logLevel] = 1;
                loggerGroupMap[logLevel.componentName] = {levelCounts: counts, runtimeIds: [runtimeId]};
            }
        }
    }

    types:LoggerGroup[] loggerGroups = [];
    foreach [string, record {map<int> levelCounts; string[] runtimeIds;}] [componentName, entry] in loggerGroupMap.entries() {
        // Pick the most common level; tie-break alphabetically
        string chosenLevel = "";
        int maxCount = 0;
        foreach [string, int] [level, cnt] in entry.levelCounts.entries() {
            if cnt > maxCount || (cnt == maxCount && (chosenLevel == "" || level < chosenLevel)) {
                chosenLevel = level;
                maxCount = cnt;
            }
        }
        types:LoggerGroup group = {
            loggerName: componentName,
            componentName: componentName,
            logLevel: <types:LogLevel>chosenLevel,
            logLevelInSync: entry.levelCounts.length() == 1,
            runtimeIds: entry.runtimeIds
        };
        loggerGroups.push(group);
    }

    return loggerGroups;
}
