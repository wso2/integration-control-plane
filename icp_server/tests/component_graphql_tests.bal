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
import icp_server.types;

import ballerina/test;

// Test data IDs - these are already defined in runtime_graphql_tests.bal
// const string PROJECT_1_ID = "650e8400-e29b-41d4-a716-446655440001";
// const string COMPONENT_1_ID = "640e8400-e29b-41d4-a716-446655440001";

const string COMPONENT_2_ID = "640e8400-e29b-41d4-a716-446655440002"; // Project 1, Component 2
const string COMPONENT_3_ID = "640e8400-e29b-41d4-a716-446655440003"; // Project 2, Component 3
const string PROJECT_2_ID = "650e8400-e29b-41d4-a716-446655440002";

// Token for read-only viewer (only view permission, no edit/manage)
string readOnlyViewerToken = "";

@test:BeforeSuite
function setupComponentTests() returns error? {
    // Generate token for read-only viewer (view permission only for Component 1)
    readOnlyViewerToken = check generateV2Token(
            "770e8400-e29b-41d4-a716-446655440005",
            "readonlyviewer",
            [auth:PERMISSION_INTEGRATION_VIEW, auth:PERMISSION_PROJECT_VIEW]
    );
}

// =============================================================================
// Test 1: Get components - Org-level user sees all accessible components
// =============================================================================

@test:Config {
    groups: ["component-graphql", "get-components"]
}
function testGetComponentsOrgLevel() returns error? {
    string query = string `
        query {
            components(orgHandler: "default") {
                items {
                    id
                    name
                    projectId
                }
                pageInfo { total limit offset }
            }
        }
    `;

    json response = check executeGraphQL(query, orgDevToken);

    // Verify no errors
    test:assertFalse(response.errors is json, "Query should not return errors");

    // Verify data exists
    json data = check response.data;
    json componentsPage = check data.components;
    json[] components = check componentsPage.items.ensureType();

    // Org-level user should see components from all projects
    test:assertTrue(components.length() >= 2, "Should return at least 2 components");
}

// =============================================================================
// Test 2: Get components - Project-level user sees only their project's components
// =============================================================================

@test:Config {
    groups: ["component-graphql", "get-components"]
}
function testGetComponentsProjectLevel() returns error? {
    string query = string `
        query {
            components(orgHandler: "default") {
                items {
                    id
                    name
                    projectId
                }
                pageInfo { total limit offset }
            }
        }
    `;

    json response = check executeGraphQL(query, project1AdminToken);

    // Verify no errors
    test:assertFalse(response.errors is json, "Query should not return errors");

    // Verify data exists and doesn't include Project 2 components
    json data = check response.data;
    json componentsPage = check data.components;
    json[] components = check componentsPage.items.ensureType();

    // Should not see Component 3 which is in Project 2
    boolean hasComponent3 = false;
    foreach json component in components {
        string componentId = check component.id;
        if componentId == COMPONENT_3_ID {
            hasComponent3 = true;
        }
    }
    test:assertFalse(hasComponent3, "Project admin should not see Project 2 components");
}

// =============================================================================
// Test 3: Get components with project filter
// =============================================================================

@test:Config {
    groups: ["component-graphql", "get-components"]
}
function testGetComponentsWithProjectFilter() returns error? {
    string query = string `
        query GetComponents($projectId: String) {
            components(orgHandler: "default", projectId: $projectId) {
                items {
                    id
                    name
                    projectId
                }
                pageInfo { total limit offset }
            }
        }
    `;

    json variables = {
        projectId: PROJECT_1_ID
    };

    json response = check executeGraphQL(query, orgDevToken, variables);

    // Verify no errors
    test:assertFalse(response.errors is json, "Query should not return errors");

    json data = check response.data;
    json componentsPage = check data.components;
    json[] components = check componentsPage.items.ensureType();

    // All returned components should belong to Project 1
    foreach json component in components {
        string projectId = check component.projectId;
        test:assertEquals(projectId, PROJECT_1_ID, "All components should be from Project 1");
    }
}

// =============================================================================
// Test 4: Get component by ID - Success with proper permissions
// =============================================================================

