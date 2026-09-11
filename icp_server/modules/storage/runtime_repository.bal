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

import ballerina/lang.value as value;
import ballerina/log;
import ballerina/sql;
import ballerina/time;

// Get filtered runtimes based on criteria
public isolated function getRuntimes(string? status, string? runtimeType, string? environmentId, string? projectId, string? componentId) returns types:Runtime[]|error {
    types:Runtime[] runtimeList = [];
    sql:ParameterizedQuery whereClause = ` WHERE 1=1 `;
    sql:ParameterizedQuery whereConditions = ` `;
    if status is string {
        whereConditions = sql:queryConcat(whereConditions, ` AND status = ${status} `);
    }
    if runtimeType is string {
        whereConditions = sql:queryConcat(whereConditions, ` AND runtime_type = ${runtimeType} `);
    }
    if environmentId is string {
        whereConditions = sql:queryConcat(whereConditions, ` AND environment_id = ${environmentId} `);
    }
    if projectId is string {
        whereConditions = sql:queryConcat(whereConditions, ` AND project_id = ${projectId} `);
    }
    if componentId is string {
        whereConditions = sql:queryConcat(whereConditions, ` AND component_id = ${componentId} `);
    }
    sql:ParameterizedQuery selectClause = ` SELECT runtime_id, name, runtime_type, status, environment_id, project_id, component_id, version, 
                 runtime_hostname, runtime_port,
                 platform_name, platform_version, platform_home, os_name, os_version, 
                 carbon_home, java_vendor, java_version, total_memory, free_memory, max_memory, used_memory, os_arch, server_name,
                 registration_time, last_heartbeat FROM runtimes `;
    sql:ParameterizedQuery orderByClause = ` ORDER BY registration_time DESC `;
    sql:ParameterizedQuery query = sql:queryConcat(selectClause, whereClause, whereConditions, orderByClause);
    stream<types:RuntimeDBRecord, sql:Error?> runtimeStream = dbClient->query(query);
    types:RuntimeDBRecord[] records = check from types:RuntimeDBRecord r in runtimeStream
        select r;
    log:printDebug(string `getRuntimes: collected ${records.length()} records, mapping`);
    foreach types:RuntimeDBRecord rec in records {
        runtimeList.push(check mapToRuntime(rec));
    }
    return runtimeList;
}

public isolated function getRuntimesByIntegrationIds(
        string[] integrationIds,
        string? status = (),
        string? runtimeType = (),
        string? environmentId = (),
        string? projectId = ()
) returns types:Runtime[]|error {
    // Return empty array if no integration IDs provided
    if integrationIds.length() == 0 {
        return [];
    }

    types:Runtime[] runtimeList = [];

    // Build WHERE clause with IN condition for component_id
    sql:ParameterizedQuery whereClause = ` WHERE 1=1 `;
    sql:ParameterizedQuery whereConditions = ` `;

    // Add component_id IN clause
    sql:ParameterizedQuery inClause = ` AND component_id IN (`;
    foreach int i in 0 ..< integrationIds.length() {
        if i > 0 {
            inClause = sql:queryConcat(inClause, `, `);
        }
        inClause = sql:queryConcat(inClause, `${integrationIds[i]}`);
    }
    inClause = sql:queryConcat(inClause, `) `);
    whereConditions = sql:queryConcat(whereConditions, inClause);

    // Add optional filters
    if status is string {
        whereConditions = sql:queryConcat(whereConditions, ` AND status = ${status} `);
    }
    if runtimeType is string {
        whereConditions = sql:queryConcat(whereConditions, ` AND runtime_type = ${runtimeType} `);
    }
    if environmentId is string {
        whereConditions = sql:queryConcat(whereConditions, ` AND environment_id = ${environmentId} `);
    }
    if projectId is string {
        whereConditions = sql:queryConcat(whereConditions, ` AND project_id = ${projectId} `);
    }

    sql:ParameterizedQuery selectClause = ` SELECT runtime_id, name, runtime_type, status, environment_id, project_id, component_id, version, 
                 runtime_hostname, runtime_port,
                 platform_name, platform_version, platform_home, os_name, os_version, 
                 carbon_home, java_vendor, java_version, total_memory, free_memory, max_memory, used_memory, os_arch, server_name,
                 registration_time, last_heartbeat FROM runtimes `;
    sql:ParameterizedQuery orderByClause = ` ORDER BY registration_time DESC `;
    sql:ParameterizedQuery query = sql:queryConcat(selectClause, whereClause, whereConditions, orderByClause);

    stream<types:RuntimeDBRecord, sql:Error?> runtimeStream = dbClient->query(query);
    types:RuntimeDBRecord[] records = check from types:RuntimeDBRecord r in runtimeStream
        select r;
    log:printDebug(string `getRuntimesByIntegrationIds: collected ${records.length()} records, mapping`);
    foreach types:RuntimeDBRecord rec in records {
        runtimeList.push(check mapToRuntime(rec));
    }
    return runtimeList;
}

// Get a specific runtime by ID
public isolated function getRuntimeById(string runtimeId) returns types:Runtime?|error {
    stream<types:RuntimeDBRecord, sql:Error?> runtimeStream = dbClient->query(`
        SELECT runtime_id, name, runtime_type, status, environment_id, project_id, component_id, version,
               runtime_hostname, runtime_port,
               platform_name, platform_version, platform_home, os_name, os_version, 
               carbon_home, java_vendor, java_version, total_memory, free_memory, max_memory, used_memory, os_arch, server_name,
               registration_time, last_heartbeat 
        FROM runtimes 
        WHERE runtime_id = ${runtimeId}
    `);

    types:RuntimeDBRecord[] runtimeRecords = check from types:RuntimeDBRecord runtimeRecord in runtimeStream
        select runtimeRecord;

    if runtimeRecords.length() == 0 {
        return;
    }

    return check mapToRuntime(runtimeRecords[0]);
}

// Get the type of a runtime by ID
public isolated function getRuntimeTypeById(string runtimeId) returns types:RuntimeTypeRecord?|error {
    log:printDebug("Fetching runtime type for runtime ID: " + runtimeId);
    stream<types:RuntimeTypeRecord, sql:Error?> runtimeTypeStream = dbClient->query(`
        SELECT runtime_id, runtime_type, environment_id, component_id 
        FROM runtimes
        WHERE runtime_id = ${runtimeId}
    `);

    types:RuntimeTypeRecord[] runtimeTypeRecords = check from types:RuntimeTypeRecord runtimeTypeRecord in runtimeTypeStream
        select runtimeTypeRecord;

    if runtimeTypeRecords.length() == 0 {
        log:printDebug("No runtime type found for runtime ID: " + runtimeId);
        return;
    }

    return runtimeTypeRecords[0];
}

