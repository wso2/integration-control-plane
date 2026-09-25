// Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
//
// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

import icp_server.auth;

import ballerina/test;

// What an MI field tells a caller it refuses.
//
// The rights themselves are covered elsewhere; these tests are about the wording, which is
// easy to lose. Folding the repeated preamble into miRuntimeById flattened three refusals
// into a bare "Unauthorized" — enforcement stayed correct, and the screens stopped saying
// which right was missing.

string miViewOnlyToken = "";

@test:BeforeSuite
function setupMIPermissionTests() returns error? {
    // Enough to read a runtime's artifacts, not enough to read its user accounts: who can
    // log in to a production runtime is not a view-level fact.
    miViewOnlyToken = check generateV2Token(NO_PERM_USER_ID, "mi-viewer",
            [auth:PERMISSION_INTEGRATION_VIEW]);
}

@test:Config {groups: ["mi_permissions"]}
function testRuntimeUsersRefusalNamesTheMissingRight() returns error? {
    json response = check executeGraphQL(string `
        query {
            getMIUsers(componentId: "${COMPONENT_1_ID}", runtimeId: "${RUNTIME_1_ID}") {
                items { username }
            }
        }
    `, miViewOnlyToken);

    test:assertEquals(check refusalOf(response), "Insufficient permissions to view MI users");
}

@test:Config {groups: ["mi_permissions"]}
function testUserWritesRefuseInTheirOwnWords() returns error? {
    json created = check executeGraphQL(string `
        mutation {
            addMIUser(componentId: "${COMPONENT_1_ID}", runtimeId: "${RUNTIME_1_ID}",
                    username: "qa", password: "qa12345") {
                username
            }
        }
    `, miViewOnlyToken);
    test:assertEquals(check refusalOf(created), "Insufficient permissions to create MI users");

    json deleted = check executeGraphQL(string `
        mutation {
            deleteMIUser(componentId: "${COMPONENT_1_ID}", runtimeId: "${RUNTIME_1_ID}",
                    username: "qa") {
                username
            }
        }
    `, miViewOnlyToken);
    test:assertEquals(check refusalOf(deleted), "Insufficient permissions to delete MI users");
}

@test:Config {groups: ["mi_permissions"]}
function testLogFileContentKeepsItsOwnRefusal() returns error? {
    // This one says nothing about permissions on purpose: a caller who may not read a
    // runtime's logs is not told whether the file exists.
    string noRights = check generateV2Token(NO_PERM_USER_ID, "nobody", []);
    json response = check executeGraphQL(string `
        query {
            logFileContent(runtimeId: "${RUNTIME_1_ID}", fileName: "wso2carbon.log") {
                content
            }
        }
    `, noRights);

    test:assertEquals(check refusalOf(response), "Unable to retrieve log file content");
}

isolated function refusalOf(json response) returns string|error {
    json errors = check response.errors;
    if errors !is json[] || errors.length() == 0 {
        return error("The request was not refused: " + response.toJsonString());
    }
    return (check errors[0].message).toString();
}
