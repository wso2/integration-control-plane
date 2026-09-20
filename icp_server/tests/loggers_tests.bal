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

import icp_server.types;

import ballerina/test;

// =============================================================================
// Loggers GraphQL Tests
// =============================================================================
// These tests verify RBAC and response structure for the loggersByRuntime
// resolver.
//
// Behaviour table (differs from services/listeners):
//   - Runtime not found  → empty {items:[], pageInfo:{total:0,...}} — NOT an error
//   - No permission      → empty {items:[], pageInfo:{total:0,...}}
//   - Has permission     → list (may be empty if no log level data seeded)
// =============================================================================

const string LOGGERS_INVALID_RUNTIME_ID = "00000000-0000-0000-0000-000000000002";

string loggersNoPermToken = "";

@test:BeforeSuite
function setupLoggersTests() returns error? {
    loggersNoPermToken = check generateV2Token(
            NO_PERM_USER_ID,
            "nopermuser",
            []
    );
}

// =============================================================================
// Test 1: loggersByRuntime — org-level user can query loggers for an existing runtime
// =============================================================================

@test:Config {
    groups: ["loggers-graphql"]
}
function testLoggersByRuntime() returns error? {
    string query = string `
        query {
            loggersByRuntime(runtimeId: "${RUNTIME_1_ID}") {
                items { componentName logLevel }
                pageInfo { total limit offset }
            }
        }
    `;

    json response = check executeGraphQL(query, orgDevToken);

    test:assertFalse(response.errors is json, "Org-level user should be able to query loggers");

    json data = check response.data;
    json page = check data.loggersByRuntime;
    json[] items = check page.items.ensureType();
    json pageInfo = check page.pageInfo;
    int total = check (check pageInfo.total).ensureType();

    test:assertEquals(items.length(), total, "items count should match total");
}

// =============================================================================
// Test 2: loggersByRuntime — non-existent runtime returns empty list, not an error
//         This differs from services/listeners which return a GraphQL error.
// =============================================================================

@test:Config {
    groups: ["loggers-graphql"]
}
function testLoggersByRuntimeNotFound() returns error? {
    string query = string `
        query {
            loggersByRuntime(runtimeId: "${LOGGERS_INVALID_RUNTIME_ID}") {
                items { componentName }
                pageInfo { total limit offset }
            }
        }
    `;

    json response = check executeGraphQL(query, orgDevToken);

    test:assertFalse(response.errors is json, "Non-existent runtime should return empty list, not an error");

    json data = check response.data;
    json page = check data.loggersByRuntime;
    json[] items = check page.items.ensureType();
    int total = check (check (check page.pageInfo).total).ensureType();

    test:assertEquals(items.length(), 0, "Should return empty items for non-existent runtime");
    test:assertEquals(total, 0, "total should be 0 for non-existent runtime");
}

// =============================================================================
// Test 3: loggersByRuntime — user with no DB permissions gets empty list
// =============================================================================

@test:Config {
    groups: ["loggers-graphql"]
}
function testLoggersByRuntimeNoPermission() returns error? {
    string query = string `
        query {
            loggersByRuntime(runtimeId: "${RUNTIME_1_ID}") {
                items { componentName }
                pageInfo { total limit offset }
            }
        }
    `;

    json response = check executeGraphQL(query, loggersNoPermToken);

    test:assertFalse(response.errors is json, "No-permission user should get empty list, not an error");

    json data = check response.data;
    json page = check data.loggersByRuntime;
    json[] items = check page.items.ensureType();
    int total = check (check (check page.pageInfo).total).ensureType();

    test:assertEquals(items.length(), 0, "No-permission user should see no loggers");
    test:assertEquals(total, 0, "total should be 0 for no-permission user");
}

// =============================================================================
// Test 4: loggersByRuntime — pagination params are reflected in pageInfo
// =============================================================================

@test:Config {
    groups: ["loggers-graphql"],
    dependsOn: [testLoggersByRuntime]
}
function testLoggersByRuntimeWithPagination() returns error? {
    string query = string `
        query {
            loggersByRuntime(runtimeId: "${RUNTIME_1_ID}", pagination: { limit: 5, offset: 0 }) {
                items { componentName logLevel }
                pageInfo { total limit offset }
            }
        }
    `;

    json response = check executeGraphQL(query, orgDevToken);

    test:assertFalse(response.errors is json, "Paginated loggers query should not return errors");

    json data = check response.data;
    json page = check data.loggersByRuntime;
    json pageInfo = check page.pageInfo;
    int resultLimit = check (check pageInfo.'limit).ensureType();
    int offset = check (check pageInfo.offset).ensureType();

    test:assertEquals(resultLimit, 5, "pageInfo.limit should reflect requested limit");
    test:assertEquals(offset, 0, "pageInfo.offset should be 0");
}

// =============================================================================
// Test 5: loggersByRuntime — project-scoped user can access their project's runtime
// =============================================================================

@test:Config {
    groups: ["loggers-graphql"]
}
function testLoggersByRuntimeProjectScopedUser() returns error? {
    string query = string `
        query {
            loggersByRuntime(runtimeId: "${RUNTIME_1_ID}") {
                items { componentName }
                pageInfo { total limit offset }
            }
        }
    `;

    json response = check executeGraphQL(query, project1AdminToken);

    test:assertFalse(response.errors is json, "Project admin should be able to query loggers for their project");

    json data = check response.data;
    json page = check data.loggersByRuntime;
    json[] items = check page.items.ensureType();
    int total = check (check (check page.pageInfo).total).ensureType();

    test:assertEquals(items.length(), total, "items count should match total");
}

// =============================================================================
// Test 6: one logger the runtime described incompletely does not hide the rest
// =============================================================================
// MI answered /management/logging with an entry carrying neither name, seconds after a
// level change, and the whole page went to "No loggers found" until something refetched
// it. The list is projected entry by entry so that a bad entry costs one row.

@test:Config {
    groups: ["loggers-graphql"]
}
function testAnIncompleteLoggerEntryCostsOnlyItself() returns error? {
    json answer = {
        count: 3,
        list: [
            {level: "INFO", componentName: "root", loggerName: "rootLogger"},
            {level: "DEBUG"},
            {level: "ERROR", componentName: "com.hazelcast", loggerName: "com-hazelcast"}
        ]
    };

    types:MgmtLoggerInfo[] reported = check reportedLoggers(answer);

    test:assertEquals(reported.length(), 2, "the two complete entries should survive");
    test:assertEquals(reported[0].loggerName, "rootLogger");
    test:assertEquals(reported[1].loggerName, "com-hazelcast");
}

@test:Config {
    groups: ["loggers-graphql"]
}
function testAnAnswerWithoutAListIsAnError() returns error? {
    // Distinct from the above: nothing was reported at all, which is the runtime failing
    // to answer rather than one logger being unreadable, and the caller must hear about it.
    types:MgmtLoggerInfo[]|error reported = reportedLoggers({count: 0});
    test:assertTrue(reported is error, "an answer with no list should not read as no loggers");
}
