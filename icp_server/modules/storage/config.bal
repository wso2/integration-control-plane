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

import icp_server.types;

// Database configuration
configurable string dbHost = "localhost";
configurable int dbPort = 5432;
configurable string dbName = "icp_db";
configurable string dbUser = "icp_user";
configurable string dbPassword = "icp_password";
configurable int maxOpenConnections = 10;
configurable int minIdleConnections = 5;
configurable decimal maxConnectionLifeTime = 1800.0; // 30 minutes
configurable DatabaseType dbType = "h2";
configurable boolean dbUseTLS = false; // TLS (TCPS) for Oracle, e.g. Autonomous Database

// Heartbeat timeout in seconds
configurable int heartbeatTimeoutSeconds = 30;

// Deployment type
configurable types:DeploymentType deploymentType = "VM";

// Artifacts API configuration
configurable boolean artifactsApiAllowInsecureTLS = true;

// Secrets map for the storage module — populated from [icp_server.storage.secrets] in Config.toml.
// Aliases are also resolved from the top-level [secrets] table (see createDbClient).
configurable map<string> secrets = {};

// Runtime auth configuration (runtime and server communication)
configurable string jwtIssuer = "icp-runtime-jwt-issuer";
configurable string|string[] jwtAudience = "icp-server";
configurable string publicCertFile = "./resources/keys/public.cert";
configurable decimal jwtClockSkewSeconds = 10;
configurable int defaultTokenExpiryTime = 3600; // 1 hour (in seconds)

