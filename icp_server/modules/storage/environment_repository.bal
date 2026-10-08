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

import ballerina/log;
import ballerina/sql;
import ballerina/uuid;

// Oracle stores booleans as NUMBER(1), which the connector cannot map to
// Ballerina boolean fields — read `critical` as int and convert.
type OracleEnvironmentRow record {
    string environment_id;
    string name;
    string handler;
    string? description;
    string? region;
    string? cluster_id;
    string? choreo_env;
    string? external_apim_env_name;
    string? internal_apim_env_name;
    string? sandbox_apim_env_name;
    int critical;
    string? dns_prefix;
    string? created_at?;
    string? updated_at?;
    string? created_by?;
    string? updated_by?;
};

isolated function oracleRowToEnvironment(OracleEnvironmentRow row) returns types:Environment => {
    id: row.environment_id,
    name: row.name,
    handler: row.handler,
    description: row.description,
    region: row.region,
    clusterId: row.cluster_id,
    choreoEnv: row.choreo_env,
    externalApimEnvName: row.external_apim_env_name,
    internalApimEnvName: row.internal_apim_env_name,
    sandboxApimEnvName: row.sandbox_apim_env_name,
    critical: row.critical == 1,
    dnsPrefix: row.dns_prefix,
    createdAt: row?.created_at,
    updatedAt: row?.updated_at,
    createdBy: row?.created_by,
    updatedBy: row?.updated_by
};

// Runs an environments SELECT and returns typed rows, handling the Oracle
// NUMBER(1)-to-boolean limitation transparently for callers.
isolated function fetchEnvironmentRows(sql:ParameterizedQuery query) returns types:Environment[]|error {
    if isOracle() {
        stream<OracleEnvironmentRow, sql:Error?> s = dbClient->query(query);
        return check from OracleEnvironmentRow row in s
            select oracleRowToEnvironment(row);
    }
    stream<types:Environment, sql:Error?> s = dbClient->query(query);
    return check from types:Environment env in s
        select env;
}

// Get all environments
public isolated function getEnvironments() returns types:Environment[]|error {
    types:Environment[] environments = [];
    types:Environment[] envRows = check fetchEnvironmentRows(`SELECT environment_id, name, handler, description,
        region, cluster_id, choreo_env, external_apim_env_name, internal_apim_env_name, sandbox_apim_env_name,
        critical, dns_prefix, created_at, updated_at, created_by, updated_by
        FROM environments ORDER BY name ASC`);
    foreach types:Environment env in envRows {
        environments.push({
            id: env.id,
            description: env.description,
            name: env.name,
            handler: env.handler,
            region: env.region,
            clusterId: env.clusterId,
            choreoEnv: env.choreoEnv,
            externalApimEnvName: env.externalApimEnvName,
            internalApimEnvName: env.internalApimEnvName,
            sandboxApimEnvName: env.sandboxApimEnvName,
            critical: env.critical,
            dnsPrefix: env.dnsPrefix,
            createdAt: env.createdAt,
            createdBy: getDisplayNameById(env.createdBy),
            updatedAt: env.updatedAt,
            updatedBy: getDisplayNameById(env.updatedBy)
        });
    }
    return environments;
}

