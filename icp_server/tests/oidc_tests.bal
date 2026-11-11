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

import ballerina/http;
import ballerina/jwt;
import ballerina/log;
import ballerina/test;

import icp_server.auth;
import icp_server.storage;
import icp_server.types;

// Test configuration
const string AUTH_SERVICE_URL = "https://localhost:9446";
const string MOCK_OIDC_PROVIDER_PORT = "9458";
const string MOCK_OIDC_PROVIDER_URL = "http://localhost:" + MOCK_OIDC_PROVIDER_PORT;

// Mock OIDC provider data
const string MOCK_ISSUER = MOCK_OIDC_PROVIDER_URL + "/oauth2/token";
const string MOCK_CLIENT_ID = "test-client-id";
const string MOCK_CLIENT_SECRET = "test-client-secret";
const string MOCK_REDIRECT_URI = "http://localhost:3000/sso/callback";
const string VALID_AUTH_CODE = "valid-auth-code-12345";
const string INVALID_AUTH_CODE = "invalid-auth-code";
const string EXPIRED_AUTH_CODE = "expired-auth-code";

// Test user data (must match mock_oidc_provider.bal)
const string TEST_USER_ID = "550e8400-e29b-41d4-a716-446655440001";
const string TEST_USER_EMAIL = "[email protected]";
const string TEST_USER_NAME = "Test User";
const string NEW_USER_CODE = "new-user-auth-code";

// ============================================================================
// OIDC Tests
// ============================================================================
// Note: Mock OIDC provider service runs in mock_oidc_provider.bal on port 9448

// Test: Get OIDC authorization URL (when SSO is enabled)
@test:Config {
    groups: ["oidc", "authorization"]
}
function testGetAuthorizationUrl() returns error? {
    // Send request to get authorization URL
    http:Response response = check authClient->get("/auth/oidc/authorize-url");

    // Assert response status
    test:assertEquals(response.statusCode, 200, "Expected status code 200 for authorization URL request");

    // Parse response body
    json responseBody = check response.getJsonPayload();

    // Assert response structure
    test:assertTrue(responseBody.authorizationUrl is string, "Authorization URL should be present");

    string authUrl = check responseBody.authorizationUrl;

    // Verify URL contains required parameters
    test:assertTrue(authUrl.includes("response_type=code"), "URL should contain response_type=code");
    test:assertTrue(authUrl.includes("client_id="), "URL should contain client_id");
    test:assertTrue(authUrl.includes("redirect_uri="), "URL should contain redirect_uri");
    test:assertTrue(authUrl.includes("scope="), "URL should contain scope");
    test:assertTrue(authUrl.includes("state="), "URL should contain state parameter");

    log:printInfo("OIDC Test: Authorization URL generated successfully");
}

// Test: Get OIDC authorization URL with custom state parameter
@test:Config {
    groups: ["oidc", "authorization", "csrf"]
}
function testGetAuthorizationUrlWithState() returns error? {
    // Send request to get authorization URL with custom state
    string customState = "custom-csrf-token-12345";
    http:Response response = check authClient->get("/auth/oidc/authorize-url?state=" + customState);

    // Assert response status
    test:assertEquals(response.statusCode, 200, "Expected status code 200 for authorization URL request");

    // Parse response body
    json responseBody = check response.getJsonPayload();

    // Assert response structure
    test:assertTrue(responseBody.authorizationUrl is string, "Authorization URL should be present");

    string authUrl = check responseBody.authorizationUrl;

    // Verify URL contains the custom state parameter
    test:assertTrue(authUrl.includes("state=" + customState), "URL should contain custom state parameter");

    log:printInfo("OIDC Test: Authorization URL with custom state generated successfully");
}

// Test: Get OIDC authorization URL when SSO is disabled
@test:Config {
    groups: ["oidc", "authorization", "negative"],
    enable: false // Enable this when you want to test with SSO disabled
}
function testGetAuthorizationUrlWhenSSODisabled() returns error? {
    // This test assumes SSO is disabled in config
    http:Response response = check authClient->get("/auth/oidc/authorize-url");

    // Assert response status (should be 400 Bad Request)
    test:assertEquals(response.statusCode, 400, "Expected status code 400 when SSO is disabled");

    // Parse response body
    json responseBody = check response.getJsonPayload();

    // Assert error message
    test:assertTrue(responseBody.message is string, "Error message should be present");

    string message = check responseBody.message;
    test:assertTrue(
            message.toLowerAscii().includes("not enabled") || message.toLowerAscii().includes("disabled"),
            "Error message should indicate SSO is not enabled"
    );
}

