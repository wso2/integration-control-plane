// Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
//
// WSO2 LLC. licenses this file to you under the Apache License,
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
import icp_server.utils;

import ballerina/log;
import ballerina/sql;
import ballerina/uuid;

isolated function generateKeyId() returns string|error {
    // Try up to 5 times to produce a collision-free 8-char key ID.
    foreach int attempt in 0 ..< 5 {
        string candidate = utils:secureRandomHex(4);
        log:printDebug(string `generateKeyId: attempt ${attempt}, candidate=${candidate}`);

        stream<record {|int cnt;|}, sql:Error?> s =
            dbClient->query(`SELECT COUNT(*) AS cnt FROM org_secrets WHERE key_id = ${candidate}`);
        record {|int cnt;|}[] rows = check from record {|int cnt;|} r in s
            select r;

        if rows[0].cnt == 0 {
            log:printDebug(string `generateKeyId: candidate=${candidate} is unique`);
            return candidate;
        }
        log:printDebug(string `generateKeyId: candidate=${candidate} collided, retrying`);
    }
    return error("Failed to generate a unique key ID after 5 attempts");
}

isolated function generateKeyMaterial() returns string {
    // 256 bits of java.security.SecureRandom randomness, base64-encoded.
    // (Previously two ballerina/uuid values - backed by the non-cryptographic
    // java.util.Random - concatenated together; see WSO2 security review.)
    return utils:secureRandomBytes(32).toBase64();
}

