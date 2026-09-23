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
import ballerina/time;
import ballerina/uuid;

// Integration types ICP records, encoded as devant encodes them, keyed by the
// runtime that produces them — an integration type is always expressed in terms of
// one runtime, so a BI integration cannot carry an MI display_type. `service` is
// the legacy value written before integrations carried a type and predates the
// distinction, so it is accepted for either. Adding an integration type means
// adding its value under every runtime that offers it; a type one runtime cannot
// run is simply absent there, as Workflow is for MI.
// The legacy generic integration type: the column default and what older clients
// wrote. Runtime registration now explicitly writes "unspecified".
const string GENERIC_DISPLAY_TYPE = "service";

// The workflow integration type. The integration-level Workflows view keys on it, so a
// workflow integration that carries the generic type shows no workflow features.
const string WORKFLOW_DISPLAY_TYPE = "ballerinaWorkflow";

// "unspecified" records an explicit choice to leave the integration unclassified.
// Keep it distinct from the legacy "service" default used by older clients.
final readonly & map<string[]> SUPPORTED_DISPLAY_TYPES_BY_RUNTIME = {
    // The workflow engine and its management API are Ballerina-only, so
    // `ballerinaWorkflow` has no MI counterpart.
    "BI": ["unspecified", "service", "ballerinaService", "scheduledTask", "ballerinaEventHandler", "ballerinaWorkflow"],
    "MI": ["unspecified", "service", "miApiService", "miCronjob", "miEventHandler"]
};

// Subtypes for the integration types that share a generic service display_type and
// cannot be told apart by it alone. File Integration is runtime-specific; AI Agent
// and MCP Server are not.
final readonly & map<string[]> SUPPORTED_SUB_TYPES_BY_RUNTIME = {
    "BI": ["ballerinaFileIntegration", "aiAgent", "MCP"],
    "MI": ["miFileIntegration", "aiAgent", "MCP"]
};

// display_types a subtype may accompany. A subtype exists only to disambiguate a
// generic service, so pairing one with e.g. `scheduledTask` is contradictory.
final readonly & map<string[]> SUB_TYPED_DISPLAY_TYPES_BY_RUNTIME = {
    "BI": ["service", "ballerinaService"],
    "MI": ["service", "miApiService"]
};

// The columns only constrain length, so reject values that could not have come
// from a real choice before they are persisted and later render as the wrong
// integration type. Validating against the runtime also rules out mismatches the
// length constraint cannot see, such as `miApiService` on a BI integration or
// `miApiService` paired with `ballerinaFileIntegration`.
isolated function validateIntegrationMetadata(string componentType, string displayType, string? componentSubType) returns error? {
    string[]? allowedDisplayTypes = SUPPORTED_DISPLAY_TYPES_BY_RUNTIME[componentType];
    if allowedDisplayTypes is () {
        return error(string `Unsupported runtime: ${componentType}`);
    }
    if allowedDisplayTypes.indexOf(displayType) is () {
        return error(string `Unsupported integration type ${displayType} for a ${componentType} integration`);
    }
    if componentSubType is string {
        string[] allowedSubTypes = SUPPORTED_SUB_TYPES_BY_RUNTIME[componentType] ?: [];
        if allowedSubTypes.indexOf(componentSubType) is () {
            return error(string `Unsupported integration subtype ${componentSubType} for a ${componentType} integration`);
        }
        string[] subTypedDisplayTypes = SUB_TYPED_DISPLAY_TYPES_BY_RUNTIME[componentType] ?: [];
        if subTypedDisplayTypes.indexOf(displayType) is () {
            return error(string `Integration subtype ${componentSubType} is not valid for integration type ${displayType}`);
        }
    }
    return ();
}

// Runtime recorded for a component. Integration metadata is validated against the
// persisted runtime on update, not against anything the caller supplies, since the
// runtime of an existing integration is not editable.
isolated function getComponentRuntimeType(string componentId) returns string|error {
    stream<record {|string component_type;|}, sql:Error?> componentStream = dbClient->query(`
        SELECT component_type FROM components WHERE component_id = ${componentId}
    `);

    record {|string component_type;|}[] componentRecords = check from record {|string component_type;|} component in componentStream
        select component;

    if componentRecords.length() == 0 {
        return error(string `Component with ID ${componentId} not found`);
    }
    return componentRecords[0].component_type;
}