// Delete a runtime by ID
public isolated function updateRuntimeStatus(string runtimeId, string status) returns error? {
    sql:ExecutionResult|sql:Error result = dbClient->execute(
        `UPDATE runtimes SET status = ${status} WHERE runtime_id = ${runtimeId}`
    );
    if result is sql:Error {
        return error(string `Failed to update status for runtime ${runtimeId}`, result);
    }
}

public isolated function deleteRuntime(string runtimeId) returns error? {
    sql:ParameterizedQuery deleteQuery = `DELETE FROM runtimes WHERE runtime_id = ${runtimeId}`;
    var result = dbClient->execute(deleteQuery);
    if result is sql:Error {
        log:printError(string `Failed to delete runtime ${runtimeId}`, 'error = result);
        match classifySqlError(result) {
            FOREIGN_KEY_VIOLATION => {
                return error("Cannot delete runtime because it has dependent resources", result);
            }
            _ => {
                return error("An unexpected error occurred. Please contact your administrator.", result);
            }
        }
    }
    log:printInfo(string `Successfully deleted runtime ${runtimeId}`);
}

type StaleRuntimeRow record {|string runtime_id; string environment_id; string environment_name;|};

// Mark runtimes as offline if they haven't sent heartbeat within timeout
// For K8S deployments, delete OFFLINE runtimes instead of marking them
// Runs a claiming UPDATE/DELETE that ends with `RETURNING runtime_id` and collects the
// claimed ids. The statement runs through `query` because `execute` cannot read RETURNING
// rows; a failed consumption closes the stream so no pooled connection is abandoned.
isolated function claimReturningIds(sql:ParameterizedQuery claimQuery) returns string[]|error {
    stream<record {|string runtime_id;|}, sql:Error?> claimed = dbClient->query(claimQuery);
    record {|string runtime_id;|}[]|error rows = from record {|string runtime_id;|} r in claimed
        select r;
    if rows is error {
        error? closeResult = claimed.close();
        if closeResult is error {
            log:printDebug("Closing the claim stream also failed", closeResult);
        }
        return rows;
    }
    return from record {|string runtime_id;|} r in rows
        select r.runtime_id;
}

public isolated function markOfflineRuntimes() returns error? {

    // Compare against an explicit UTC value, not CURRENT_TIMESTAMP: last_heartbeat holds
    // UTC wall-clock, while the database server would evaluate CURRENT_TIMESTAMP in its own
    // timezone, inflating or deflating the age by that offset.
    string nowUtc = check utcNowSqlLiteral();

    // Pre-query stale runtimes before the DELETE/UPDATE so we can publish OFFLINE
    // events after the operation (for K8S the rows are deleted so we must read first).
    sql:ParameterizedQuery staleSelectQuery = sql:queryConcat(
            `SELECT r.runtime_id, r.environment_id, e.name AS environment_name
        FROM runtimes r
        JOIN environments e ON r.environment_id = e.environment_id
        WHERE r.status != 'OFFLINE'
        AND r.last_heartbeat IS NOT NULL
        AND `,
            sqlQueryFromString(getTimestampDiffSeconds("r.last_heartbeat", nowUtc)),
            ` > ${heartbeatTimeoutSeconds}`
    );

    stream<StaleRuntimeRow, sql:Error?> staleStream = dbClient->query(staleSelectQuery);
    StaleRuntimeRow[]|error collected = from StaleRuntimeRow r in staleStream
        select r;
    StaleRuntimeRow[] staleRows;
    if collected is error {
        // Close the stream the failed consumption abandoned, or its pooled connection
        // stays leased — the leak that turns one bad tick into a dead pool.
        log:printWarn("Failed to query stale runtimes for event notifications", collected);
        error? closeResult = staleStream.close();
        if closeResult is error {
            log:printDebug("Closing the stale-runtimes stream also failed", closeResult);
        }
        staleRows = [];
    } else {
        staleRows = collected;
    }

    // On PostgreSQL the sweep claims its rows with SKIP LOCKED: the table-wide
    // UPDATE/DELETE otherwise queues behind any row lock a stalled heartbeat
    // transaction still holds — and once the sweep is queued, every other runtime's
    // heartbeat queues behind the sweep. A locked row belongs to a live transaction,
    // which means that runtime just heartbeat anyway; skipping it is correct, and the
    // next tick picks up anything that still qualifies.
    // On PostgreSQL the claiming statement also says WHAT it claimed (RETURNING):
    // SKIP LOCKED can leave a selected row alone — a row whose heartbeat transaction
    // holds the lock stays RUNNING — and publishing OFFLINE for an unclaimed row would
    // announce a lie. `()` means "everything the pre-select saw was claimed", which is
    // what the blocking non-postgres statements guarantee.
    string[]? claimedIds = ();
    if deploymentType == "K8S" {
        // For K8S deployments, delete runtimes that should be marked offline
        if dbType == POSTGRESQL {
            sql:ParameterizedQuery deleteQuery = sql:queryConcat(
                    `DELETE FROM runtimes
                WHERE runtime_id IN (
                    SELECT runtime_id FROM runtimes
                    WHERE status != 'OFFLINE'
                    AND last_heartbeat IS NOT NULL
                    AND `,
                    sqlQueryFromString(getTimestampDiffSeconds("last_heartbeat", nowUtc)),
                    ` > ${heartbeatTimeoutSeconds}
                    FOR UPDATE SKIP LOCKED)
                RETURNING runtime_id`
            );
            string[] claimed = check claimReturningIds(deleteQuery);
            claimedIds = claimed;
            if claimed.length() > 0 {
                log:printInfo(string `Successfully deleted ${claimed.length()} offline runtime(s) in K8S deployment`);
            }
        } else {
            sql:ParameterizedQuery deleteQuery = sql:queryConcat(
                    `DELETE FROM runtimes
                WHERE status != 'OFFLINE'
                AND last_heartbeat IS NOT NULL
                AND `,
                    sqlQueryFromString(getTimestampDiffSeconds("last_heartbeat", nowUtc)),
                    ` > ${heartbeatTimeoutSeconds}`
            );
            sql:ExecutionResult result = check dbClient->execute(deleteQuery);
            int? affectedCount = result.affectedRowCount;
            if affectedCount is int && affectedCount > 0 {
                log:printInfo(string `Successfully deleted ${affectedCount} offline runtime(s) in K8S deployment`);
            }
        }
    } else {
        // For VM deployments, mark runtimes as offline
        if dbType == POSTGRESQL {
            sql:ParameterizedQuery updateQuery = sql:queryConcat(
                    `UPDATE runtimes
                SET status = 'OFFLINE'
                WHERE runtime_id IN (
                    SELECT runtime_id FROM runtimes
                    WHERE status != 'OFFLINE'
                    AND last_heartbeat IS NOT NULL
                    AND `,
                    sqlQueryFromString(getTimestampDiffSeconds("last_heartbeat", nowUtc)),
                    ` > ${heartbeatTimeoutSeconds}
                    FOR UPDATE SKIP LOCKED)
                RETURNING runtime_id`
            );
            string[] claimed = check claimReturningIds(updateQuery);
            claimedIds = claimed;
            if claimed.length() > 0 {
                log:printInfo(string `Successfully marked ${claimed.length()} runtime(s) as OFFLINE`);
            }
        } else {
            sql:ParameterizedQuery updateQuery = sql:queryConcat(
                    `UPDATE runtimes
                SET status = 'OFFLINE'
                WHERE status != 'OFFLINE'
                AND last_heartbeat IS NOT NULL
                AND `,
                    sqlQueryFromString(getTimestampDiffSeconds("last_heartbeat", nowUtc)),
                    ` > ${heartbeatTimeoutSeconds}`
            );
            sql:ExecutionResult result = check dbClient->execute(updateQuery);
            int? affectedCount = result.affectedRowCount;
            if affectedCount is int && affectedCount > 0 {
                log:printInfo(string `Successfully marked ${affectedCount} runtime(s) as OFFLINE`);
            }
        }
    }

    // Notify WebSocket subscribers for each runtime that ACTUALLY went offline: on
    // PostgreSQL that is the claimed set, which can be smaller than the pre-select saw.
    foreach StaleRuntimeRow r in staleRows {
        if claimedIds is string[] && claimedIds.indexOf(r.runtime_id) is () {
            continue;
        }
        runtimeBroadcaster.publish(r.environment_id, r.environment_name, r.runtime_id, "OFFLINE");
    }
}

public isolated function getServicesForRuntime(string runtimeId) returns types:Service[]|error {
    stream<types:ServiceRecordInDB, sql:Error?> serviceStream = dbClient->query(`
        SELECT service_name, service_package, base_path, state
        FROM bi_service_artifacts
        WHERE runtime_id = ${runtimeId}
    `);
    types:ServiceRecordInDB[] records = check from types:ServiceRecordInDB r in serviceStream
        select r;
    log:printDebug(string `getServicesForRuntime(${runtimeId}): collected ${records.length()} records, mapping`);
    types:Service[] serviceList = [];
    foreach types:ServiceRecordInDB rec in records {
        serviceList.push(check mapToService(rec, runtimeId));
    }
    return serviceList;
}

// Get listeners for a specific runtime
public isolated function getListenersForRuntime(string runtimeId) returns types:Listener[]|error {
    types:Listener[] listenerList = [];
    stream<types:Listener, sql:Error?> listenerStream = dbClient->query(`
        SELECT listener_name, listener_package, protocol, state, listener_host, listener_port 
        FROM bi_runtime_listener_artifacts 
        WHERE runtime_id = ${runtimeId}
    `);

    check from types:Listener listenerRecord in listenerStream
        do {
            listenerList.push(listenerRecord);
        };

    return listenerList;
}

// Predicate matching a usable (non-null, non-empty) try_it_host. Oracle stores empty
// strings as NULL and any comparison with '' is never true there, so `try_it_host <> ''`
// would exclude every row on Oracle; IS NOT NULL alone is the correct Oracle form.
isolated function usableTryItHostPredicate() returns sql:ParameterizedQuery =>
    isOracle() ? ` AND r.try_it_host IS NOT NULL` : ` AND r.try_it_host IS NOT NULL AND r.try_it_host <> ''`;

// A wrapper listener's own protocol column can be its package name (e.g. "graphql" for
// graphql:Listener, which composes an http:Listener privately) rather than "HTTP"/"HTTPS" — only
// ever treat it as https when it case-insensitively says so; everything else is plain http.
public isolated function tryitScheme(string protocol) returns string =>
    protocol.toLowerAscii() == "https" ? "https" : "http";

// Resolves the Try-It proxy target for one explicit runtime+port: the runtime's self-reported
// reachable host and the requested listener's protocol. This single query does double duty as
// both the runtime-ownership check (the row only exists if runtimeId truly belongs to
// componentId+environmentId) and the port-ownership check (the row only exists if `port`
// matches a real registered listener_port for that runtime) — a forged runtimeId or an
// unregistered port both collapse to the same `()` result, which the proxy surfaces as 404.
public isolated function getTryItTarget(string componentId, string environmentId, string runtimeId, int port)
        returns types:TryItTarget?|error {
    sql:ParameterizedQuery query = sql:queryConcat(`
        SELECT r.try_it_host AS host, l.protocol AS protocol
        FROM runtimes r
        JOIN bi_runtime_listener_artifacts l ON l.runtime_id = r.runtime_id
        WHERE r.runtime_id = ${runtimeId} AND r.component_id = ${componentId}
            AND r.environment_id = ${environmentId} AND r.status = 'RUNNING'
            AND l.listener_port = ${port}`, usableTryItHostPredicate());
    stream<record {|string host; string protocol;|}, sql:Error?> rs = dbClient->query(query);
    record {|string host; string protocol;|}[] rows = check from var r in rs
        limit 1
        select r;
    if rows.length() == 0 {
        return ();
    }
    return {host: rows[0].host, protocol: rows[0].protocol};
}

// Base URLs (scheme://host:port) of RUNNING runtimes' registered listeners with a usable
// try_it_host — used by the offline-runtime scheduler to prune the Try-It proxy's http:Client
// cache, mirroring getRunningWorkflowCallbackUrls. Built in Ballerina rather than SQL since
// string concatenation syntax differs across engines (||/CONCAT/+).
public isolated function getLiveTryItBaseUrls() returns string[]|error {
    sql:ParameterizedQuery query = sql:queryConcat(`
        SELECT DISTINCT r.try_it_host AS host, l.listener_port AS port, l.protocol AS protocol
        FROM runtimes r
        JOIN bi_runtime_listener_artifacts l ON l.runtime_id = r.runtime_id
        WHERE r.status = 'RUNNING' AND l.listener_port IS NOT NULL`, usableTryItHostPredicate());
    stream<record {|string host; int port; string protocol;|}, sql:Error?> rs = dbClient->query(query);
    record {|string host; int port; string protocol;|}[] rows = check from var r in rs
        select r;
    return rows.map(r => tryitScheme(r.protocol) + "://" + r.host + ":" + r.port.toString());
}

type ApiRecordInDB record {|
    string api_name;
    string url;
    string? urls;
    string context;
    string? version;
    string state;
    string tracing;
    string statistics;
    string? composite_app;
|};

public isolated function getApisForRuntime(string runtimeId) returns types:RestApi[]|error {
    sql:ParameterizedQuery apiQuery;
    if isMSSQL() {
        apiQuery = `
            SELECT api_name, url, urls, context, version, state, tracing, [statistics], composite_app
            FROM mi_api_artifacts
            WHERE runtime_id = ${runtimeId}
        `;
    } else {
        apiQuery = `
            SELECT api_name, url, urls, context, version, state, tracing, statistics, composite_app
            FROM mi_api_artifacts
            WHERE runtime_id = ${runtimeId}
        `;
    }
    stream<ApiRecordInDB, sql:Error?> apiStream = dbClient->query(apiQuery);
    ApiRecordInDB[] records = check from ApiRecordInDB r in apiStream
        select r;
    log:printDebug(string `getApisForRuntime(${runtimeId}): collected ${records.length()} records, mapping`);

    types:RestApi[] apiList = [];
    foreach ApiRecordInDB rec in records {
        types:ApiResource[] resources = check getApiResourcesForRuntime(runtimeId, rec.api_name);
        string[] urlsArray = [];
        if rec.urls is string {
            json urlsJson = check (<string>rec.urls).fromJsonString();
            urlsArray = check urlsJson.cloneWithType();
        }
        apiList.push({
            name: rec.api_name,
            url: rec.url,
            urls: urlsArray,
            context: rec.context,
            version: rec.version,
            state: <types:ArtifactState>rec.state,
            tracing: rec.tracing,
            statistics: rec.statistics,
            compositeApp: rec.composite_app,
            resources: resources
        });
    }
    return apiList;
}

// Get API resources for a specific runtime and API
isolated function getApiResourcesForRuntime(string runtimeId, string apiName) returns types:ApiResource[]|error {
    types:ApiResource[] resourceList = [];

    stream<record {|string resource_path; string methods;|}, sql:Error?> resourceStream = dbClient->query(`
        SELECT resource_path, methods
        FROM mi_api_resource_artifacts
        WHERE runtime_id = ${runtimeId} AND api_name = ${apiName}
    `);

    check from record {|string resource_path; string methods;|} resourceRecord in resourceStream
        do {
            types:ApiResource apiResource = {
                path: resourceRecord.resource_path,
                methods: resourceRecord.methods
            };
            resourceList.push(apiResource);
        };

    return resourceList;
}

// Get proxy services for a specific runtime
public isolated function getProxyServicesForRuntime(string runtimeId) returns types:ProxyService[]|error {
    types:ProxyService[] proxyList = [];
    // Load endpoints for all proxies in this runtime
    map<string[]> endpointMap = {};
    stream<record {|string proxy_name; string endpoint_url;|}, sql:Error?> epStream = dbClient->query(`
        SELECT proxy_name, endpoint_url
        FROM mi_proxy_service_endpoint_artifacts
        WHERE runtime_id = ${runtimeId}
    `);
    check from record {|string proxy_name; string endpoint_url;|} ep in epStream
        do {
            string[] existing = endpointMap[ep.proxy_name] ?: [];
            existing.push(ep.endpoint_url);
            endpointMap[ep.proxy_name] = existing;
        };

    sql:ParameterizedQuery proxyQuery;
    if isMSSQL() {
        proxyQuery = `
            SELECT proxy_name, state, tracing, [statistics], composite_app
            FROM mi_proxy_service_artifacts
            WHERE runtime_id = ${runtimeId}
        `;
    } else {
        proxyQuery = `
            SELECT proxy_name, state, tracing, statistics, composite_app
            FROM mi_proxy_service_artifacts
            WHERE runtime_id = ${runtimeId}
        `;
    }
    stream<types:ProxyServiceRecordInDB, sql:Error?> proxyStream = dbClient->query(proxyQuery);

    check from types:ProxyServiceRecordInDB proxyRecord in proxyStream
        do {
            types:ProxyService proxy = {
                name: proxyRecord.proxy_name,
                state: proxyRecord.state,
                tracing: proxyRecord.tracing,
                statistics: proxyRecord.statistics,
                compositeApp: proxyRecord.composite_app
            };
            string[] eps = endpointMap[proxyRecord.proxy_name] ?: [];
            proxy.endpoints = eps;
            proxyList.push(proxy);
        };

    return proxyList;
}

type EndpointAttrRecordInDB record {|
    string endpoint_name;
    string attribute_name;
    // Nullable: the column allows NULL, and Oracle additionally stores
    // empty-string attribute values as NULL.
    string? attribute_value;
|};

public isolated function getEndpointsForRuntime(string runtimeId) returns types:Endpoint[]|error {
    sql:ParameterizedQuery endpointQuery;
    if isMSSQL() {
        endpointQuery = `
            SELECT endpoint_name, endpoint_type, state, tracing, [statistics], composite_app
            FROM mi_endpoint_artifacts
            WHERE runtime_id = ${runtimeId}
        `;
    } else {
        endpointQuery = `
            SELECT endpoint_name, endpoint_type, state, tracing, statistics, composite_app
            FROM mi_endpoint_artifacts
            WHERE runtime_id = ${runtimeId}
        `;
    }
    stream<types:EndpointRecordInDB, sql:Error?> endpointStream = dbClient->query(endpointQuery);
    types:EndpointRecordInDB[] records = check from types:EndpointRecordInDB r in endpointStream
        select r;

    // Batch-load all attributes for this runtime
    stream<EndpointAttrRecordInDB, sql:Error?> attrStream = dbClient->query(`
        SELECT endpoint_name, attribute_name, attribute_value
        FROM mi_endpoint_attribute_artifacts
        WHERE runtime_id = ${runtimeId}
    `);
    EndpointAttrRecordInDB[] attrRecords = check from EndpointAttrRecordInDB a in attrStream
        select a;
    map<types:EndpointAttribute[]> attrMap = {};
    foreach EndpointAttrRecordInDB a in attrRecords {
        types:EndpointAttribute[] existing = attrMap[a.endpoint_name] ?: [];
        existing.push({name: a.attribute_name, value: a.attribute_value ?: ""});
        attrMap[a.endpoint_name] = existing;
    }
    log:printDebug(string `getEndpointsForRuntime(${runtimeId}): ${records.length()} endpoints, ${attrRecords.length()} attributes`);

    types:Endpoint[] endpointList = [];
    foreach types:EndpointRecordInDB rec in records {
        types:Endpoint endpoint = {
            name: rec.endpoint_name,
            'type: rec.endpoint_type,
            state: rec.state,
            tracing: rec.tracing,
            statistics: rec.statistics,
            compositeApp: rec.composite_app
        };
        types:EndpointAttribute[]? attrs = attrMap[rec.endpoint_name];
        if attrs is types:EndpointAttribute[] && attrs.length() > 0 {
            endpoint.attributes = attrs;
        }
        endpointList.push(endpoint);
    }
    return endpointList;
}

// Get inbound endpoints for a specific runtime
public isolated function getInboundEndpointsForRuntime(string runtimeId) returns types:InboundEndpoint[]|error {
    types:InboundEndpoint[] inboundList = [];
    sql:ParameterizedQuery query;
    if isMSSQL() {
        query = `
            SELECT inbound_name, protocol, sequence, state, [statistics], on_error, tracing, composite_app
            FROM mi_inbound_endpoint_artifacts 
            WHERE runtime_id = ${runtimeId}
        `;
    } else {
        query = `
            SELECT inbound_name, protocol, sequence, state, statistics, on_error, tracing, composite_app
            FROM mi_inbound_endpoint_artifacts 
            WHERE runtime_id = ${runtimeId}
        `;
    }
    stream<types:InboundEndpoint, sql:Error?> inboundStream = dbClient->query(query);

    check from types:InboundEndpoint inboundRecord in inboundStream
        do {
            inboundList.push(inboundRecord);
        };

    return inboundList;
}

// Get sequences for a specific runtime
public isolated function getSequencesForRuntime(string runtimeId) returns types:Sequence[]|error {
    types:Sequence[] sequenceList = [];
    sql:ParameterizedQuery sequenceQuery;
    if isMSSQL() {
        sequenceQuery = `
            SELECT sequence_name, sequence_type, container, state, tracing, [statistics], composite_app
            FROM mi_sequence_artifacts
            WHERE runtime_id = ${runtimeId}
        `;
    } else {
        sequenceQuery = `
            SELECT sequence_name, sequence_type, container, state, tracing, statistics, composite_app
            FROM mi_sequence_artifacts
            WHERE runtime_id = ${runtimeId}
        `;
    }
    stream<types:SequenceRecordInDB, sql:Error?> sequenceStream = dbClient->query(sequenceQuery);

    check from types:SequenceRecordInDB sequenceRecord in sequenceStream
        do {
            types:Sequence sequence = {
                name: sequenceRecord.sequence_name,
                'type: sequenceRecord.sequence_type,
                container: sequenceRecord.container,
                state: sequenceRecord.state,
                tracing: sequenceRecord.tracing,
                statistics: sequenceRecord.statistics,
                compositeApp: sequenceRecord.composite_app
            };
            sequenceList.push(sequence);
        };

    return sequenceList;
}

// Get tasks for a specific runtime
public isolated function getTasksForRuntime(string runtimeId) returns types:Task[]|error {
    types:Task[] taskList = [];
    stream<types:TaskRecordInDB, sql:Error?> taskStream = dbClient->query(`
        SELECT task_name, task_class, task_group, state, composite_app
        FROM mi_task_artifacts 
        WHERE runtime_id = ${runtimeId}
    `);

    check from types:TaskRecordInDB taskRecord in taskStream
        do {
            types:Task task = {
                name: taskRecord.task_name,
                'class: taskRecord.task_class,
                group: taskRecord.task_group,
                state: taskRecord.state,
                compositeApp: taskRecord.composite_app
            };
            taskList.push(task);
        };

    return taskList;
}

// Get templates for a specific runtime
public isolated function getTemplatesForRuntime(string runtimeId) returns types:Template[]|error {
    types:Template[] templateList = [];
    sql:ParameterizedQuery templateQuery;
    if isMSSQL() {
        templateQuery = `
            SELECT template_name, template_type, tracing, [statistics], composite_app
            FROM mi_template_artifacts
            WHERE runtime_id = ${runtimeId}
        `;
    } else {
        templateQuery = `
            SELECT template_name, template_type, tracing, statistics, composite_app
            FROM mi_template_artifacts
            WHERE runtime_id = ${runtimeId}
        `;
    }
    stream<types:Template, sql:Error?> templateStream = dbClient->query(templateQuery);

    check from types:Template templateRecord in templateStream
        do {
            // state is no longer persisted; default value in type will be used
            templateList.push(templateRecord);
        };

    return templateList;
}

// Get message stores for a specific runtime
public isolated function getMessageStoresForRuntime(string runtimeId) returns types:MessageStore[]|error {
    types:MessageStore[] storeList = [];
    sql:ParameterizedQuery storeQuery;
    if isOracle() {
        // SIZE is a reserved word in Oracle; the column is created as quoted "SIZE"
        storeQuery = `
            SELECT store_name, store_type, "SIZE" AS "size", composite_app
            FROM mi_message_store_artifacts
            WHERE runtime_id = ${runtimeId}
        `;
    } else {
        storeQuery = `
            SELECT store_name, store_type, size, composite_app
            FROM mi_message_store_artifacts
            WHERE runtime_id = ${runtimeId}
        `;
    }
    stream<types:MessageStoreRecordInDB, sql:Error?> storeStream = dbClient->query(storeQuery);

    check from types:MessageStoreRecordInDB storeRecord in storeStream
        do {
            types:MessageStore store = {
                name: storeRecord.store_name,
                'type: storeRecord.store_type,
                size: storeRecord.size,
                compositeApp: storeRecord.composite_app
            };
            storeList.push(store);
        };

    return storeList;
}

// Get message processors for a specific runtime
public isolated function getMessageProcessorsForRuntime(string runtimeId) returns types:MessageProcessor[]|error {
    types:MessageProcessor[] processorList = [];
    stream<types:MessageProcessorRecordInDB, sql:Error?> processorStream = dbClient->query(`
        SELECT processor_name, processor_type, processor_class, state, composite_app
        FROM mi_message_processor_artifacts 
        WHERE runtime_id = ${runtimeId}
    `);

    check from types:MessageProcessorRecordInDB processorRecord in processorStream
        do {
            types:MessageProcessor processor = {
                name: processorRecord.processor_name,
                'type: processorRecord.processor_type,
                'class: processorRecord.processor_class,
                state: processorRecord.state,
                compositeApp: processorRecord.composite_app
            };
            processorList.push(processor);
        };

    return processorList;
}

// Get local entries for a specific runtime
public isolated function getLocalEntriesForRuntime(string runtimeId) returns types:LocalEntry[]|error {
    types:LocalEntry[] entryList = [];
    stream<types:LocalEntryRecordInDB, sql:Error?> entryStream = dbClient->query(`
        SELECT entry_name, entry_type, entry_value, state, composite_app
        FROM mi_local_entry_artifacts 
        WHERE runtime_id = ${runtimeId}
    `);

    check from types:LocalEntryRecordInDB entryRecord in entryStream
        do {
            types:LocalEntry entry = {
                name: entryRecord.entry_name,
                'type: entryRecord.entry_type,
                value: entryRecord.entry_value,
                state: entryRecord.state,
                compositeApp: entryRecord.composite_app
            };
            entryList.push(entry);
        };

    return entryList;
}

// Get data services for a specific runtime
public isolated function getDataServicesForRuntime(string runtimeId) returns types:DataService[]|error {
    types:DataService[] serviceList = [];
    // Bind to an explicit record so the "Faulty" state and error_message (present
    // only when a data service failed to deploy) are read reliably.
    stream<record {string service_name; string? description; string? wsdl; string state; string? composite_app; string? error_message;}, sql:Error?> serviceStream = dbClient->query(`
        SELECT service_name, description, wsdl, state, composite_app, error_message
        FROM mi_data_service_artifacts
        WHERE runtime_id = ${runtimeId}
    `);

    check from record {string service_name; string? description; string? wsdl; string state; string? composite_app; string? error_message;} serviceRecord in serviceStream
        do {
            types:DataService dataService = {
                name: serviceRecord.service_name,
                state: serviceRecord.state
            };
            if serviceRecord.description is string {
                dataService.description = serviceRecord.description;
            }
            if serviceRecord.wsdl is string {
                dataService.wsdl = serviceRecord.wsdl;
            }
            if serviceRecord.composite_app is string {
                dataService.compositeApp = serviceRecord.composite_app;
            }
            if serviceRecord.error_message is string {
                dataService.errorMessage = serviceRecord.error_message;
            }
            serviceList.push(dataService);
        };

    return serviceList;
}

// Get composite apps for a specific runtime
public isolated function getCompositeAppsForRuntime(string runtimeId) returns types:CompositeApp[]|error {
    log:printDebug("Fetching composite apps for runtime: " + runtimeId);
    types:CompositeApp[] appList = [];
    // Include artifacts column (serialized JSON string) if present
    stream<record {string app_name; string? version; types:DeploymentState state; string? error_message?; string artifacts?;}, sql:Error?> appStream = dbClient->query(`
        SELECT app_name, version, state, error_message, artifacts
        FROM mi_composite_app_artifacts
        WHERE runtime_id = ${runtimeId}
    `);

    check from record {string app_name; string? version; types:DeploymentState state; string? error_message?; string artifacts?;} appRecord in appStream
        do {
            types:CompositeApp app = {
                name: appRecord.app_name,
                version: appRecord.version,
                state: appRecord.state,
                errorMessage: appRecord?.error_message
            };
            if appRecord.artifacts is string {
                // Attempt to parse JSON string to CompositeAppArtifact[]
                string versionForLog = appRecord.version ?: "";
                log:printDebug("Parsing artifacts for composite app: " + appRecord.app_name + " version: " + versionForLog);
                string artStr = <string>appRecord.artifacts;
                json|error parsed = value:fromJsonString(artStr);
                if parsed is json {
                    types:CompositeAppArtifact[]|error arts = parseCompositeAppArtifacts(parsed);
                    if arts is types:CompositeAppArtifact[] {
                        app.artifacts = arts;
                    }
                }
            }
            appList.push(app);
        };

    return appList;
}

// Parse a JSON value into CompositeAppArtifact[]; expects an array of objects with name and type
isolated function parseCompositeAppArtifacts(json j) returns types:CompositeAppArtifact[]|error {
    if j is json[] {
        types:CompositeAppArtifact[] result = [];
        foreach json item in j {
            if item is map<json> {
                string? name = <string?>item["name"];
                string? typ = <string?>item["type"];
                if name is string && typ is string {
                    types:CompositeAppArtifact art = {name: name, 'type: typ};
                    result.push(art);
                }
            }
        }
        return result;
    }
    return []; // Non-array or invalid -> empty list
}

// Get data sources for a specific runtime
public isolated function getDataSourcesForRuntime(string runtimeId) returns types:DataSource[]|error {
    types:DataSource[] sourceList = [];
    stream<types:DataSource, sql:Error?> sourceStream = dbClient->query(`
        SELECT datasource_name, datasource_type, driver, url, username, state
        FROM mi_data_source_artifacts 
        WHERE runtime_id = ${runtimeId}
    `);

    check from types:DataSource sourceRecord in sourceStream
        do {
            sourceList.push(sourceRecord);
        };

    return sourceList;
}

// Get connectors for a specific runtime
public isolated function getConnectorsForRuntime(string runtimeId) returns types:Connector[]|error {
    log:printDebug("Fetching connectors for runtime: " + runtimeId);
    types:Connector[] connectorList = [];
    stream<types:Connector, sql:Error?> connectorStream = dbClient->query(`
        SELECT connector_name, package, version, description, state AS connector_state
        FROM mi_connector_artifacts
        WHERE runtime_id = ${runtimeId}
    `);

    check from types:Connector connectorRecord in connectorStream
        do {
            connectorList.push(connectorRecord);
        };
    log:printDebug("Retrieved " + connectorList.length().toString() + " connectors for runtime: " + runtimeId);
    return connectorList;
}

// Get registry resources for a specific runtime
public isolated function getRegistryResourcesForRuntime(string runtimeId) returns types:RegistryResource[]|error {
    log:printDebug("Fetching registry resources for runtime: " + runtimeId);
    types:RegistryResource[] resourceList = [];
    stream<types:RegistryResourceRecordInDB, sql:Error?> resourceStream = dbClient->query(`
        SELECT resource_name, resource_type
        FROM mi_registry_resource_artifacts 
        WHERE runtime_id = ${runtimeId}
    `);

    check from types:RegistryResourceRecordInDB resourceRecord in resourceStream
        do {
            types:RegistryResource registryResource = {
                name: resourceRecord.resource_name,
                'type: resourceRecord.resource_type
            };
            resourceList.push(registryResource);
        };

    return resourceList;
}

// Helper function to map database record to Runtime type
public isolated function mapToRuntime(types:RuntimeDBRecord runtimeRecord) returns types:Runtime|error {
    // Get services for this runtime
    types:Service[] serviceList = check getServicesForRuntime(runtimeRecord.runtime_id);

    // Get listeners for this runtime
    types:Listener[] listenerList = check getListenersForRuntime(runtimeRecord.runtime_id);

    // Initialize all MI artifacts as empty arrays for non-MI runtimes
    types:RestApi[] apiList = [];
    types:ProxyService[] proxyList = [];
    types:Endpoint[] endpointList = [];
    types:InboundEndpoint[] inboundList = [];
    types:Sequence[] sequenceList = [];
    types:Task[] taskList = [];
    types:Template[] templateList = [];
    types:MessageStore[] storeList = [];
    types:MessageProcessor[] processorList = [];
    types:LocalEntry[] entryList = [];
    types:DataService[] dataServiceList = [];
    types:CompositeApp[] appList = [];
    types:DataSource[] sourceList = [];
    types:Connector[] connectorList = [];
    types:RegistryResource[] resourceList = [];

    // Get MI artifacts only for MI runtime types
    if runtimeRecord.runtime_type == types:MI {
        apiList = check getApisForRuntime(runtimeRecord.runtime_id);
        proxyList = check getProxyServicesForRuntime(runtimeRecord.runtime_id);
        endpointList = check getEndpointsForRuntime(runtimeRecord.runtime_id);
        inboundList = check getInboundEndpointsForRuntime(runtimeRecord.runtime_id);
        sequenceList = check getSequencesForRuntime(runtimeRecord.runtime_id);
        taskList = check getTasksForRuntime(runtimeRecord.runtime_id);
        templateList = check getTemplatesForRuntime(runtimeRecord.runtime_id);
        storeList = check getMessageStoresForRuntime(runtimeRecord.runtime_id);
        processorList = check getMessageProcessorsForRuntime(runtimeRecord.runtime_id);
        entryList = check getLocalEntriesForRuntime(runtimeRecord.runtime_id);
        dataServiceList = check getDataServicesForRuntime(runtimeRecord.runtime_id);
        appList = check getCompositeAppsForRuntime(runtimeRecord.runtime_id);
        sourceList = check getDataSourcesForRuntime(runtimeRecord.runtime_id);
        connectorList = check getConnectorsForRuntime(runtimeRecord.runtime_id);
        resourceList = check getRegistryResourcesForRuntime(runtimeRecord.runtime_id);
    }

    // Convert time values to string format
    string? registrationTimeStr = ();
    time:Civil? regTime = runtimeRecord.registration_time;
    if regTime is time:Civil {
        registrationTimeStr = time:utcToString(check convertDbDateTimeToUtc(regTime));
    }

    string? lastHeartbeatStr = ();
    time:Civil? heartbeatTime = runtimeRecord.last_heartbeat;
    if heartbeatTime is time:Civil {
        lastHeartbeatStr = time:utcToString(check convertDbDateTimeToUtc(heartbeatTime));
    }

    // Get log levels for BI runtimes only (null for MI runtimes)
    types:RuntimeLogLevelRecord[]? logLevels = ();
    if runtimeRecord.runtime_type == types:BI {
        logLevels = check getLogLevelsForRuntime(runtimeRecord.runtime_id);
    }
    // Packed OpenAPI definitions are resolved on demand via the dedicated
    // openApiDefinitionsByRuntime GraphQL query, not loaded on every runtime mapping.
    types:OpenApiDefinitionRecord[]? openApiDefinitions = ();

    return {
        runtimeId: runtimeRecord.runtime_id,
        runtimeName: runtimeRecord["name"] ?: "-",
        runtimeType: runtimeRecord.runtime_type,
        status: runtimeRecord.status,
        environment: check getEnvironmentById(runtimeRecord.environment_id),
        component: check getComponentById(runtimeRecord.component_id),
        version: runtimeRecord.version,
        managementHostname: runtimeRecord.runtime_hostname,
        managementPort: runtimeRecord.runtime_port,
        platformName: runtimeRecord.platform_name,
        platformVersion: runtimeRecord.platform_version,
        platformHome: runtimeRecord.platform_home,
        osName: runtimeRecord.os_name,
        osVersion: runtimeRecord.os_version,
        registrationTime: registrationTimeStr,
        lastHeartbeat: lastHeartbeatStr,
        artifacts: {
            listeners: listenerList,
            services: serviceList,
            main: (),
            apis: apiList,
            proxyServices: proxyList,
            endpoints: endpointList,
            inboundEndpoints: inboundList,
            sequences: sequenceList,
            tasks: taskList,
            templates: templateList,
            messageStores: storeList,
            messageProcessors: processorList,
            localEntries: entryList,
            dataServices: dataServiceList,
            carbonApps: appList,
            dataSources: sourceList,
            connectors: connectorList,
            registryResources: resourceList
        },
        logLevels: logLevels,
        openApiDefinitions: openApiDefinitions
    };
}

// Helper function to map service record and get resources
public isolated function mapToService(types:ServiceRecordInDB serviceRecord, string runtimeId) returns types:Service|error {
    types:Resource[] resourceList = [];
    string serviceName = serviceRecord.service_name;

    stream<types:ResourceRecord, sql:Error?> resourceStream = dbClient->query(`
        SELECT resource_url, methods 
        FROM bi_service_resource_artifacts 
        WHERE runtime_id = ${runtimeId} AND service_name = ${serviceName}
    `);

    check from types:ResourceRecord resourceRecord in resourceStream
        do {
            // Parse methods JSON string to array
            json methodsJson = check resourceRecord.methods.fromJsonString();
            string[] methods = check methodsJson.cloneWithType();

            types:Resource resourceItem = {
                path: resourceRecord.resource_path,
                method: resourceRecord.method,
                url: resourceRecord.resource_url,
                methods: methods
            };
            resourceList.push(resourceItem);
        };

    // Fetch the listener(s) this service is attached to, enriched with full listener
    // detail. Column list mirrors getListenersForRuntime so rows map into types:Listener.
    types:Listener[] serviceListeners = [];
    stream<types:Listener, sql:Error?> boundListenerStream = dbClient->query(`
        SELECT l.listener_name, l.listener_package, l.protocol, l.state, l.listener_host, l.listener_port
        FROM bi_service_listener_bindings b
        JOIN bi_runtime_listener_artifacts l
            ON l.runtime_id = b.runtime_id AND l.listener_name = b.listener_name
        WHERE b.runtime_id = ${runtimeId}
            AND b.service_name = ${serviceName}
            AND b.service_package = ${serviceRecord.service_package}
    `);
    check from types:Listener boundListener in boundListenerStream
        do {
            serviceListeners.push(boundListener);
        };

    return {
        name: serviceRecord.service_name,
        package: serviceRecord.service_package,
        basePath: serviceRecord.base_path,
        state: "enabled", // Default state
        'type: "API", // Default type
        resources: resourceList,
        listeners: serviceListeners
    };
}

// Get log levels for a specific runtime
public isolated function getOpenApiDefinitionsForRuntime(string runtimeId) returns types:OpenApiDefinitionRecord[]|error {
    types:OpenApiDefinitionRecord[] definitionList = [];
    stream<types:OpenApiDefinitionRecord, sql:Error?> definitionStream = dbClient->query(`
        SELECT file_name, definition
        FROM bi_service_openapi_definitions
        WHERE runtime_id = ${runtimeId}
        ORDER BY file_name
    `);

    check from types:OpenApiDefinitionRecord definitionRecord in definitionStream
        do {
            definitionList.push(definitionRecord);
        };

    return definitionList;
}

// Get the stored workflow metadata document for a specific runtime, or () when the
// runtime never published one.
public isolated function getWorkflowMetadataForRuntime(string runtimeId)
        returns types:WorkflowMetadataRecord?|error {
    types:WorkflowMetadataRecord|error metadataRecord = dbClient->queryRow(`
        SELECT m.runtime_id, r.component_id, m.metadata, m.capabilities, m.task_queue
        FROM bi_workflow_metadata m
        INNER JOIN runtimes r ON m.runtime_id = r.runtime_id
        WHERE m.runtime_id = ${runtimeId}
    `);
    if metadataRecord is sql:NoRowsError {
        return ();
    }
    return metadataRecord;
}

// Get the stored workflow metadata documents of every RUNNING runtime of a
// component+environment, freshest heartbeat first. Feeds the workflow definitions
// resolver (documents are deduped across runtimes there) and, for the command tunnel,
// leader selection: a runtime whose `capabilities` include workflowCommands can
// execute tunneled workflow management commands.
public isolated function getWorkflowMetadataForComponentEnv(string componentId, string environmentId)
        returns types:WorkflowMetadataRecord[]|error {
    types:WorkflowMetadataRecord[] metadataList = [];
    stream<types:WorkflowMetadataRecord, sql:Error?> metadataStream = dbClient->query(`
        SELECT m.runtime_id, r.component_id, m.metadata, m.capabilities, m.task_queue
        FROM bi_workflow_metadata m
        INNER JOIN runtimes r ON m.runtime_id = r.runtime_id
        WHERE r.component_id = ${componentId} AND r.environment_id = ${environmentId}
            AND r.status = 'RUNNING'
        ORDER BY r.last_heartbeat DESC
    `);

    check from types:WorkflowMetadataRecord metadataRecord in metadataStream
        do {
            metadataList.push(metadataRecord);
        };

    return metadataList;
}

// Workflow metadata of every RUNNING runtime in the component's project and environment;
// its own rows first, then freshest heartbeat.
public isolated function getWorkflowMetadataForProjectEnv(string componentId, string environmentId)
        returns types:WorkflowMetadataRecord[]|error {
    types:WorkflowMetadataRecord[] metadataList = [];
    stream<types:WorkflowMetadataRecord, sql:Error?> metadataStream = dbClient->query(`
        SELECT m.runtime_id, r.component_id, m.metadata, m.capabilities, m.task_queue
        FROM bi_workflow_metadata m
        INNER JOIN runtimes r ON m.runtime_id = r.runtime_id
        WHERE r.environment_id = ${environmentId}
            AND r.status = 'RUNNING'
            AND r.project_id = (SELECT project_id FROM components WHERE component_id = ${componentId})
        ORDER BY (r.component_id = ${componentId}) DESC, r.last_heartbeat DESC
    `);

    check from types:WorkflowMetadataRecord metadataRecord in metadataStream
        do {
            metadataList.push(metadataRecord);
        };

    return metadataList;
}

public isolated function getLogLevelsForRuntime(string runtimeId) returns types:RuntimeLogLevelRecord[]|error {
    types:RuntimeLogLevelRecord[] logLevelList = [];
    stream<types:RuntimeLogLevelRecord, sql:Error?> logLevelStream = dbClient->query(`
        SELECT runtime_id, component_name, log_level
        FROM bi_runtime_log_levels 
        WHERE runtime_id = ${runtimeId}
        ORDER BY component_name
    `);

    check from types:RuntimeLogLevelRecord logLevelRecord in logLevelStream
        do {
            logLevelList.push(logLevelRecord);
        };

    return logLevelList;
}

// Update or insert a log level for a specific runtime and component
public isolated function upsertLogLevel(string runtimeId, string componentName, string logLevel) returns error? {
    if dbType == MSSQL {
        _ = check dbClient->execute(`
            MERGE INTO bi_runtime_log_levels AS target
            USING (VALUES (${runtimeId}, ${componentName}, ${logLevel}))
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
            USING (SELECT ${runtimeId} AS runtime_id, ${componentName} AS component_name, ${logLevel} AS log_level FROM dual) source
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
                ${runtimeId}, ${componentName}, ${logLevel}
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
                ${runtimeId}, ${componentName}, ${logLevel}
            )
            ON DUPLICATE KEY UPDATE
                log_level = VALUES(log_level),
                updated_at = CURRENT_TIMESTAMP
        `);
    }
}

// Delete log level for a specific runtime and component
public isolated function deleteLogLevel(string runtimeId, string componentName) returns error? {
    _ = check dbClient->execute(`
        DELETE FROM bi_runtime_log_levels 
        WHERE runtime_id = ${runtimeId} AND component_name = ${componentName}
    `);
}

// Delete all log levels for a specific runtime
public isolated function deleteAllLogLevels(string runtimeId) returns error? {
    _ = check dbClient->execute(`
        DELETE FROM bi_runtime_log_levels
        WHERE runtime_id = ${runtimeId}
    `);
}
