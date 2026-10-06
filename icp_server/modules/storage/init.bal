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
    DbCredentials credentials = check resolveDbCredentials(dbType,
            check utils:resolveConfig(dbUser, secrets), check utils:resolveConfig(dbPassword, secrets),
            "dbUser and dbPassword under [icp_server.storage]");
    DatabaseConnectionManager dbManager = check new (dbType, dbHost, dbPort, dbName, credentials.user, credentials.password, dbUseTLS);
    return dbManager.getClient();
}