// Test: OIDC login with valid authorization code
@test:Config {
    groups: ["oidc", "login"],
    dependsOn: [testGetAuthorizationUrl]
}
function testOIDCLoginWithValidCode() returns error? {
    // Prepare OIDC login request with valid authorization code
    json loginRequest = {
        code: VALID_AUTH_CODE,
        state: "test-state-123" // Optional CSRF protection state
    };

    // Send OIDC login request
    http:Response response = check authClient->post("/auth/login/oidc", loginRequest);

    // Assert response status
    test:assertEquals(response.statusCode, 200, "Expected status code 200 for successful OIDC login");

    // Parse response body
    json responseBody = check response.getJsonPayload();

    // Assert response structure
    test:assertTrue(responseBody.token is string, "Token should be present in response");
    test:assertTrue(responseBody.expiresIn is int, "ExpiresIn should be present in response");
    test:assertTrue(responseBody.username is string, "Username should be present in response");
    test:assertTrue(responseBody.permissions is json[], "Permissions should be present in response");
    test:assertTrue(responseBody.refreshToken is string, "Refresh token should be present in response");
    test:assertTrue(responseBody.refreshTokenExpiresIn is int, "Refresh token expiresIn should be present in response");
    test:assertTrue(responseBody.displayName is string, "Display name should be present in response");
    json[] permissions = check responseBody.permissions.ensureType();
    test:assertTrue(permissions.toString().includes(auth:PERMISSION_USER_MANAGE_GROUPS),
            "OIDC admin claim should grant Super Admins permissions before token generation");

    // Validate JWT token
    string token = check responseBody.token;
    test:assertTrue(token.length() > 0, "Token should not be empty");
    
    // Validate refresh token
    string refreshToken = check responseBody.refreshToken;
    test:assertTrue(refreshToken.length() > 0, "Refresh token should not be empty");
    test:assertNotEquals(token, refreshToken, "Refresh token should be different from access token");
    
    // Validate token expiry times
    int expiresIn = check responseBody.expiresIn;
    int refreshTokenExpiresIn = check responseBody.refreshTokenExpiresIn;
    test:assertTrue(refreshTokenExpiresIn > expiresIn, "Refresh token should have longer expiry than access token");

    // Decode JWT to verify claims
    [jwt:Header, jwt:Payload] [_, payload] = check jwt:decode(token);

    // Verify JWT claims
    test:assertTrue(payload.sub is string, "Subject should be present in JWT");
    test:assertEquals(payload["username"], TEST_USER_EMAIL, "Username should match the OIDC user email");
    test:assertEquals(payload["displayName"], TEST_USER_NAME, "Display name should match OIDC user name");
    string scope = check payload["scope"].ensureType();
    test:assertTrue(scope.includes(auth:PERMISSION_USER_MANAGE_GROUPS),
            "OIDC admin claim should grant Super Admins scope in the JWT");

    log:printInfo("OIDC Test: Successfully logged in with valid authorization code");
}

// Test: OIDC login with invalid authorization code
@test:Config {
    groups: ["oidc", "login", "negative"]
}
function testOIDCLoginWithInvalidCode() returns error? {
    // Prepare OIDC login request with invalid authorization code
    json loginRequest = {
        code: INVALID_AUTH_CODE
    };

    // Send OIDC login request
    http:Response response = check authClient->post("/auth/login/oidc", loginRequest);

    // Assert response status (should be 401 Unauthorized)
    test:assertEquals(response.statusCode, 401, "Expected status code 401 for invalid authorization code");

    // Parse response body
    json responseBody = check response.getJsonPayload();

    // Assert error message
    test:assertTrue(responseBody.message is string, "Error message should be present");

    log:printInfo("OIDC Test: Invalid authorization code rejected as expected");
}

// Test: OIDC login with expired authorization code
@test:Config {
    groups: ["oidc", "login", "negative"]
}
function testOIDCLoginWithExpiredCode() returns error? {
    // Prepare OIDC login request with expired authorization code
    json loginRequest = {
        code: EXPIRED_AUTH_CODE
    };

    // Send OIDC login request
    http:Response response = check authClient->post("/auth/login/oidc", loginRequest);

    // Assert response status (should be 401 Unauthorized)
    test:assertEquals(response.statusCode, 401, "Expected status code 401 for expired authorization code");

    // Parse response body
    json responseBody = check response.getJsonPayload();

    // Assert error message
    test:assertTrue(responseBody.message is string, "Error message should be present");

    log:printInfo("OIDC Test: Expired authorization code rejected as expected");
}

