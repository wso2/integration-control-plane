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

import ballerina/file;

// ICP version
configurable string icpVersion = "2.0.0-SNAPSHOT";

// Server configuration
configurable int serverPort = 9446;
configurable int defaultOpensearchAdaptorPort = 9449;
configurable int runtimeListenerPort = 9445;

configurable string serverHost = "0.0.0.0";
configurable string organization = "WSO2 Inc.";

// Publicly reachable base URL of the ICP server (scheme + host + port, no trailing slash).
// Frontend-facing backend URLs and the CORS allowlist are derived from this by default.
configurable string publicBaseUrl = "https://localhost:9446";

configurable boolean sslEnabled = true;
configurable string keystorePath = check file:joinPath("..", "conf", "security", "wso2carbon.jks");
configurable string keystorePassword = "wso2carbon";
configurable string truststorePath = check file:joinPath("..", "conf", "security", "client-truststore.jks");
configurable string truststorePassword = "wso2carbon";

configurable int schedulerIntervalSeconds = 60;
configurable int refreshTokenCleanupIntervalSeconds = 86400; // 24 hours (in seconds)

// How often the workflow tunnel is swept: unconfirmed mutations expired and surfaced, and
// rows nobody can still be served deleted. Five minutes is well inside the 30-minute
// mutation deadline, so an expiry is noticed promptly without polling the tables hard.
configurable int workflowSweepIntervalSeconds = 300;

// Reach MI management APIs through the heartbeat command tunnel instead of dialling the
// runtime (see mi_tunnel.bal). For deployments where nothing routes from the ICP to a
// runtime's management port — MI behind a load balancer is the case this exists for.
//
// Off by default because it needs an MI new enough to execute tunneled commands. An older
// one ignores them silently, so the symptom of turning this on too early is management
// views that report the runtime never answered.
configurable boolean miTunnelEnabled = false;

// Runtime auth configuration (runtime and server communication)
configurable string jwtIssuer = "icp-runtime-jwt-issuer";
configurable string|string[] jwtAudience = "icp-server";
configurable string publicCertFile = "./resources/keys/public.cert";
configurable decimal jwtClockSkewSeconds = 10;

// Frontend auth configuration (frontend and server communication)
configurable string frontendJwtHMACSecret = "default-secret-key-at-least-32-characters-long-for-hs256";
configurable string frontendJwtIssuer = "icp-frontend-jwt-issuer";
configurable string frontendJwtAudience = "icp-server";

// Backend auth configuration (server and user service communication)
configurable string userServiceJwtHMACSecret = "default-secret-key-at-least-32-characters-long-for-hs256";
configurable string userServiceJwtIssuer = "icp-user-service-jwt-issuer";
configurable string userServiceJwtAudience = "icp-user-service-jwt-audience";
configurable decimal userServiceJwtClockSkewSeconds = 0;

configurable int defaultTokenExpiryTime = 3600; // 1 hour (in seconds)

// CORS configuration — restrict to known origins; default matches the local dev server
configurable string[] corsAllowedOrigins = [publicBaseUrl, "http://localhost:5173"];

// Normalize a CORS origin by removing trailing slashes to ensure consistent matching
public isolated function normalizeCorsOrigin(string origin) returns string {
    return origin.endsWith("/") ? origin.substring(0, origin.length() - 1) : origin;
}

// Normalize CORS origins by removing trailing slashes to ensure consistent matching
final string[] normalizedCorsAllowedOrigins = from string origin in corsAllowedOrigins
    select normalizeCorsOrigin(origin);

// TLS cipher suites — GCM and ChaCha20 only; CBC ciphers excluded (BEAST/POODLE/Lucky13)
configurable string[] tlsCiphers = [
    "TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384",
    "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
    "TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256",
    "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
    "TLS_DHE_RSA_WITH_AES_256_GCM_SHA384",
    "TLS_DHE_RSA_WITH_AES_128_GCM_SHA256",
    "TLS_AES_256_GCM_SHA384",
    "TLS_CHACHA20_POLY1305_SHA256",
    "TLS_AES_128_GCM_SHA256"
];

//Backend URLs for the frontend to call
configurable string backendGraphqlEndpoint = publicBaseUrl + "/graphql";
configurable string backendAuthBaseUrl = publicBaseUrl + "/auth";
configurable string backendObservabilityEndpoint = publicBaseUrl + "/icp/observability";
configurable string backendWorkflowEndpoint = publicBaseUrl + "/icp/workflow";
configurable string backendTryitEndpoint = publicBaseUrl + "/icp/tryit";

