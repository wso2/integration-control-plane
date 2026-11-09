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
import ballerina/time;

// Mock OIDC Provider Configuration
const string MOCK_OIDC_PROVIDER_PORT = "9458";
const string MOCK_OIDC_PROVIDER_URL = "http://localhost:" + MOCK_OIDC_PROVIDER_PORT;

// Mock OIDC provider data
const string MOCK_ISSUER = MOCK_OIDC_PROVIDER_URL + "/oauth2/token";
const string MOCK_CLIENT_ID = "test-client-id";
const string MOCK_CLIENT_SECRET = "test-client-secret";

// Mock authorization codes
const string VALID_AUTH_CODE = "valid-auth-code-12345";
const string INVALID_AUTH_CODE = "invalid-auth-code";
const string EXPIRED_AUTH_CODE = "expired-auth-code";
const string NEW_USER_CODE = "new-user-auth-code";
// Identity carrying neither the configured admin claim value nor any mappable
// group — the only way to exercise a login that resolves to zero permissions.
const string UNMAPPED_USER_CODE = "unmapped-user-auth-code";

// Test user data
const string TEST_USER_ID = "550e8400-e29b-41d4-a716-446655440001";
const string TEST_USER_EMAIL = "[email protected]";
const string TEST_USER_NAME = "Test User";

const string UNMAPPED_USER_ID = "550e8400-e29b-41d4-a716-446655440002";
const string UNMAPPED_USER_EMAIL = "unmapped-user";
const string UNMAPPED_USER_NAME = "Unmapped User";

// RSA signing configuration for the mock provider
const string MOCK_KEYSTORE_PATH = "tests/resources/keys/mock_oidc.p12";
const string MOCK_KEYSTORE_PASSWORD = "mocktest";
const string MOCK_KEY_ALIAS = "mock-oidc-key";

// Pre-built JWKS response (matches the RSA key pair in tests/resources/keys/)
const string MOCK_JWKS_RESPONSE = "{\"keys\":[{\"kty\":\"RSA\",\"kid\":\"mock-oidc-key\",\"use\":\"sig\",\"alg\":\"RS256\",\"n\":\"rDMqu37NM8gqDnF7tUHwYxsxRuCwmuMN5YXpfFBaNl0A6gPbInnmqlUGCdMgClPokOR7iKOflT1q6YobPEejl3beK91ChdtgoHUC2-K1cqGgG7buaQqAVCEDpuxpa21_0EwKUiG8i1C9yYBq8yL9ESqGKHgHtliY3iVT5pSn7fYmmbnWKLeFfXl_Z4y5zwOlbgWVIaw25k93icCKe6enka54_VAE8trNhkJ9Bvn_vwDLJ7eGyYV3lsGpcEeYbg3rt_B6g_2ZMxHNvOIrC1n6-9voJjVmjA7xP9Yjs8g2jVJecl4nQTxrNzR48luclzIRm8hwoUkCrmGRQlFJ8R9Yew\",\"e\":\"AQAB\"}]}";

// Mock OIDC Provider Service
listener http:Listener mockOidcListener = check new (check int:fromString(MOCK_OIDC_PROVIDER_PORT));