// Get environments by specific environment IDs
public isolated function getEnvironmentsByIds(string[] environmentIds) returns types:Environment[]|error {
    // Return empty array if no environment IDs provided
    if environmentIds.length() == 0 {
        return [];
    }

    types:Environment[] environments = [];

    // Build WHERE clause to filter by environment IDs
    sql:ParameterizedQuery query = `SELECT environment_id, name, handler, description, 
                                     region, cluster_id, choreo_env, external_apim_env_name, internal_apim_env_name, 
                                     sandbox_apim_env_name, critical, dns_prefix, created_at, updated_at, created_by, updated_by
                                     FROM environments 
                                     WHERE environment_id IN (`;

    // Add environment IDs to the IN clause
    foreach int i in 0 ..< environmentIds.length() {
        if i > 0 {
            query = sql:queryConcat(query, `, `);
        }
        query = sql:queryConcat(query, `${environmentIds[i]}`);
    }

    query = sql:queryConcat(query, `) ORDER BY name ASC`);

    types:Environment[] envRows = check fetchEnvironmentRows(query);

    foreach types:Environment env in envRows {
        environments.push({
            id: env.id,
            description: env.description,
            name: env.name,
            handler: env.handler,
            region: env.region,
            clusterId: env.clusterId,
            choreoEnv: env.choreoEnv,
            externalApimEnvName: env.externalApimEnvName,
            internalApimEnvName: env.internalApimEnvName,
            sandboxApimEnvName: env.sandboxApimEnvName,
            critical: env.critical,
            dnsPrefix: env.dnsPrefix,
            createdAt: env.createdAt,
            updatedAt: env.updatedAt,
            createdBy: getDisplayNameById(env.createdBy),
            updatedBy: getDisplayNameById(env.updatedBy)
        });
    }

    log:printDebug("Retrieved environments by IDs", environmentCount = environments.length());

    return environments;
}

// Get all environments (for admin operations)
public isolated function getAllEnvironments() returns types:Environment[]|error {
    types:Environment[] environments = [];

    sql:ParameterizedQuery query = `SELECT environment_id, name, handler, description, 
                                     region, cluster_id, choreo_env, external_apim_env_name, internal_apim_env_name, 
                                     sandbox_apim_env_name, critical, dns_prefix, created_at, updated_at, created_by, updated_by
                                     FROM environments 
                                     ORDER BY name ASC`;

    types:Environment[] envRows = check fetchEnvironmentRows(query);

    foreach types:Environment env in envRows {
        environments.push({
            id: env.id,
            description: env.description,
            name: env.name,
            handler: env.handler,
            region: env.region,
            clusterId: env.clusterId,
            choreoEnv: env.choreoEnv,
            externalApimEnvName: env.externalApimEnvName,
            internalApimEnvName: env.internalApimEnvName,
            sandboxApimEnvName: env.sandboxApimEnvName,
            critical: env.critical,
            dnsPrefix: env.dnsPrefix,
            createdAt: env.createdAt,
            updatedAt: env.updatedAt,
            createdBy: getDisplayNameById(env.createdBy),
            updatedBy: getDisplayNameById(env.updatedBy)
        });
    }

    log:printDebug("Retrieved all environments", environmentCount = environments.length());

    return environments;
}

// Get environment IDs by environment types (for RBAC filtering)
public isolated function getEnvironmentIdsByTypes(boolean hasProdAccess, boolean hasNonProdAccess) returns string[]|error {
    if !hasProdAccess && !hasNonProdAccess {
        return [];
    }

    string[] environmentIds = [];

    // Build WHERE clause to filter by environment types
    sql:ParameterizedQuery query = `SELECT environment_id FROM environments WHERE `;

    if hasProdAccess && hasNonProdAccess {
        query = sql:queryConcat(query, `1=1`);
    } else if hasProdAccess {
        query = sql:queryConcat(query, sql:queryConcat(`critical = `, sqlQueryFromString(TRUE_LITERAL)));
    } else if hasNonProdAccess {
        query = sql:queryConcat(query, sql:queryConcat(`critical = `, sqlQueryFromString(FALSE_LITERAL)));
    }

    query = sql:queryConcat(query, ` ORDER BY name ASC`);

    stream<record {|string environment_id;|}, sql:Error?> envStream = dbClient->query(query);

    check from record {|string environment_id;|} env in envStream
        do {
            environmentIds.push(env.environment_id);
        };

    log:printDebug("Retrieved environment IDs by types", environmentCount = environmentIds.length());

    return environmentIds;
}