// Test: OIDC login with missing authorization code
@test:Config {
    groups: ["oidc", "login", "negative"]
}
function testOIDCLoginWithMissingCode() returns error? {
    // Prepare OIDC login request without authorization code
    json loginRequest = {};

    // Send OIDC login request
    http:Response response = check authClient->post("/auth/login/oidc", loginRequest);

    // Assert response status (should be 400 or 500)
    test:assertTrue(
            response.statusCode == 400 || response.statusCode == 500,
            "Expected status code 400 or 500 for missing authorization code"
    );

    log:printInfo("OIDC Test: Missing authorization code rejected as expected");
}

// Test: OIDC user auto-creation on first login
@test:Config {
    groups: ["oidc", "login", "user-creation"],
    dependsOn: [testOIDCLoginWithValidCode]
}
function testOIDCUserAutoCreation() returns error? {
    json loginRequest = {
        code: NEW_USER_CODE,
        state: "test-state-789" // Optional CSRF protection state
    };

    // Send OIDC login request (first time for this user)
    http:Response response = check authClient->post("/auth/login/oidc", loginRequest);

    // Assert response status
    test:assertEquals(response.statusCode, 200, "Expected status code 200 for new OIDC user");

    // Parse response body
    json responseBody = check response.getJsonPayload();

    // Assert user was created successfully
    test:assertTrue(responseBody.token is string, "Token should be present for auto-created user");
    test:assertTrue(responseBody.username is string, "Username should be present");

    // Decode JWT to verify user ID matches the one from OIDC
    string token = check responseBody.token;
    [jwt:Header, jwt:Payload] [_, payload] = check jwt:decode(token);

    test:assertEquals(payload.sub, TEST_USER_ID, "User ID should match the OIDC sub claim");

    log:printInfo("OIDC Test: New user auto-created successfully on first login");
}

// Test: Verify ID token claim extraction
@test:Config {
    groups: ["oidc", "claims"]
}
function testIDTokenClaimExtraction() returns error? {
    json loginRequest = {
        code: VALID_AUTH_CODE,
        state: "test-state-456" // Optional CSRF protection state
    };

    http:Response response = check authClient->post("/auth/login/oidc", loginRequest);

    test:assertEquals(response.statusCode, 200, "Expected successful login");

    json responseBody = check response.getJsonPayload();
    string token = check responseBody.token;

    // Decode ICP JWT
    [jwt:Header, jwt:Payload] [_, payload] = check jwt:decode(token);

    // Verify that OIDC claims were correctly extracted and mapped
    test:assertTrue(payload["username"] is string, "Username should be extracted from OIDC email claim");
    test:assertTrue(payload["displayName"] is string, "Display name should be extracted from OIDC name claim");

    string username = check payload["username"].ensureType();
    string displayName = check payload["displayName"].ensureType();

    test:assertEquals(username, TEST_USER_EMAIL, "Username should match OIDC email");
    test:assertEquals(displayName, TEST_USER_NAME, "Display name should match OIDC name");

    log:printInfo("OIDC Test: ID token claims extracted correctly");
}

// Test: Verify provider-specific OIDC claim path extraction
@test:Config {
    groups: ["oidc", "claims", "claim-paths"]
}
function testOIDCClaimPathExtraction() {
    types:OIDCIdTokenClaims claims = {
        sub: TEST_USER_ID,
        iss: MOCK_ISSUER,
        aud: MOCK_CLIENT_ID,
        exp: 2000000000,
        iat: 1999999000,
        email: TEST_USER_EMAIL,
        name: TEST_USER_NAME,
        rawClaims: {
            "sub": TEST_USER_ID,
            "iss": MOCK_ISSUER,
            "aud": MOCK_CLIENT_ID,
            "exp": 2000000000,
            "iat": 1999999000,
            "email": TEST_USER_EMAIL,
            "name": TEST_USER_NAME,
            "groups": ["icp-platform-admins", "developers"],
            "roles": "platform-admin",
            "realm_access": {
                "roles": ["realm-admin", "realm-auditor"]
            },
            "resource_access": {
                "icp": {
                    "roles": ["icp-admin", "icp-viewer"]
                }
            },
            "invalid_claim": {"roles": ["not-a-string-root"]},
            "mixed_values": ["valid", 100, true, "also-valid"]
        }
    };

    test:assertEquals(auth:extractClaimValues(claims, "groups"),
            ["icp-platform-admins", "developers"], "Should extract string array claims");
    test:assertEquals(auth:extractClaimValues(claims, "roles"),
            ["platform-admin"], "Should normalize scalar string claims");
    test:assertEquals(auth:extractClaimValues(claims, "realm_access.roles"),
            ["realm-admin", "realm-auditor"], "Should extract nested claim paths");
    test:assertEquals(auth:extractClaimValues(claims, "resource_access.icp.roles"),
            ["icp-admin", "icp-viewer"], "Should extract deeper nested claim paths");
    test:assertEquals(auth:extractClaimValues(claims, "missing.roles"),
            [], "Missing claim paths should return an empty list");
    test:assertEquals(auth:extractClaimValues(claims, "invalid_claim"),
            [], "Unsupported claim shapes should return an empty list");
    test:assertEquals(auth:extractClaimValues(claims, "mixed_values"),
            ["valid", "also-valid"], "Non-string values in arrays should be ignored");
}