// Create a new org-level secret for the given environment.
// Returns the full secret string `<keyId>.<keyMaterial>` — shown once, never retrievable again.
public isolated function createOrgSecret(string environmentId, string createdBy) returns string|error {
    string keyId = check generateKeyId();
    string keyMaterial = generateKeyMaterial();

    log:printDebug(string `createOrgSecret: inserting keyId=${keyId} for environment=${environmentId}, createdBy=${createdBy}`);

    sql:ExecutionResult|sql:Error result = dbClient->execute(`
        INSERT INTO org_secrets (key_id, environment_id, key_material, created_by)
        VALUES (${keyId}, ${environmentId}, ${keyMaterial}, ${createdBy})
    `);

    if result is sql:Error {
        log:printError(string `createOrgSecret: insert failed for keyId=${keyId}, environment=${environmentId}`, 'error = result);
        match classifySqlError(result) {
            DUPLICATE_KEY => {
                return error("A secret with this key ID already exists. Please retry.", result);
            }
            FOREIGN_KEY_VIOLATION => {
                return error("The specified environment does not exist", result);
            }
            _ => {
                return error("Failed to create org secret", result);
            }
        }
    }

    log:printInfo(string `createOrgSecret: created keyId=${keyId} for environment=${environmentId}`);
    return keyId + "." + keyMaterial;
}

public isolated function createComponentEnvBoundOrgSecret(string environmentId, string createdBy, string projectId,
        string componentId, string projectHandler, string componentName, string runtimeType) returns string|error {
    string keyId = check generateKeyId();
    string keyMaterial = generateKeyMaterial();

    log:printDebug(string `createComponentEnvBoundOrgSecret: inserting keyId=${keyId} for environment=${environmentId}, componentId=${componentId}, createdBy=${createdBy}`);

    sql:ExecutionResult|sql:Error result = dbClient->execute(`
        INSERT INTO org_secrets (
            key_id, environment_id, key_material, project_id, component_id,
            project_handler, component_name, runtime_type, created_by
        )
        VALUES (
            ${keyId}, ${environmentId}, ${keyMaterial}, ${projectId}, ${componentId},
            ${projectHandler}, ${componentName}, ${runtimeType}, ${createdBy}
        )
    `);

    if result is sql:Error {
        log:printError(string `createComponentEnvBoundOrgSecret: insert failed for keyId=${keyId}, environment=${environmentId}, componentId=${componentId}`,
                'error = result);
        match classifySqlError(result) {
            DUPLICATE_KEY => {
                return error("A secret with this key ID already exists. Please retry.", result);
            }
            FOREIGN_KEY_VIOLATION => {
                return error("The specified environment or component does not exist", result);
            }
            _ => {
                return error("Failed to create component-bound org secret", result);
            }
        }
    }

    log:printInfo(string `createBoundOrgSecret: created keyId=${keyId} for environment=${environmentId}, componentId=${componentId}`);
    return keyId + "." + keyMaterial;
}

// List all org-level secrets, optionally filtered by environment.
// Returns truncated entries (keyId + "....") — key material is never returned.
public isolated function listOrgSecrets(string? environmentId = ()) returns types:OrgSecretListEntry[]|error {
    log:printDebug(string `listOrgSecrets: environmentId=${environmentId ?: "all"}`);

    // 1/0 works on every supported dialect (Oracle has no TRUE/FALSE literals,
    // and its NUMBER type cannot map to a boolean field), so read bound as an
    // int and convert.
    sql:ParameterizedQuery query = `
        SELECT os.key_id, os.environment_id, e.name AS environment_name,
               CASE WHEN os.bound_at IS NOT NULL THEN 1 ELSE 0 END AS bound,
               os.created_at, os.created_by
        FROM org_secrets os
        JOIN environments e ON os.environment_id = e.environment_id`;

    if environmentId is string {
        query = sql:queryConcat(query, ` WHERE os.environment_id = ${environmentId}`);
    }

    query = sql:queryConcat(query, ` ORDER BY os.created_at DESC`);

    stream<record {|
        string key_id;
        string environment_id;
        string environment_name;
        int bound;
        string created_at;
        string? created_by;
    |}, sql:Error?> s = dbClient->query(query);

    types:OrgSecretListEntry[] entries = check from var row in s
        select {
            keyId: row.key_id,
            environmentId: row.environment_id,
            environmentName: row.environment_name,
            bound: row.bound == 1,
            createdAt: row.created_at,
            createdBy: getDisplayNameById(row.created_by)
        };

    log:printDebug(string `listOrgSecrets: found ${entries.length()} entries`);
    return entries;
}

// Revoke (delete) an org secret by key ID.
// This is the ONLY correct way to delete an org_secrets row. MSSQL uses
// ON DELETE NO ACTION for runtimes.key_id (multiple cascade path restriction),
// so the app layer must detach runtimes before deleting the secret.
// All code paths that remove secrets — including component deletion — must
// go through this function or revokeAllSecretsForComponent().
public isolated function revokeOrgSecret(string keyId) returns error? {
    log:printDebug(string `revokeOrgSecret: keyId=${keyId}`);

    transaction {
        _ = check dbClient->execute(
            `UPDATE runtimes SET key_id = NULL WHERE key_id = ${keyId}`
        );

        sql:ExecutionResult result = check dbClient->execute(
            `DELETE FROM org_secrets WHERE key_id = ${keyId}`
        );

        if result.affectedRowCount == 0 {
            log:printWarn(string `revokeOrgSecret: keyId=${keyId} not found`);
            fail error(string `Secret with key ID '${keyId}' not found`);
        }

        check commit;
    } on fail error e {
        log:printError(string `revokeOrgSecret: failed for keyId=${keyId}`, 'error = e);
        return e;
    }

    log:printInfo(string `revokeOrgSecret: revoked keyId=${keyId}`);
}

// Revoke all org secrets bound to a component. Used by deleteComponent()
// to clean up before the component row is removed.
public isolated function revokeAllSecretsForComponent(string componentId) returns error? {
    log:printDebug(string `revokeAllSecretsForComponent: componentId=${componentId}`);

    stream<record {|string key_id;|}, sql:Error?> s =
        dbClient->query(`SELECT key_id FROM org_secrets WHERE component_id = ${componentId}`);
    string[] keyIds = check from var r in s
        select r.key_id;

    foreach string kid in keyIds {
        check revokeOrgSecret(kid);
    }

    log:printInfo(string `revokeAllSecretsForComponent: revoked ${keyIds.length()} secrets for componentId=${componentId}`);
}

// ---------------------------------------------------------------------------
// M2: kid-based secret lookup, binding, and auto-creation
// ---------------------------------------------------------------------------

isolated function inferComponentType(string runtimeType) returns string {
    if runtimeType == "MI" {
        return "MI";
    }
    return "BI";
}

public isolated function lookupOrgSecretByKeyId(string keyId) returns types:OrgSecret|error {
    log:printDebug(string `lookupOrgSecretByKeyId: keyId=${keyId}`);

    stream<types:OrgSecret, sql:Error?> s = dbClient->query(`
        SELECT key_id, environment_id, key_material, project_id, component_id,
               project_handler, component_name, runtime_type, bound_at, created_at, created_by
        FROM org_secrets WHERE key_id = ${keyId}
    `);
    types:OrgSecret[] rows = check from types:OrgSecret r in s
        select r;

    if rows.length() == 0 {
        log:printWarn(string `lookupOrgSecretByKeyId: keyId=${keyId} not found`);
        return error(string `Unknown key ID '${keyId}'`);
    }

    log:printDebug(string `lookupOrgSecretByKeyId: found keyId=${keyId}, bound=${rows[0].componentId is string}`);
    return rows[0];
}

public isolated function bindOrgSecret(string keyId, string projectId, string componentId,
        string projectHandler, string componentName, string runtimeType) returns error? {
    log:printDebug(string `bindOrgSecret: keyId=${keyId}, projectId=${projectId}, componentId=${componentId}, runtimeType=${runtimeType}`);

    sql:ExecutionResult result = check dbClient->execute(`
        UPDATE org_secrets
        SET project_id = ${projectId}, component_id = ${componentId},
            project_handler = ${projectHandler}, component_name = ${componentName},
            runtime_type = ${runtimeType},
            bound_at = CURRENT_TIMESTAMP
        WHERE key_id = ${keyId} AND component_id IS NULL
    `);

    if result.affectedRowCount == 0 {
        types:OrgSecret current = check lookupOrgSecretByKeyId(keyId);
        if current.projectId != projectId || current.componentId != componentId {
            log:printWarn(string `bindOrgSecret: race — keyId=${keyId} already bound to project=${current.projectId ?: "?"}, component=${current.componentId ?: "?"}`);
            return error(string `Key ID '${keyId}' is already bound to a different project/component`);
        }
        log:printDebug(string `bindOrgSecret: keyId=${keyId} already bound to same project/component — no-op`);
        return;
    }

    log:printInfo(string `bindOrgSecret: bound keyId=${keyId} to project=${projectId}, component=${componentId}`);
}

public isolated function updateRuntimeKeyId(string runtimeId, string keyId) returns error? {
    log:printDebug(string `updateRuntimeKeyId: runtimeId=${runtimeId}, keyId=${keyId}`);

    _ = check dbClient->execute(`
        UPDATE runtimes SET key_id = ${keyId} WHERE runtime_id = ${runtimeId}
    `);

    log:printDebug(string `updateRuntimeKeyId: recorded keyId=${keyId} on runtime=${runtimeId}`);
}

# The key a runtime last authenticated with, or `()` when the runtime is unknown or has
# never had a key recorded. Used to refuse workflow command results posted with a key
# that is not the target runtime's own.
public isolated function getRuntimeKeyId(string runtimeId) returns string?|error {
    record {|string? key_id;|}|sql:Error row = dbClient->queryRow(`
        SELECT key_id FROM runtimes WHERE runtime_id = ${runtimeId}
    `);
    if row is sql:NoRowsError {
        return ();
    }
    if row is sql:Error {
        return row;
    }
    return row.key_id;
}

public isolated function resolveOrCreateProject(string handler, string? createdBy) returns string|error {
    log:printDebug(string `resolveOrCreateProject: handler=${handler}, createdBy=${createdBy ?: "null"}`);

    string|error existing = getProjectIdByHandler(handler, DEFAULT_ORG_ID);
    if existing is string {
        log:printDebug(string `resolveOrCreateProject: found existing project=${existing} for handler=${handler}`);
        return existing;
    }

    log:printInfo(string `resolveOrCreateProject: auto-creating project for handler=${handler}`);
    string projectId = uuid:createType1AsString();

    do {
        transaction {
            _ = check dbClient->execute(`
                INSERT INTO projects (project_id, org_id, name, handler, owner_id, created_by)
                VALUES (${projectId}, ${DEFAULT_ORG_ID}, ${handler}, ${handler}, ${createdBy}, ${createdBy})
            `);

            string adminGroupId = uuid:createType1AsString();
            string groupName = string `${handler} Admins`;

            sql:ExecutionResult|sql:Error groupRes = dbClient->execute(`
                INSERT INTO user_groups (group_id, group_name, org_uuid, description)
                VALUES (${adminGroupId}, ${groupName}, ${DEFAULT_ORG_ID}, ${string `Admin group for project: ${handler}`})
            `);
            if groupRes is sql:Error {
                if classifySqlError(groupRes) == DUPLICATE_KEY {
                    record {|string group_id;|}|sql:Error existingGroup = dbClient->queryRow(`
                        SELECT group_id FROM user_groups
                        WHERE group_name = ${groupName} AND org_uuid = ${DEFAULT_ORG_ID}
                    `);
                    if existingGroup is record {|string group_id;|} {
                        adminGroupId = existingGroup.group_id;
                        log:printWarn(string `resolveOrCreateProject: reusing existing admin group for handler=${handler}`, groupId = adminGroupId);
                    } else {
                        log:printError(string `resolveOrCreateProject: duplicate admin group but lookup failed for handler=${handler}`, 'error = existingGroup);
                        fail error("Failed to resolve duplicate project admin group", existingGroup);
                    }
                } else {
                    log:printError(string `resolveOrCreateProject: failed to create admin group for handler=${handler}`, 'error = groupRes);
                    fail error("Failed to set up project admin group", groupRes);
                }
            }

            string roleId = check getProjectAdminRoleId();

            sql:ExecutionResult|sql:Error roleRes = dbClient->execute(`
                INSERT INTO group_role_mapping (group_id, role_id, org_uuid, project_uuid)
                VALUES (${adminGroupId}, ${roleId}, ${DEFAULT_ORG_ID}, ${projectId})
            `);
            if roleRes is sql:Error {
                log:printError(string `resolveOrCreateProject: failed to map admin role for handler=${handler}`, 'error = roleRes);
                fail error("Failed to set up project admin role", roleRes);
            }

            if createdBy is string {
                sql:ExecutionResult|sql:Error userRes = dbClient->execute(`
                    INSERT INTO group_user_mapping (group_id, user_uuid)
                    VALUES (${adminGroupId}, ${createdBy})
                `);
                if userRes is sql:Error {
                    if classifySqlError(userRes) == DUPLICATE_KEY {
                        log:printWarn(string `resolveOrCreateProject: creator already belongs to admin group for handler=${handler}`, groupId = adminGroupId, userId = createdBy);
                    } else {
                        log:printError(string `resolveOrCreateProject: failed to add creator to admin group for handler=${handler}`, 'error = userRes);
                        fail error("Failed to add user to project admin group", userRes);
                    }
                }
            }

            check commit;
        }
    } on fail error e {
        if e is sql:Error && classifySqlError(e) == DUPLICATE_KEY {
            log:printDebug(string `resolveOrCreateProject: concurrent insert detected for handler=${handler}, re-querying`);
            string|error found = getProjectIdByHandler(handler, DEFAULT_ORG_ID);
            if found is string {
                return found;
            }
            return error(string `Project concurrent insert race for '${handler}'`, found);
        }
        log:printError(string `resolveOrCreateProject: transaction failed for handler=${handler}`, 'error = e);
        return error(string `Failed to auto-create project '${handler}'`, e);
    }

    log:printInfo(string `resolveOrCreateProject: created project=${projectId} for handler=${handler}`);
    return projectId;
}

public isolated function resolveOrCreateComponent(string projectId, string name, string runtimeType, string? createdBy) returns string|error {
    log:printDebug(string `resolveOrCreateComponent: projectId=${projectId}, name=${name}, runtimeType=${runtimeType}`);

    string expectedType = inferComponentType(runtimeType);

    stream<record {|string component_id; string component_type;|}, sql:Error?> s = dbClient->query(`
        SELECT component_id, component_type FROM components WHERE project_id = ${projectId} AND name = ${name}
    `);
    record {|string component_id; string component_type;|}[] rows = check from record {|string component_id; string component_type;|} r in s
        select r;

    if rows.length() > 0 {
        if rows[0].component_type != expectedType {
            log:printError(string `resolveOrCreateComponent: type mismatch for component=${name}: existing=${rows[0].component_type}, expected=${expectedType}`);
            return error(string `Component '${name}' exists with type '${rows[0].component_type}', expected '${expectedType}'`);
        }
        log:printDebug(string `resolveOrCreateComponent: found existing component=${rows[0].component_id}`);
        return rows[0].component_id;
    }

    log:printInfo(string `resolveOrCreateComponent: auto-creating component=${name} under project=${projectId}`);
    string componentId = uuid:createType1AsString();
    string componentType = expectedType;

    sql:ExecutionResult|sql:Error result = dbClient->execute(`
        INSERT INTO components (component_id, project_id, name, display_name, component_type, display_type, created_by)
        VALUES (${componentId}, ${projectId}, ${name}, ${name}, ${componentType}, ${"unspecified"}, ${createdBy})
    `);

    if result is sql:Error {
        log:printError(string `resolveOrCreateComponent: insert failed for name=${name}, project=${projectId}`, 'error = result);
        if classifySqlError(result) == DUPLICATE_KEY {
            stream<record {|string component_id; string component_type;|}, sql:Error?> retryStream = dbClient->query(
                `SELECT component_id, component_type FROM components WHERE project_id = ${projectId} AND name = ${name}`
            );
            record {|string component_id; string component_type;|}[] existing = check from record {|string component_id; string component_type;|} r in retryStream
                select r;
            if existing.length() > 0 {
                if existing[0].component_type != expectedType {
                    log:printError(string `resolveOrCreateComponent: type mismatch on retry for component=${name}: existing=${existing[0].component_type}, expected=${expectedType}`);
                    return error(string `Component '${name}' exists with type '${existing[0].component_type}', expected '${expectedType}'`);
                }
                return existing[0].component_id;
            }
        }
        return error(string `Failed to auto-create component '${name}'`, result);
    }

    log:printInfo(string `resolveOrCreateComponent: created component=${componentId}, type=${componentType}`);
    return componentId;
}

public isolated function updateOrgSecretsComponentName(string componentId, string newName) returns error? {
    log:printDebug(string `updateOrgSecretsComponentName: componentId=${componentId}, newName=${newName}`);

    sql:ExecutionResult result = check dbClient->execute(`
        UPDATE org_secrets SET component_name = ${newName}
        WHERE component_id = ${componentId}
    `);

    log:printInfo(string `updateOrgSecretsComponentName: updated ${result.affectedRowCount ?: 0} rows for componentId=${componentId}`);
}

// Resolve the key_id and HMAC key material for a runtime via runtimes.key_id → org_secrets.key_material.
// Returns error if the runtime has no key_id (hasn't sent a full heartbeat yet).
public isolated function resolveKeyIdAndMaterialByRuntimeId(string runtimeId) returns record {|string keyId; string keyMaterial;|}|error {
    log:printDebug(string `resolveKeyIdAndMaterialByRuntimeId: runtimeId=${runtimeId}`);

    stream<record {|string? key_id; string? key_material;|}, sql:Error?> s =
        dbClient->query(`
            SELECT r.key_id, os.key_material
            FROM runtimes r
            LEFT JOIN org_secrets os ON os.key_id = r.key_id
            WHERE r.runtime_id = ${runtimeId}
        `);
    record {|string? key_id; string? key_material;|}[] rows = check from var r in s
        select r;

    if rows.length() == 0 {
        return error(string `Runtime '${runtimeId}' not found`);
    }

    string? keyId = rows[0].key_id;
    if keyId is () {
        log:printDebug(string `resolveKeyIdAndMaterialByRuntimeId: runtime=${runtimeId} has no key_id yet`);
        return error(string `Runtime '${runtimeId}' has no key ID — full heartbeat required first`);
    }

    string? material = rows[0].key_material;
    if material is () || material.length() == 0 {
        log:printWarn(string `resolveKeyIdAndMaterialByRuntimeId: key_id=${keyId} found but no key_material for runtime=${runtimeId}`);
        return error(string `Key material missing for key ID '${keyId}'`);
    }

    log:printDebug(string `resolveKeyIdAndMaterialByRuntimeId: resolved key_id=${keyId} for runtime=${runtimeId}`);
    return {keyId: keyId, keyMaterial: material};
}

// List bound secrets for a component+environment, with associated runtimes.
// Single JOIN query to avoid N+1.
public isolated function listBoundSecrets(string componentId, string environmentId) returns types:BoundSecretEntry[]|error {
    log:printDebug(string `listBoundSecrets: componentId=${componentId}, environmentId=${environmentId}`);

    stream<record {|string key_id; string created_at; string? created_by; string? runtime_id; string? status;|}, sql:Error?> s =
        dbClient->query(`
            SELECT os.key_id, os.created_at, os.created_by, r.runtime_id, r.status
            FROM org_secrets os
            LEFT JOIN runtimes r ON r.key_id = os.key_id
            WHERE os.component_id = ${componentId} AND os.environment_id = ${environmentId}
            ORDER BY os.created_at DESC, r.runtime_id
        `);
    record {|string key_id; string created_at; string? created_by; string? runtime_id; string? status;|}[] rows =
        check from var r in s
        select r;

    log:printDebug(string `listBoundSecrets: fetched ${rows.length()} joined rows`);

    // Group rows by key_id, preserving insertion order.
    map<types:BoundSecretEntry> byKey = {};
    string[] keyOrder = [];
    foreach var row in rows {
        if !byKey.hasKey(row.key_id) {
            byKey[row.key_id] = {
                keyId: row.key_id,
                createdAt: row.created_at,
                createdBy: getDisplayNameById(row.created_by),
                runtimes: []
            };
            keyOrder.push(row.key_id);
        }
        if row.runtime_id is string {
            byKey.get(row.key_id).runtimes.push({runtimeId: <string>row.runtime_id, status: <string>row.status});
        }
    }

    types:BoundSecretEntry[] entries = from var k in keyOrder
        select byKey.get(k);
    log:printDebug(string `listBoundSecrets: returning ${entries.length()} entries`);
    return entries;
}

// Get the key_id for a runtime (null if none bound yet).
public isolated function getKeyIdByRuntimeId(string runtimeId) returns string?|error {
    log:printDebug(string `getKeyIdByRuntimeId: runtimeId=${runtimeId}`);

    stream<record {|string? key_id;|}, sql:Error?> s =
        dbClient->query(`SELECT key_id FROM runtimes WHERE runtime_id = ${runtimeId}`);
    record {|string? key_id;|}[] rows = check from var r in s
        select r;

    if rows.length() == 0 {
        return error(string `Runtime '${runtimeId}' not found`);
    }
    return rows[0].key_id;
}

// Count how many runtimes reference a given key_id.
public isolated function countRuntimesByKeyId(string keyId) returns int|error {
    log:printDebug(string `countRuntimesByKeyId: keyId=${keyId}`);

    stream<record {|int cnt;|}, sql:Error?> s =
        dbClient->query(`SELECT COUNT(*) AS cnt FROM runtimes WHERE key_id = ${keyId}`);
    record {|int cnt;|}[] rows = check from var r in s
        select r;
    int count = rows[0].cnt;

    log:printDebug(string `countRuntimesByKeyId: keyId=${keyId}, count=${count}`);
    return count;
}

public isolated function updateOrgSecretsProjectHandler(string projectId, string newHandler) returns error? {
    log:printDebug(string `updateOrgSecretsProjectHandler: projectId=${projectId}, newHandler=${newHandler}`);

    sql:ExecutionResult result = check dbClient->execute(`
        UPDATE org_secrets SET project_handler = ${newHandler}
        WHERE project_id = ${projectId}
    `);

    log:printInfo(string `updateOrgSecretsProjectHandler: updated ${result.affectedRowCount ?: 0} rows for projectId=${projectId}`);
}