@test:Config {
    groups: ["component-graphql", "get-component"]
}
function testGetComponentById() returns error? {
    string query = string `
        query GetComponent($componentId: String!) {
            component(componentId: $componentId) {
                id
                name
                displayName
                projectId
            }
        }
    `;

    json variables = {
        componentId: COMPONENT_1_ID
    };

    json response = check executeGraphQL(query, orgDevToken, variables);

    // Verify no errors
    test:assertFalse(response.errors is json, "Query should not return errors");

    // Verify component returned
    json data = check response.data;
    json|error component = data.component;
    test:assertTrue(component is json, "Should return component object");

    if component is json {
        string componentId = check component.id;
        test:assertEquals(componentId, COMPONENT_1_ID, "Should return correct component");
    }
}

// =============================================================================
// Test 6: Get component by projectId + componentHandler
// =============================================================================

@test:Config {
    groups: ["component-graphql", "get-component"]
}
function testGetComponentByProjectAndHandler() returns error? {
    string query = string `
        query GetComponent($projectId: String!, $componentHandler: String!) {
            component(projectId: $projectId, componentHandler: $componentHandler) {
                id
                name
                projectId
            }
        }
    `;

    json variables = {
        projectId: PROJECT_1_ID,
        componentHandler: "sample-integration"
    };

    json response = check executeGraphQL(query, orgDevToken, variables);

    // Verify no errors
    test:assertFalse(response.errors is json, "Query should not return errors");

    // Verify component returned
    json data = check response.data;
    json|error component = data.component;
    test:assertTrue(component is json, "Should return component object");

    if component is json {
        string projectId = check component.projectId;
        test:assertEquals(projectId, PROJECT_1_ID, "Should return component from correct project");
    }
}

// =============================================================================
// Test 7: Create component - Success with manage permission
// =============================================================================

@test:Config {
    groups: ["component-graphql", "create-component"]
}
function testCreateComponentSuccess() returns error? {
    string mutation = string `
        mutation CreateComponent($component: ComponentInput!) {
            createComponent(component: $component) {
                id
                name
                displayName
                projectId
            }
        }
    `;

    json variables = {
        component: {
            name: "test-integration",
            displayName: "Test Integration",
            description: "Test component for GraphQL tests",
            projectId: PROJECT_1_ID,
            componentType: "BI"
        }
    };

    json response = check executeGraphQL(mutation, project1AdminToken, variables);

    // Verify no errors
    test:assertFalse(response.errors is json, "Mutation should not return errors");

    json data = check response.data;
    json|error component = data.createComponent;
    test:assertTrue(component is json, "Should return created component");

    if component is json {
        string name = check component.name;
        test:assertEquals(name, "test-integration", "Should return component with correct name");
    }
}

// =============================================================================
// Test 8: Create component - Success without component type
// =============================================================================

@test:Config {
    groups: ["component-graphql", "create-component"]
}
function testCreateComponentWithoutComponentType() returns error? {
    string mutation = string `
        mutation CreateComponent($component: ComponentInput!) {
            createComponent(component: $component) {
                id
                name
                componentType
            }
        }
    `;

    json variables = {
        component: {
            name: "test-integration-default-type",
            displayName: "Test Integration Default Type",
            description: "Test component without componentType",
            projectId: PROJECT_1_ID
        }
    };

    json response = check executeGraphQL(mutation, project1AdminToken, variables);

    test:assertFalse(response.errors is json, "Mutation should not return errors");

    json data = check response.data;
    json component = check data.createComponent;
    string componentType = check component.componentType;
    test:assertEquals(componentType, "BI", "Should default component type to BI");
}

// =============================================================================
// Test 9: Update component - Success without component type
// =============================================================================

@test:Config {
    groups: ["component-graphql", "update-component"]
}
function testUpdateComponentWithoutComponentType() returns error? {
    string mutation = string `
        mutation UpdateComponent($component: ComponentUpdateInput!) {
            updateComponent(component: $component) {
                id
                displayName
                description
            }
        }
    `;

    json variables = {
        component: {
            id: COMPONENT_2_ID,
            displayName: "Component Two Updated",
            description: "Updated without componentType"
        }
    };

    json response = check executeGraphQL(mutation, project1AdminToken, variables);

    test:assertFalse(response.errors is json, "Mutation should not return errors");

    json data = check response.data;
    json component = check data.updateComponent;
    string displayName = check component.displayName;
    test:assertEquals(displayName, "Component Two Updated", "Should update component");
}

// =============================================================================
// Test 10: Create component - Fails without manage permission
// =============================================================================