// Get environment by ID
public isolated function getEnvironmentById(string environmentId) returns types:Environment|error {
    types:Environment[] envRecords = check fetchEnvironmentRows(
        `SELECT environment_id, name, handler, description, region, cluster_id, choreo_env,
        external_apim_env_name, internal_apim_env_name, sandbox_apim_env_name, critical, dns_prefix,
        created_at, updated_at FROM environments WHERE environment_id = ${environmentId}`);

    if envRecords.length() == 0 {
        return error(string `Environment ${environmentId} not found.`);
    }

    types:Environment env = envRecords[0];
    return {
        id: env.id,
        name: env.name,
        handler: env.handler,
        description: env.description,
        region: env?.region,
        clusterId: env?.clusterId,
        choreoEnv: env?.choreoEnv,
        externalApimEnvName: env?.externalApimEnvName,
        internalApimEnvName: env?.internalApimEnvName,
        sandboxApimEnvName: env?.sandboxApimEnvName,
        critical: env?.critical,
        dnsPrefix: env?.dnsPrefix,
        createdAt: env.createdAt,
        updatedAt: env.updatedAt
    };
}

public isolated function getEnvironmentNameById(string environmentId) returns string|error {
    stream<record {|string name;|}, sql:Error?> nameStream =
        dbClient->query(`SELECT name FROM environments WHERE environment_id = ${environmentId}`);
    record {|string name;|}[] records = check from var r in nameStream
        select r;
    if records.length() == 0 {
        return error(string `Environment ${environmentId} not found.`);
    }
    return records[0].name;
}