service /oauth2 on mockOidcListener {

    // JWKS endpoint - serves the public key for ID token signature verification
    resource function get jwks() returns http:Response {
        http:Response response = new;
        response.statusCode = 200;
        response.setJsonPayload(checkpanic MOCK_JWKS_RESPONSE.fromJsonString());
        return response;
    }

    // Token endpoint - exchanges authorization code for tokens
    resource function post token(http:Request request) returns http:Response {
        http:Response response = new;

        // Reject HTTP/2 (h2c) like Keycloak on plain http, which loses the form body on upgrade
        if request.httpVersion != "1.1" || request.hasHeader("upgrade") {
            response.statusCode = 400;
            response.setJsonPayload({"error": "invalid_request", "error_description": "HTTP/2 not supported"});
            return response;
        }

        do {
            // Parse form data
            string payload = check request.getTextPayload();
            log:printInfo("Mock OIDC: Received token request", payload = payload);

            // Extract parameters from form-urlencoded body
            map<string> params = {};
            string[] pairs = re `&`.split(payload);
            foreach string pair in pairs {
                string[] keyValue = re `=`.split(pair);
                if keyValue.length() == 2 {
                    params[keyValue[0]] = keyValue[1];
                }
            }

            // Verify grant type
            if params["grant_type"] != "authorization_code" {
                response.statusCode = 400;
                response.setJsonPayload({
                    "error": "unsupported_grant_type",
                    "error_description": "Only authorization_code grant type is supported"
                });
                return response;
            }

            // Verify authorization code
            string? code = params["code"];
            if code is () {
                response.statusCode = 400;
                response.setJsonPayload({
                    "error": "invalid_request",
                    "error_description": "Missing authorization code"
                });
                return response;
            }

            // Check for invalid code
            if code == INVALID_AUTH_CODE {
                response.statusCode = 401;
                response.setJsonPayload({
                    "error": "invalid_grant",
                    "error_description": "Invalid authorization code"
                });
                return response;
            }

            // Check for expired code
            if code == EXPIRED_AUTH_CODE {
                response.statusCode = 401;
                response.setJsonPayload({
                    "error": "invalid_grant",
                    "error_description": "Authorization code has expired"
                });
                return response;
            }

            // Generate mock ID token (signed with RSA)
            string idToken = check generateMockIdToken(code);

            // Return successful token response
            response.statusCode = 200;
            response.setJsonPayload({
                "access_token": "mock-access-token-" + code,
                "refresh_token": "mock-refresh-token-" + code,
                "id_token": idToken,
                "token_type": "Bearer",
                "expires_in": 3600,
                "scope": "openid email profile"
            });

            log:printInfo("Mock OIDC: Returning successful token response");
            return response;

        } on fail error e {
            log:printError("Mock OIDC: Error processing token request", e);
            response.statusCode = 500;
            response.setJsonPayload({
                "error": "server_error",
                "error_description": "Internal server error"
            });
            return response;
        }
    }
}

// Generate a mock ID token signed with RS256. Every code other than
// UNMAPPED_USER_CODE resolves to the same admin-claim identity, preserving the
// behaviour the pre-existing OIDC tests were written against.
function generateMockIdToken(string code) returns string|error {
    // Get current timestamp
    time:Utc currentTime = time:utcNow();
    int currentTimestamp = <int>currentTime[0];
    int expiryTimestamp = currentTimestamp + 3600; // 1 hour from now

    boolean unmapped = code == UNMAPPED_USER_CODE;
    string subject = unmapped ? UNMAPPED_USER_ID : TEST_USER_ID;
    string email = unmapped ? UNMAPPED_USER_EMAIL : TEST_USER_EMAIL;
    string name = unmapped ? UNMAPPED_USER_NAME : TEST_USER_NAME;
    string[] groups = unmapped ? ["contractors"] : ["icp-platform-admins", "developers"];

    // Create ID token claims with RSA signature
    jwt:IssuerConfig issuerConfig = {
        username: subject,
        issuer: MOCK_ISSUER,
        audience: MOCK_CLIENT_ID,
        expTime: 3600,
        keyId: MOCK_KEY_ALIAS,
        signatureConfig: {
            algorithm: jwt:RS256,
            config: {
                keyStore: {path: MOCK_KEYSTORE_PATH, password: MOCK_KEYSTORE_PASSWORD},
                keyAlias: MOCK_KEY_ALIAS,
                keyPassword: MOCK_KEYSTORE_PASSWORD
            }
        },
        customClaims: {
            "sub": subject,
            "email": email,
            "name": name,
            "groups": groups,
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
            "mixed_values": ["valid", 100, true, "also-valid"],
            "iat": currentTimestamp,
            "exp": expiryTimestamp
        }
    };

    string idToken = check jwt:issue(issuerConfig);
    return idToken;
}
