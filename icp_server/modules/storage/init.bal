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

import icp_server.utils;

import ballerina/sql;

// Initialized at module load time with resolved (decrypted) credentials.
final sql:Client dbClient = check createDbClient();

function createDbClient() returns sql:Client|error {
    map<string> dbSecrets = check resolveSecretsTable();
    string resolvedUser = check utils:resolveConfig(dbUser, dbSecrets);
    string resolvedPassword = check utils:resolveConfig(dbPassword, dbSecrets);
    DatabaseConnectionManager dbManager = check new (dbType, dbHost, dbPort, dbName, resolvedUser, resolvedPassword, dbUseTLS);
    return dbManager.getClient();
}

// Aliases come from the top-level [secrets] table (the one the cipher tool encrypts), with
// [icp_server.storage.secrets] taking precedence. The TOML config is read only when an alias is used.
function resolveSecretsTable() returns map<string>|error {
    if !utils:isSecretAlias(dbUser) && !utils:isSecretAlias(dbPassword) {
        return secrets;
    }
    map<string> merged = check utils:readTopLevelSecrets();
    foreach [string, string] [alias, value] in secrets.entries() {
        merged[alias] = value;
    }
    return merged;
}