// WebSocket endpoint — shares the main HTTPS port so no separate cert trust is needed
configurable string backendWsUrl = toWsScheme(publicBaseUrl) + "/runtime-status";

// Map an http(s) base URL to its ws(s) equivalent
isolated function toWsScheme(string baseUrl) returns string {
    if baseUrl.startsWith("https://") {
        return "wss://" + baseUrl.substring(8);
    }
    if baseUrl.startsWith("http://") {
        return "ws://" + baseUrl.substring(7);
    }
    return baseUrl;
}

// Refresh token configuration
configurable int refreshTokenExpiryTime = 86400; // 1 day (in seconds)
configurable boolean enableRefreshTokenRotation = true; // Rotate refresh token on each use
configurable int maxRefreshTokensPerUser = 10; // Maximum number of active refresh tokens per user (0 = unlimited)

// Authentication backend configuration 
configurable string authBackendUrl = "https://localhost:9447";
configurable string ldapAuthBackendUrl = "https://localhost:9450";
// SSO (OIDC) configuration
configurable boolean ssoEnabled = false;
configurable string ssoIssuer = "";
configurable string ssoAuthorizationEndpoint = "";
configurable string ssoTokenEndpoint = "";
configurable string ssoLogoutEndpoint = "";
configurable string ssoClientId = "";
configurable string ssoClientSecret = "";
configurable string ssoRedirectUri = "";
configurable string ssoUsernameClaim = "email"; // Claim to use for username: "email" or "preferred_username"
configurable string[] ssoScopes = ["openid", "email", "profile"];
configurable string ssoJwksUrl = ""; // OIDC provider's JWKS endpoint (e.g. https://provider/.well-known/jwks.json)
configurable boolean ssoAllowInsecureTLS = false; // Set true for local/self-signed OIDC provider certs
configurable boolean passwordLoginDisabled = false; // Set true to allow only SSO login
configurable string ssoAdminClaim = ""; // Claim used to identify SSO super admins when password login is disabled
configurable string[] ssoAdminValues = []; // Claim values that grant super admin access in SSO-only mode
configurable boolean federatedAccessControlEnabled = false; // Manage group membership from IdP claims via SSO mappings; requires passwordLoginDisabled

// Logging configuration
configurable string logLevel = "INFO"; // DEBUG, INFO, WARN, ERROR
configurable boolean enableAuditLogging = true;
configurable string auditLogFilePath = "../logs/audit.log";
configurable boolean enableMetrics = true;

// Observability Adapter configuration
configurable string observabilityBackendURL = "https://localhost:" + defaultOpensearchAdaptorPort.toString();
configurable string observabilityJwtHMACSecret = "default-secret-key-at-least-32-characters-long-for-hs256";
configurable string observabilityTruststorePassword = truststorePassword;
configurable ObservabilityJwtConfig observabilityJwt = {};
configurable ObservabilitySecureSocketConfig observabilitySecureSocket = {};
configurable ObservabilityClientConfig observabilityClient = {};

// OpenSearch configuration
configurable string opensearchUrl = "https://localhost:9200";
configurable string opensearchUsername = "admin";
configurable string opensearchPassword = "Ballerina@123";

// If true, HTTPS certificate validation will be disabled for calls to the icp artifacts API.
// Keep this true for local/self-signed certs; set to false in production with a proper truststore.
configurable boolean artifactsApiAllowInsecureTLS = true;

// Secrets map containing values encrypted by the WSO2 cipher tool.
// All values present in this table are expected to be encrypted; plaintext values will cause an error.
configurable map<string> secrets = {};

// Any configurable that can be encrypted should first be resolved here.
// Initialized by decrypting (if value is "$secret{alias}") or returned as-is.
// All code outside config.bal must use these resolved variables.
final string resolvedKeystorePassword = check resolveSecret(keystorePassword);
final string resolvedTruststorePassword = check resolveSecret(truststorePassword);
final string resolvedFrontendJwtHMACSecret = check resolveSecret(frontendJwtHMACSecret);
final string resolvedUserServiceJwtHMACSecret = check resolveSecret(userServiceJwtHMACSecret);
final string resolvedSsoClientId = check resolveSecret(ssoClientId);
final string resolvedSsoClientSecret = check resolveSecret(ssoClientSecret);
final string resolvedObservabilityJwtHMACSecret = check resolveSecret(observabilityJwtHMACSecret);
final string resolvedObservabilityTruststorePassword = check resolveSecret(observabilityTruststorePassword);
final string resolvedOpensearchUsername = check resolveSecret(opensearchUsername);
final string resolvedOpensearchPassword = check resolveSecret(opensearchPassword);