// Create a new environment
public isolated function createEnvironment(types:EnvironmentInput environment) returns types:Environment|error? {
    log:printInfo(string `Register environment : ${environment.toString()}`);
    string envId = uuid:createRandomUuid();

    if environment.name.trim() == "" {
        log:printWarn("Environment creation attempted with empty name");
        return error("Environment name is required");
    }

    string handler = environment.environmentHandler.trim();
    if handler == "" {
        log:printWarn("Environment creation attempted without handler for environment: " + environment.name);
        return error("Environment handler is required");
    }
    check validateHandler("Environment handler", handler, MAX_ENVIRONMENT_HANDLER_LENGTH);

    // Check for duplicate handler
    sql:ParameterizedQuery handlerCheckQuery = `SELECT COUNT(*) as cnt FROM environments WHERE handler = ${handler}`;
    stream<record {|int cnt;|}, sql:Error?> handlerCheckStream = dbClient->query(handlerCheckQuery);
    record {|int cnt;|}[] handlerCheckResult = check from record {|int cnt;|} r in handlerCheckStream
        select r;
    if handlerCheckResult.length() > 0 && handlerCheckResult[0].cnt > 0 {
        return error(string `Environment handler '${handler}' is already taken`);
    }

    sql:ParameterizedQuery insertQuery = `INSERT INTO environments (environment_id, name, handler, description, critical, created_by) 
    VALUES (${envId}, ${environment.name}, ${handler}, ${environment.description}, ${environment.critical}, ${environment.createdBy})`;
    var result = dbClient->execute(insertQuery);
    if result is sql:Error {
        log:printError(string `Failed to insert environment: ${environment.name}`, 'error = result);
        match classifySqlError(result) {
            DUPLICATE_KEY => {
                return error(string `An environment with the name or handler "${environment.name}" already exists`, result);
            }
            VALUE_TOO_LONG => {
                return error("The provided value exceeds the maximum allowed length", result);
            }
            _ => {
                return error("An unexpected error occurred. Please contact your administrator.", result);
            }
        }
    }

    log:printInfo(string `Created environment: ${environment.name}`,
            envId = envId,
            handler = handler,
            createdBy = environment.createdBy);

    // Return the created environment
    return check getEnvironmentById(envId);
}

// Update environment name, description and/or critical status.
// The handler is immutable once the environment is created, so it can't be updated here.
public isolated function updateEnvironment(string environmentId, string? name, string? description, boolean? critical) returns error? {
    sql:ParameterizedQuery whereClause = ` WHERE environment_id = ${environmentId} `;
    sql:ParameterizedQuery updateFields = ` SET updated_at = CURRENT_TIMESTAMP `;

    if name is string {
        updateFields = sql:queryConcat(updateFields, `, name = ${name} `);
    }
    if description is string {
        updateFields = sql:queryConcat(updateFields, `, description = ${description} `);
    }
    if critical is boolean {
        updateFields = sql:queryConcat(updateFields, `, critical = ${critical} `);
    }

    sql:ParameterizedQuery updateQuery = sql:queryConcat(`UPDATE environments `, updateFields, whereClause);
    var result = dbClient->execute(updateQuery);
    if result is sql:Error {
        log:printError(string `Failed to update environment ${environmentId}`, 'error = result);
        match classifySqlError(result) {
            DUPLICATE_KEY => {
                return error("An environment with this name or handler already exists", result);
            }
            VALUE_TOO_LONG => {
                return error("The provided value exceeds the maximum allowed length", result);
            }
            _ => {
                return error("An unexpected error occurred. Please contact your administrator.", result);
            }
        }
    }
    log:printInfo(string `Successfully updated environment ${environmentId}`);
    return ();
}

// Update environment production status
public isolated function updateEnvironmentProductionStatus(string environmentId, boolean critical) returns error? {
    sql:ParameterizedQuery updateQuery = `UPDATE environments SET critical = ${critical}, updated_at = CURRENT_TIMESTAMP WHERE environment_id = ${environmentId}`;
    var result = dbClient->execute(updateQuery);
    if result is sql:Error {
        log:printError(string `Failed to update environment production status ${environmentId}`, 'error = result);
        return error("An unexpected error occurred. Please contact your administrator.", result);
    }
    log:printInfo(string `Successfully updated environment production status ${environmentId}`);
    return ();
}

// Delete an environment by ID
public isolated function deleteEnvironment(string environmentId) returns error? {
    // Single-statement conditional delete to avoid TOCTOU between runtime check and delete.
    sql:ParameterizedQuery deleteQuery = `DELETE FROM environments
                                         WHERE environment_id = ${environmentId}
                                           AND NOT EXISTS (
                                               SELECT 1 FROM runtimes WHERE environment_id = ${environmentId}
                                           )`;
    var result = dbClient->execute(deleteQuery);
    if result is sql:Error {
        log:printError(string `Failed to delete environment ${environmentId}`, 'error = result);
        match classifySqlError(result) {
            FOREIGN_KEY_VIOLATION => {
                return error("Cannot delete environment because it has dependent resources", result);
            }
            _ => {
                return error("An unexpected error occurred. Please contact your administrator.", result);
            }
        }
    }

    if (result.affectedRowCount ?: 0) == 0 {
        // No row deleted means runtimes exist, or the environment was concurrently removed.
        stream<record {|int runtimeCount;|}, sql:Error?> runtimeCountStream = dbClient->query(
            `SELECT COUNT(*) as runtimeCount FROM runtimes WHERE environment_id = ${environmentId}`
        );

        int runtimeCount = 0;
        check from record {|int runtimeCount;|} countRecord in runtimeCountStream
            do {
                runtimeCount = countRecord.runtimeCount;
            };

        if runtimeCount > 0 {
            log:printWarn(string `Cannot delete environment ${environmentId}: ${runtimeCount} runtime(s) still active`);
            return error(string `Cannot delete environment: ${runtimeCount} registered runtime(s) found. Please delete all runtimes before deleting.`);
        }

        return error("Environment not found");
    }

    log:printInfo(string `Successfully deleted environment ${environmentId}`);
    return ();
}

// Get environment by handler
public isolated function getEnvironmentByHandler(string environmentHandler) returns types:Environment|error {
    types:Environment[] envRecords = check fetchEnvironmentRows(
        `SELECT environment_id, name, handler, description, region, cluster_id, choreo_env,
        external_apim_env_name, internal_apim_env_name, sandbox_apim_env_name, critical, dns_prefix,
        created_at, updated_at FROM environments WHERE handler = ${environmentHandler}`);

    if envRecords.length() == 0 {
        return error(string `Environment with handler '${environmentHandler}' not found.`);
    }

    types:Environment env = envRecords[0];
    return {
        id: env.id,
        name: env.name,
        handler: env.handler,
        description: env.description,
        region: env?.region,
        clusterId: env?.clusterId,
        choreoEnv: env?.choreoEnv,
        externalApimEnvName: env?.externalApimEnvName,
        internalApimEnvName: env?.internalApimEnvName,
        sandboxApimEnvName: env?.sandboxApimEnvName,
        critical: env?.critical,
        dnsPrefix: env?.dnsPrefix,
        createdAt: env.createdAt,
        updatedAt: env.updatedAt
    };
}

// Get environment ID by handler.
//
// `queryRow` rather than a stream: every heartbeat resolves its environment through here, so a
// connection this function fails to return is a connection the pool never sees again. Consuming
// a stream returns the connection only on the paths that reach the end of it — an error from the
// query, or a client that disconnects mid-request, leaves it borrowed forever, and ten of those
// retire the pool. `queryRow` owns the connection for the whole call and hands it back on every
// path, including its own error.
public isolated function getEnvironmentIdByHandler(string environmentHandler) returns string|error {
    record {|string environment_id;|}|sql:Error row = dbClient->queryRow(`
        SELECT environment_id FROM environments WHERE handler = ${environmentHandler}
    `);
    if row is sql:NoRowsError {
        return error(string `Environment with handler '${environmentHandler}' not found.`);
    }
    if row is sql:Error {
        return error(string `Failed to resolve environment handler '${environmentHandler}'.`, row);
    }
    return row.environment_id;
}

// Check environment handler availability
public isolated function checkEnvironmentHandlerAvailability(string environmentHandlerCandidate) returns types:EnvironmentHandlerAvailability|error {
    log:printDebug(string `Checking environment handler availability for handler: ${environmentHandlerCandidate}`);

    // Check if the handler already exists
    sql:ParameterizedQuery query = `SELECT COUNT(*) as handlecount 
                                   FROM environments 
                                   WHERE handler = ${environmentHandlerCandidate}`;

    int existingHandlerCount = 0;

    stream<record {|int handlecount;|}, sql:Error?> handlerCountStream = dbClient->query(query);

    check from record {|int handlecount;|} countRecord in handlerCountStream
        do {
            existingHandlerCount = countRecord.handlecount;
        };

    boolean isHandlerUnique = existingHandlerCount == 0;
    string? alternateCandidate = ();

    // If handler is not unique, generate an alternate candidate
    if !isHandlerUnique {
        // Generate alternate handler suggestions by appending numbers
        int counter = 1;
        string baseHandler = environmentHandlerCandidate;

        while counter <= 10 { // Limit to 10 attempts to avoid infinite loop
            string candidate = string `${baseHandler}${counter}`;

            sql:ParameterizedQuery alternateQuery = `SELECT COUNT(*) as handlecount 
                                                   FROM environments 
                                                   WHERE handler = ${candidate}`;

            int candidateCount = 0;
            stream<record {|int handlecount;|}, sql:Error?> candidateStream = dbClient->query(alternateQuery);

            check from record {|int handlecount;|} candidateRecord in candidateStream
                do {
                    candidateCount = candidateRecord.handlecount;
                };

            if candidateCount == 0 {
                alternateCandidate = candidate;
                break;
            }

            counter += 1;
        }
    }

    log:printDebug(string `Environment handler availability check completed`,
            environmentHandlerCandidate = environmentHandlerCandidate,
            isHandlerUnique = isHandlerUnique,
            alternateCandidate = alternateCandidate);

    return {
        handlerUnique: isHandlerUnique,
        alternateHandlerCandidate: alternateCandidate
    };
}

// Get all environment IDs where a component has runtimes
public isolated function getEnvironmentIdsWithRuntimes(string componentId) returns string[]|error {
    log:printDebug(string `Fetching environment IDs where component ${componentId} has runtimes`);

    stream<record {|string environment_Id;|}, sql:Error?> envStream = dbClient->query(
        `SELECT DISTINCT environment_id 
         FROM runtimes 
         WHERE component_id = ${componentId}`
        );

    string[] environmentIds = [];
    check from record {|string environment_Id;|} envRecord in envStream
        do {
            environmentIds.push(envRecord.environment_Id);
        };

    log:printDebug(string `Component ${componentId} has runtimes in ${environmentIds.length()} environments`);
    return environmentIds;
}