@test:Config {
    groups: ["oidc", "claims", "group-mapping"]
}
function testResolveFederatedGroupMemberships() {
    types:OIDCIdTokenClaims claims = {
        sub: TEST_USER_ID,
        iss: MOCK_ISSUER,
        aud: MOCK_CLIENT_ID,
        exp: 2000000000,
        iat: 1999999000,
        rawClaims: {
            "groups": ["developers", "auditors"],
            "realm_access": {
                "roles": ["realm-admin"]
            }
        }
    };

    types:SSOGroupMapping[] mappings = [
        {
            mappingId: "mapping-1",
            orgUuid: storage:DEFAULT_ORG_ID,
            issuer: MOCK_ISSUER,
            claimName: "groups",
            claimValue: "developers",
            groupId: "group-developers"
        },
        {
            mappingId: "mapping-2",
            orgUuid: storage:DEFAULT_ORG_ID,
            issuer: MOCK_ISSUER,
            claimName: "realm_access.roles",
            claimValue: "realm-admin",
            groupId: "group-realm-admins"
        },
        {
            mappingId: "mapping-3",
            orgUuid: storage:DEFAULT_ORG_ID,
            issuer: MOCK_ISSUER,
            claimName: "groups",
            claimValue: "auditors",
            groupId: "group-auditors",
            projectUuid: "project-1",
            integrationUuid: "integration-1"
        },
        {
            mappingId: "mapping-4",
            orgUuid: storage:DEFAULT_ORG_ID,
            issuer: "https://other-idp.example.com",
            claimName: "groups",
            claimValue: "developers",
            groupId: "group-other-issuer"
        }
    ];

    types:FederatedGroupMembershipInput[] memberships =
        auth:resolveFederatedGroupMemberships(claims, mappings);

    test:assertEquals(memberships.length(), 3,
        "Only mappings for the validated issuer should resolve, regardless of scope");
    test:assertTrue(hasDesiredFederatedMembership(memberships, "group-developers", "groups", "developers"),
        "Flat group claims should resolve");
    test:assertTrue(hasDesiredFederatedMembership(
        memberships, "group-realm-admins", "realm_access.roles", "realm-admin"),
        "Nested role claims should resolve");
    test:assertTrue(hasDesiredFederatedMembership(memberships, "group-auditors", "groups", "auditors"),
        "Scoped mappings should resolve the same as org-level mappings");
}

function hasDesiredFederatedMembership(types:FederatedGroupMembershipInput[] memberships,
        string groupId, string claimName, string claimValue) returns boolean {
    foreach types:FederatedGroupMembershipInput membership in memberships {
        if membership.groupId == groupId && membership.claimName == claimName
                && membership.claimValue == claimValue {
            return true;
        }
    }
    return false;
}

// Test: Token response with provider-specific extra fields (e.g. Keycloak) is accepted
@test:Config {
    groups: ["oidc", "token-response"]
}
function testTokenResponseWithProviderExtraFields() returns error? {
    // The mock provider adds Keycloak's refresh_expires_in, not-before-policy and session_state
    types:OIDCTokenResponse|http:Unauthorized|http:InternalServerError tokenResponse =
        auth:exchangeCodeForTokens(VALID_AUTH_CODE, getSSOConfig());
    if tokenResponse !is types:OIDCTokenResponse {
        test:assertFail("Token response with provider-specific extra fields should be accepted");
    }
    test:assertEquals(tokenResponse.access_token, "mock-access-token-" + VALID_AUTH_CODE);
    test:assertEquals(tokenResponse.expires_in, 3600);
}

// Test: Verify display name fallback logic
@test:Config {
    groups: ["oidc", "claims", "fallback"],
    enable: false // This would require a modified mock token without 'name' claim
}
function testDisplayNameFallback() returns error? {
    // This test would verify that if 'name' claim is missing,
    // the system falls back to email and strips the domain
    // Implementation would require a separate mock token generation

    log:printInfo("OIDC Test: Display name fallback logic (placeholder)");
}