// Build SSO configuration from configurable values
public isolated function getSSOConfig() returns types:SSOConfig => {
    enabled: ssoEnabled,
    issuer: ssoIssuer,
    authorizationEndpoint: ssoAuthorizationEndpoint,
    tokenEndpoint: ssoTokenEndpoint,
    logoutEndpoint: ssoLogoutEndpoint,
    jwksUrl: ssoJwksUrl,
    clientId: resolvedSsoClientId,
    clientSecret: resolvedSsoClientSecret,
    redirectUri: ssoRedirectUri,
    usernameClaim: ssoUsernameClaim,
    scopes: ssoScopes,
    allowInsecureTLS: ssoAllowInsecureTLS,
    passwordLoginDisabled,
    adminClaim: ssoAdminClaim,
    adminValues: ssoAdminValues,
    federatedAccessControlEnabled
};

// Validate SSO configuration
public isolated function validateSSOConfig(types:SSOConfig config) returns error? {
    if config.passwordLoginDisabled && !config.enabled {
        return error("'passwordLoginDisabled' requires 'ssoEnabled' to be true");
    }
    if config.federatedAccessControlEnabled && !config.enabled {
        return error("'federatedAccessControlEnabled' requires 'ssoEnabled' to be true");
    }
    if config.federatedAccessControlEnabled && !config.passwordLoginDisabled {
        return error("'federatedAccessControlEnabled' requires 'passwordLoginDisabled' to be true. " +
            "Combining federated access control with password login is not supported");
    }

    if !config.enabled {
        // SSO is disabled, no validation needed
        return;
    }

    // Validate required fields
    if config.issuer.trim() == "" {
        return error("SSO is enabled but 'ssoIssuer' is not configured");
    }
    if config.authorizationEndpoint.trim() == "" {
        return error("SSO is enabled but 'ssoAuthorizationEndpoint' is not configured");
    }
    if config.tokenEndpoint.trim() == "" {
        return error("SSO is enabled but 'ssoTokenEndpoint' is not configured");
    }
    if config.logoutEndpoint.trim() == "" {
        return error("SSO is enabled but 'ssoLogoutEndpoint' is not configured");
    }
    if config.jwksUrl.trim() == "" {
        return error("SSO is enabled but 'ssoJwksUrl' is not configured. " +
            "Set it to the OIDC provider's JWKS endpoint (e.g. https://provider/.well-known/jwks.json)");
    }
    if config.clientId.trim() == "" {
        return error("SSO is enabled but 'ssoClientId' is not configured");
    }
    if config.clientSecret.trim() == "" {
        return error("SSO is enabled but 'ssoClientSecret' is not configured");
    }
    if config.redirectUri.trim() == "" {
        return error("SSO is enabled but 'ssoRedirectUri' is not configured");
    }

    // Validate usernameClaim is either "email" or "preferred_username"
    if config.usernameClaim != "email" && config.usernameClaim != "preferred_username" {
        return error("'ssoUsernameClaim' must be either 'email' or 'preferred_username'");
    }

    // Validate scopes contain at least "openid"
    if config.scopes.length() == 0 {
        return error("'ssoScopes' must contain at least 'openid' scope");
    }

    boolean hasOpenIdScope = false;
    foreach string scope in config.scopes {
        if scope == "openid" {
            hasOpenIdScope = true;
            break;
        }
    }

    if !hasOpenIdScope {
        return error("'ssoScopes' must include 'openid' scope");
    }

    if config.passwordLoginDisabled {
        if config.adminClaim.trim() == "" {
            return error("'ssoAdminClaim' must be configured when 'passwordLoginDisabled' is true");
        }
        if config.adminValues.length() == 0 {
            return error("'ssoAdminValues' must contain at least one value when 'passwordLoginDisabled' is true");
        }
        foreach string adminValue in config.adminValues {
            if adminValue.trim() == "" {
                return error("'ssoAdminValues' cannot contain empty values when 'passwordLoginDisabled' is true");
            }
        }
    }
}
