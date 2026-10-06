// Copyright (c) 2026, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
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

import icp_server.storage;

import ballerina/test;

const string TEST_DB_CONFIG_KEYS = "dbUser and dbPassword under [icp_server.storage]";

@test:Config {}
function testConfiguredDbCredentialsAreUsedAsIs() returns error? {
    storage:DbCredentials credentials = check storage:resolveDbCredentials("postgresql", "icp", "S3cret", TEST_DB_CONFIG_KEYS);
    test:assertEquals(credentials, {user: "icp", password: "S3cret"});
}

@test:Config {}
function testUnsetH2CredentialsFallBackToQuickStart() returns error? {
    storage:DbCredentials credentials = check storage:resolveDbCredentials("h2", "", "", TEST_DB_CONFIG_KEYS);
    test:assertEquals(credentials, {user: "icp_user", password: "icp_password"});
}

@test:Config {}
function testPartiallySetH2CredentialsKeepConfiguredValue() returns error? {
    storage:DbCredentials credentials = check storage:resolveDbCredentials("h2", "admin", "", TEST_DB_CONFIG_KEYS);
    test:assertEquals(credentials, {user: "admin", password: "icp_password"});
}

@test:Config {}
function testUnsetCredentialsFailForExternalDatabases() {
    foreach string dbType in ["mysql", "postgresql", "mssql", "oracle"] {
        storage:DbCredentials|error noCredentials = storage:resolveDbCredentials(dbType, "", "", TEST_DB_CONFIG_KEYS);
        if noCredentials !is error {
            test:assertFail(string `expected an error for ${dbType} without credentials`);
        }
        test:assertTrue(noCredentials.message().includes(TEST_DB_CONFIG_KEYS));

        storage:DbCredentials|error noPassword = storage:resolveDbCredentials(dbType, "icp", "", TEST_DB_CONFIG_KEYS);
        test:assertTrue(noPassword is error, string `expected an error for ${dbType} without a password`);
    }
}