@test:Config {
    groups: ["component-graphql", "create-component"]
}
function testCreateComponentNoPermission() returns error? {
    string mutation = string `
        mutation CreateComponent($component: ComponentInput!) {
            createComponent(component: $component) {
                id
                name
            }
        }
    `;

    // Integration viewer only has view permission, not manage
    json variables = {
        component: {
            name: "unauthorized-integration",
            displayName: "Unauthorized",
            projectId: PROJECT_1_ID,
            componentType: "BI"
        }
    };

    json response = check executeGraphQL(mutation, integrationViewerToken, variables);

    // Should return error (mutation returns explicit errors for no access)
    test:assertTrue(response.errors is json, "Mutation should return errors for insufficient permissions");

    json[] errors = check response.errors.ensureType();
    test:assertTrue(errors.length() > 0, "Should have at least one error");
}

// =============================================================================
// Test 11: Get componentArtifactTypes - Success with view/edit/manage permission
// =============================================================================

@test:Config {
    groups: ["component-graphql", "artifact-types"]
}
function testGetComponentArtifactTypes() returns error? {
    string query = string `
        query GetArtifactTypes($componentId: String!, $environmentId: String) {
            componentArtifactTypes(componentId: $componentId, environmentId: $environmentId) {
                artifactType
                artifactCount
            }
        }
    `;

    json variables = {
        componentId: COMPONENT_1_ID,
        environmentId: DEV_ENV_ID
    };

    json response = check executeGraphQL(query, orgDevToken, variables);

    // Verify no errors (even if no artifacts exist)
    test:assertFalse(response.errors is json, "Query should not return errors");

    json data = check response.data;
    json artifactTypesJson = check data.componentArtifactTypes;
    json[]|error artifactTypes = artifactTypesJson.ensureType();

    // Should return array (may be empty if no artifacts deployed)
    test:assertTrue(artifactTypes is json[], "Should return artifact types array");
}

// =============================================================================
// Test 12: Get componentArtifactTypes - Fails without permission
// =============================================================================

@test:Config {
    groups: ["component-graphql", "artifact-types"]
}
function testGetComponentArtifactTypesNoPermission() returns error? {
    string query = string `
        query GetArtifactTypes($componentId: String!) {
            componentArtifactTypes(componentId: $componentId) {
                artifactType
                count
            }
        }
    `;

    // Project admin tries to access Component 3 which is in Project 2
    json variables = {
        componentId: COMPONENT_3_ID
    };

    json response = check executeGraphQL(query, project1AdminToken, variables);

    // Should return error (query returns error for artifact operations)
    test:assertTrue(response.errors is json, "Query should return errors for insufficient permissions");
}

// =============================================================================
// Test: Create component - every integration type the create form can produce
// =============================================================================

// Every value in SUPPORTED_DISPLAY_TYPES_BY_RUNTIME (component_repository.bal) must actually be
// creatable on the runtime it is listed under: one missing from the allowlist is rejected with
// "Unsupported integration type", making that integration type unusable. The list below is a copy,
// so it cannot detect the frontend adding a type - adding one means updating the allowlist, this
// list, and resolveDisplayType in frontend/src/constants/integrationTypes.tsx together.
@test:Config {
    groups: ["component-graphql", "create-component"]
}
function testCreateComponentAcceptsEveryIntegrationType() returns error? {
    string mutation = string `
        mutation CreateComponent($component: ComponentInput!) {
            createComponent(component: $component) {
                id
                displayType
            }
        }
    `;

    // The technology each display type belongs to, so the created integration's metadata is the
    // combination the create form would actually produce.
    [string, string][] displayTypes = [
        ["ballerinaService", "BI"],
        ["miApiService", "MI"],
        ["scheduledTask", "BI"],
        ["miCronjob", "MI"],
        ["ballerinaEventHandler", "BI"],
        ["miEventHandler", "MI"],
        ["ballerinaWorkflow", "BI"],
        ["unspecified", "BI"],
        ["unspecified", "MI"]
    ];

    foreach int i in 0 ..< displayTypes.length() {
        [string, string] [displayType, componentType] = displayTypes[i];
        json variables = {
            component: {
                name: string `test-integration-type-${i}`,
                displayName: string `Test ${displayType}`,
                description: "Integration type allowlist coverage",
                projectId: PROJECT_1_ID,
                componentType: componentType,
                displayType: displayType
            }
        };

        json response = check executeGraphQL(mutation, project1AdminToken, variables);
        test:assertFalse(response.errors is json,
                string `Creating an integration of type ${displayType} must be accepted`);

        json created = check (check response.data).createComponent;
        test:assertEquals(check created.displayType, displayType,
                string `The created integration must read back as ${displayType}`);
    }
}

