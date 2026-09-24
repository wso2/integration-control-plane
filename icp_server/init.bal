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
import icp_server.types;
import icp_server.utils;

import ballerina/http;
import ballerina/jwt;
import ballerina/log;

function init() returns error? {
    // Initialize HTTP client to authentication backend using resolved TLS and JWT secrets
    http:ClientSecureSocket authBackendSecureSocket = {
        cert: {
            path: truststorePath,
            password: resolvedTruststorePassword
        }
    };
    http:JwtIssuerConfig authBackendJwtConfig = {
        issuer: userServiceJwtIssuer,
        audience: userServiceJwtAudience,
        expTime: 3600,
        signatureConfig: {
            algorithm: jwt:HS256,
            config: resolvedUserServiceJwtHMACSecret
        }
    };

    log:printInfo("Initializing ICP server");
    authBackendClient = check new (ldapUserStoreEnabled ? ldapAuthBackendUrl : authBackendUrl,
        secureSocket = authBackendSecureSocket,
        auth = authBackendJwtConfig
    );

    // Initialize JWT signature config used throughout auth_service.bal
    jwtSignatureConfig = {
        algorithm: jwt:HS256,
        config: resolvedFrontendJwtHMACSecret
    };

    // Initialize OpenSearch client using resolved credentials
    // This client is optional - if initialization fails, OpenSearch functionality will be unavailable
    http:Client|error opensearchClientResult = new (opensearchUrl,
        config = {
            auth: {
                username: resolvedOpensearchUsername,
                password: resolvedOpensearchPassword
            },
            secureSocket: {
                enable: false
            }
        }
    );

    if opensearchClientResult is error {
        log:printWarn(string `Failed to initialize OpenSearch client: ${opensearchClientResult.message()}. OpenSearch functionality will be unavailable.`);
        opensearchClient = ();
    } else {
        opensearchClient = opensearchClientResult;
        log:printInfo("OpenSearch client initialized successfully");
    }

    types:SSOConfig ssoConfig = getSSOConfig();
    if ssoConfig.passwordLoginDisabled || ssoConfig.federatedAccessControlEnabled {
        check validateSSOConfig(ssoConfig);
    }

    // Initialize audit logging
    storage:initAuditLogging(enableAuditLogging, auditLogFilePath);

    // Initialize the runtime scheduler
    check initRuntimeScheduler();

    logMIAccessMode();

    log:printInfo("ICP server initialization completed successfully");
}

// Resolves a configurable value for the default module.
// If the value matches "$secret{alias}", looks up the alias in the [icp_server.secrets] map and decrypts it.
// Otherwise returns the value unchanged (plain-text config).
function resolveSecret(string configValue) returns string|error {
    return utils:resolveConfig(configValue, secrets);
}
