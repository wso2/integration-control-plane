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

// ============================================================================
// RBAC V2 - Authorization Repository
// ============================================================================
// This module provides data access functions for the group-based, 
// permission-driven authorization system (RBAC V2).
//
// Organization: All queries default to org_uuid=1 for single-tenant mode
// ============================================================================

public const int DEFAULT_ORG_ID = 1;

// ============================================================================
// 3.1 Organization Helper Functions
// ============================================================================

// Get organization ID by handle
public isolated function getOrgIdByHandle(string orgHandle) returns int|error {
    log:printDebug(string `Resolving org handle: ${orgHandle} to org ID`);
    
    record {|int org_id;|} result = check dbClient->queryRow(
        `SELECT org_id FROM organizations WHERE org_handle = ${orgHandle}`
    );
    
    return result.org_id;
}

// ============================================================================
// 3.2 Group Management Functions
// ============================================================================

// Create a new group
public isolated function createGroup(types:GroupInput input) returns string|error {
    string groupId = uuid:createType1AsString();
    int orgId = input.orgUuid ?: DEFAULT_ORG_ID;

    log:printDebug(string `Creating group: ${input.groupName} with groupId: ${groupId}`);

    sql:ExecutionResult|error result = dbClient->execute(
        `INSERT INTO user_groups (group_id, group_name, org_uuid, description) 
         VALUES (${groupId}, ${input.groupName}, ${orgId}, ${input.description})`
    );

    if result is sql:Error {
        log:printError(string `Failed to create group ${input.groupName}`, 'error = result);
        match classifySqlError(result) {
            DUPLICATE_KEY => { return error("A group with this name already exists", result); }
            VALUE_TOO_LONG => { return error("The provided value exceeds the maximum allowed length", result); }
            _ => { return error("An unexpected error occurred. Please contact your administrator.", result); }
        }
    }
    if result is error {
        log:printError(string `Failed to create group ${input.groupName}`, 'error = result);
        return result;
    }

    log:printInfo(string `Successfully created group ${input.groupName}`, groupId = groupId);
    return groupId;
}

// Get group by ID
public isolated function getGroupById(string groupId) returns types:Group|error {
    log:printDebug(string `Fetching group details for groupId: ${groupId}`);

    types:Group group = check dbClient->queryRow(
        `SELECT group_id, group_name, org_uuid, description, created_at, updated_at 
         FROM user_groups 
         WHERE group_id = ${groupId}`
    );

    return group;
}

// Return the group_id of the built-in "Super Admins" group for the default org.
// This group is seeded by the DB init scripts and is always present.
public isolated function getSuperAdminsGroupId() returns string|error {
    record {|string group_id;|}|sql:Error row = dbClient->queryRow(
        `SELECT group_id FROM user_groups
         WHERE group_name = 'Super Admins' AND org_uuid = ${DEFAULT_ORG_ID}`
    );
    if row is sql:NoRowsError {
        return error("Super Admins group not found in database");
    }
    if row is sql:Error {
        return row;
    }
    return row.group_id;
}

// Return the role_id of the built-in "Super Admin" role for the default org.
// This role is seeded by the DB init scripts and is always present.
public isolated function getSuperAdminRoleId() returns string|error {
    record {|string role_id;|}|sql:Error row = dbClient->queryRow(
        `SELECT role_id FROM roles_v2
         WHERE role_name = 'Super Admin' AND org_id = ${DEFAULT_ORG_ID}`
    );
    if row is sql:NoRowsError {
        return error("Super Admin role not found in database");
    }
    if row is sql:Error {
        return row;
    }
    return row.role_id;
}

// Get all groups for an organization
public isolated function getGroupsByOrgId(int orgId) returns types:Group[]|error {
    log:printDebug(string `Fetching groups for orgId: ${orgId}`);

    types:Group[] groups = [];
    stream<types:Group, sql:Error?> groupStream = dbClient->query(
        `SELECT group_id, group_name, org_uuid, description, created_at, updated_at 
         FROM user_groups 
         WHERE org_uuid = ${orgId}`
    );

    check from types:Group group in groupStream
        do {
            groups.push(group);
        };

    return groups;
}

// Get all groups for an organization with precomputed user and role counts
public isolated function getGroupsWithCountsByOrgId(int orgId) returns types:GroupResponse[]|error {
    log:printDebug(string `Fetching groups with counts for orgId: ${orgId}`);

    types:GroupResponse[] groups = [];
    sql:ParameterizedQuery groupsQuery;
    if isOracle() {
        // Oracle cannot GROUP BY a CLOB column — group by its VARCHAR2 projection
        groupsQuery = `SELECT ug.group_id, ug.group_name, ug.org_uuid, TO_CHAR(ug.description) AS description, ug.created_at, ug.updated_at,
                COUNT(DISTINCT egum.user_uuid) AS user_count,
                COUNT(DISTINCT grm.id) AS role_count
         FROM user_groups ug
         LEFT JOIN v_effective_group_user_mapping egum ON ug.group_id = egum.group_id
         LEFT JOIN group_role_mapping grm ON ug.group_id = grm.group_id
         WHERE ug.org_uuid = ${orgId}
         GROUP BY ug.group_id, ug.group_name, ug.org_uuid, TO_CHAR(ug.description), ug.created_at, ug.updated_at`;
    } else {
        groupsQuery = `SELECT ug.group_id, ug.group_name, ug.org_uuid, ug.description, ug.created_at, ug.updated_at,
                COUNT(DISTINCT egum.user_uuid) AS user_count,
                COUNT(DISTINCT grm.id) AS role_count
         FROM user_groups ug
         LEFT JOIN v_effective_group_user_mapping egum ON ug.group_id = egum.group_id
         LEFT JOIN group_role_mapping grm ON ug.group_id = grm.group_id
         WHERE ug.org_uuid = ${orgId}
         GROUP BY ug.group_id, ug.group_name, ug.org_uuid, ug.description, ug.created_at, ug.updated_at`;
    }
    stream<types:GroupResponse, sql:Error?> groupStream = dbClient->query(groupsQuery);

    check from types:GroupResponse group in groupStream
        do {
            groups.push(group);
        };

    return groups;
}

// Update group details
public isolated function updateGroup(string groupId, types:GroupInput input) returns error? {
    log:printDebug(string `Updating group: ${groupId}`);

    sql:ExecutionResult|sql:Error result = dbClient->execute(
        `UPDATE user_groups
         SET group_name = ${input.groupName},
             description = ${input.description}
         WHERE group_id = ${groupId}`
    );

    if result is sql:Error {
        log:printError(string `Failed to update group ${groupId}`, 'error = result);
        match classifySqlError(result) {
            DUPLICATE_KEY => { return error("A group with this name already exists", result); }
            VALUE_TOO_LONG => { return error("The provided value exceeds the maximum allowed length", result); }
            _ => { return error("An unexpected error occurred. Please contact your administrator.", result); }
        }
    }

    if result.affectedRowCount == 0 {
        return error(string `Group not found: ${groupId}`);
    }

    log:printInfo(string `Successfully updated group ${groupId}`);
    return ();
}

// Get the number of groups a role is mapped to
public isolated function getRoleMappedGroupCount(string roleId) returns int|error {
    log:printDebug(string `Counting group mappings for role: ${roleId}`);

    int|sql:Error result = dbClient->queryRow(
        `SELECT COUNT(*) FROM group_role_mapping WHERE role_id = ${roleId}`
    );

    if result is sql:Error {
        log:printError(string `Failed to count group mappings for role ${roleId}`, 'error = result);
        return error("Failed to count group mappings", result);
    }

    return result;
}

// Get role mapping count for a group
public isolated function getGroupRoleMappingCount(string groupId) returns int|error {
    log:printDebug(string `Counting role mappings for group: ${groupId}`);

    int|sql:Error result = dbClient->queryRow(
        `SELECT COUNT(*) FROM group_role_mapping WHERE group_id = ${groupId}`
    );

    if result is sql:Error {
        log:printError(string `Failed to count role mappings for group ${groupId}`, 'error = result);
        return error("Failed to count role mappings", result);
    }

    return result;
}

// Delete a group
public isolated function deleteGroup(string groupId) returns error? {
    log:printDebug(string `Deleting group: ${groupId}`);

    sql:ExecutionResult|sql:Error result = dbClient->execute(
        `DELETE FROM user_groups WHERE group_id = ${groupId}`
    );

    if result is sql:Error {
        log:printError(string `Failed to delete group ${groupId}`, 'error = result);
        match classifySqlError(result) {
            FOREIGN_KEY_VIOLATION => { return error("Cannot delete group because it has dependent role assignments or members", result); }
            _ => { return error("An unexpected error occurred. Please contact your administrator.", result); }
        }
    }

    if result.affectedRowCount == 0 {
        return error(string `Group not found: ${groupId}`);
    }

    log:printInfo(string `Successfully deleted group ${groupId}`);
    return ();
}

// ============================================================================
// 3.3 Role V2 Management Functions
// ============================================================================

// Create a new role
public isolated function createRoleV2(types:RoleV2Input input) returns string|error {
    string roleId = uuid:createType1AsString();
    int orgId = input.orgId ?: DEFAULT_ORG_ID;

    log:printDebug(string `Creating role: ${input.roleName} with roleId: ${roleId}`);

    sql:ExecutionResult|error result = dbClient->execute(
        `INSERT INTO roles_v2 (role_id, role_name, org_id, description) 
         VALUES (${roleId}, ${input.roleName}, ${orgId}, ${input.description})`
    );

    if result is sql:Error {
        log:printError(string `Failed to create role ${input.roleName}`, 'error = result);
        match classifySqlError(result) {
            DUPLICATE_KEY => { return error("A role with this name already exists", result); }
            VALUE_TOO_LONG => { return error("The provided value exceeds the maximum allowed length", result); }
            _ => { return error("An unexpected error occurred. Please contact your administrator.", result); }
        }
    }
    if result is error {
        log:printError(string `Failed to create role ${input.roleName}`, 'error = result);
        return result;
    }

    log:printInfo(string `Successfully created role ${input.roleName}`, roleId = roleId);
    return roleId;
}

// Get role by ID
public isolated function getRoleV2ById(string roleId) returns types:RoleV2|error {
    log:printDebug(string `Fetching role details for roleId: ${roleId}`);

    types:RoleV2 role = check dbClient->queryRow(
        `SELECT role_id, role_name, org_id, description, created_at, updated_at 
         FROM roles_v2 
         WHERE role_id = ${roleId}`
    );

    return role;
}

// Get all roles for an organization
public isolated function getAllRolesV2(int orgId) returns types:RoleV2[]|error {
    log:printDebug(string `Fetching all roles for orgId: ${orgId}`);

    types:RoleV2[] roles = [];
    stream<types:RoleV2, sql:Error?> roleStream = dbClient->query(
        `SELECT role_id, role_name, org_id, description, created_at, updated_at 
         FROM roles_v2 
         WHERE org_id = ${orgId}
         ORDER BY role_name`
    );

    check from types:RoleV2 role in roleStream
        do {
            roles.push(role);
        };

    return roles;
}

// Get all roles for an organization with precomputed group and user counts
public isolated function getRolesWithCountsByOrgId(int orgId) returns types:RoleResponse[]|error {
    log:printDebug(string `Fetching roles with counts for orgId: ${orgId}`);

    types:RoleResponse[] roles = [];
    sql:ParameterizedQuery rolesQuery;
    if isOracle() {
        // Oracle cannot GROUP BY a CLOB column — group by its VARCHAR2 projection
        rolesQuery = `SELECT r.role_id, r.role_name, r.org_id, TO_CHAR(r.description) AS description, r.created_at, r.updated_at,
                COUNT(DISTINCT grm.group_id) AS group_count,
                COUNT(DISTINCT egum.user_uuid) AS user_count
         FROM roles_v2 r
         LEFT JOIN group_role_mapping grm ON r.role_id = grm.role_id
         LEFT JOIN v_effective_group_user_mapping egum ON grm.group_id = egum.group_id
         WHERE r.org_id = ${orgId}
         GROUP BY r.role_id, r.role_name, r.org_id, TO_CHAR(r.description), r.created_at, r.updated_at
         ORDER BY r.role_name`;
    } else {
        rolesQuery = `SELECT r.role_id, r.role_name, r.org_id, r.description, r.created_at, r.updated_at,
                COUNT(DISTINCT grm.group_id) AS group_count,
                COUNT(DISTINCT egum.user_uuid) AS user_count
         FROM roles_v2 r
         LEFT JOIN group_role_mapping grm ON r.role_id = grm.role_id
         LEFT JOIN v_effective_group_user_mapping egum ON grm.group_id = egum.group_id
         WHERE r.org_id = ${orgId}
         GROUP BY r.role_id, r.role_name, r.org_id, r.description, r.created_at, r.updated_at
         ORDER BY r.role_name`;
    }
    stream<types:RoleResponse, sql:Error?> roleStream = dbClient->query(rolesQuery);

    check from types:RoleResponse role in roleStream
        do {
            roles.push(role);
        };

    return roles;
}

// Update role details
public isolated function updateRoleV2(string roleId, types:RoleV2Input input) returns error? {
    log:printDebug(string `Updating role: ${roleId}`);

    sql:ExecutionResult|sql:Error result = dbClient->execute(
        `UPDATE roles_v2
         SET role_name = ${input.roleName},
             description = ${input.description}
         WHERE role_id = ${roleId}`
    );

    if result is sql:Error {
        log:printError(string `Failed to update role ${roleId}`, 'error = result);
        match classifySqlError(result) {
            DUPLICATE_KEY => { return error("A role with this name already exists", result); }
            VALUE_TOO_LONG => { return error("The provided value exceeds the maximum allowed length", result); }
            _ => { return error("An unexpected error occurred. Please contact your administrator.", result); }
        }
    }

    if result.affectedRowCount == 0 {
        return error(string `Role not found: ${roleId}`);
    }

    log:printInfo(string `Successfully updated role ${roleId}`);
    return ();
}

// Delete a role
public isolated function deleteRoleV2(string roleId) returns error? {
    log:printDebug(string `Deleting role: ${roleId}`);

    sql:ExecutionResult|sql:Error result = dbClient->execute(
        `DELETE FROM roles_v2 WHERE role_id = ${roleId}`
    );

    if result is sql:Error {
        log:printError(string `Failed to delete role ${roleId}`, 'error = result);
        match classifySqlError(result) {
            FOREIGN_KEY_VIOLATION => { return error("Cannot delete role because it is assigned to one or more groups", result); }
            _ => { return error("An unexpected error occurred. Please contact your administrator.", result); }
        }
    }

    if result.affectedRowCount == 0 {
        return error(string `Role not found: ${roleId}`);
    }

    log:printInfo(string `Successfully deleted role ${roleId}`);
    return ();
}

// ============================================================================
// 3.4 Permission Management Functions
// ============================================================================

// Get permission by ID
public isolated function getPermissionById(string permissionId) returns types:Permission|error {
    log:printDebug(string `Fetching permission details for permissionId: ${permissionId}`);

    types:Permission permission = check dbClient->queryRow(
        `SELECT permission_id, permission_name, permission_domain, resource_type, action, description, created_at, updated_at 
         FROM permissions 
         WHERE permission_id = ${permissionId}`
    );

    return permission;
}

// Get permission by name
public isolated function getPermissionByName(string permissionName) returns types:Permission|error {
    log:printDebug(string `Fetching permission details for permissionName: ${permissionName}`);

    types:Permission permission = check dbClient->queryRow(
        `SELECT permission_id, permission_name, permission_domain, resource_type, action, description, created_at, updated_at 
         FROM permissions 
         WHERE permission_name = ${permissionName}`
    );

    return permission;
}

// Get all permissions
public isolated function getAllPermissions() returns types:Permission[]|error {
    log:printDebug("Fetching all permissions");

    types:Permission[] permissions = [];
    stream<types:Permission, sql:Error?> permissionStream = dbClient->query(
        `SELECT permission_id, permission_name, permission_domain, resource_type, action, description, created_at, updated_at 
         FROM permissions 
         ORDER BY permission_domain, permission_name`
    );

    check from types:Permission permission in permissionStream
        do {
            permissions.push(permission);
        };

    return permissions;
}

// Get permissions by domain
public isolated function getPermissionsByDomain(types:PermissionDomain domain) returns types:Permission[]|error {
    log:printDebug(string `Fetching permissions for domain: ${domain}`);

    types:Permission[] permissions = [];
    stream<types:Permission, sql:Error?> permissionStream = dbClient->query(
        `SELECT permission_id, permission_name, permission_domain, resource_type, action, description, created_at, updated_at 
         FROM permissions 
         WHERE permission_domain = ${domain}
         ORDER BY permission_name`
    );

    check from types:Permission permission in permissionStream
        do {
            permissions.push(permission);
        };

    return permissions;
}

// ============================================================================
// 3.5 Mapping Management Functions
// ============================================================================

// Add user to group
public isolated function addUserToGroup(string userId, string groupId) returns error? {
    log:printDebug(string `Adding user ${userId} to group ${groupId}`);

    sql:ExecutionResult|error result = dbClient->execute(
        `INSERT INTO group_user_mapping (group_id, user_uuid) 
         VALUES (${groupId}, ${userId})`
    );

    if result is sql:Error {
        log:printError(string `Failed to add user ${userId} to group ${groupId}`, 'error = result);
        match classifySqlError(result) {
            DUPLICATE_KEY => { return error("This user is already a member of the group", result); }
            FOREIGN_KEY_VIOLATION => { return error("The specified user or group does not exist", result); }
            _ => { return error("An unexpected error occurred. Please contact your administrator.", result); }
        }
    }
    if result is error {
        log:printError(string `Failed to add user ${userId} to group ${groupId}`, 'error = result);
        return result;
    }

    log:printInfo(string `Successfully added user ${userId} to group ${groupId}`);
    return ();
}

// Remove user from group
public isolated function removeUserFromGroup(string userId, string groupId) returns error? {
    log:printDebug(string `Removing user ${userId} from group ${groupId}`);

    sql:ExecutionResult|sql:Error result = dbClient->execute(
        `DELETE FROM group_user_mapping
         WHERE group_id = ${groupId} AND user_uuid = ${userId}`
    );

    if result is sql:Error {
        log:printError(string `Failed to remove user ${userId} from group ${groupId}`, 'error = result);
        return error("An unexpected error occurred. Please contact your administrator.", result);
    }

    if result.affectedRowCount == 0 {
        return error(string `User ${userId} not found in group ${groupId}`);
    }

    log:printInfo(string `Successfully removed user ${userId} from group ${groupId}`);
    return ();
}

// Create an SSO group mapping from an IdP claim value to an existing ICP group.
// The optional project/integration scope records where the mapping is administered;
// it does not change login-time sync behavior.
public isolated function createSSOGroupMapping(types:SSOGroupMappingInput input) returns string|error {
    string mappingId = uuid:createType1AsString();
    int orgId = input.orgUuid ?: DEFAULT_ORG_ID;

    log:printDebug("Creating SSO group mapping", issuer = input.issuer, claimName = input.claimName, groupId = input.groupId);

    sql:ExecutionResult|error result = dbClient->execute(
        `INSERT INTO sso_group_mappings (mapping_id, org_uuid, issuer, claim_name, claim_value, group_id, project_uuid, integration_uuid)
         VALUES (${mappingId}, ${orgId}, ${input.issuer}, ${input.claimName}, ${input.claimValue}, ${input.groupId},
                 ${input?.projectUuid}, ${input?.integrationUuid})`
    );

    if result is sql:Error {
        log:printError("Failed to create SSO group mapping", 'error = result);
        match classifySqlError(result) {
            DUPLICATE_KEY => { return error("This SSO group mapping already exists", result); }
            FOREIGN_KEY_VIOLATION => { return error("The specified organization, group, project, or integration does not exist", result); }
            VALUE_TOO_LONG => { return error("The provided value exceeds the maximum allowed length", result); }
            _ => { return error("An unexpected error occurred. Please contact your administrator.", result); }
        }
    }
    if result is error {
        log:printError("Failed to create SSO group mapping", 'error = result);
        return result;
    }

    log:printInfo("Successfully created SSO group mapping", mappingId = mappingId);
    return mappingId;
}

// Get an SSO group mapping by ID.
public isolated function getSSOGroupMappingById(string mappingId) returns types:SSOGroupMapping|error {
    log:printDebug(string `Fetching SSO group mapping ${mappingId}`);

    types:SSOGroupMapping mapping = check dbClient->queryRow(
        `SELECT mapping_id, org_uuid, issuer, claim_name, claim_value, group_id, project_uuid, integration_uuid, created_at, updated_at
         FROM sso_group_mappings
         WHERE mapping_id = ${mappingId}`
    );

    return mapping;
}

// List SSO group mappings for an organization.
public isolated function getSSOGroupMappingsByOrgId(int orgId) returns types:SSOGroupMapping[]|error {
    log:printDebug(string `Fetching SSO group mappings for orgId: ${orgId}`);

    types:SSOGroupMapping[] mappings = [];
    stream<types:SSOGroupMapping, sql:Error?> mappingStream = dbClient->query(
        `SELECT mapping_id, org_uuid, issuer, claim_name, claim_value, group_id, project_uuid, integration_uuid, created_at, updated_at
         FROM sso_group_mappings
         WHERE org_uuid = ${orgId}
         ORDER BY created_at DESC`
    );

    check from types:SSOGroupMapping mapping in mappingStream
        do {
            mappings.push(mapping);
        };

    return mappings;
}

// List SSO group mappings with target group details for management APIs.
public isolated function getSSOGroupMappingsWithGroupNamesByOrgId(int orgId)
        returns types:SSOGroupMappingResponse[]|error {
    log:printDebug(string `Fetching enriched SSO group mappings for orgId: ${orgId}`);

    types:SSOGroupMappingResponse[] mappings = [];
    stream<types:SSOGroupMappingResponse, sql:Error?> mappingStream = dbClient->query(
        `SELECT sgm.mapping_id, sgm.org_uuid, sgm.issuer, sgm.claim_name, sgm.claim_value,
                sgm.group_id, sgm.project_uuid, sgm.integration_uuid, sgm.created_at, sgm.updated_at,
                ug.group_name, p.name AS project_name, c.display_name AS integration_name
         FROM sso_group_mappings sgm
         INNER JOIN user_groups ug ON ug.group_id = sgm.group_id
         LEFT JOIN projects p ON p.project_id = sgm.project_uuid
         LEFT JOIN components c ON c.component_id = sgm.integration_uuid
         WHERE sgm.org_uuid = ${orgId}
         ORDER BY sgm.created_at DESC`
    );

    error? streamResult = from types:SSOGroupMappingResponse mapping in mappingStream
        do {
            mappings.push(mapping);
        };
    if streamResult is sql:Error {
        return mapSSOSchemaError(streamResult, "list SSO group mappings");
    }
    if streamResult is error {
        return streamResult;
    }

    return mappings;
}

// List SSO group mappings for an organization and issuer.
public isolated function getSSOGroupMappingsByIssuer(int orgId, string issuer) returns types:SSOGroupMapping[]|error {
    log:printDebug("Fetching SSO group mappings by issuer", orgId = orgId, issuer = issuer);

    types:SSOGroupMapping[] mappings = [];
    stream<types:SSOGroupMapping, sql:Error?> mappingStream = dbClient->query(
        `SELECT mapping_id, org_uuid, issuer, claim_name, claim_value, group_id, project_uuid, integration_uuid, created_at, updated_at
         FROM sso_group_mappings
         WHERE org_uuid = ${orgId} AND issuer = ${issuer}
         ORDER BY created_at`
    );

    error? streamResult = from types:SSOGroupMapping mapping in mappingStream
        do {
            mappings.push(mapping);
        };
    if streamResult is sql:Error {
        return mapSSOSchemaError(streamResult, "read SSO group mappings");
    }
    if streamResult is error {
        return streamResult;
    }

    return mappings;
}

// The SSO group mapping tables ship with a schema migration. A deployment that
// upgrades the server without running it fails on the first SSO login, because
// login-time reconciliation reads these tables on every SSO login regardless of
// whether any mapping exists. Translate the raw "table not found" into something
// that names the remedy instead of leaking SQL to the operator.
public const string SSO_SCHEMA_UPDATE_REQUIRED =
    "This update adds new SSO capabilities that need a one-time update to the ICP database. " +
    "Update the database and restart ICP to continue using SSO.";

isolated function mapSSOSchemaError(sql:Error err, string operation) returns error {
    if classifySqlError(err) == MISSING_SCHEMA_OBJECT {
        log:printError(SSO_SCHEMA_UPDATE_REQUIRED
                + " The SSO group mapping tables are missing. Apply the migration script for your database "
                + "('add_sso_group_mapping_tables_<database>.sql', shipped under resources/db/migration-scripts) "
                + "to the main ICP database, then restart ICP.", 'error = err);
        return error(SSO_SCHEMA_UPDATE_REQUIRED, err);
    }
    log:printError(string `Failed to ${operation}`, 'error = err);
    return err;
}

// SSO group mappings are immutable (like group-role mappings): change means delete + create.

// Delete an SSO group mapping within an organization.
public isolated function deleteSSOGroupMapping(string mappingId, int orgId) returns error? {
    log:printDebug("Deleting SSO group mapping", mappingId = mappingId, orgId = orgId);

    // Deleting the mapping must also revoke the memberships it produced. Federated
    // rows are otherwise only reconciled when each affected user next logs in, which
    // would leave access in place for an unbounded time after an admin revoked it.
    // The mapping tuple is unique, so no other mapping can justify these rows.
    types:SSOGroupMapping|error mapping = getSSOGroupMappingById(mappingId);
    if mapping is error || mapping.orgUuid != orgId {
        return error("SSO group mapping not found");
    }

    transaction {
        sql:ExecutionResult federatedResult = check dbClient->execute(
            `DELETE FROM federated_group_user_mapping
             WHERE org_uuid = ${orgId} AND issuer = ${mapping.issuer}
               AND claim_name = ${mapping.claimName} AND claim_value = ${mapping.claimValue}
               AND group_id = ${mapping.groupId}`
        );

        sql:ExecutionResult result = check dbClient->execute(
            `DELETE FROM sso_group_mappings
             WHERE mapping_id = ${mappingId} AND org_uuid = ${orgId}`
        );

        // Lost a race with a concurrent delete; leave the transaction unapplied.
        error? notFound = result.affectedRowCount == 0 ? error("SSO group mapping not found") : ();
        check notFound;

        check commit;
        log:printInfo("Successfully deleted SSO group mapping", mappingId = mappingId,
                revokedMemberships = federatedResult.affectedRowCount);
    }
}

// Add an SSO-owned group membership. Manual memberships remain in group_user_mapping.
public isolated function addFederatedGroupUserMapping(types:FederatedGroupUserMappingInput input) returns int|error {
    int orgId = input.orgUuid ?: DEFAULT_ORG_ID;

    log:printDebug("Adding federated group membership", issuer = input.issuer, userId = input.userUuid, groupId = input.groupId);

    sql:ExecutionResult|error result = dbClient->execute(
        `INSERT INTO federated_group_user_mapping (org_uuid, issuer, user_uuid, group_id, claim_name, claim_value)
         VALUES (${orgId}, ${input.issuer}, ${input.userUuid}, ${input.groupId}, ${input.claimName}, ${input.claimValue})`
    );

    if result is sql:Error {
        log:printError("Failed to add federated group membership", 'error = result);
        match classifySqlError(result) {
            DUPLICATE_KEY => { return error("This federated group membership already exists", result); }
            FOREIGN_KEY_VIOLATION => { return error("The specified organization, user, or group does not exist", result); }
            VALUE_TOO_LONG => { return error("The provided value exceeds the maximum allowed length", result); }
            _ => { return error("An unexpected error occurred. Please contact your administrator.", result); }
        }
    }
    if result is error {
        log:printError("Failed to add federated group membership", 'error = result);
        return result;
    }

    if isOracle() {
        // Oracle returns the ROWID (not the identity value) as lastInsertId,
        // so read the id back via the unique membership tuple.
        int|error mappingId = dbClient->queryRow(`
            SELECT id FROM federated_group_user_mapping
            WHERE org_uuid = ${orgId} AND issuer = ${input.issuer}
              AND user_uuid = ${input.userUuid} AND group_id = ${input.groupId}
              AND claim_name = ${input.claimName} AND claim_value = ${input.claimValue}
        `);
        if mappingId is int {
            log:printInfo("Successfully added federated group membership", mappingId = mappingId);
            return mappingId;
        }
        log:printWarn("Failed to read back federated group membership ID on Oracle", 'error = mappingId);
        return error("Failed to retrieve mapping ID after creating federated group membership");
    }

    int|string? lastInsertId = result.lastInsertId;
    if lastInsertId is int {
        log:printInfo("Successfully added federated group membership", mappingId = lastInsertId);
        return lastInsertId;
    } else if lastInsertId is string && dbType == MSSQL {
        int|error parsedId = int:fromString(lastInsertId);
        if parsedId is int {
            log:printInfo("Successfully added federated group membership", mappingId = parsedId);
            return parsedId;
        }
    }

    log:printWarn("Database did not return a valid last insert ID for federated group membership", lastInsertId = lastInsertId);
    return error("Failed to retrieve mapping ID after creating federated group membership");
}

// Get all SSO-owned group memberships for a user.
public isolated function getFederatedGroupUserMappings(string userId) returns types:FederatedGroupUserMapping[]|error {
    log:printDebug(string `Fetching federated group memberships for user: ${userId}`);

    types:FederatedGroupUserMapping[] mappings = [];
    stream<types:FederatedGroupUserMapping, sql:Error?> mappingStream = dbClient->query(
        `SELECT id, org_uuid, issuer, user_uuid, group_id, claim_name, claim_value, last_seen_at, created_at, updated_at
         FROM federated_group_user_mapping
         WHERE user_uuid = ${userId}
         ORDER BY created_at DESC`
    );

    check from types:FederatedGroupUserMapping mapping in mappingStream
        do {
            mappings.push(mapping);
        };

    return mappings;
}

// Reconcile SSO-owned memberships for exactly one organization, issuer, and
// user. Manual memberships and rows owned by other issuers are never changed.
public isolated function reconcileFederatedGroupUserMappings(int orgId, string issuer, string userId,
        types:FederatedGroupMembershipInput[] desiredMemberships) returns error? {
    log:printDebug("Reconciling federated group memberships", orgId = orgId, issuer = issuer,
            userId = userId, desiredCount = desiredMemberships.length());

    transaction {
        types:FederatedGroupUserMapping[] existingMappings = [];
        stream<types:FederatedGroupUserMapping, sql:Error?> existingStream = dbClient->query(
            `SELECT id, org_uuid, issuer, user_uuid, group_id, claim_name, claim_value,
                    last_seen_at, created_at, updated_at
             FROM federated_group_user_mapping
             WHERE org_uuid = ${orgId} AND issuer = ${issuer} AND user_uuid = ${userId}`
        );
        error? existingResult = from types:FederatedGroupUserMapping mapping in existingStream
            do {
                existingMappings.push(mapping);
            };
        // Surfaced first because this is the earliest statement to touch the
        // migration-provided tables, so a missing migration is reported here.
        error? existingFailure = existingResult is sql:Error
            ? mapSSOSchemaError(existingResult, "read federated group memberships")
            : existingResult;
        check existingFailure;

        foreach types:FederatedGroupMembershipInput desired in desiredMemberships {
            types:FederatedGroupUserMapping? existing = findFederatedMembership(existingMappings, desired);
            if existing is types:FederatedGroupUserMapping {
                _ = check dbClient->execute(
                    `UPDATE federated_group_user_mapping
                     SET last_seen_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                     WHERE id = ${existing.id}`
                );
            } else {
                sql:ExecutionResult|sql:Error insertResult = dbClient->execute(
                    `INSERT INTO federated_group_user_mapping
                        (org_uuid, issuer, user_uuid, group_id, claim_name, claim_value)
                     VALUES (${orgId}, ${issuer}, ${userId}, ${desired.groupId},
                             ${desired.claimName}, ${desired.claimValue})`
                );
                // Two concurrent logins for the same user can both read an empty
                // existing set and then race to insert. The unique constraint means
                // the loser's desired state is already satisfied, so a duplicate key
                // here is success, not a reason to fail the login.
                error? insertFailure = ();
                if insertResult is sql:Error && classifySqlError(insertResult) != DUPLICATE_KEY {
                    insertFailure = insertResult;
                }
                check insertFailure;
                if insertResult is sql:Error {
                    log:printDebug("Federated membership already inserted by a concurrent login",
                            userId = userId, groupId = desired.groupId);
                }
            }
        }

        foreach types:FederatedGroupUserMapping existing in existingMappings {
            if findDesiredFederatedMembership(desiredMemberships, existing) is () {
                _ = check dbClient->execute(
                    `DELETE FROM federated_group_user_mapping WHERE id = ${existing.id}`
                );
            }
        }

        check commit;
    } on fail error e {
        log:printError("Failed to reconcile federated group memberships", 'error = e,
                orgId = orgId, issuer = issuer, userId = userId);
        return error("Failed to synchronize SSO group memberships", e);
    }

    log:printInfo("Reconciled federated group memberships", orgId = orgId, issuer = issuer,
            userId = userId, membershipCount = desiredMemberships.length());
}

isolated function findFederatedMembership(types:FederatedGroupUserMapping[] existingMappings,
        types:FederatedGroupMembershipInput desired) returns types:FederatedGroupUserMapping? {
    foreach types:FederatedGroupUserMapping existing in existingMappings {
        if existing.groupId == desired.groupId && existing.claimName == desired.claimName
                && existing.claimValue == desired.claimValue {
            return existing;
        }
    }
    return ();
}

isolated function findDesiredFederatedMembership(types:FederatedGroupMembershipInput[] desiredMemberships,
        types:FederatedGroupUserMapping existing) returns types:FederatedGroupMembershipInput? {
    foreach types:FederatedGroupMembershipInput desired in desiredMemberships {
        if desired.groupId == existing.groupId && desired.claimName == existing.claimName
                && desired.claimValue == existing.claimValue {
            return desired;
        }
    }
    return ();
}

// Assign role to group with scope context
public isolated function assignRoleToGroup(types:AssignRoleToGroupInput input) returns int|error {
    int orgId = input.orgUuid ?: DEFAULT_ORG_ID;

    log:printDebug(string `Assigning role ${input.roleId} to group ${input.groupId} with scope`);

    sql:ExecutionResult|error result = dbClient->execute(
        `INSERT INTO group_role_mapping (group_id, role_id, org_uuid, project_uuid, env_uuid, integration_uuid) 
         VALUES (${input.groupId}, ${input.roleId}, ${orgId}, ${input.projectUuid}, ${input.envUuid}, ${input.integrationUuid})`
    );

    if result is sql:Error {
        log:printError(string `Failed to assign role ${input.roleId} to group ${input.groupId}`, 'error = result);
        match classifySqlError(result) {
            DUPLICATE_KEY => { return error("This role assignment already exists", result); }
            FOREIGN_KEY_VIOLATION => { return error("The specified group or role does not exist", result); }
            _ => { return error("An unexpected error occurred. Please contact your administrator.", result); }
        }
    }
    if result is error {
        log:printError(string `Failed to assign role ${input.roleId} to group ${input.groupId}`, 'error = result);
        return result;
    }

    if isOracle() {
        // Oracle returns the ROWID (not the identity value) as lastInsertId,
        // so read the id back via the unique mapping tuple. NVL sentinels make
        // the nullable scope columns comparable.
        int|error mappingId = dbClient->queryRow(`
            SELECT id FROM group_role_mapping
            WHERE group_id = ${input.groupId} AND role_id = ${input.roleId} AND org_uuid = ${orgId}
              AND NVL(project_uuid, '~') = NVL(${input.projectUuid}, '~')
              AND NVL(env_uuid, '~') = NVL(${input.envUuid}, '~')
              AND NVL(integration_uuid, '~') = NVL(${input.integrationUuid}, '~')
        `);
        if mappingId is int {
            log:printInfo(string `Successfully assigned role ${input.roleId} to group ${input.groupId}`, mappingId = mappingId);
            return mappingId;
        }
        log:printWarn(string `Failed to read back mapping ID for role assignment of role ${input.roleId} to group ${input.groupId}`);
        return error("Failed to retrieve mapping ID after role assignment");
    }

    int|string? lastInsertId = result.lastInsertId;
    if lastInsertId is int {
        log:printInfo(string `Successfully assigned role ${input.roleId} to group ${input.groupId}`, mappingId = lastInsertId);
        return lastInsertId;
    } else if lastInsertId is string && dbType == MSSQL {
        // MSSQL connector returns lastInsertId as a string rather than an int
        int|error parsedId = int:fromString(lastInsertId);
        if parsedId is int {
            log:printInfo(string `Successfully assigned role ${input.roleId} to group ${input.groupId}`, mappingId = parsedId);
            return parsedId;
        }
    }

    log:printWarn(string `Database did not return a valid last insert ID for role assignment of role ${input.roleId} to group ${input.groupId}`, lastInsertId = lastInsertId);
    return error("Failed to retrieve mapping ID after role assignment");
}

// Remove role from group (by mapping ID)
public isolated function removeRoleFromGroup(int mappingId) returns error? {
    log:printDebug(string `Removing group-role mapping with ID: ${mappingId}`);

    sql:ExecutionResult|sql:Error result = dbClient->execute(
        `DELETE FROM group_role_mapping WHERE id = ${mappingId}`
    );

    if result is sql:Error {
        log:printError(string `Failed to remove group-role mapping ${mappingId}`, 'error = result);
        return error("An unexpected error occurred. Please contact your administrator.", result);
    }

    if result.affectedRowCount == 0 {
        return error(string `Group-role mapping not found: ${mappingId}`);
    }

    log:printInfo(string `Successfully removed group-role mapping ${mappingId}`);
    return ();
}

// Update group-role mapping scope
public isolated function updateGroupRoleMapping(int mappingId, types:UpdateGroupRoleMappingInput input) returns error? {
    log:printDebug(string `Updating group-role mapping: ${mappingId}`);

    // Build dynamic update query based on provided fields
    sql:ParameterizedQuery updateQuery = `UPDATE group_role_mapping SET `;
    boolean hasUpdate = false;

    if input.groupId is string {
        updateQuery = sql:queryConcat(updateQuery, `group_id = ${input.groupId}`);
        hasUpdate = true;
    }

    if input.roleId is string {
        if hasUpdate {
            updateQuery = sql:queryConcat(updateQuery, `, `);
        }
        updateQuery = sql:queryConcat(updateQuery, `role_id = ${input.roleId}`);
        hasUpdate = true;
    }

    if input.orgUuid is int {
        if hasUpdate {
            updateQuery = sql:queryConcat(updateQuery, `, `);
        }
        updateQuery = sql:queryConcat(updateQuery, `org_uuid = ${input.orgUuid}`);
        hasUpdate = true;
    }

    if input.projectUuid is string {
        if hasUpdate {
            updateQuery = sql:queryConcat(updateQuery, `, `);
        }
        updateQuery = sql:queryConcat(updateQuery, `project_uuid = ${input.projectUuid}`);
        hasUpdate = true;
    }

    if input.envUuid is string {
        if hasUpdate {
            updateQuery = sql:queryConcat(updateQuery, `, `);
        }
        updateQuery = sql:queryConcat(updateQuery, `env_uuid = ${input.envUuid}`);
        hasUpdate = true;
    }

    if input.integrationUuid is string {
        if hasUpdate {
            updateQuery = sql:queryConcat(updateQuery, `, `);
        }
        updateQuery = sql:queryConcat(updateQuery, `integration_uuid = ${input.integrationUuid}`);
        hasUpdate = true;
    }

    if !hasUpdate {
        return error("No fields provided for update");
    }

    updateQuery = sql:queryConcat(updateQuery, ` WHERE id = ${mappingId}`);

    sql:ExecutionResult|sql:Error result = dbClient->execute(updateQuery);

    if result is sql:Error {
        log:printError(string `Failed to update group-role mapping ${mappingId}`, 'error = result);
        match classifySqlError(result) {
            DUPLICATE_KEY => { return error("This role assignment already exists", result); }
            FOREIGN_KEY_VIOLATION => { return error("The specified group or role does not exist", result); }
            _ => { return error("An unexpected error occurred. Please contact your administrator.", result); }
        }
    }

    if result.affectedRowCount == 0 {
        return error(string `Group-role mapping not found: ${mappingId}`);
    }

    log:printInfo(string `Successfully updated group-role mapping ${mappingId}`);
    return ();
}

// Assign permissions to role
public isolated function assignPermissionsToRole(string roleId, string[] permissionIds) returns error? {
    log:printDebug(string `Assigning ${permissionIds.length()} permissions to role ${roleId}`);

    transaction {
        foreach string permissionId in permissionIds {
            sql:ExecutionResult _ = check dbClient->execute(
                `INSERT INTO role_permission_mapping (role_id, permission_id) 
                 VALUES (${roleId}, ${permissionId})`
            );
        }

        check commit;
        log:printInfo(string `Successfully assigned ${permissionIds.length()} permissions to role ${roleId}`);
    } on fail error e {
        log:printError(string `Transaction failed while assigning permissions to role ${roleId}`, 'error = e);
        if e is sql:Error {
            match classifySqlError(e) {
                DUPLICATE_KEY => { return error("This permission is already assigned to the role", e); }
                FOREIGN_KEY_VIOLATION => { return error("The specified permission does not exist", e); }
                _ => { return error("An unexpected error occurred. Please contact your administrator.", e); }
            }
        }
        return error("An unexpected error occurred while assigning permissions. Please contact your administrator.", e);
    }

    return ();
}

// Remove permissions from role
public isolated function removePermissionsFromRole(string roleId, string[] permissionIds) returns error? {
    log:printDebug(string `Removing ${permissionIds.length()} permissions from role ${roleId}`);

    transaction {
        foreach string permissionId in permissionIds {
            sql:ExecutionResult result = check dbClient->execute(
                `DELETE FROM role_permission_mapping 
                 WHERE role_id = ${roleId} AND permission_id = ${permissionId}`
            );

            if result.affectedRowCount == 0 {
                log:printWarn(string `Permission ${permissionId} not found in role ${roleId}, skipping`);
            }
        }

        check commit;
        log:printInfo(string `Successfully removed permissions from role ${roleId}`);
    } on fail error e {
        log:printError(string `Transaction failed while removing permissions from role ${roleId}`, 'error = e);
        return error("An unexpected error occurred while removing permissions. Please contact your administrator.", e);
    }

    return ();
}

// ============================================================================
// 3.6 User Group & Role Resolution Functions
// ============================================================================

// Get manually assigned groups for a user. SSO-owned federated memberships are not included.
public isolated function getUserManualGroups(string userId) returns types:Group[]|error {
    log:printDebug(string `Fetching manually assigned groups for user: ${userId}`);

    types:Group[] groups = [];
    stream<types:Group, sql:Error?> groupStream = dbClient->query(
        `SELECT DISTINCT g.group_id, g.group_name, g.org_uuid, g.description, g.created_at, g.updated_at
         FROM user_groups g
         INNER JOIN group_user_mapping gum ON g.group_id = gum.group_id
         WHERE gum.user_uuid = ${userId}`
    );

    check from types:Group group in groupStream
        do {
            groups.push(group);
        };

    return groups;
}

// Get all effective groups for a user, including manual and SSO-owned federated memberships.
public isolated function getUserGroups(string userId) returns types:Group[]|error {
    log:printDebug(string `Fetching groups for user: ${userId}`);

    types:Group[] groups = [];
    stream<types:Group, sql:Error?> groupStream = dbClient->query(
        `SELECT DISTINCT g.group_id, g.group_name, g.org_uuid, g.description, g.created_at, g.updated_at
         FROM user_groups g
         INNER JOIN v_effective_group_user_mapping egum ON g.group_id = egum.group_id
         WHERE egum.user_uuid = ${userId}`
    );

    check from types:Group group in groupStream
        do {
            groups.push(group);
        };

    return groups;
}

// Get roles for a group in a specific context (with optional scope filtering)
public isolated function getGroupRoles(string groupId, types:AccessScope? scope) returns types:RoleV2[]|error {
    log:printDebug(string `Fetching roles for group: ${groupId} with scope context`);

    types:RoleV2[] roles = [];
    
    // Build query with optional scope filters
    sql:ParameterizedQuery query = `SELECT DISTINCT r.role_id, r.role_name, r.description, r.created_at, r.updated_at
                                     FROM roles_v2 r
                                     INNER JOIN group_role_mapping grm ON r.role_id = grm.role_id
                                     WHERE grm.group_id = ${groupId}`;

    // Add scope filters if provided
    if scope is types:AccessScope {
        query = sql:queryConcat(query, ` AND grm.org_uuid = ${scope.orgUuid}`);
        
        if scope.projectUuid is string {
            query = sql:queryConcat(query, ` AND (grm.project_uuid = ${scope.projectUuid} OR grm.project_uuid IS NULL)`);
        }
        
        if scope.envUuid is string {
            query = sql:queryConcat(query, ` AND (grm.env_uuid = ${scope.envUuid} OR grm.env_uuid IS NULL)`);
        }
        
        if scope.integrationUuid is string {
            query = sql:queryConcat(query, ` AND (grm.integration_uuid = ${scope.integrationUuid} OR grm.integration_uuid IS NULL)`);
        }
    }

    stream<types:RoleV2, sql:Error?> roleStream = dbClient->query(query);

    check from types:RoleV2 role in roleStream
        do {
            roles.push(role);
        };

    return roles;
}

// Get all permissions for a role
public isolated function getRolePermissions(string roleId) returns types:Permission[]|error {
    log:printDebug(string `Fetching permissions for role: ${roleId}`);

    types:Permission[] permissions = [];
    stream<types:Permission, sql:Error?> permissionStream = dbClient->query(
        `SELECT p.permission_id, p.permission_name, p.permission_domain, p.resource_type, p.action, p.description, p.created_at, p.updated_at
         FROM permissions p
         INNER JOIN role_permission_mapping rpm ON p.permission_id = rpm.permission_id
         WHERE rpm.role_id = ${roleId}
         ORDER BY p.permission_domain, p.permission_name`
    );

    check from types:Permission permission in permissionStream
        do {
            permissions.push(permission);
        };

    return permissions;
}

// Get user's effective permissions in a given scope
// This computes: user → groups → roles (in scope) → permissions
public isolated function getUserEffectivePermissions(string userId, types:AccessScope scope) returns types:Permission[]|error {
    log:printDebug(string `Computing effective permissions for user ${userId} in scope: ${scope.toString()}`);

    types:Permission[] permissions = [];

    // Base EXISTS-style query that checks for existence of a (group -> role -> permission)
    // mapping for the user within the provided scope. We'll append scope-specific clauses
    // (project, env, integration) to match current semantics exactly.
    sql:ParameterizedQuery query = `
        SELECT DISTINCT
            p.permission_id,
            p.permission_name,
            p.permission_domain,
            p.resource_type,
            p.action,
            p.description,
            p.created_at,
            p.updated_at
        FROM permissions p
        WHERE EXISTS (
            SELECT 1
            FROM role_permission_mapping rpm
            INNER JOIN group_role_mapping grm ON grm.role_id = rpm.role_id
            INNER JOIN v_effective_group_user_mapping egum ON egum.group_id = grm.group_id
            WHERE rpm.permission_id = p.permission_id
              AND egum.user_uuid = ${userId}
              AND grm.org_uuid = ${scope.orgUuid}
    `;

    // Project scope: if projectUuid provided, include org-wide OR project-specific roles.
    // If not provided, restrict to org-wide only (grm.project_uuid IS NULL).
    if scope.projectUuid is string {
        query = sql:queryConcat(query, ` AND (grm.project_uuid IS NULL OR grm.project_uuid = ${scope.projectUuid})`);
    } else {
        query = sql:queryConcat(query, ` AND grm.project_uuid IS NULL`);
    }

    // Environment filter: include roles that apply to all envs OR the specific env when given.
    if scope.envUuid is string {
        query = sql:queryConcat(query, ` AND (grm.env_uuid IS NULL OR grm.env_uuid = ${scope.envUuid})`);
    }

    // Integration scope: if integrationUuid provided include project-wide OR integration-specific roles.
    // If no integration but project scope present, exclude integration-specific roles.
    if scope.integrationUuid is string {
        query = sql:queryConcat(query, ` AND (grm.integration_uuid IS NULL OR grm.integration_uuid = ${scope.integrationUuid})`);
    } else if scope.projectUuid is string {
        // project scope without integration: do not include integration-specific role mappings
        query = sql:queryConcat(query, ` AND grm.integration_uuid IS NULL`);
    }

    // Close the EXISTS and apply ordering
    query = sql:queryConcat(query, `
        ) -- end EXISTS
        ORDER BY p.permission_domain, p.permission_name
    `);

    stream<types:Permission, sql:Error?> permissionStream = dbClient->query(query);

    // Collect results
    check from types:Permission permission in permissionStream
        do {
            permissions.push(permission);
        };

    log:printDebug(string `Found ${permissions.length()} effective permissions for user ${userId}`);
    return permissions;
}

// Get ALL permissions for a user across ALL scopes (org, project, integration levels)
// This is used for JWT token generation at login - returns complete permission set
// regardless of where the permissions are assigned (org-wide, project-specific, or integration-specific)
public isolated function getAllUserPermissions(string userId) returns types:Permission[]|error {
    log:printDebug(string `Fetching all permissions for user ${userId} across all scopes`);

    types:Permission[] permissions = [];

    // Query that gets all unique permissions for a user regardless of scope
    // Joins through: user -> groups -> role mappings (any scope) -> roles -> permissions
    sql:ParameterizedQuery query = `
        SELECT DISTINCT
            p.permission_id,
            p.permission_name,
            p.permission_domain,
            p.resource_type,
            p.action,
            p.description,
            p.created_at,
            p.updated_at
        FROM permissions p
        WHERE EXISTS (
            SELECT 1
            FROM role_permission_mapping rpm
            INNER JOIN group_role_mapping grm ON grm.role_id = rpm.role_id
            INNER JOIN v_effective_group_user_mapping egum ON egum.group_id = grm.group_id
            WHERE rpm.permission_id = p.permission_id
              AND egum.user_uuid = ${userId}
        )
        ORDER BY p.permission_domain, p.permission_name
    `;

    stream<types:Permission, sql:Error?> permissionStream = dbClient->query(query);

    check from types:Permission permission in permissionStream
        do {
            permissions.push(permission);
        };

    log:printDebug(string `Found ${permissions.length()} total permissions for user ${userId}`);
    return permissions;
}

# Returns the distinct role names assigned to a user across all of their group
# memberships (any scope). Used to forward the caller's roles to the runtime
# workflow service (x-user-roles) for human-task assignment matching.
#
# + userId - The user's UUID.
# + return - Distinct role names, or an error.
public isolated function getAllUserRoleNames(string userId) returns string[]|error {
    stream<record {|string role_name;|}, sql:Error?> roleStream = dbClient->query(`
        SELECT DISTINCT r.role_name
        FROM roles_v2 r
        INNER JOIN group_role_mapping grm ON grm.role_id = r.role_id
        INNER JOIN v_effective_group_user_mapping egum ON egum.group_id = grm.group_id
        WHERE egum.user_uuid = ${userId}
    `);
    return from record {|string role_name;|} row in roleStream
        select row.role_name;
}

# Every role name the organization defines, whoever holds it. A runtime matches a task by role
# intersection, so the union of all roles reaches every task any role could claim.
#
# + return - Distinct role names, or an error.
public isolated function getAllRoleNames() returns string[]|error {
    stream<record {|string role_name;|}, sql:Error?> roleStream = dbClient->query(`
        SELECT DISTINCT r.role_name
        FROM roles_v2 r
    `);
    return from record {|string role_name;|} row in roleStream
        select row.role_name;
}

// ============================================================================
// 3.7 Access Query Functions (Using Views)
// ============================================================================

// Get all projects accessible to a user
public isolated function getUserAccessibleProjects(string userId) returns types:UserProjectAccess[]|error {
    log:printDebug(string `Fetching accessible projects for user: ${userId}`);

    types:UserProjectAccess[] projects = [];
    stream<types:UserProjectAccess, sql:Error?> projectStream = dbClient->query(
        `SELECT user_uuid, project_uuid, project_name, role_id, org_uuid, access_level
         FROM v_user_project_access
         WHERE user_uuid = ${userId}
         ORDER BY project_name`
    );

    check from types:UserProjectAccess project in projectStream
        do {
            projects.push(project);
        };

    log:printDebug(string `Found ${projects.length()} accessible projects for user ${userId}`);
    return projects;
}

// Get all integrations accessible to a user (with optional project and environment filters)
public isolated function getUserAccessibleIntegrations(string userId, string? projectId = (), string? envId = ()) returns types:UserIntegrationAccess[]|error {
    log:printDebug(string `Fetching accessible integrations for user: ${userId}`);

    types:UserIntegrationAccess[] integrations = [];
    
    sql:ParameterizedQuery query = `
        SELECT user_uuid, integration_uuid, integration_name, project_uuid, 
               env_uuid, role_id, access_level
        FROM v_user_integration_access
        WHERE user_uuid = ${userId}`;

    // Apply optional filters
    if projectId is string {
        query = sql:queryConcat(query, ` AND project_uuid = ${projectId}`);
    }

    if envId is string {
        query = sql:queryConcat(query, ` AND (env_uuid = ${envId} OR env_uuid IS NULL)`);
    }

    query = sql:queryConcat(query, ` ORDER BY integration_name`);

    stream<types:UserIntegrationAccess, sql:Error?> integrationStream = dbClient->query(query);

    check from types:UserIntegrationAccess integration in integrationStream
        do {
            integrations.push(integration);
        };

    log:printDebug(string `Found ${integrations.length()} accessible integrations for user ${userId}`);
    return integrations;
}

// Get environment restrictions for a user (with optional project and integration filters)
public isolated function getUserEnvironmentRestrictions(string userId, string? projectId = (), string? integrationId = ()) returns types:UserEnvironmentAccess[]|error {
    log:printDebug(string `Fetching environment restrictions for user: ${userId}`);

    types:UserEnvironmentAccess[] environments = [];
    
    sql:ParameterizedQuery query = `
        SELECT user_uuid, env_uuid, project_uuid, 
               integration_uuid, role_id, scope_level
        FROM v_user_environment_access
        WHERE user_uuid = ${userId}`;

    // Apply optional filters
    if projectId is string {
        query = sql:queryConcat(query, ` AND (project_uuid = ${projectId} OR project_uuid IS NULL)`);
    }

    if integrationId is string {
        query = sql:queryConcat(query, ` AND (integration_uuid = ${integrationId} OR integration_uuid IS NULL)`);
    }

    query = sql:queryConcat(query, ` ORDER BY env_uuid`);

    stream<types:UserEnvironmentAccess, sql:Error?> envStream = dbClient->query(query);

    check from types:UserEnvironmentAccess env in envStream
        do {
            environments.push(env);
        };

    log:printDebug(string `Found ${environments.length()} environment restrictions for user ${userId}`);
    return environments;
}

// ============================================================================
// 3.8 Context-Aware Access Check Functions
// ============================================================================

// Check if user has access to a specific project
public isolated function hasAccessToProject(string userId, string projectId) returns boolean|error {
    log:printDebug(string `Checking project access for user ${userId} on project ${projectId}`);

    int count = check dbClient->queryRow(
        `SELECT COUNT(*) as count
         FROM v_user_project_access
         WHERE user_uuid = ${userId} AND project_uuid = ${projectId}`
    );

    return count > 0;
}

// Check if user has access to a specific integration
public isolated function hasAccessToIntegration(string userId, string integrationId) returns boolean|error {
    log:printDebug(string `Checking integration access for user ${userId} on integration ${integrationId}`);

    int count = check dbClient->queryRow(
        `SELECT COUNT(*) as count
         FROM v_user_integration_access
         WHERE user_uuid = ${userId} AND integration_uuid = ${integrationId}`
    );

    return count > 0;
}

// Get environment restriction for user in a given context
// Returns: () if all environments allowed, or string[] of allowed environment UUIDs
public isolated function getEnvironmentRestriction(string userId, string? projectId = (), string? integrationId = ()) returns string[]?|error {
    log:printDebug(string `Checking environment restrictions for user ${userId}`);

    string[] envIds = [];
    boolean hasNullEnv = false;

    sql:ParameterizedQuery query = `
        SELECT DISTINCT env_uuid
        FROM v_user_environment_access
        WHERE user_uuid = ${userId}`;

    // Apply context filters
    if projectId is string {
        query = sql:queryConcat(query, ` AND (project_uuid = ${projectId} OR project_uuid IS NULL)`);
    }

    if integrationId is string {
        query = sql:queryConcat(query, ` AND (integration_uuid = ${integrationId} OR integration_uuid IS NULL)`);
    }

    stream<record {|string? env_uuid;|}, sql:Error?> envStream = dbClient->query(query);

    check from record {|string? env_uuid;|} env in envStream
        do {
            string? envUuid = env.env_uuid;
            if envUuid is string {
                envIds.push(envUuid);
            } else {
                hasNullEnv = true;
            }
        };

    // If any role has NULL env_uuid, user has access to all environments
    if hasNullEnv {
        log:printDebug(string `User ${userId} has access to all environments in context`);
        return ();
    }

    // If no environment restrictions found at all, deny access
    if envIds.length() == 0 {
        log:printDebug(string `User ${userId} has no environment access in context`);
        return [];
    }

    log:printDebug(string `User ${userId} restricted to ${envIds.length()} specific environments`);
    return envIds;
}

// Check if user has access to a specific runtime (integration + environment combination)
public isolated function hasAccessToRuntime(string userId, string runtimeId) returns boolean|error {
    log:printDebug(string `Checking runtime access for user ${userId} on runtime ${runtimeId}`);

    record {|string component_id; string environment_id;|}? runtime = check dbClient->queryRow(
        `SELECT component_id, environment_id
         FROM runtimes
         WHERE runtime_id = ${runtimeId}`
    );

    if runtime is () {
        log:printWarn(string `Runtime not found: ${runtimeId}`);
        return false;
    }

    // Check integration access
    boolean hasIntegrationAccess = check hasAccessToIntegration(userId, runtime.component_id);
    if !hasIntegrationAccess {
        return false;
    }

    // Check environment restriction
    string[]? allowedEnvs = check getEnvironmentRestriction(userId, integrationId = runtime.component_id);

    // If allowedEnvs is (), user has access to all environments
    if allowedEnvs is () {
        return true;
    }

    // Check if runtime's environment is in the allowed list
    foreach string envId in allowedEnvs {
        if envId == runtime.environment_id {
            return true;
        }
    }

    log:printDebug(string `User ${userId} does not have access to runtime ${runtimeId} (environment restriction)`);
    return false;
}

// ============================================================================
// 3.9 Helper/Utility Functions
// ============================================================================

// Build effective permissions with scope context for a user
// Returns contextual permissions (permission + scope) for use in authorization decisions
public isolated function buildEffectivePermissionsWithScope(string userId, types:AccessScope scope) returns types:ContextualPermission[]|error {
    log:printDebug(string `Building effective permissions with scope for user: ${userId}`);

    types:Permission[] permissions = check getUserEffectivePermissions(userId, scope);

    types:ContextualPermission[] contextualPermissions = [];
    foreach types:Permission permission in permissions {
        contextualPermissions.push({
            permission: permission,
            scope: scope
        });
    }

    log:printDebug(string `Built ${contextualPermissions.length()} contextual permissions for user ${userId}`);
    return contextualPermissions;
}

// Check if user has a MANUAL membership in a specific group.
//
// This deliberately queries `group_user_mapping` rather than
// `v_effective_group_user_mapping`: the SSO super-admin bootstrap uses it to
// decide whether to write a manual `Super Admins` row, and that row must be
// sticky (surviving claim/mapping removal). Widening this to effective
// membership would let a federated Super Admins membership suppress the manual
// grant, so deleting the mapping would silently revoke super admin.
// Use `getGroupUsersWithMembershipSource()` or the effective view when you need
// federated memberships included.
public isolated function isUserInGroup(string userId, string groupId) returns boolean|error {
    log:printDebug(string `Checking if user ${userId} has a manual membership in group ${groupId}`);

    int count = check dbClient->queryRow(
        `SELECT COUNT(*) as count
         FROM group_user_mapping
         WHERE user_uuid = ${userId} AND group_id = ${groupId}`
    );

    return count > 0;
}

// Get all users in a group
public isolated function getGroupUsers(string groupId) returns string[]|error {
    log:printDebug(string `Fetching users for group: ${groupId}`);

    string[] userIds = [];
    stream<record {|string user_uuid;|}, sql:Error?> userStream = dbClient->query(
        `SELECT user_uuid
         FROM v_effective_group_user_mapping
         WHERE group_id = ${groupId}
         ORDER BY user_uuid`
    );

    check from record {|string user_uuid;|} user in userStream
        do {
            userIds.push(user.user_uuid);
        };

    log:printDebug(string `Found ${userIds.length()} users in group ${groupId}`);
    return userIds;
}

// Get all effective users in a group together with the ownership of each membership.
public isolated function getGroupUsersWithMembershipSource(string groupId)
        returns types:EffectiveGroupUserMembership[]|error {
    log:printDebug(string `Fetching users and membership sources for group: ${groupId}`);

    stream<types:EffectiveGroupUserMembership, sql:Error?> userStream = dbClient->query(
        `SELECT u.user_id AS user_uuid,
                CASE
                    WHEN EXISTS (
                        SELECT 1 FROM group_user_mapping gum
                        WHERE gum.user_uuid = u.user_id AND gum.group_id = ${groupId}
                    ) AND EXISTS (
                        SELECT 1 FROM federated_group_user_mapping fgm
                        WHERE fgm.user_uuid = u.user_id AND fgm.group_id = ${groupId}
                    ) THEN 'manual_and_federated'
                    WHEN EXISTS (
                        SELECT 1 FROM federated_group_user_mapping fgm
                        WHERE fgm.user_uuid = u.user_id AND fgm.group_id = ${groupId}
                    ) THEN 'federated'
                    ELSE 'manual'
                END AS membership_source
         FROM users u
         WHERE EXISTS (
             SELECT 1 FROM group_user_mapping gum
             WHERE gum.user_uuid = u.user_id AND gum.group_id = ${groupId}
         ) OR EXISTS (
             SELECT 1 FROM federated_group_user_mapping fgm
             WHERE fgm.user_uuid = u.user_id AND fgm.group_id = ${groupId}
         )
         ORDER BY u.user_id`
    );

    return check from types:EffectiveGroupUserMembership membership in userStream
        select membership;
}

// Get all groups that have a specific role (in any scope)
public isolated function getRoleGroups(string roleId) returns types:Group[]|error {
    log:printDebug(string `Fetching groups with role: ${roleId}`);

    types:Group[] groups = [];
    stream<types:Group, sql:Error?> groupStream = dbClient->query(
        `SELECT DISTINCT g.group_id, g.group_name, g.org_uuid, g.description, g.created_at, g.updated_at
         FROM user_groups g
         INNER JOIN group_role_mapping grm ON g.group_id = grm.group_id
         WHERE grm.role_id = ${roleId}
         ORDER BY g.group_name`
    );

    check from types:Group group in groupStream
        do {
            groups.push(group);
        };

    log:printDebug(string `Found ${groups.length()} groups with role ${roleId}`);
    return groups;
}

// Check if a specific permission exists by name (useful for validation)
public isolated function permissionExists(string permissionName) returns boolean|error {
    log:printDebug(string `Checking if permission exists: ${permissionName}`);

    int count = check dbClient->queryRow(
        `SELECT COUNT(*) as count
         FROM permissions
         WHERE permission_name = ${permissionName}`
    );

    return count > 0;
}

// Get group-role mappings for a specific group (returns full mapping details including scope)
// Get a single group-role mapping by ID
public isolated function getGroupRoleMappingById(int mappingId) returns types:GroupRoleMapping|error {
    log:printDebug(string `Fetching group-role mapping with ID: ${mappingId}`);

    types:GroupRoleMapping mapping = check dbClient->queryRow(
        `SELECT id, group_id, role_id, org_uuid, project_uuid, env_uuid, integration_uuid, created_at
         FROM group_role_mapping
         WHERE id = ${mappingId}`
    );

    log:printDebug(string `Found mapping: group=${mapping.groupId}, role=${mapping.roleId}`);
    return mapping;
}

public isolated function getGroupRoleMappings(string groupId) returns types:GroupRoleMapping[]|error {
    log:printDebug(string `Fetching role mappings for group: ${groupId}`);

    types:GroupRoleMapping[] mappings = [];
    stream<types:GroupRoleMapping, sql:Error?> mappingStream = dbClient->query(
        `SELECT id, group_id, role_id, org_uuid, project_uuid, env_uuid, integration_uuid, created_at
         FROM group_role_mapping
         WHERE group_id = ${groupId}
         ORDER BY created_at DESC`
    );

    check from types:GroupRoleMapping mapping in mappingStream
        do {
            mappings.push(mapping);
        };

    log:printDebug(string `Found ${mappings.length()} role mappings for group ${groupId}`);
    return mappings;
}

// Get all group-role mappings for a specific role (shows which groups have this role)
public isolated function getRoleMappings(string roleId) returns types:GroupRoleMapping[]|error {
    log:printDebug(string `Fetching group mappings for role: ${roleId}`);

    types:GroupRoleMapping[] mappings = [];
    stream<types:GroupRoleMapping, sql:Error?> mappingStream = dbClient->query(
        `SELECT id, group_id, role_id, org_uuid, project_uuid, env_uuid, integration_uuid, created_at
         FROM group_role_mapping
         WHERE role_id = ${roleId}
         ORDER BY created_at DESC`
    );

    check from types:GroupRoleMapping mapping in mappingStream
        do {
            mappings.push(mapping);
        };

    log:printDebug(string `Found ${mappings.length()} group mappings for role ${roleId}`);
    return mappings;
}

// Get user count in a group
public isolated function getGroupUserCount(string groupId) returns int|error {
    log:printDebug(string `Counting users in group: ${groupId}`);

    int count = check dbClient->queryRow(
        `SELECT COUNT(*) as count
         FROM v_effective_group_user_mapping
         WHERE group_id = ${groupId}`
    );

    return count;
}

// Get role assignment count (how many groups have this role across all scopes)
public isolated function getRoleAssignmentCount(string roleId) returns int|error {
    log:printDebug(string `Counting role assignments for role: ${roleId}`);

    int count = check dbClient->queryRow(
        `SELECT COUNT(*) as count
         FROM group_role_mapping
         WHERE role_id = ${roleId}`
    );

    return count;
}