// Create a new component
public isolated function createComponent(types:ComponentInput component) returns types:Component|error? {
    string componentId = uuid:createType1AsString();
    string componentTypeValue = (component?.componentType ?: types:BI).toString();

    // Use displayName if provided, otherwise fall back to name
    string displayName = component?.displayName ?: component.name;

    // "service" keeps pre-integration-type clients (and the DB default) working:
    // a component created without an explicit type is a plain service.
    string displayType = component?.displayType ?: "service";
    string? componentSubType = component?.componentSubType;

    check validateIntegrationMetadata(componentTypeValue, displayType, componentSubType);

    sql:ParameterizedQuery insertQuery = `INSERT INTO components (component_id, project_id, name, display_name, description, component_type, display_type, component_sub_type, created_by)
                                          VALUES (${componentId}, ${component.projectId}, ${component.name}, ${displayName}, ${component.description}, ${componentTypeValue}, ${displayType}, ${componentSubType}, ${component.createdBy})`;
    var result = dbClient->execute(insertQuery);
    if result is sql:Error {
        log:printError(string `Failed to create component: ${component.name}`, 'error = result);
        match classifySqlError(result) {
            DUPLICATE_KEY => { return error("A component with this name already exists in this project", result); }
            VALUE_TOO_LONG => { return error("The provided value exceeds the maximum allowed length", result); }
            FOREIGN_KEY_VIOLATION => { return error("The specified project does not exist", result); }
            _ => { return error("An unexpected error occurred. Please contact your administrator.", result); }
        }
    }
    return getComponentById(componentId);
}

// Check if a project has any components
public isolated function hasProjectComponents(string projectId) returns boolean|error {
    sql:ParameterizedQuery query = `SELECT COUNT(*) as component_count FROM components WHERE project_id = ${projectId}`;
    stream<record {int component_count;}, sql:Error?> resultStream = dbClient->query(query);

    record {|record {int component_count;} value;|}? streamResult = check resultStream.next();
    check resultStream.close();

    if streamResult is record {|record {int component_count;} value;|} {
        return streamResult.value.component_count > 0;
    }
    return false;
}

// Get all components with optional project filter
public isolated function getComponents(string? projectId, types:ComponentOptionsInput? options = ()) returns types:Component[]|error {
    types:Component[] components = [];
    sql:ParameterizedQuery whereClause = ` WHERE 1=1 `;
    sql:ParameterizedQuery whereConditions = ` `;

    if projectId is string {
        whereConditions = sql:queryConcat(whereConditions, ` AND c.project_id = ${projectId} `);
    }

    sql:ParameterizedQuery selectClause = `SELECT c.component_id, c.project_id, c.name as component_name, c.display_name as component_display_name, c.description as component_description, 
                                                  c.component_type, c.display_type as component_display_type, c.component_sub_type,
                                                  c.created_by as component_created_by, c.created_at as component_created_at, c.updated_at as component_updated_at,
                                                  c.updated_by as component_updated_by,
                                                  p.org_id as project_org_id, p.name as project_name, p.version as project_version, 
                                                  p.created_date as project_created_date, p.handler as project_handler, p.region as project_region,
                                                  p.description as project_description, p.default_deployment_pipeline_id as project_default_deployment_pipeline_id,
                                                  p.deployment_pipeline_ids as project_deployment_pipeline_ids, p.type as project_type,
                                                  p.git_provider as project_git_provider, p.git_organization as project_git_organization,
                                                  p.repository as project_repository, p.branch as project_branch, p.secret_ref as project_secret_ref,
                                                  p.created_by as project_created_by, p.updated_at as project_updated_at, p.updated_by as project_updated_by
                                           FROM components c 
                                           JOIN projects p ON c.project_id = p.project_id `;
    sql:ParameterizedQuery orderByClause = ` ORDER BY c.name ASC `;
    sql:ParameterizedQuery query = sql:queryConcat(selectClause, whereClause, whereConditions, orderByClause);

    stream<types:ComponentInDB, sql:Error?> componentStream = dbClient->query(query);

    check from types:ComponentInDB component in componentStream
        do {
            components.push(mapToComponent(component));
        };
    return components;
}

// Get all components for multiple projects (RBAC-aware batch query)
public isolated function getComponentsByProjectIds(string[] projectIds, types:ComponentOptionsInput? options = ()) returns types:Component[]|error {
    if projectIds.length() == 0 {
        return [];
    }

    types:Component[] components = [];

    sql:ParameterizedQuery selectClause = `SELECT c.component_id, c.project_id, c.name as component_name, c.display_name as component_display_name, c.description as component_description, 
                                                  c.component_type, c.display_type as component_display_type, c.component_sub_type,
                                                  c.created_by as component_created_by, c.created_at as component_created_at, c.updated_at as component_updated_at,
                                                  c.updated_by as component_updated_by,
                                                  p.org_id as project_org_id, p.name as project_name, p.version as project_version, 
                                                  p.created_date as project_created_date, p.handler as project_handler, p.region as project_region,
                                                  p.description as project_description, p.default_deployment_pipeline_id as project_default_deployment_pipeline_id,
                                                  p.deployment_pipeline_ids as project_deployment_pipeline_ids, p.type as project_type,
                                                  p.git_provider as project_git_provider, p.git_organization as project_git_organization,
                                                  p.repository as project_repository, p.branch as project_branch, p.secret_ref as project_secret_ref,
                                                  p.created_by as project_created_by, p.updated_at as project_updated_at, p.updated_by as project_updated_by
                                           FROM components c 
                                           JOIN projects p ON c.project_id = p.project_id 
                                           WHERE c.project_id IN (`;

    sql:ParameterizedQuery inClause = ``;
    foreach int i in 0 ..< projectIds.length() {
        if i > 0 {
            inClause = sql:queryConcat(inClause, `, `);
        }
        inClause = sql:queryConcat(inClause, `${projectIds[i]}`);
    }

    sql:ParameterizedQuery orderByClause = `) ORDER BY c.name ASC`;
    sql:ParameterizedQuery query = sql:queryConcat(selectClause, inClause, orderByClause);

    stream<types:ComponentInDB, sql:Error?> componentStream = dbClient->query(query);

    check from types:ComponentInDB component in componentStream
        do {
            components.push(mapToComponent(component));
        };

    return components;
}

// Get components by component IDs (integration IDs) using SQL IN clause
public isolated function getComponentsByIds(string[] componentIds) returns types:Component[]|error {
    if componentIds.length() == 0 {
        return [];
    }

    // Log warning for large lists (similar to getProjectsByIds)
    if componentIds.length() > 5000 {
        log:printWarn(string `Large component ID list: ${componentIds.length()} components`);
    }

    types:Component[] components = [];

    sql:ParameterizedQuery selectClause = `SELECT c.component_id, c.project_id, c.name as component_name, c.display_name as component_display_name, c.description as component_description, 
                                                  c.component_type, c.display_type as component_display_type, c.component_sub_type,
                                                  c.created_by as component_created_by, c.created_at as component_created_at, c.updated_at as component_updated_at,
                                                  c.updated_by as component_updated_by,
                                                  p.org_id as project_org_id, p.name as project_name, p.version as project_version, 
                                                  p.created_date as project_created_date, p.handler as project_handler, p.region as project_region,
                                                  p.description as project_description, p.default_deployment_pipeline_id as project_default_deployment_pipeline_id,
                                                  p.deployment_pipeline_ids as project_deployment_pipeline_ids, p.type as project_type,
                                                  p.git_provider as project_git_provider, p.git_organization as project_git_organization,
                                                  p.repository as project_repository, p.branch as project_branch, p.secret_ref as project_secret_ref,
                                                  p.created_by as project_created_by, p.updated_at as project_updated_at, p.updated_by as project_updated_by
                                           FROM components c 
                                           JOIN projects p ON c.project_id = p.project_id 
                                           WHERE c.component_id IN (`;

    sql:ParameterizedQuery inClause = ``;
    foreach int i in 0 ..< componentIds.length() {
        if i > 0 {
            inClause = sql:queryConcat(inClause, `, `);
        }
        inClause = sql:queryConcat(inClause, `${componentIds[i]}`);
    }

    sql:ParameterizedQuery orderByClause = `) ORDER BY c.name ASC`;
    sql:ParameterizedQuery query = sql:queryConcat(selectClause, inClause, orderByClause);

    stream<types:ComponentInDB, sql:Error?> componentStream = dbClient->query(query);

    check from types:ComponentInDB component in componentStream
        do {
            components.push(mapToComponent(component));
        };

    return components;
}

// Get project ID for a given component ID (lightweight query for access control)
public isolated function getProjectIdByComponentId(string componentId) returns string|error {
    stream<record {|string project_id;|}, sql:Error?> resultStream =
        dbClient->query(`SELECT project_id FROM components WHERE component_id = ${componentId}`);

    record {|string project_id;|}[] results =
        check from record {|string project_id;|} result in resultStream
        select result;

    if results.length() == 0 {
        return error(string `Component with id ${componentId} not found`);
    }

    return results[0].project_id;
}

// Get a specific component by ID
public isolated function getComponentById(string componentId) returns types:Component|error {
    stream<types:ComponentInDB, sql:Error?> componentStream =
        dbClient->query(`SELECT c.component_id, c.project_id, c.name as component_name, c.display_name as component_display_name, c.description as component_description, 
                                c.component_type, c.display_type as component_display_type, c.component_sub_type,
                                c.created_by as component_created_by, c.created_at as component_created_at, c.updated_at as component_updated_at,
                                c.updated_by as component_updated_by,
                                p.org_id as project_org_id, p.name as project_name, p.version as project_version, 
                                p.created_date as project_created_date, p.handler as project_handler, p.region as project_region,
                                p.description as project_description, p.default_deployment_pipeline_id as project_default_deployment_pipeline_id,
                                p.deployment_pipeline_ids as project_deployment_pipeline_ids, p.type as project_type,
                                p.git_provider as project_git_provider, p.git_organization as project_git_organization,
                                p.repository as project_repository, p.branch as project_branch, p.secret_ref as project_secret_ref,
                                p.created_by as project_created_by, p.updated_at as project_updated_at, p.updated_by as project_updated_by
                         FROM components c 
                         JOIN projects p ON c.project_id = p.project_id 
                         WHERE c.component_id = ${componentId}`);

    types:ComponentInDB[] componentRecords =
        check from types:ComponentInDB component in componentStream
        select component;

    if componentRecords.length() == 0 {
        log:printError(string `Component with id ${componentId} not found`);
        return error(string `Component with id ${componentId} not found`);
    }

    return mapToComponent(componentRecords[0]);
}

// Get component ID by name
public isolated function getComponentIdByName(string componentName) returns string|error {
    stream<record {|string component_id;|}, sql:Error?> componentStream = dbClient->query(`
        SELECT component_id FROM components WHERE name = ${componentName}
    `);

    record {|string component_id;|}[] componentRecords = check from record {|string component_id;|} component in componentStream
        select component;

    if componentRecords.length() == 0 {
        return error(string `Component ${componentName} not found.`);
    }
    return componentRecords[0].component_id;
}

// Get component name by component ID
public isolated function getComponentNameById(string componentId) returns string|error {
    stream<record {|string name;|}, sql:Error?> componentStream = dbClient->query(`
        SELECT name FROM components WHERE component_id = ${componentId}
    `);

    record {|string name;|}[] componentRecords = check from record {|string name;|} component in componentStream
        select component;

    if componentRecords.length() == 0 {
        return error(string `Component with ID ${componentId} not found`);
    }
    return componentRecords[0].name;
}

// Get a component by project ID and handler (component name)
public isolated function getComponentByProjectAndHandler(string projectId, string handler) returns types:Component?|error {
    stream<types:ComponentInDB, sql:Error?> componentStream =
        dbClient->query(`SELECT c.component_id, c.project_id, c.name as component_name, c.display_name as component_display_name, c.description as component_description,
                                c.component_type, c.display_type as component_display_type, c.component_sub_type,
                                c.created_by as component_created_by, c.created_at as component_created_at, c.updated_at as component_updated_at,
                                c.updated_by as component_updated_by,
                                p.org_id as project_org_id, p.name as project_name, p.version as project_version,
                                p.created_date as project_created_date, p.handler as project_handler, p.region as project_region,
                                p.description as project_description, p.default_deployment_pipeline_id as project_default_deployment_pipeline_id,
                                p.deployment_pipeline_ids as project_deployment_pipeline_ids, p.type as project_type,
                                p.git_provider as project_git_provider, p.git_organization as project_git_organization,
                                p.repository as project_repository, p.branch as project_branch, p.secret_ref as project_secret_ref,
                                p.created_by as project_created_by, p.updated_at as project_updated_at, p.updated_by as project_updated_by
                         FROM components c
                         JOIN projects p ON c.project_id = p.project_id
                         WHERE c.project_id = ${projectId} AND c.name = ${handler}`);

    types:ComponentInDB[] componentRecords =
        check from types:ComponentInDB component in componentStream
        select component;

    if componentRecords.length() == 0 {
        return ();
    }

    return mapToComponent(componentRecords[0]);
}

// Records whether the Moesif metrics dashboards have been created for a specific
// environment. Upserts into environment_moesif_config keyed by environment_id.
// Returns the number of affected rows.
public isolated function updateComponentMoesifDashboardsCreated(string environmentId, boolean created) returns int|error {
    sql:ExecutionResult result;
    if dbType == MSSQL {
        result = check dbClient->execute(`
            MERGE INTO environment_moesif_config AS target
            USING (VALUES (${environmentId}, ${created}))
                   AS source (environment_id, dashboards_created)
            ON (target.environment_id = source.environment_id)
            WHEN MATCHED THEN
                UPDATE SET dashboards_created = source.dashboards_created, updated_at = GETDATE()
            WHEN NOT MATCHED THEN
                INSERT (environment_id, dashboards_created)
                VALUES (source.environment_id, source.dashboards_created);
        `);
    } else if dbType == ORACLE {
        result = check dbClient->execute(`
            MERGE INTO environment_moesif_config target
            USING (SELECT ${environmentId} AS environment_id, ${created} AS dashboards_created FROM dual) source
            ON (target.environment_id = source.environment_id)
            WHEN MATCHED THEN
                UPDATE SET dashboards_created = source.dashboards_created, updated_at = CURRENT_TIMESTAMP
            WHEN NOT MATCHED THEN
                INSERT (environment_id, dashboards_created)
                VALUES (source.environment_id, source.dashboards_created)
        `);
    } else if dbType == POSTGRESQL {
        result = check dbClient->execute(`
            INSERT INTO environment_moesif_config (environment_id, dashboards_created)
            VALUES (${environmentId}, ${created})
            ON CONFLICT (environment_id) DO UPDATE SET
                dashboards_created = EXCLUDED.dashboards_created,
                updated_at = CURRENT_TIMESTAMP
        `);
    } else {
        result = check dbClient->execute(`
            INSERT INTO environment_moesif_config (environment_id, dashboards_created)
            VALUES (${environmentId}, ${created})
            ON DUPLICATE KEY UPDATE
                dashboards_created = VALUES(dashboards_created),
                updated_at = CURRENT_TIMESTAMP
        `);
    }
    return result.affectedRowCount ?: 0;
}

// Retrieve the Moesif Management API key stored for an environment. This key is
// the only credential needed to load either canvas: the short-lived canvas token
// is minted from it, and the canvas resolves the Moesif organization + application
// from that token's claims. A Moesif application maps to a specific environment,
// so the key is stored per environment and is shared by every integration in it
// and by both the metrics and the logs view. Returns () when no row exists or no
// key has been stored.
public isolated function getEnvironmentMoesifManagementKey(string environmentId) returns string?|error {
    sql:ParameterizedQuery selectQuery =
        `SELECT management_key FROM environment_moesif_config WHERE environment_id = ${environmentId}`;
    string?|sql:Error result = dbClient->queryRow(selectQuery);
    if result is sql:NoRowsError {
        return ();
    }
    if result is sql:Error {
        return result;
    }
    return result;
}


// The Moesif organization + Collector Application ids stored for an environment.
// Both metrics and logs share the one application per environment, so a setup
// flow must never repoint one feature at a different application while the other
// stays configured against the old one.
type EnvironmentMoesifApplication record {|
    string? canvas_org_id;
    string? canvas_app_id;
|};

// Which of the two Moesif setup flows an upsert is running for. Metrics and logs
// are configured independently and each flips only its own flag, so the flow
// selects the column to set while everything else about the upsert is shared.
enum MoesifSetupFlow {
    MOESIF_METRICS_FLOW,
    MOESIF_LOGS_FLOW
}

// Persist the Moesif canvas embed details for an environment after one of the two
// setup flows completes: the Moesif organization id + application id (used to build
// the canvas iframe src) and the Management API key (kept so the app list can be
// re-fetched when editing and so a short-lived canvas token can be minted from it
// on demand). The key is shared by metrics and logs, but the two are separate setup
// flows, so this flips ONLY the calling flow's flag and leaves the other one
// untouched (it defaults to FALSE on first insert and is preserved on update).
//
// The metrics canvas and the logs canvas resolve against the same Moesif
// organization + application, so configuring one feature with a key issued for a
// different application would leave the other pointing at credentials that no
// longer match. Guarding that with a plain SELECT before the upsert would leave a
// window in which two concurrent setup flows both read "unconfigured" and then both
// wrote, so the whole check-then-write runs in one transaction:
//
//  1. Claim the row if this environment has no Moesif config yet. Every dialect's
//     form below is an atomic insert-or-ignore on the environment_id primary key,
//     so concurrent flows cannot both insert — the loser falls through to step 2
//     and validates against whatever the winner stored.
//  2. Re-read the identifiers under a row lock, so no other flow can slip a
//     different application in between the check and the write.
//  3. Reject a mismatch before either flag is committed. The environment must be
//     reconfigured from scratch to move to another Moesif application.
//  4. Write the identifiers, the key and this flow's flag against the locked row.
//
// Returns the number of affected rows.
isolated function upsertEnvironmentMoesifConfig(string environmentId, string orgId, string appId,
        string managementKey, MoesifSetupFlow flow) returns int|error {
    string trimmedOrgId = orgId.trim();
    string trimmedAppId = appId.trim();
    int affectedRows = 0;

    transaction {
        // 1. Insert the row only if this environment has no Moesif config yet.
        sql:ParameterizedQuery claimQuery;
        if dbType == MSSQL {
            claimQuery = `
                MERGE INTO environment_moesif_config WITH (HOLDLOCK) AS target
                USING (VALUES (${environmentId}, ${trimmedOrgId}, ${trimmedAppId}))
                       AS source (environment_id, canvas_org_id, canvas_app_id)
                ON (target.environment_id = source.environment_id)
                WHEN NOT MATCHED THEN
                    INSERT (environment_id, canvas_org_id, canvas_app_id)
                    VALUES (source.environment_id, source.canvas_org_id, source.canvas_app_id);
            `;
        } else if dbType == ORACLE {
            claimQuery = `
                MERGE INTO environment_moesif_config target
                USING (SELECT ${environmentId} AS environment_id, ${trimmedOrgId} AS canvas_org_id,
                              ${trimmedAppId} AS canvas_app_id FROM dual) source
                ON (target.environment_id = source.environment_id)
                WHEN NOT MATCHED THEN
                    INSERT (environment_id, canvas_org_id, canvas_app_id)
                    VALUES (source.environment_id, source.canvas_org_id, source.canvas_app_id)
            `;
        } else if dbType == POSTGRESQL {
            claimQuery = `
                INSERT INTO environment_moesif_config (environment_id, canvas_org_id, canvas_app_id)
                VALUES (${environmentId}, ${trimmedOrgId}, ${trimmedAppId})
                ON CONFLICT (environment_id) DO NOTHING
            `;
        } else {
            // MySQL / H2: a self-assignment keeps the conflict branch a no-op, so an
            // existing row is left exactly as the other flow wrote it.
            claimQuery = `
                INSERT INTO environment_moesif_config (environment_id, canvas_org_id, canvas_app_id)
                VALUES (${environmentId}, ${trimmedOrgId}, ${trimmedAppId})
                ON DUPLICATE KEY UPDATE environment_id = environment_id
            `;
        }
        _ = check dbClient->execute(claimQuery);

        // 2. Re-read the now-guaranteed-present row under a row lock.
        sql:ParameterizedQuery lockQuery;
        if dbType == MSSQL {
            lockQuery = `SELECT canvas_org_id, canvas_app_id FROM environment_moesif_config
                WITH (UPDLOCK, ROWLOCK) WHERE environment_id = ${environmentId}`;
        } else {
            lockQuery = `SELECT canvas_org_id, canvas_app_id FROM environment_moesif_config
                WHERE environment_id = ${environmentId} FOR UPDATE`;
        }
        EnvironmentMoesifApplication existing = check dbClient->queryRow(lockQuery);

        // 3. Reject a key issued for a different Moesif application. Identifiers that
        //    are still unset (the row we just claimed, or one written before they were
        //    recorded) are free to take the incoming values.
        string storedOrgId = (existing.canvas_org_id ?: "").trim();
        string storedAppId = (existing.canvas_app_id ?: "").trim();
        boolean unset = storedOrgId.length() == 0 && storedAppId.length() == 0;
        if !unset && (storedOrgId != trimmedOrgId || storedAppId != trimmedAppId) {
            fail error(string `This environment is already configured with a different Moesif application `
                + string `(organization '${storedOrgId}', application '${storedAppId}'). Moesif metrics and logs `
                + string `share one application per environment, so use a Management API key issued for that `
                + string `application, or reset the environment's Moesif configuration before switching.`);
        }

        // 4. Write the identifiers, the key and only this flow's flag.
        sql:ParameterizedQuery setUpdatedAt = dbType == MSSQL ? `GETDATE()` : `CURRENT_TIMESTAMP`;
        sql:ParameterizedQuery setFlag = flow == MOESIF_METRICS_FLOW
            ? `dashboards_created = ${true}`
            : `logs_configured = ${true}`;
        sql:ParameterizedQuery updateQuery = sql:queryConcat(
            `UPDATE environment_moesif_config SET canvas_org_id = ${trimmedOrgId}, `,
            `canvas_app_id = ${trimmedAppId}, management_key = ${managementKey}, `,
            setFlag, `, updated_at = `, setUpdatedAt,
            ` WHERE environment_id = ${environmentId}`
        );
        sql:ExecutionResult result = check dbClient->execute(updateQuery);
        affectedRows = result.affectedRowCount ?: 0;

        check commit;
    } on fail error e {
        return e;
    }

    return affectedRows;
}

// Persist the Moesif canvas embed details for an environment after the metrics
// dashboards are linked. Flips ONLY dashboards_created and leaves logs_configured
// untouched. See upsertEnvironmentMoesifConfig for the shared-application guard.
// Returns the number of affected rows.
public isolated function updateComponentMoesifDashboardDetails(string environmentId, string orgId, string appId,
        string managementKey) returns int|error {
    return upsertEnvironmentMoesifConfig(environmentId, orgId, appId, managementKey, MOESIF_METRICS_FLOW);
}

// Persist the Moesif canvas embed details for an environment after the logs canvas
// is linked. Flips ONLY logs_configured and leaves dashboards_created untouched.
// See upsertEnvironmentMoesifConfig for the shared-application guard. Returns the
// number of affected rows.
public isolated function updateComponentMoesifLogsDetails(string environmentId, string orgId, string appId,
        string managementKey) returns int|error {
    return upsertEnvironmentMoesifConfig(environmentId, orgId, appId, managementKey, MOESIF_LOGS_FLOW);
}

// Delete a component by ID
public isolated function deleteComponent(string componentId) returns error? {
    // Revoke all org secrets bound to this component (detaches runtimes + deletes secrets).
    check revokeAllSecretsForComponent(componentId);

    // Explicitly delete dependent mi_runtime_control_commands rows.
    // Required for MSSQL where ON DELETE CASCADE is not used (multiple cascade path restriction);
    // safe to do unconditionally for all other dialects as well.
    sql:ParameterizedQuery deleteCmdQuery = `DELETE FROM mi_runtime_control_commands WHERE component_id = ${componentId}`;
    var cmdResult = dbClient->execute(deleteCmdQuery);
    if cmdResult is sql:Error {
        log:printError(string `Failed to delete mi_runtime_control_commands for component ${componentId}`, 'error = cmdResult);
        return error("An unexpected error occurred. Please contact your administrator.", cmdResult);
    }

    // Explicitly delete group_role_mapping rows scoped to this integration (component).
    // Required for MSSQL where fk_grp_role_integration is ON DELETE NO ACTION (multiple
    // cascade path restriction); safe to do unconditionally for all other dialects as well.
    sql:ParameterizedQuery deleteRoleMappingQuery = `DELETE FROM group_role_mapping WHERE integration_uuid = ${componentId}`;
    var roleMappingResult = dbClient->execute(deleteRoleMappingQuery);
    if roleMappingResult is sql:Error {
        log:printError(string `Failed to delete group role mappings for component ${componentId}`, 'error = roleMappingResult);
        return error("An unexpected error occurred. Please contact your administrator.", roleMappingResult);
    }
    log:printInfo(string `Removed all role mappings scoped to component`, componentId = componentId);

    sql:ParameterizedQuery deleteQuery = `DELETE FROM components WHERE component_id = ${componentId}`;
    var result = dbClient->execute(deleteQuery);
    if result is sql:Error {
        log:printError(string `Failed to delete component ${componentId}`, 'error = result);
        match classifySqlError(result) {
            FOREIGN_KEY_VIOLATION => { return error("Cannot delete component because it has dependent resources", result); }
            _ => { return error("An unexpected error occurred. Please contact your administrator.", result); }
        }
    }
    log:printInfo(string `Successfully deleted component ${componentId}`);
    return ();
}

// Update component name and/or description
// `displayType` and `componentSubType` are written as a pair: a subtype only
// qualifies a display_type, so passing a displayType clears any stale subtype when
// componentSubType is nil. Passing displayType as nil leaves both columns alone.
public isolated function updateComponent(string componentId, string? name, string? displayName, string? description, string updatedBy,
        string? displayType = (), string? componentSubType = ()) returns error? {
    sql:ParameterizedQuery whereClause = ` WHERE component_id = ${componentId} `;
    sql:ParameterizedQuery updateFields = ` SET updated_at = CURRENT_TIMESTAMP, updated_by = ${updatedBy} `;

    if name is string {
        updateFields = sql:queryConcat(updateFields, `, name = ${name} `);
    }
    if displayName is string {
        updateFields = sql:queryConcat(updateFields, `, display_name = ${displayName} `);
    }
    if description is string {
        updateFields = sql:queryConcat(updateFields, `, description = ${description} `);
    }
    if displayType is string {
        // The persisted runtime, not the caller's — technology is not editable.
        string runtimeType = check getComponentRuntimeType(componentId);
        check validateIntegrationMetadata(runtimeType, displayType, componentSubType);
        updateFields = sql:queryConcat(updateFields, `, display_type = ${displayType}, component_sub_type = ${componentSubType} `);
    }

    sql:ParameterizedQuery updateQuery = sql:queryConcat(`UPDATE components `, updateFields, whereClause);
    var result = dbClient->execute(updateQuery);
    if result is sql:Error {
        log:printError(string `Failed to update component ${componentId}`, 'error = result);
        match classifySqlError(result) {
            DUPLICATE_KEY => { return error("A component with this name already exists in this project", result); }
            VALUE_TOO_LONG => { return error("The provided value exceeds the maximum allowed length", result); }
            _ => { return error("An unexpected error occurred. Please contact your administrator.", result); }
        }
    }
    log:printInfo(string `Successfully updated component ${componentId}`);

    if name is string {
        error? cascadeErr = updateOrgSecretsComponentName(componentId, name);
        if cascadeErr is error {
            log:printError(string `Failed to cascade component name change to org_secrets for ${componentId}`, 'error = cascadeErr);
        }
    }

    return ();
}

// Get component deployment information from runtimes table
public isolated function getComponentDeployment(string componentId, string environmentId, string versionId) returns types:ComponentDeployment?|error {
    log:printDebug(string `Fetching deployment info for component: ${componentId}, environment: ${environmentId}`);

    sql:ParameterizedQuery query = `
        SELECT runtime_id, runtime_type, status, environment_id, project_id, component_id, version,
               platform_name, platform_version, platform_home, os_name, os_version,
               registration_time, last_heartbeat
        FROM runtimes
        WHERE component_id = ${componentId} AND environment_id = ${environmentId}
        ORDER BY last_heartbeat DESC
    `;

    query = appendLimitClause(query, 1);

    stream<types:RuntimeDBRecord, sql:Error?> runtimeStream = dbClient->query(query);

    types:RuntimeDBRecord[] runtimeRecords = check from types:RuntimeDBRecord runtimeRecord in runtimeStream
        select runtimeRecord;

    if runtimeRecords.length() == 0 {
        log:printDebug(string `No runtime found for component ${componentId} in environment ${environmentId}`);
        return ();
    }

    types:RuntimeDBRecord runtime = runtimeRecords[0];
    types:Component component = check getComponentById(componentId);

    int configCount = 0;
    types:Service[] services = check getServicesForRuntime(runtime.runtime_id);
    types:Listener[] listeners = check getListenersForRuntime(runtime.runtime_id);
    configCount = services.length() + listeners.length();

    types:BuildInfo buildInfo = {
        buildId: runtime.runtime_id,
        deployedAt: runtime?.last_heartbeat is time:Civil
            ? time:utcToString(check convertDbDateTimeToUtc(<time:Civil>runtime?.last_heartbeat))
            : (),
        'commit: (),
        sourceConfigMigrationStatus: (),
        runId: runtime.runtime_id
    };

    types:ComponentDeployment deployment = {
        environmentId: environmentId,
        configCount: configCount,
        apiId: component?.apiId,
        releaseId: runtime.runtime_id,
        apiRevision: (),
        build: buildInfo,
        imageUrl: "",
        invokeUrl: "",
        versionId: versionId,
        deploymentStatus: runtime.status,
        deploymentStatusV2: runtime.status,
        version: runtime?.version,
        cron: (),
        cronTimezone: ()
    };

    log:printDebug(string `Retrieved deployment info for component ${componentId}`,
            status = runtime.status,
            configCount = configCount);

    return deployment;
}

// Get artifact types for a component
public isolated function getArtifactTypesForComponent(string componentId, types:RuntimeType componentType, string? environmentId = ()) returns types:ArtifactTypeCount[]|error {
    types:ArtifactTypeCount[] artifactTypes = [];

    sql:ParameterizedQuery runtimeQuery = `SELECT DISTINCT runtime_id FROM runtimes WHERE component_id = ${componentId}`;
    if environmentId is string {
        runtimeQuery = sql:queryConcat(runtimeQuery, ` AND environment_id = ${environmentId}`);
    }
    stream<record {|string runtime_id;|}, sql:Error?> runtimeStream = dbClient->query(runtimeQuery);

    string[] runtimeIds = [];
    check from record {|string runtime_id;|} runtime in runtimeStream
        do {
            runtimeIds.push(runtime.runtime_id);
        };

    if runtimeIds.length() == 0 {
        return [];
    }

    sql:ParameterizedQuery runtimeInClause = ` WHERE runtime_id IN (`;
    foreach int i in 0 ..< runtimeIds.length() {
        if i > 0 {
            runtimeInClause = sql:queryConcat(runtimeInClause, `, `);
        }
        runtimeInClause = sql:queryConcat(runtimeInClause, `${runtimeIds[i]}`);
    }
    runtimeInClause = sql:queryConcat(runtimeInClause, `) `);

    sql:ParameterizedQuery countQuery = `SELECT COUNT(*) as count FROM `;

    int serviceCount = check getCount(sql:queryConcat(countQuery, `bi_service_artifacts `, runtimeInClause));
    if serviceCount > 0 {
        artifactTypes.push({artifactType: types:SERVICE, artifactCount: serviceCount});
    }

    int listenerCount = check getCount(sql:queryConcat(countQuery, `bi_runtime_listener_artifacts `, runtimeInClause));
    if listenerCount > 0 {
        artifactTypes.push({artifactType: types:LISTENER, artifactCount: listenerCount});
    }

    if componentType == types:MI {
        int apiCount = check getCount(sql:queryConcat(countQuery, `mi_api_artifacts `, runtimeInClause));
        if apiCount > 0 {
            artifactTypes.push({artifactType: types:RESTAPI, artifactCount: apiCount});
        }

        int proxyCount = check getCount(sql:queryConcat(countQuery, `mi_proxy_service_artifacts `, runtimeInClause));
        if proxyCount > 0 {
            artifactTypes.push({artifactType: types:PROXYSERVICE, artifactCount: proxyCount});
        }

        int endpointCount = check getCount(sql:queryConcat(countQuery, `mi_endpoint_artifacts `, runtimeInClause));
        if endpointCount > 0 {
            artifactTypes.push({artifactType: types:ENDPOINT, artifactCount: endpointCount});
        }

        int inboundCount = check getCount(sql:queryConcat(countQuery, `mi_inbound_endpoint_artifacts `, runtimeInClause));
        if inboundCount > 0 {
            artifactTypes.push({artifactType: types:INBOUNDENDPOINT, artifactCount: inboundCount});
        }

        int sequenceCount = check getCount(sql:queryConcat(countQuery, `mi_sequence_artifacts `, runtimeInClause));
        if sequenceCount > 0 {
            artifactTypes.push({artifactType: types:SEQUENCE, artifactCount: sequenceCount});
        }

        int taskCount = check getCount(sql:queryConcat(countQuery, `mi_task_artifacts `, runtimeInClause));
        if taskCount > 0 {
            artifactTypes.push({artifactType: types:TASK, artifactCount: taskCount});
        }

        int templateCount = check getCount(sql:queryConcat(countQuery, `mi_template_artifacts `, runtimeInClause));
        if templateCount > 0 {
            artifactTypes.push({artifactType: types:TEMPLATE, artifactCount: templateCount});
        }

        int storeCount = check getCount(sql:queryConcat(countQuery, `mi_message_store_artifacts `, runtimeInClause));
        if storeCount > 0 {
            artifactTypes.push({artifactType: types:MESSAGESTORE, artifactCount: storeCount});
        }

        int processorCount = check getCount(sql:queryConcat(countQuery, `mi_message_processor_artifacts `, runtimeInClause));
        if processorCount > 0 {
            artifactTypes.push({artifactType: types:MESSAGEPROCESSOR, artifactCount: processorCount});
        }

        int entryCount = check getCount(sql:queryConcat(countQuery, `mi_local_entry_artifacts `, runtimeInClause));
        if entryCount > 0 {
            artifactTypes.push({artifactType: types:LOCALENTRY, artifactCount: entryCount});
        }

        int dataServiceCount = check getCount(sql:queryConcat(countQuery, `mi_data_service_artifacts `, runtimeInClause));
        if dataServiceCount > 0 {
            artifactTypes.push({artifactType: types:DATASERVICE, artifactCount: dataServiceCount});
        }

        int appCount = check getCount(sql:queryConcat(countQuery, `mi_composite_app_artifacts `, runtimeInClause));
        if appCount > 0 {
            artifactTypes.push({artifactType: types:COMPOSITEAPP, artifactCount: appCount});
        }

        int sourceCount = check getCount(sql:queryConcat(countQuery, `mi_data_source_artifacts `, runtimeInClause));
        if sourceCount > 0 {
            artifactTypes.push({artifactType: types:DATASOURCE, artifactCount: sourceCount});
        }

        int connectorCount = check getCount(sql:queryConcat(countQuery, `mi_connector_artifacts `, runtimeInClause));
        if connectorCount > 0 {
            artifactTypes.push({artifactType: types:CONNECTOR, artifactCount: connectorCount});
        }

        int resourceCount = check getCount(sql:queryConcat(countQuery, `mi_registry_resource_artifacts `, runtimeInClause));
        if resourceCount > 0 {
            artifactTypes.push({artifactType: types:REGISTRYRESOURCE, artifactCount: resourceCount});
        }
    }

    return artifactTypes;
}

// Helper function to map database record to Component type
isolated function mapToComponent(types:ComponentInDB component) returns types:Component {
    return {
        id: component.component_id,
        projectId: component.project_id,
        orgHandler: component.project_handler,
        orgId: component.project_org_id,
        name: component.component_name,
        handler: component.component_name,
        displayName: component.component_display_name ?: component.component_name,
        displayType: component.component_display_type ?: "service",
        description: component.component_description,
        status: "active",
        initStatus: "completed",
        version: "v1.0.0",
        createdAt: component.component_created_at ?: "",
        lastBuildDate: component.component_updated_at,
        updatedAt: component.component_updated_at,
        componentSubType: component.component_sub_type,
        componentType: component.component_type == "MI" ? types:MI : types:BI,
        labels: (),
        isSystemComponent: false,
        apiVersions: [],
        deploymentTracks: [],
        gitProvider: component.project_git_provider,
        gitOrganization: component.project_git_organization,
        gitRepository: component.project_repository,
        branch: component.project_branch,
        endpoints: [],
        environmentVariables: [],
        secrets: [],
        componentId: component.component_id,
        project: {
            id: component.project_id,
            orgId: component.project_org_id,
            name: component.project_name,
            version: component.project_version,
            createdDate: component.project_created_date,
            handler: component.project_handler,
            region: component.project_region,
            description: component.project_description,
            'type: component.project_type,
            gitProvider: component.project_git_provider,
            gitOrganization: component.project_git_organization,
            repository: component.project_repository,
            branch: component.project_branch,
            secretRef: component.project_secret_ref,
            createdBy: component.project_created_by,
            updatedAt: component.project_updated_at,
            updatedBy: component.project_updated_by
        },
        createdBy: getDisplayNameById(component.component_created_by),
        updatedBy: getDisplayNameById(component.component_updated_by)
    };
}

// Records that a component is a workflow integration, if it is not already typed as
// something an operator chose.
//
// A component auto-created by older versions carries the generic integration type: the
// bridge registers a runtime before anything knows whether the integration contains
// workflows, so registration cannot tell. The first heartbeat that carries workflow
// metadata settles it — the integration registered workflows with its runtime — and the
// integration-level Workflows view keys on the integration type, so without this an
// auto-registered workflow integration shows no workflow features at all. (Creating the
// integration by hand and picking Workflow sets the type up front, which is why that
// path has always worked.)
//
// Only the generic type is promoted, and only for Ballerina components, since the
// workflow engine is Ballerina-only: a type an operator chose deliberately is left
// alone, and re-running this is a no-op. New registrations use "unspecified" and
// stay unclassified until an operator selects a type.
//
// + componentId - The component the reporting runtime belongs to
// + return - An error only if the update itself fails
public isolated function promoteToWorkflowIntegration(string componentId) returns error? {
    sql:ExecutionResult result = check dbClient->execute(`
        UPDATE components
        SET display_type = ${WORKFLOW_DISPLAY_TYPE}
        WHERE component_id = ${componentId}
            AND component_type = ${types:BI}
            AND display_type = ${GENERIC_DISPLAY_TYPE}
    `);
    int? affected = result.affectedRowCount;
    if affected is int && affected > 0 {
        log:printInfo(string `Component ${componentId} reported workflows; recorded it as a ` +
                string `${WORKFLOW_DISPLAY_TYPE} integration`);
    }
}