// A type the create form cannot produce is still rejected, so the allowlist keeps its purpose.
@test:Config {
    groups: ["component-graphql", "create-component"]
}
function testCreateComponentRejectsUnknownIntegrationType() returns error? {
    string mutation = string `
        mutation CreateComponent($component: ComponentInput!) {
            createComponent(component: $component) { id }
        }
    `;

    json variables = {
        component: {
            name: "test-integration-bogus-type",
            displayName: "Bogus",
            description: "Unknown integration type",
            projectId: PROJECT_1_ID,
            displayType: "notAnIntegrationType"
        }
    };

    json response = check executeGraphQL(mutation, project1AdminToken, variables);
    test:assertTrue(response.errors is json, "An unknown integration type must be rejected");

    // Assert on the message too, so an unrelated failure (permissions, validation) cannot pass.
    test:assertTrue(response.toJsonString().includes("Unsupported integration type"),
            string `Rejection must come from the display-type allowlist, got: ${response.toJsonString()}`);
}

// Clearing a specific type must also clear its subtype, for both runtimes.
@test:Config {
    groups: ["component-graphql", "update-component"]
}
function testUpdateComponentToUnspecifiedType() returns error? {
    string createMutation = string `
        mutation CreateComponent($component: ComponentInput!) {
            createComponent(component: $component) { id }
        }
    `;
    string updateMutation = string `
        mutation UpdateComponent($component: ComponentUpdateInput!) {
            updateComponent(component: $component) { displayType componentSubType }
        }
    `;

    foreach string runtimeType in ["BI", "MI"] {
        json createdResponse = check executeGraphQL(createMutation, project1AdminToken, {
            component: {
                name: string `test-clear-type-${runtimeType.toLowerAscii()}`,
                displayName: "Clear integration type",
                description: "Integration containing multiple types",
                projectId: PROJECT_1_ID,
                componentType: runtimeType,
                displayType: runtimeType == "BI" ? "ballerinaService" : "miApiService",
                componentSubType: "aiAgent"
            }
        });
        test:assertFalse(createdResponse.errors is json, "Creating a typed integration must succeed");
        json created = check (check createdResponse.data).createComponent;
        string componentId = check created.id;

        json updatedResponse = check executeGraphQL(updateMutation, project1AdminToken, {
            component: {
                id: componentId,
                displayType: "unspecified"
            }
        });
        test:assertFalse(updatedResponse.errors is json, "Clearing the integration type must succeed");
        json updated = check (check updatedResponse.data).updateComponent;
        test:assertEquals(check updated.displayType, "unspecified");
        test:assertEquals(check updated.componentSubType, ());
    }
}

// Add Runtime auto-creates integrations without a user-selected classification.
@test:Config {
    groups: ["component-graphql", "runtime-registration"]
}
function testRuntimeRegistrationDefaultsToUnspecifiedType() returns error? {
    foreach string runtimeType in ["BI", "MI"] {
        string name = string `test-runtime-untyped-${runtimeType.toLowerAscii()}`;
        string componentId = check storage:resolveOrCreateComponent(
            PROJECT_1_ID, name, runtimeType, SUPER_ADMIN_USER_ID);
        types:Component created = check storage:getComponentById(componentId);
        test:assertEquals(created.displayType, "unspecified");
        test:assertEquals(created.componentType, runtimeType);
        test:assertEquals(created.componentSubType, ());

        // Workflow discovery must not replace the unselected state.
        check storage:promoteToWorkflowIntegration(componentId);
        types:Component discovered = check storage:getComponentById(componentId);
        test:assertEquals(discovered.displayType, "unspecified");

        string selectedType = runtimeType == "BI" ? "ballerinaService" : "miApiService";
        check storage:updateComponent(componentId, (), (), (), SUPER_ADMIN_USER_ID, selectedType, "aiAgent");
        string resolvedId = check storage:resolveOrCreateComponent(
            PROJECT_1_ID, name, runtimeType, SUPER_ADMIN_USER_ID);
        test:assertEquals(resolvedId, componentId);
        types:Component existing = check storage:getComponentById(resolvedId);
        test:assertEquals(existing.displayType, selectedType,
            "Registering another runtime must preserve the user-selected type");
        test:assertEquals(existing.componentSubType, "aiAgent");
    }
}
