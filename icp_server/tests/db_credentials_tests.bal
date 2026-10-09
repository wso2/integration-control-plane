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
const string TEST_DB_NAME = "icp_db";

@test:Config {}
function testConfiguredDbCredentialsAreUsedAsIs() returns error? {
    storage:DbCredentials credentials = check storage:resolveDbCredentials("postgresql", TEST_DB_NAME, "icp", "S3cret",
            TEST_DB_CONFIG_KEYS);
    test:assertEquals(credentials, {user: "icp", password: "S3cret"});
}

@test:Config {}
function testEmptyDbPasswordIsAllowed() returns error? {
    storage:DbCredentials credentials = check storage:resolveDbCredentials("mysql", TEST_DB_NAME, "root", "",
            TEST_DB_CONFIG_KEYS);
    test:assertEquals(credentials, {user: "root", password: ""});
}

@test:Config {}
function testUnsetH2CredentialsFallBackToQuickStart() returns error? {
    storage:DbCredentials credentials = check storage:resolveDbCredentials("h2", TEST_DB_NAME, (), (), TEST_DB_CONFIG_KEYS);
    test:assertEquals(credentials, {user: "icp_user", password: "icp_password"});
}

@test:Config {}
function testPartiallySetH2CredentialsFail() {
    storage:DbCredentials|error noPassword = storage:resolveDbCredentials("h2", TEST_DB_NAME, "admin", (), TEST_DB_CONFIG_KEYS);
    test:assertTrue(noPassword is error, "expected an error for H2 with only a user");

    storage:DbCredentials|error noUser = storage:resolveDbCredentials("h2", TEST_DB_NAME, (), "secret", TEST_DB_CONFIG_KEYS);
    test:assertTrue(noUser is error, "expected an error for H2 with only a password");
}

@test:Config {}
function testBlankDbCredentialsFail() {
    storage:DbCredentials|error blankUser = storage:resolveDbCredentials("postgresql", TEST_DB_NAME, " ", "S3cret",
            TEST_DB_CONFIG_KEYS);
    test:assertTrue(blankUser is error, "expected an error for a blank user");

    storage:DbCredentials|error whitespacePassword = storage:resolveDbCredentials("postgresql", TEST_DB_NAME, "icp", "  ",
            TEST_DB_CONFIG_KEYS);
    test:assertTrue(whitespacePassword is error, "expected an error for a whitespace-only password");
}

@test:Config {}
function testUnsetCredentialsFailForExternalDatabases() {
    storage:DatabaseType[] externalDbTypes = [storage:MYSQL, storage:POSTGRESQL, storage:MSSQL, storage:ORACLE];
    foreach storage:DatabaseType dbType in externalDbTypes {
        storage:DbCredentials|error noCredentials = storage:resolveDbCredentials(dbType, TEST_DB_NAME, (), (),
                TEST_DB_CONFIG_KEYS);
        if noCredentials !is error {
            test:assertFail(string `expected an error for ${dbType} without credentials`);
        }
        test:assertTrue(noCredentials.message().includes(TEST_DB_CONFIG_KEYS));

        storage:DbCredentials|error noPassword = storage:resolveDbCredentials(dbType, TEST_DB_NAME, "icp", (),
                TEST_DB_CONFIG_KEYS);
        test:assertTrue(noPassword is error, string `expected an error for ${dbType} without a password`);
    }
}
