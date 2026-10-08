// Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com) All Rights Reserved.
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

import icp_server.storage;
import icp_server.types;

import ballerina/test;

// Handlers become console URL path segments, so anything outside the slug the create
// forms generate must be rejected by the API too.

function validHandlers() returns string[][] {
    return [["dev"], ["order-service"], ["a1-b2-c3"], ["2024"]];
}

function invalidHandlers() returns string[][] {
    return [
        ["Weird Handler!!"],
        ["Bad Handler/../x"],
        ["Bad Comp !! /x"],
        ["UPPER"],
        ["under_score"],
        ["-leading"],
        ["trailing-"],
        ["double--hyphen"],
        ["with.dot"],
        [""]
    ];
}

@test:Config {
    groups: ["handler-validation"],
    dataProvider: validHandlers
}
function testValidateHandlerAcceptsSlugs(string handler) {
    test:assertFalse(storage:validateHandler("Handler", handler, 64) is error,
            string `'${handler}' should be accepted`);
}

@test:Config {
    groups: ["handler-validation"],
    dataProvider: invalidHandlers
}
function testValidateHandlerRejectsNonSlugs(string handler) {
    test:assertTrue(storage:validateHandler("Handler", handler, 64) is error,
            string `'${handler}' should be rejected`);
}

@test:Config {
    groups: ["handler-validation"]
}
function testValidateHandlerRejectsOverlongHandler() {
    error? result = storage:validateHandler("Handler", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", 64);
    test:assertTrue(result is error && result.message().includes("at most 64"));
}

@test:Config {
    groups: ["handler-validation", "environment-graphql"]
}
function testCreateEnvironmentRejectsInvalidHandler() returns error? {
    string mutation = string `
        mutation CreateEnvironment($environment: EnvironmentInput!) {
            createEnvironment(environment: $environment) { id }
        }
    `;
    json variables = {environment: {name: "Weird Env", environmentHandler: "Weird Handler!!", critical: false}};
    json response = check executeGraphQL(mutation, adminToken, variables);
    assertHandlerRejected(response, "Environment handler");
}

@test:Config {
    groups: ["handler-validation", "environment-graphql"]
}
function testUpdateEnvironmentRejectsHandlerChange() returns error? {
    // Environment handlers are immutable, whether the new value is a valid slug or not.
    foreach string newHandler in ["dev-renamed", "dev/../x"] {
        json response = check updateEnvironmentHandler(DEV_ENV_ID, newHandler);
        string body = response.toJsonString();
        test:assertTrue(response.errors is json, string `Changing the handler to '${newHandler}' must be rejected, got: ${body}`);
        test:assertTrue(body.includes("Environment handler cannot be changed"),
                string `Rejection must come from the immutability check, got: ${body}`);
    }
    types:Environment env = check storage:getEnvironmentById(DEV_ENV_ID);
    test:assertEquals(env.handler, "dev", "The handler must be unchanged");
}

@test:Config {
    groups: ["handler-validation", "environment-graphql"]
}
function testUpdateEnvironmentAcceptsUnchangedHandler() returns error? {
    // Clients that resend the current handler along with the other fields keep working.
    json response = check updateEnvironmentHandler(DEV_ENV_ID, "dev");
    test:assertFalse(response.errors is json, string `Resending the current handler must be accepted, got: ${response.toJsonString()}`);
    test:assertEquals(check response.data.updateEnvironment.handler, "dev");
}

function updateEnvironmentHandler(string environmentId, string handler) returns json|error {
    string mutation = string `
        mutation UpdateEnvironment($environmentId: String!, $handler: String) {
            updateEnvironment(environmentId: $environmentId, handler: $handler) { id handler }
        }
    `;
    return executeGraphQL(mutation, adminToken, {environmentId, handler});
}

@test:Config {
    groups: ["handler-validation", "project-graphql"]
}
function testCreateProjectRejectsInvalidHandler() returns error? {
    string mutation = string `
        mutation CreateProject($project: ProjectInput!) {
            createProject(project: $project) { id }
        }
    `;
    json variables = {
        project: {orgId: 1, orgHandler: "default", name: "Bad Handler Project", projectHandler: "Bad Handler/../x"}
    };
    json response = check executeGraphQL(mutation, adminToken, variables);
    assertHandlerRejected(response, "Project handler");
}

@test:Config {
    groups: ["handler-validation", "component-graphql"]
}
function testCreateComponentRejectsInvalidName() returns error? {
    string mutation = string `
        mutation CreateComponent($component: ComponentInput!) {
            createComponent(component: $component) { id }
        }
    `;
    json variables = {component: {name: "Bad Comp !! /x", projectId: PROJECT_1_ID}};
    json response = check executeGraphQL(mutation, project1AdminToken, variables);
    assertHandlerRejected(response, "Component name");
}

@test:Config {
    groups: ["handler-validation", "component-graphql"]
}
function testUpdateComponentRejectsNameChange() returns error? {
    // The component name is its handler, which is immutable, whether the new value is a valid slug or not.
    foreach string newName in ["sample-integration-renamed", "Sample Integration/.."] {
        json response = check updateComponentName(COMPONENT_1_ID, newName);
        string body = response.toJsonString();
        test:assertTrue(response.errors is json, string `Renaming to '${newName}' must be rejected, got: ${body}`);
        test:assertTrue(body.includes("Component name cannot be changed"),
                string `Rejection must come from the immutability check, got: ${body}`);
    }
    types:Component component = check storage:getComponentById(COMPONENT_1_ID);
    test:assertEquals(component.name, "sample-integration", "The name must be unchanged");
}

@test:Config {
    groups: ["handler-validation", "component-graphql"]
}
function testUpdateComponentAcceptsUnchangedName() returns error? {
    // Clients that resend the current name along with the other fields keep working.
    json response = check updateComponentName(COMPONENT_1_ID, "sample-integration");
    test:assertFalse(response.errors is json, string `Resending the current name must be accepted, got: ${response.toJsonString()}`);
    test:assertEquals(check response.data.updateComponent.name, "sample-integration");
}

function updateComponentName(string componentId, string name) returns json|error {
    string mutation = string `
        mutation UpdateComponent($component: ComponentUpdateInput!) {
            updateComponent(component: $component) { id name }
        }
    `;
    return executeGraphQL(mutation, project1AdminToken, {component: {id: componentId, name}});
}

// Assert on the message too, so an unrelated failure (permissions, duplicates) cannot pass.
function assertHandlerRejected(json response, string label) {
    string body = response.toJsonString();
    test:assertTrue(response.errors is json, string `Invalid ${label} must be rejected, got: ${body}`);
    test:assertTrue(body.includes(string `${label} '`) && body.includes("is invalid"),
            string `Rejection must come from handler validation, got: ${body}`);
}
