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

import icp_server.auth;
import icp_server.storage as storage;
import icp_server.types as types;
import icp_server.utils as utils;

import ballerina/http;
import ballerina/jwt;
import ballerina/log;
import ballerina/sql;

// Initialized in init() with resolved (decrypted) secrets
final http:Client authBackendClient;
final readonly & jwt:IssuerSignatureConfig jwtSignatureConfig;

isolated function extractClientIp(http:Request req) returns string? {
    string|http:HeaderNotFoundError xff = req.getHeader("X-Forwarded-For");
    if xff is string {
        return xff;
    }
    string|http:HeaderNotFoundError xri = req.getHeader("X-Real-IP");
    return xri is string ? xri : ();
}

// Scheme + authority of a URL, used to derive the post-logout redirect from the
// configured redirect URI. Returns the input unchanged when it carries no scheme:
// `ssoRedirectUri` is only validated as non-empty, so a value without "://" must
// not panic this request.
isolated function originOf(string url) returns string {
    int? schemeSep = url.indexOf("://");
    if schemeSep is () {
        return url;
    }
    int authorityStart = schemeSep + 3;
    int? pathSep = url.indexOf("/", authorityStart);
    return pathSep is int ? url.substring(0, pathSep) : url;
}

@http:ServiceConfig {
    cors: {
        allowOrigins: normalizedCorsAllowedOrigins
    }
}
service /auth on httpListener {

    function init() {
        log:printInfo("Auth service started at " + serverHost + ":" + authServicePort.toString());
    }

    // Returns the user-management operations supported by the active user store.
    // The frontend uses this to show or hide UI features (e.g. create user, change password).
    @http:ResourceConfig {
        auth: [
            {
                jwtValidatorConfig: {
                    issuer: frontendJwtIssuer,
                    audience: frontendJwtAudience,
                    signatureConfig: {
                        secret: resolvedFrontendJwtHMACSecret
                    }
                }
            }
        ]
    }
    resource function get capabilities() returns http:Ok {
        string[] caps;
        if passwordLoginDisabled {
            caps = [];
        } else if ldapUserStoreEnabled {
            caps = ["authenticate"];
        } else {
            caps = [
                "authenticate",
                "password_change",
                "password_reset",
                "unlock_account",
                "create"
            ];
        }
        return <http:Ok>{body: {capabilities: caps}};
    }

    isolated resource function post login(types:Credentials credentials, http:Request req) returns http:Ok|http:Unauthorized|http:Forbidden|http:TooManyRequests|http:InternalServerError|error {
        log:printInfo("Login attempt for user", username = credentials.username);

        if passwordLoginDisabled {
            log:printWarn("Password login rejected because it is disabled", username = credentials.username);
            storage:logAuditEvent(storage:AUDIT_LOGIN_FAILURE, resourceType = storage:AUDIT_RESOURCE_SESSION,
                    details = string `Password login rejected because password login is disabled for user '${credentials.username}'`,
                    clientIp = extractClientIp(req));
            return utils:createForbiddenError("Password login is disabled. Use SSO to sign in.");
        }

        // Call the authentication backend to verify credentials
        http:Response|error authResponse = authBackendClient->post("/authenticate", credentials);

        if authResponse is error {
            log:printError("Error calling authentication backend", authResponse);
            return utils:createInternalServerError("Authentication service unavailable");
        }

        if authResponse.statusCode == 429 {
            log:printWarn("Account locked out by auth backend", username = credentials.username);
            storage:logAuditEvent(storage:AUDIT_LOGIN_LOCKED, resourceType = storage:AUDIT_RESOURCE_SESSION,
                    details = string `Account locked after repeated failures for user '${credentials.username}'`,
                    clientIp = extractClientIp(req));
            json|error lockoutPayload = authResponse.getJsonPayload();
            if lockoutPayload is error {
                log:printError("Failed to read lockout response payload", lockoutPayload);
                return utils:createInternalServerError("Authentication service error");
            }
            int retryAfterSeconds = 0;
            json|error ras = lockoutPayload.retryAfterSeconds;
            if ras is int {
                retryAfterSeconds = ras;
            }
            return <http:TooManyRequests>{
                headers: {"Retry-After": retryAfterSeconds.toString()},
                body: lockoutPayload
            };
        }

        if authResponse.statusCode == http:STATUS_UNAUTHORIZED {
            log:printError("Authentication failed for user", username = credentials.username);
            storage:logAuditEvent(storage:AUDIT_LOGIN_FAILURE, resourceType = storage:AUDIT_RESOURCE_SESSION,
                    details = string `Login failed — invalid credentials for user '${credentials.username}'`,
                    clientIp = extractClientIp(req));
            return utils:createUnauthorizedError("Invalid credentials");
        } else if authResponse.statusCode != http:STATUS_OK {
            log:printError("Unexpected status code from authentication backend", statusCode = authResponse.statusCode);
            return utils:createInternalServerError("Authentication service error");
        }

        // Parse response body
        json|error authPayload = authResponse.getJsonPayload();
        if authPayload is error {
            log:printError("JSON payload not present in authentication response", authPayload);
            return utils:createInternalServerError("Invalid response from authentication service");
        }

        types:AuthenticateResponse|error authResult = authPayload.cloneWithType();
        if authResult is error {
            log:printError("Authentication response payload does not match expected type", authResult);
            return utils:createInternalServerError("Invalid response from authentication service");
        }

        if !authResult.authenticated {
            log:printError("Authentication failed for user", username = credentials.username);
            storage:logAuditEvent(storage:AUDIT_LOGIN_FAILURE, resourceType = storage:AUDIT_RESOURCE_SESSION,
                    details = string `Login denied — authentication rejected for user '${credentials.username}'`,
                    clientIp = extractClientIp(req));
            return utils:createUnauthorizedError("Invalid credentials");
        }

        // Validate that auth backend returned required user claims
        if authResult.userId is () || authResult.displayName is () {
            log:printError("Authentication backend did not return required user claims", username = credentials.username);
            return utils:createInternalServerError("Invalid response from authentication service");
        }

        string userId = <string>authResult.userId;
        string displayName = <string>authResult.displayName;
        // Use username from the original request credentials
        string username = credentials.username;

        types:User|error userDetails = storage:getUserDetailsById(userId);
        if userDetails is error {
            if userDetails is sql:NoRowsError {
                // New user — resolve initial group assignments before creating the record.
                log:printInfo(string `User ${username} authenticated but not found in users table, creating user record`);

                // If the auth backend signals that this user should be a super-admin
                // (e.g. because of an external admin role), add them to the built-in
                // "Super Admins" group on first login.
                string[] initialGroupIds = [];
                if authResult?.isSuperAdmin == true {
                    string|error superAdminsGroupId = storage:getSuperAdminsGroupId();
                    if superAdminsGroupId is error {
                        log:printError("Could not resolve Super Admins group; aborting user bootstrap",
                                superAdminsGroupId, username = username);
                        return utils:createInternalServerError("Could not resolve Super Admins group");
                    }
                    initialGroupIds = [superAdminsGroupId];
                    log:printInfo("Assigning new user to Super Admins group on first login", username = username);
                }

                json|error? createResult = storage:createUserV2(userId, username, displayName, initialGroupIds);
                if createResult is error {
                    if !createResult.message().includes("already exists") {
                        log:printError("Error creating user in database", createResult, username = username);
                        return utils:createInternalServerError("Error creating user record");
                    }
                    log:printInfo("Concurrent first-login detected; re-fetching existing user record", username = username);
                }

                // Fetch the newly created (or concurrently created) user details
                userDetails = storage:getUserDetailsById(userId);
                if userDetails is error {
                    log:printError("Error getting user details after creation", userDetails);
                    return utils:createInternalServerError("Error getting user details");
                }

            } else {
                log:printError("Error getting user details", userDetails);
                return utils:createInternalServerError("Error getting user details");
            }
        }

        // `userDetails` is reassigned inside the block above, which resets the
        // compiler's type narrowing, so re-check before accessing its fields.
        if userDetails is error {
            log:printError("Error getting user details", userDetails);
            return utils:createInternalServerError("Error getting user details");
        }

        // Generate JWT token using V2 utility function with permissions
        string|error jwtToken = auth:generateJWTTokenV2(
                userDetails.userId,
                userDetails.username,
                userDetails.displayName,
                frontendJwtIssuer,
                defaultTokenExpiryTime,
                frontendJwtAudience,
                jwtSignatureConfig
        );

        if jwtToken is error {
            log:printError("Error generating JWT token", jwtToken);
            return utils:createInternalServerError("Error generating JWT token");
        }

        // Get user permissions for response
        string[]|error userPermissions = auth:getUserPermissionNames(userDetails.userId);
        if userPermissions is error {
            log:printError("Error getting user permissions", userPermissions, userId = userDetails.userId);
            return utils:createInternalServerError("Error getting user permissions");
        }

        // Generate refresh token
        string refreshToken = auth:generateRefreshToken();
        string tokenId = auth:generateTokenId();
        string tokenHash = auth:hashRefreshToken(refreshToken);

        // Extract user agent and IP address from request
        string|http:HeaderNotFoundError userAgentHeader = req.getHeader("User-Agent");
        string? userAgent = userAgentHeader is string ? userAgentHeader : ();

        string|http:HeaderNotFoundError ipAddressHeader = req.getHeader("X-Forwarded-For");
        string? ipAddress = ipAddressHeader is string ? ipAddressHeader : ();
        if ipAddress is () {
            // Fallback to X-Real-IP if X-Forwarded-For is not present
            string|http:HeaderNotFoundError realIpHeader = req.getHeader("X-Real-IP");
            ipAddress = realIpHeader is string ? realIpHeader : ();
        }

        // Store refresh token in database
        error? storeResult = storage:storeRefreshToken(
                tokenId,
                userId,
                tokenHash,
                refreshTokenExpiryTime,
                userAgent,
                ipAddress
        );

        if storeResult is error {
            log:printError("Error storing refresh token", storeResult, userId = userId);
            return utils:createInternalServerError("Error storing refresh token");
        }

        log:printInfo("Login successful for user", username = username, permissionCount = userPermissions.length());
        storage:logAuditEvent(storage:AUDIT_LOGIN_SUCCESS, userId = userDetails.userId,
                resourceType = storage:AUDIT_RESOURCE_SESSION,
                details = string `User '${username}' logged in successfully`,
                clientIp = ipAddress, userAgent = userAgent);
        return <http:Ok>{
            body: {
                userId: userDetails.userId,
                token: jwtToken,
                expiresIn: defaultTokenExpiryTime,
                refreshToken: refreshToken,
                refreshTokenExpiresIn: refreshTokenExpiryTime,
                username: username,
                displayName: userDetails.displayName,
                permissions: userPermissions,
                isOidcUser: false,
                requirePasswordChange: userDetails.requirePasswordChange
            }
        };
    }

    // OIDC Login endpoint - exchanges authorization code for ICP token
    isolated resource function post login/oidc(types:OIDCCallbackRequest request, http:Request req) returns http:Ok|http:Unauthorized|http:Forbidden|http:BadRequest|http:InternalServerError {
        log:printInfo("OIDC login attempt - exchanging authorization code");

        // Get SSO configuration
        types:SSOConfig ssoConfig = getSSOConfig();

        // Validate SSO configuration
        error? validationError = validateSSOConfig(ssoConfig);
        if validationError is error {
            log:printError("SSO configuration validation failed", validationError);
            return utils:createBadRequestError(validationError.message());
        }

        // Check if SSO is enabled
        if !ssoConfig.enabled {
            log:printWarn("OIDC login attempted but SSO is not enabled");
            return utils:createBadRequestError("SSO authentication is not enabled");
        }

        // Exchange authorization code for tokens
        types:OIDCTokenResponse|http:Unauthorized|http:InternalServerError tokenResponse = auth:exchangeCodeForTokens(request.code, ssoConfig);

        if tokenResponse is http:Unauthorized|http:InternalServerError {
            storage:logAuditEvent(storage:AUDIT_OIDC_LOGIN_FAILURE, resourceType = storage:AUDIT_RESOURCE_SESSION,
                    details = "OIDC login failed — token exchange error",
                    clientIp = extractClientIp(req));
            return tokenResponse;
        }

        log:printInfo("Successfully exchanged authorization code for tokens");

        // Decode and validate ID token
        types:OIDCIdTokenClaims|http:Unauthorized|http:InternalServerError claims =
            auth:decodeAndValidateIdToken(tokenResponse.id_token, ssoConfig);

        if claims is http:Unauthorized|http:InternalServerError {
            return claims;
        }

        // Extract user information
        types:ExtractedUserInfo|http:InternalServerError userInfo = auth:extractUserInfo(claims, ssoConfig);

        if userInfo is http:InternalServerError {
            return userInfo;
        }

        // Check if user exists, create if new
        types:User|error userDetails = storage:getUserDetailsById(userInfo.userId);
        if userDetails is error {
            if userDetails is sql:NoRowsError {
                // New OIDC user - create record
                log:printInfo("New OIDC user, creating user record",
                        userId = userInfo.userId,
                        username = userInfo.username);

                json|error? createResult = storage:createUserV2(userInfo.userId, userInfo.username, userInfo.displayName, [], isOidcUser = true);
                if createResult is error {
                    log:printError("Error creating OIDC user in database", createResult,
                            username = userInfo.username);
                    return utils:createInternalServerError("Error creating user record");
                }

                // Fetch the newly created user details
                userDetails = storage:getUserDetailsById(userInfo.userId);
                if userDetails is error {
                    log:printError("Error getting newly created OIDC user details", userDetails);
                    return utils:createInternalServerError("Error getting user details");
                }
            } else {
                log:printError("Error getting OIDC user details", userDetails);
                return utils:createInternalServerError("Error getting user details");
            }
        }

        // `userDetails` is reassigned inside the block above, which resets the
        // compiler's type narrowing, so re-check before accessing its fields.
        if userDetails is error {
            log:printError("Error getting OIDC user details", userDetails);
            return utils:createInternalServerError("Error getting user details");
        }

        error? ssoAdminGrantResult = grantSuperAdminFromSSOClaims(userDetails.userId, userInfo.username, claims, ssoConfig);
        if ssoAdminGrantResult is error {
            log:printError("Error applying SSO super admin claim mapping", ssoAdminGrantResult,
                    username = userInfo.username);
            return utils:createInternalServerError("Error applying SSO admin access");
        }

        error? federatedSyncResult = syncFederatedGroupsFromSSOClaims(userDetails.userId, userInfo.username, claims);
        if federatedSyncResult is error {
            log:printError("Error synchronizing SSO group memberships", federatedSyncResult,
                    username = userInfo.username);
            // A pending schema update is an operator problem with a known remedy, so
            // pass that message through instead of a generic failure. Login-time
            // reconciliation runs for every SSO login, so a database that has not been
            // updated breaks SSO entirely — the message has to name the fix.
            if federatedSyncResult.message() == storage:SSO_SCHEMA_UPDATE_REQUIRED {
                return utils:createInternalServerError(storage:SSO_SCHEMA_UPDATE_REQUIRED);
            }
            return utils:createInternalServerError("Error synchronizing SSO group access");
        }

        // Resolved after the super admin grant and the federated sync so the gate below
        // sees this login's membership, and so the bootstrapped super admin can never be
        // locked out by the gate that their own grant satisfies.
        string[]|error userPermissions = auth:getUserPermissionNames(userDetails.userId);
        if userPermissions is error {
            log:printError("Error getting user permissions for OIDC user", userPermissions, userId = userDetails.userId);
            return utils:createInternalServerError("Error getting user permissions");
        }

        // The user record is kept even when the login is refused: JIT provisioning is
        // independent of authorization, and an admin needs the user to appear under
        // Access Control → Users to map their IdP groups.
        if !isLoginAuthorized(isLoginAuthorizationRequired(), userPermissions) {
            log:printWarn("OIDC login refused — user has no ICP authorization",
                    username = userDetails.username,
                    userId = userDetails.userId);
            storage:logAuditEvent(storage:AUDIT_OIDC_LOGIN_FAILURE, userId = userDetails.userId,
                    resourceType = storage:AUDIT_RESOURCE_SESSION,
                    details = string `OIDC login refused — no ICP authorization mapped for user '${userDetails.username}'`,
                    clientIp = extractClientIp(req));
            return <http:Forbidden>{
                body: {
                    message: LOGIN_NOT_AUTHORIZED_MESSAGE,
                    username: userDetails.username
                }
            };
        }

        // Generate JWT token using V2 utility function with permissions
        string|error jwtToken = auth:generateJWTTokenV2(
                userDetails.userId,
                userDetails.username,
                userDetails.displayName,
                frontendJwtIssuer,
                defaultTokenExpiryTime,
                frontendJwtAudience,
                jwtSignatureConfig
        );

        if jwtToken is error {
            log:printError("Error generating JWT token for OIDC user", jwtToken);
            return utils:createInternalServerError("Error generating JWT token");
        }

        // Generate refresh token
        string refreshToken = auth:generateRefreshToken();
        string tokenId = auth:generateTokenId();
        string tokenHash = auth:hashRefreshToken(refreshToken);

        // Extract user agent and IP address from request
        string|http:HeaderNotFoundError userAgentHeader = req.getHeader("User-Agent");
        string? userAgent = userAgentHeader is string ? userAgentHeader : ();

        string|http:HeaderNotFoundError ipAddressHeader = req.getHeader("X-Forwarded-For");
        string? ipAddress = ipAddressHeader is string ? ipAddressHeader : ();
        if ipAddress is () {
            // Fallback to X-Real-IP if X-Forwarded-For is not present
            string|http:HeaderNotFoundError realIpHeader = req.getHeader("X-Real-IP");
            ipAddress = realIpHeader is string ? realIpHeader : ();
        }

        // Store refresh token in database
        error? storeResult = storage:storeRefreshToken(
                tokenId,
                userDetails.userId,
                tokenHash,
                refreshTokenExpiryTime,
                userAgent,
                ipAddress
        );

        if storeResult is error {
            log:printError("Error storing refresh token for OIDC user", storeResult, userId = userDetails.userId);
            return utils:createInternalServerError("Error storing refresh token");
        }

        // Return login response
        log:printInfo("OIDC login successful", username = userInfo.username, permissionCount = userPermissions.length());
        storage:logAuditEvent(storage:AUDIT_OIDC_LOGIN_SUCCESS, userId = userDetails.userId,
                resourceType = storage:AUDIT_RESOURCE_SESSION,
                details = string `OIDC user '${userInfo.username}' logged in successfully`,
                clientIp = ipAddress, userAgent = userAgent);
        return <http:Ok>{
            body: {
                userId: userDetails.userId,
                token: jwtToken,
                expiresIn: defaultTokenExpiryTime,
                refreshToken: refreshToken,
                refreshTokenExpiresIn: refreshTokenExpiryTime,
                username: userInfo.username,
                displayName: userDetails.displayName,
                permissions: userPermissions,
                isOidcUser: true,
                idToken: tokenResponse.id_token
            }
        };
    }

    // Change password endpoint - proxies to auth backend
    // Requires JWT authentication to identify the user
    @http:ResourceConfig {
        auth: [
            {
                jwtValidatorConfig: {
                    issuer: frontendJwtIssuer,
                    audience: frontendJwtAudience,
                    signatureConfig: {
                        secret: resolvedFrontendJwtHMACSecret
                    }
                }
            }
        ]
    }
    isolated resource function post 'change\-password(@http:Payload types:ChangePasswordRequest request, http:Request req) returns http:Ok|http:BadRequest|http:Unauthorized|http:InternalServerError {
        log:printInfo("Password change requested");

        // Extract user context from current JWT
        types:UserContextV2|error userContext = extractUserContextFromRequest(req);
        if userContext is error {
            log:printError("Failed to extract user context for password change", userContext);
            return utils:createUnauthorizedError("Invalid authorization token");
        }

        // Forward to auth backend with userId from JWT
        json changePasswordPayload = {
            userId: userContext.userId,
            currentPassword: request.currentPassword,
            newPassword: request.newPassword
        };

        http:Response|error authResponse = authBackendClient->post("/change-password", changePasswordPayload);

        if authResponse is error {
            log:printError("Error calling auth backend for password change", authResponse);
            return utils:createInternalServerError("Password change service unavailable");
        }

        if authResponse.statusCode == http:STATUS_BAD_REQUEST {
            json|error errorBody = authResponse.getJsonPayload();
            if errorBody is json {
                json|error messageField = errorBody.message;
                string message = messageField is string ? messageField : "Invalid password change request";
                return utils:createBadRequestError(message);
            }
            return utils:createBadRequestError("Invalid password change request");
        }

        if authResponse.statusCode == http:STATUS_UNAUTHORIZED {
            return utils:createUnauthorizedError("Current password is incorrect");
        }

        if authResponse.statusCode != http:STATUS_OK {
            log:printError("Unexpected status code from auth backend for password change", statusCode = authResponse.statusCode);
            return utils:createInternalServerError("Password change failed");
        }

        // Clear require_password_change flag if it was set
        error? flagResult = storage:setRequirePasswordChange(userContext.userId, false);
        if flagResult is error {
            log:printWarn("Could not clear require_password_change flag after password change", userId = userContext.userId);
        }

        log:printInfo("Password changed successfully", userId = userContext.userId, username = userContext.username);
        storage:logAuditEvent(storage:AUDIT_PASSWORD_CHANGE, userId = userContext.userId,
                resourceType = storage:AUDIT_RESOURCE_USER, resourceId = userContext.userId,
                details = string `User '${userContext.username}' changed their password`,
                clientIp = extractClientIp(req));
        return <http:Ok>{
            body: {
                message: "Password changed successfully"
            }
        };
    }

    // Force change password endpoint - used after admin password reset
    // Requires JWT auth but does NOT require current password. Only available for users with require_password_change flag set to true
    @http:ResourceConfig {
        auth: [
            {
                jwtValidatorConfig: {
                    issuer: frontendJwtIssuer,
                    audience: frontendJwtAudience,
                    signatureConfig: {
                        secret: resolvedFrontendJwtHMACSecret
                    }
                }
            }
        ]
    }
    isolated resource function post 'force\-change\-password(@http:Payload types:ForceChangePasswordRequest request, http:Request req) returns http:Ok|http:BadRequest|http:Unauthorized|http:Forbidden|http:InternalServerError {
        log:printInfo("Force password change requested");

        types:UserContextV2|error userContext = extractUserContextFromRequest(req);
        if userContext is error {
            log:printError("Failed to extract user context for force password change", userContext);
            return utils:createUnauthorizedError("Invalid authorization token");
        }

        types:User|error userDetails = storage:getUserDetailsById(userContext.userId);
        if userDetails is error {
            log:printError("Failed to fetch user details for force password change", userDetails, userId = userContext.userId);
            return utils:createInternalServerError("Failed to fetch user details");
        }
        if !userDetails.requirePasswordChange {
            log:printWarn("Force password change attempted but require_password_change flag is not set", userId = userContext.userId);
            return utils:createForbiddenError("Password change is not required for this user");
        }

        json payload = {
            newPassword: request.newPassword
        };

        http:Response|error authResponse = authBackendClient->post(string `/force-change-password?userId=${userContext.userId}`, payload);

        if authResponse is error {
            log:printError("Error calling auth backend for force password change", authResponse);
            return utils:createInternalServerError("Password change service unavailable");
        }

        if authResponse.statusCode == http:STATUS_BAD_REQUEST {
            json|error errorBody = authResponse.getJsonPayload();
            if errorBody is json {
                json|error messageField = errorBody.message;
                string message = messageField is string ? messageField : "Invalid request";
                return utils:createBadRequestError(message);
            }
            return utils:createBadRequestError("Invalid request");
        }

        if authResponse.statusCode != http:STATUS_OK {
            log:printError("Unexpected status code from auth backend for force password change", statusCode = authResponse.statusCode);
            return utils:createInternalServerError("Password change failed");
        }

        // Clear require_password_change flag in main DB
        error? flagResult = storage:setRequirePasswordChange(userContext.userId, false);
        if flagResult is error {
            log:printError("Error clearing require_password_change flag", flagResult, userId = userContext.userId);
            // Don't fail the request - the password was already changed successfully
            log:printWarn("Password changed but require_password_change flag could not be cleared");
        }

        log:printInfo("Password force-changed successfully", userId = userContext.userId);
        storage:logAuditEvent(storage:AUDIT_PASSWORD_FORCED_CHANGE, userId = userContext.userId,
                resourceType = storage:AUDIT_RESOURCE_USER, resourceId = userContext.userId,
                details = string `User '${userContext.username}' completed forced password change`,
                clientIp = extractClientIp(req));
        return <http:Ok>{
            body: {
                message: "Password changed successfully"
            }
        };
    }

    // Token refresh endpoint - uses refresh token to generate new access token
    // This endpoint does NOT require JWT authentication - uses refresh token instead
    isolated resource function post 'refresh\-token(types:RefreshTokenRequest request, http:Request req) returns http:Ok|http:Unauthorized|http:Forbidden|http:BadRequest|http:InternalServerError {
        log:printInfo("Token refresh requested using refresh token");

        // Validate request
        if request.refreshToken.trim().length() == 0 {
            log:printWarn("Empty refresh token provided");
            return utils:createBadRequestError("Refresh token is required");
        }

        // Hash the provided refresh token to compare with stored hash
        string tokenHash = auth:hashRefreshToken(request.refreshToken);

        // Validate refresh token and get user details
        types:User|error userDetails = storage:validateRefreshToken(tokenHash);
        if userDetails is error {
            log:printWarn("Invalid or expired refresh token", userDetails);
            return utils:createUnauthorizedError("Invalid or expired refresh token");
        }

        // Resolved before the token is minted — without this gate a user authorized
        // yesterday keeps refreshing indefinitely after their access is revoked.
        // Note this reads effective permissions, so ICP-side revocation (roles removed
        // from the group, group deleted) bites immediately, while deleting an SSO group
        // mapping only takes effect once the user's next login runs the membership sync.
        string[]|error userPermissions = auth:getUserPermissionNames(userDetails.userId);
        if userPermissions is error {
            log:printError("Error getting user permissions for refresh token", userPermissions, userId = userDetails.userId);
            return utils:createInternalServerError("Error getting user permissions");
        }

        if !isLoginAuthorized(isLoginAuthorizationRequired(), userPermissions) {
            log:printWarn("Token refresh refused — user has no ICP authorization",
                    username = userDetails.username,
                    userId = userDetails.userId);
            // Revoke the presented token so the client stops retrying with it.
            error? revokeResult = storage:revokeRefreshToken(tokenHash);
            if revokeResult is error {
                log:printError("Error revoking refresh token for unauthorized user", revokeResult,
                        userId = userDetails.userId);
            }
            storage:logAuditEvent(storage:AUDIT_OIDC_LOGIN_FAILURE, userId = userDetails.userId,
                    resourceType = storage:AUDIT_RESOURCE_SESSION,
                    details = string `Token refresh refused — no ICP authorization mapped for user '${userDetails.username}'`,
                    clientIp = extractClientIp(req));
            return <http:Forbidden>{
                body: {
                    message: LOGIN_NOT_AUTHORIZED_MESSAGE,
                    username: userDetails.username
                }
            };
        }

        // Generate new JWT access token using V2 with permissions
        string|error jwtToken = auth:generateJWTTokenV2(
                userDetails.userId,
                userDetails.username,
                userDetails.displayName,
                frontendJwtIssuer,
                defaultTokenExpiryTime,
                frontendJwtAudience,
                jwtSignatureConfig
        );

        if jwtToken is error {
            log:printError("Error generating JWT token from refresh token", jwtToken);
            return utils:createInternalServerError("Error generating JWT token");
        }

        // If rotation is disabled, return response with same refresh token
        if !enableRefreshTokenRotation {
            log:printInfo("Token refreshed without rotation",
                    username = userDetails.username,
                    userId = userDetails.userId,
                    permissionCount = userPermissions.length());
            return <http:Ok>{
                body: {
                    token: jwtToken,
                    expiresIn: defaultTokenExpiryTime,
                    refreshToken: request.refreshToken,
                    refreshTokenExpiresIn: refreshTokenExpiryTime,
                    username: userDetails.username,
                    displayName: userDetails.displayName,
                    permissions: userPermissions
                }
            };
        }

        // Rotation is enabled - generate new refresh token
        string newRefreshToken = auth:generateRefreshToken();
        string newTokenId = auth:generateTokenId();
        string newTokenHash = auth:hashRefreshToken(newRefreshToken);

        // Extract user agent and IP address from request
        string|http:HeaderNotFoundError userAgentHeader = req.getHeader("User-Agent");
        string? userAgent = userAgentHeader is string ? userAgentHeader : ();

        string|http:HeaderNotFoundError ipAddressHeader = req.getHeader("X-Forwarded-For");
        string? ipAddress = ipAddressHeader is string ? ipAddressHeader : ();
        if ipAddress is () {
            // Fallback to X-Real-IP if X-Forwarded-For is not present
            string|http:HeaderNotFoundError realIpHeader = req.getHeader("X-Real-IP");
            ipAddress = realIpHeader is string ? realIpHeader : ();
        }

        // Revoke the old refresh token (used for rotation)
        error? revokeResult = storage:revokeRefreshToken(tokenHash);
        if revokeResult is error {
            log:printWarn("Failed to revoke old refresh token", revokeResult, userId = userDetails.userId);
            // Continue anyway - this is not critical
        }

        // Store new refresh token
        error? storeResult = storage:storeRefreshToken(
                newTokenId,
                userDetails.userId,
                newTokenHash,
                refreshTokenExpiryTime,
                userAgent,
                ipAddress
        );

        if storeResult is error {
            log:printError("Error storing new refresh token", storeResult, userId = userDetails.userId);
            return utils:createInternalServerError("Error storing refresh token");
        }

        log:printInfo("Token refreshed with rotation",
                username = userDetails.username,
                userId = userDetails.userId,
                permissionCount = userPermissions.length());
        return <http:Ok>{
            body: {
                token: jwtToken,
                expiresIn: defaultTokenExpiryTime,
                refreshToken: newRefreshToken,
                refreshTokenExpiresIn: refreshTokenExpiryTime,
                username: userDetails.username,
                displayName: userDetails.displayName,
                permissions: userPermissions
            }
        };
    }

    // Token revocation endpoint - revokes refresh token(s) for logout
    // Requires JWT authentication to identify the user
    @http:ResourceConfig {
        auth: [
            {
                jwtValidatorConfig: {
                    issuer: frontendJwtIssuer,
                    audience: frontendJwtAudience,
                    signatureConfig: {
                        secret: resolvedFrontendJwtHMACSecret
                    }
                }
            }
        ]
    }
    isolated resource function post 'revoke\-token(http:Request req, types:RevokeTokenRequest request) returns http:Ok|http:Unauthorized|http:BadRequest|http:InternalServerError {
        log:printInfo("Token revocation requested");

        // Extract user context from current JWT
        types:UserContextV2|error userContext = extractUserContextFromRequest(req);
        if userContext is error {
            log:printError("Failed to extract user context for token revocation", userContext);
            return utils:createUnauthorizedError("Invalid authorization token");
        }

        // Check if a specific refresh token was provided
        if request?.refreshToken is string {
            string refreshToken = <string>request?.refreshToken;

            if refreshToken.trim().length() == 0 {
                log:printWarn("Empty refresh token provided for revocation", userId = userContext.userId);
                return utils:createBadRequestError("Refresh token cannot be empty");
            }

            // Hash the refresh token to match database storage
            string tokenHash = auth:hashRefreshToken(refreshToken);

            // Revoke the specific refresh token
            error? revokeResult = storage:revokeRefreshToken(tokenHash);
            if revokeResult is error {
                log:printError("Error revoking specific refresh token", revokeResult, userId = userContext.userId);
                return utils:createInternalServerError("Failed to revoke refresh token");
            }

            log:printInfo("Specific refresh token revoked successfully",
                    userId = userContext.userId,
                    username = userContext.username);
            storage:logAuditEvent(storage:AUDIT_LOGOUT, userId = userContext.userId,
                    resourceType = storage:AUDIT_RESOURCE_SESSION,
                    details = string `User '${userContext.username}' logged out (single session)`,
                    clientIp = extractClientIp(req));
            return <http:Ok>{
                body: {
                    message: "Refresh token revoked successfully"
                }
            };
        }

        // No specific token provided - revoke ALL refresh tokens for this user (logout from all devices)
        error? revokeAllResult = storage:revokeAllUserRefreshTokens(userContext.userId);
        if revokeAllResult is error {
            log:printError("Error revoking all refresh tokens for user", revokeAllResult, userId = userContext.userId);
            return utils:createInternalServerError("Failed to revoke refresh tokens");
        }

        log:printInfo("All refresh tokens revoked successfully for user",
                userId = userContext.userId,
                username = userContext.username);
        storage:logAuditEvent(storage:AUDIT_LOGOUT_ALL, userId = userContext.userId,
                resourceType = storage:AUDIT_RESOURCE_SESSION,
                details = string `User '${userContext.username}' logged out from all devices`,
                clientIp = extractClientIp(req));
        return <http:Ok>{
            body: {
                message: "All refresh tokens revoked successfully. You have been logged out from all devices."
            }
        };
    }

    // OIDC Authorization URL endpoint
    isolated resource function get oidc/'authorize\-url(string? state) returns http:Ok|http:BadRequest|http:InternalServerError {
        log:printInfo("OIDC authorization URL requested", hasState = state is string);

        // Get SSO configuration
        types:SSOConfig ssoConfig = getSSOConfig();

        // Validate SSO configuration
        error? validationError = validateSSOConfig(ssoConfig);
        if validationError is error {
            log:printError("SSO configuration validation failed", validationError);
            return utils:createBadRequestError(validationError.message());
        }

        // Check if SSO is enabled
        if !ssoConfig.enabled {
            log:printWarn("OIDC authorization URL requested but SSO is not enabled");
            return utils:createBadRequestError("SSO authentication is not enabled");
        }

        // Build authorization URL with state parameter for CSRF protection
        string|error authorizationUrl = auth:buildAuthorizationUrl(ssoConfig, state);
        if authorizationUrl is error {
            log:printError("Error building authorization URL", authorizationUrl);
            return utils:createInternalServerError("Failed to generate authorization URL");
        }

        log:printInfo("OIDC authorization URL generated successfully");
        return <http:Ok>{
            body: {
                authorizationUrl: authorizationUrl
            }
        };
    }

    // OIDC RP-initiated logout URL endpoint
    // POST rather than GET: the ID token is a bearer-grade credential and a query
    // value would be retained in access logs, proxy logs and browser history, and can
    // exceed request-line limits. It still travels as id_token_hint on the
    // provider-directed redirect, where the spec requires it.
    isolated resource function post oidc/'logout\-url(types:OIDCLogoutRequest request) returns http:Ok|http:BadRequest|http:InternalServerError {
        types:SSOConfig ssoConfig = getSSOConfig();

        error? validationError = validateSSOConfig(ssoConfig);
        if validationError is error {
            log:printError("SSO configuration validation failed", validationError);
            return utils:createBadRequestError(validationError.message());
        }
        if !ssoConfig.enabled {
            return utils:createBadRequestError("SSO authentication is not enabled");
        }

        // Derived from the redirect URI's origin so it needs no extra config and cannot
        // be an attacker-supplied open redirect.
        string postLogoutRedirectUri = originOf(ssoConfig.redirectUri) + "/login";
        string|error logoutUrl = auth:buildLogoutUrl(ssoConfig, postLogoutRedirectUri, request?.idTokenHint);
        if logoutUrl is error {
            log:printError("Error building logout URL", logoutUrl);
            return utils:createInternalServerError("Failed to generate logout URL");
        }

        return <http:Ok>{
            body: {
                logoutUrl: logoutUrl
            }
        };
    }

    // RBAC v2: Group Management Endpoints
    // Get all groups for an organization
    @http:ResourceConfig {
        auth: [
            {
                jwtValidatorConfig: {
                    issuer: frontendJwtIssuer,
                    audience: frontendJwtAudience,
                    signatureConfig: {
                        secret: resolvedFrontendJwtHMACSecret
                    }
                }
            }
        ]
    }
    isolated resource function get orgs/[string orgHandle]/groups(http:Request req, string? projectId = (), string? integrationId = ()) returns http:Ok|http:BadRequest|http:Unauthorized|http:Forbidden|http:InternalServerError|error {
        log:printInfo("Fetching groups for organization", orgHandle = orgHandle, projectId = projectId ?: "N/A", integrationId = integrationId ?: "N/A");

        // Permission check: user must have any of these permissions at specified scope level
        types:UserContextV2|error userContext = extractUserContextFromRequest(req);
        if userContext is error {
            return utils:createUnauthorizedError("Invalid or missing authentication token");
        }

        // Build scope based on provided parameters
        types:AccessScope scope = {orgUuid: storage:DEFAULT_ORG_ID};
        if projectId is string {
            scope.projectUuid = projectId;
        }
        if integrationId is string {
            scope.integrationUuid = integrationId;
        }

        boolean|error hasPermission = auth:hasAnyPermission(userContext.userId, [auth:PERMISSION_USER_MANAGE_GROUPS, auth:PERMISSION_USER_UPDATE_GROUP_ROLES, auth:PERMISSION_PROJECT_EDIT, auth:PERMISSION_PROJECT_MANAGE, auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope);
        if hasPermission is error {
            log:printError("Error checking permissions", hasPermission, userId = userContext.userId);
            return utils:createInternalServerError("Error checking permissions");
        }
        if !hasPermission {
            return <http:Forbidden>{
                body: {
                    message: "Insufficient permissions to list groups"
                }
            };
        }

        // Resolve org handle to org ID
        // TODO : use when multiple tenants are supported
        // int|error orgId = storage:getOrgIdByHandle(orgHandle);
        // if orgId is error {
        //     log:printWarn("Invalid or unknown organization handle", orgHandle = orgHandle, 'error = orgId);
        //     return utils:createBadRequestError("Invalid or unknown organization");
        // }

        // Fetch all groups with counts for the organization
        // TODO: use orgId when multiple tenants are supported
        types:GroupResponse[]|error groupsWithCounts = storage:getGroupsWithCountsByOrgId(storage:DEFAULT_ORG_ID);
        if groupsWithCounts is error {
            log:printError("Error fetching groups", groupsWithCounts, orgHandle = orgHandle);
            return utils:createInternalServerError("Failed to fetch groups");
        }

        log:printInfo(string `Successfully fetched ${groupsWithCounts.length()} groups`, orgHandle = orgHandle);
        return <http:Ok>{
            body: groupsWithCounts
        };
    }

    // POST /auth/orgs/{orgHandle}/groups - Create a new group
    @http:ResourceConfig {
        auth: [
            {
                jwtValidatorConfig: {
                    issuer: frontendJwtIssuer,
                    audience: frontendJwtAudience,
                    signatureConfig: {
                        secret: resolvedFrontendJwtHMACSecret
                    }
                }
            }
        ]
    }
    isolated resource function post orgs/[string orgHandle]/groups(@http:Payload types:GroupInput groupInput, http:Request req) returns http:Created|http:BadRequest|http:Conflict|http:Unauthorized|http:Forbidden|http:InternalServerError|error {
        log:printInfo("Creating new group", orgHandle = orgHandle, groupName = groupInput.groupName);

        // Permission check: org-level manage groups
        types:UserContextV2|error userContext = extractUserContextFromRequest(req);
        if userContext is error {
            return utils:createUnauthorizedError("Invalid or missing authentication token");
        }
        types:AccessScope orgScope = {orgUuid: storage:DEFAULT_ORG_ID};
        boolean|error hasPermission = auth:hasPermission(userContext.userId, auth:PERMISSION_USER_MANAGE_GROUPS, orgScope);
        if hasPermission is error {
            log:printError("Error checking permissions", hasPermission, userId = userContext.userId);
            return utils:createInternalServerError("Error checking permissions");
        }
        if !hasPermission {
            return <http:Forbidden>{
                body: {
                    message: "Insufficient permissions to create groups"
                }
            };
        }

        // Resolve org handle to org ID
        // TODO: use when multiple tenants are supported
        // int|error orgId = storage:getOrgIdByHandle(orgHandle);
        // if orgId is error {
        //     log:printWarn("Invalid or unknown organization handle", orgHandle = orgHandle, 'error = orgId);
        //     return utils:createBadRequestError("Invalid or unknown organization");
        // }

        // Set org ID in the input (default to 1 for now)
        types:GroupInput inputWithOrg = {
            groupName: groupInput.groupName,
            description: groupInput.description,
            orgUuid: storage:DEFAULT_ORG_ID
        };

        // Create the group
        string|error groupId = storage:createGroup(inputWithOrg);
        if groupId is error {
            log:printError("Error creating group", groupId, groupName = groupInput.groupName);
            if groupId.message().includes("already exists") {
                return <http:Conflict>{
                    body: {
                        message: groupId.message()
                    }
                };
            }
            return utils:createInternalServerError("Failed to create group");
        }

        // Fetch the created group
        types:Group|error createdGroup = storage:getGroupById(groupId);
        if createdGroup is error {
            log:printError("Error fetching created group", createdGroup, groupId = groupId);
            return utils:createInternalServerError("Group created but failed to fetch details");
        }

        log:printInfo("Successfully created group", groupId = groupId, groupName = groupInput.groupName);
        storage:logAuditEvent(storage:AUDIT_GROUP_CREATE, userId = userContext.userId,
                resourceType = storage:AUDIT_RESOURCE_GROUP, resourceId = groupId,
                details = string `Group '${groupInput.groupName}' created by user '${userContext.username}'`,
                clientIp = extractClientIp(req));
        return <http:Created>{
            body: createdGroup
        };
    }

    // GET /auth/orgs/{orgHandle}/groups/{groupId} - Get group details
    @http:ResourceConfig {
        auth: [
            {
                jwtValidatorConfig: {
                    issuer: frontendJwtIssuer,
                    audience: frontendJwtAudience,
                    signatureConfig: {
                        secret: resolvedFrontendJwtHMACSecret
                    }
                }
            }
        ]
    }
    isolated resource function get orgs/[string orgHandle]/groups/[string groupId](http:Request req) returns http:Ok|http:BadRequest|http:NotFound|http:Unauthorized|http:Forbidden|http:InternalServerError|error {
        log:printInfo("Fetching group details", orgHandle = orgHandle, groupId = groupId);

        // Permission check: user must have any of these permissions at any level
        types:UserContextV2|error userContext = extractUserContextFromRequest(req);
        if userContext is error {
            return utils:createUnauthorizedError("Invalid or missing authentication token");
        }
        types:AccessScope orgScope = {orgUuid: storage:DEFAULT_ORG_ID};
        boolean|error hasPermission = auth:hasAnyPermission(userContext.userId, [auth:PERMISSION_USER_MANAGE_GROUPS, auth:PERMISSION_USER_UPDATE_GROUP_ROLES, auth:PERMISSION_PROJECT_EDIT, auth:PERMISSION_PROJECT_MANAGE, auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], orgScope);
        if hasPermission is error {
            log:printError("Error checking permissions", hasPermission, userId = userContext.userId);
            return utils:createInternalServerError("Error checking permissions");
        }
        if !hasPermission {
            return <http:Forbidden>{
                body: {
                    message: "Insufficient permissions to view group details"
                }
            };
        }

        // Fetch group by ID
        types:Group|error group = storage:getGroupById(groupId);
        if group is error {
            log:printWarn("Group not found", groupId = groupId, 'error = group);
            return <http:NotFound>{
                body: {
                    message: "Group not found"
                }
            };
        }

        log:printInfo("Successfully fetched group details", groupId = groupId);
        return <http:Ok>{
            body: group
        };
    }

    // PUT /auth/orgs/{orgHandle}/groups/{groupId} - Update group
    @http:ResourceConfig {
        auth: [
            {
                jwtValidatorConfig: {
                    issuer: frontendJwtIssuer,
                    audience: frontendJwtAudience,
                    signatureConfig: {
                        secret: resolvedFrontendJwtHMACSecret
                    }
                }
            }
        ]
    }
    isolated resource function put orgs/[string orgHandle]/groups/[string groupId](@http:Payload types:GroupInput groupInput, http:Request req) returns http:Ok|http:BadRequest|http:Conflict|http:NotFound|http:Unauthorized|http:Forbidden|http:InternalServerError|error {
        log:printInfo("Updating group", orgHandle = orgHandle, groupId = groupId);

        // Permission check: org-level manage groups
        types:UserContextV2|error userContext = extractUserContextFromRequest(req);
        if userContext is error {
            return utils:createUnauthorizedError("Invalid or missing authentication token");
        }
        types:AccessScope orgScope = {orgUuid: storage:DEFAULT_ORG_ID};
        boolean|error hasPermission = auth:hasPermission(userContext.userId, auth:PERMISSION_USER_MANAGE_GROUPS, orgScope);
        if hasPermission is error {
            log:printError("Error checking permissions", hasPermission, userId = userContext.userId);
            return utils:createInternalServerError("Error checking permissions");
        }
        if !hasPermission {
            return <http:Forbidden>{
                body: {
                    message: "Insufficient permissions to update groups"
                }
            };
        }

        // Update the group
        error? updateResult = storage:updateGroup(groupId, groupInput);
        if updateResult is error {
            log:printError("Error updating group", updateResult, groupId = groupId);
            if updateResult.message().includes("not found") {
                return <http:NotFound>{
                    body: {
                        message: "Group not found"
                    }
                };
            }
            if updateResult.message().includes("already exists") {
                return <http:Conflict>{
                    body: {
                        message: updateResult.message()
                    }
                };
            }
            return utils:createInternalServerError("Failed to update group");
        }

        // Fetch the updated group
        types:Group|error updatedGroup = storage:getGroupById(groupId);
        if updatedGroup is error {
            log:printError("Error fetching updated group", updatedGroup, groupId = groupId);
            return utils:createInternalServerError("Group updated but failed to fetch details");
        }

        log:printInfo("Successfully updated group", groupId = groupId);
        storage:logAuditEvent(storage:AUDIT_GROUP_UPDATE, userId = userContext.userId,
                resourceType = storage:AUDIT_RESOURCE_GROUP, resourceId = groupId,
                details = string `Group '${groupInput.groupName}' updated by user '${userContext.username}'`,
                clientIp = extractClientIp(req));
        return <http:Ok>{
            body: updatedGroup
        };
    }

    // DELETE /auth/orgs/{orgHandle}/groups/{groupId} - Delete group
    @http:ResourceConfig {
        auth: [
            {
                jwtValidatorConfig: {
                    issuer: frontendJwtIssuer,
                    audience: frontendJwtAudience,
                    signatureConfig: {
                        secret: resolvedFrontendJwtHMACSecret
                    }
                }
            }
        ]
    }
    isolated resource function delete orgs/[string orgHandle]/groups/[string groupId](http:Request req) returns http:Ok|http:BadRequest|http:Conflict|http:NotFound|http:Unauthorized|http:Forbidden|http:InternalServerError|error {
        log:printInfo("Deleting group", orgHandle = orgHandle, groupId = groupId);

        // Permission check: org-level manage groups
        types:UserContextV2|error userContext = extractUserContextFromRequest(req);
        if userContext is error {
            return utils:createUnauthorizedError("Invalid or missing authentication token");
        }
        types:AccessScope orgScope = {orgUuid: storage:DEFAULT_ORG_ID};
        boolean|error hasPermission = auth:hasPermission(userContext.userId, auth:PERMISSION_USER_MANAGE_GROUPS, orgScope);
        if hasPermission is error {
            log:printError("Error checking permissions", hasPermission, userId = userContext.userId);
            return utils:createInternalServerError("Error checking permissions");
        }
        if !hasPermission {
            return <http:Forbidden>{
                body: {
                    message: "Insufficient permissions to delete groups"
                }
            };
        }

        // Guard: prevent deletion of the built-in Super Admins group
        string|error superAdminsGroupId = storage:getSuperAdminsGroupId();
        if superAdminsGroupId is error {
            log:printError("Could not resolve Super Admins group ID", superAdminsGroupId);
            return utils:createInternalServerError("Could not resolve Super Admins group");
        }
        if groupId == superAdminsGroupId {
            log:printWarn("Attempted to delete the Super Admins group", groupId = groupId, userId = userContext.userId);
            return <http:Forbidden>{
                body: {
                    message: "The Super Admins group cannot be deleted"
                }
            };
        }

        // Check if group has mapped roles before deleting
        int|error roleMappingCount = storage:getGroupRoleMappingCount(groupId);
        if roleMappingCount is error {
            log:printError("Error checking role mappings", roleMappingCount, groupId = groupId);
            return utils:createInternalServerError("Error checking role mappings");
        }
        if roleMappingCount > 0 {
            return <http:Conflict>{
                body: {
                    message: "Cannot delete a group with mapped roles. Remove all role mappings first."
                }
            };
        }

        // Delete the group
        error? deleteResult = storage:deleteGroup(groupId);
        if deleteResult is error {
            log:printError("Error deleting group", deleteResult, groupId = groupId);
            if deleteResult.message().includes("not found") {
                return <http:NotFound>{
                    body: {
                        message: "Group not found"
                    }
                };
            }
            return utils:createInternalServerError("Failed to delete group");
        }

        log:printInfo("Successfully deleted group", groupId = groupId);
        storage:logAuditEvent(storage:AUDIT_GROUP_DELETE, userId = userContext.userId,
                resourceType = storage:AUDIT_RESOURCE_GROUP, resourceId = groupId,
                details = string `Group '${groupId}' deleted by user '${userContext.username}'`,
                clientIp = extractClientIp(req));
        return <http:Ok>{
            body: {
                message: "Group deleted successfully",
                groupId: groupId
            }
        };
    }

    // ============================================================================
    // SSO Group Mapping Endpoints
    // ============================================================================

    // GET /auth/orgs/{orgHandle}/sso/group-mappings - List SSO group mappings
    @http:ResourceConfig {
        auth: [
            {
                jwtValidatorConfig: {
                    issuer: frontendJwtIssuer,
                    audience: frontendJwtAudience,
                    signatureConfig: {
                        secret: resolvedFrontendJwtHMACSecret
                    }
                }
            }
        ]
    }
    isolated resource function get orgs/[string orgHandle]/sso/'group\-mappings(http:Request req)
            returns http:Ok|http:Unauthorized|http:Forbidden|http:InternalServerError|error {
        log:printInfo("Fetching SSO group mappings", orgHandle = orgHandle);

        types:UserContextV2|error userContext = extractUserContextFromRequest(req);
        if userContext is error {
            return utils:createUnauthorizedError("Invalid or missing authentication token");
        }

        types:AccessScope orgScope = {orgUuid: storage:DEFAULT_ORG_ID};
        boolean|error hasPermission = auth:hasAnyPermission(userContext.userId,
            [auth:PERMISSION_USER_MANAGE_GROUPS, auth:PERMISSION_USER_UPDATE_GROUP_ROLES], orgScope);
        if hasPermission is error {
            log:printError("Error checking permissions", hasPermission, userId = userContext.userId);
            return utils:createInternalServerError("Error checking permissions");
        }
        if !hasPermission {
            return <http:Forbidden>{
                body: {
                    message: "Insufficient permissions to list SSO group mappings"
                }
            };
        }

        types:SSOGroupMappingResponse[]|error mappings =
            storage:getSSOGroupMappingsWithGroupNamesByOrgId(storage:DEFAULT_ORG_ID);
        if mappings is error {
            log:printError("Error fetching SSO group mappings", mappings, orgHandle = orgHandle);
            if mappings.message() == storage:SSO_SCHEMA_UPDATE_REQUIRED {
                return utils:createInternalServerError(storage:SSO_SCHEMA_UPDATE_REQUIRED);
            }
            return utils:createInternalServerError("Failed to fetch SSO group mappings");
        }

        return <http:Ok>{
            body: mappings
        };
    }

    // POST /auth/orgs/{orgHandle}/sso/group-mappings - Create an SSO group mapping
    @http:ResourceConfig {
        auth: [
            {
                jwtValidatorConfig: {
                    issuer: frontendJwtIssuer,
                    audience: frontendJwtAudience,
                    signatureConfig: {
                        secret: resolvedFrontendJwtHMACSecret
                    }
                }
            }
        ]
    }
    isolated resource function post orgs/[string orgHandle]/sso/'group\-mappings(
            @http:Payload types:SSOGroupMappingInput mappingInput, http:Request req)
            returns http:Created|http:BadRequest|http:Conflict|http:NotFound|http:Unauthorized|http:Forbidden|http:InternalServerError|error {
        log:printInfo("Creating SSO group mapping", orgHandle = orgHandle);

        types:UserContextV2|error userContext = extractUserContextFromRequest(req);
        if userContext is error {
            return utils:createUnauthorizedError("Invalid or missing authentication token");
        }

        string? validationError = validateSSOGroupMappingInput(mappingInput);
        if validationError is string {
            return utils:createBadRequestError(validationError);
        }

        string? projectUuid = normalizeOptionalId(mappingInput?.projectUuid);
        string? integrationUuid = normalizeOptionalId(mappingInput?.integrationUuid);

        // Authorize at the mapping's administrative scope so project/integration
        // scoped admins can manage mappings at their level but not broader ones.
        types:AccessScope mappingScope = {orgUuid: storage:DEFAULT_ORG_ID};
        if projectUuid is string {
            mappingScope.projectUuid = projectUuid;
        }
        if integrationUuid is string {
            mappingScope.integrationUuid = integrationUuid;
        }
        boolean|error hasPermission = auth:hasAnyPermission(userContext.userId,
            [auth:PERMISSION_USER_MANAGE_GROUPS, auth:PERMISSION_USER_UPDATE_GROUP_ROLES], mappingScope);
        if hasPermission is error {
            log:printError("Error checking permissions", hasPermission, userId = userContext.userId);
            return utils:createInternalServerError("Error checking permissions");
        }
        if !hasPermission {
            return <http:Forbidden>{
                body: {
                    message: "Insufficient permissions to create SSO group mappings at the requested scope"
                }
            };
        }

        string? projectName = ();
        string? integrationName = ();
        if projectUuid is string {
            types:Project|error project = storage:getProjectById(projectUuid);
            if project is error || project.orgId != storage:DEFAULT_ORG_ID {
                return <http:NotFound>{
                    body: {
                        message: "Target project not found"
                    }
                };
            }
            projectName = project.name;
        }
        if integrationUuid is string {
            types:Component|error component = storage:getComponentById(integrationUuid);
            if component is error || component.projectId != projectUuid {
                return <http:NotFound>{
                    body: {
                        message: "Target integration not found in the specified project"
                    }
                };
            }
            integrationName = component.displayName;
        }

        types:SSOGroupMappingInput inputWithOrg = {
            issuer: mappingInput.issuer.trim(),
            claimName: mappingInput.claimName.trim(),
            claimValue: mappingInput.claimValue.trim(),
            groupId: mappingInput.groupId.trim(),
            orgUuid: storage:DEFAULT_ORG_ID
        };
        if projectUuid is string {
            inputWithOrg.projectUuid = projectUuid;
        }
        if integrationUuid is string {
            inputWithOrg.integrationUuid = integrationUuid;
        }
        types:Group|error targetGroup = storage:getGroupById(inputWithOrg.groupId);
        if targetGroup is error || targetGroup.orgUuid != storage:DEFAULT_ORG_ID {
            return <http:NotFound>{
                body: {
                    message: "Target group not found"
                }
            };
        }

        // A mapping grants whatever the target group's roles grant, which may reach
        // wider than the scope the mapping is administered at. Without this check a
        // project-scoped administrator could map a claim onto an org-wide group
        // (Super Admins included) and escalate privileges. Require the caller to
        // hold the permission at every scope the target group's roles apply to.
        boolean|error mayTargetGroup = canManageTargetGroupScopes(userContext.userId, inputWithOrg.groupId);
        if mayTargetGroup is error {
            log:printError("Error checking target group role scopes", mayTargetGroup, groupId = inputWithOrg.groupId);
            return utils:createInternalServerError("Failed to verify target group permissions");
        }
        if !mayTargetGroup {
            log:printWarn("SSO group mapping rejected — target group grants access beyond the caller's scope",
                    userId = userContext.userId, groupId = inputWithOrg.groupId);
            return <http:Forbidden>{
                body: {
                    message: "Insufficient permissions to target this group. The group's roles apply beyond " +
                        "the scope of this mapping; org-level user management is required."
                }
            };
        }

        string|error mappingId = storage:createSSOGroupMapping(inputWithOrg);
        if mappingId is error {
            log:printError("Error creating SSO group mapping", mappingId);
            if mappingId.message().includes("already exists") {
                // The unique constraint ignores scope, so the conflicting mapping
                // may live at a different level than the caller can see.
                return <http:Conflict>{
                    body: {
                        message: describeSSOMappingConflict(inputWithOrg)
                    }
                };
            }
            return utils:createInternalServerError("Failed to create SSO group mapping");
        }

        types:SSOGroupMapping|error createdMapping = storage:getSSOGroupMappingById(mappingId);
        if createdMapping is error {
            log:printError("Error fetching created SSO group mapping", createdMapping, mappingId = mappingId);
            return utils:createInternalServerError("Mapping created but failed to fetch details");
        }

        types:SSOGroupMappingResponse response = {
            ...createdMapping,
            groupName: targetGroup.groupName,
            projectName: projectName,
            integrationName: integrationName
        };
        return <http:Created>{
            body: response
        };
    }

    // SSO group mappings are immutable: there is no update endpoint. Changing a
    // mapping's issuer, claim, group, or scope means delete + create.

    // DELETE /auth/orgs/{orgHandle}/sso/group-mappings/{mappingId} - Delete an SSO group mapping
    @http:ResourceConfig {
        auth: [
            {
                jwtValidatorConfig: {
                    issuer: frontendJwtIssuer,
                    audience: frontendJwtAudience,
                    signatureConfig: {
                        secret: resolvedFrontendJwtHMACSecret
                    }
                }
            }
        ]
    }
    isolated resource function delete orgs/[string orgHandle]/sso/'group\-mappings/[string mappingId](
            http:Request req)
            returns http:Ok|http:NotFound|http:Unauthorized|http:Forbidden|http:InternalServerError|error {
        log:printInfo("Deleting SSO group mapping", orgHandle = orgHandle, mappingId = mappingId);

        types:UserContextV2|error userContext = extractUserContextFromRequest(req);
        if userContext is error {
            return utils:createUnauthorizedError("Invalid or missing authentication token");
        }

        types:SSOGroupMapping|error mapping = storage:getSSOGroupMappingById(mappingId);
        if mapping is error || mapping.orgUuid != storage:DEFAULT_ORG_ID {
            return <http:NotFound>{
                body: {
                    message: "SSO group mapping not found"
                }
            };
        }

        // Authorize at the mapping's administrative scope, mirroring create.
        types:AccessScope mappingScope = {orgUuid: storage:DEFAULT_ORG_ID};
        string? mappingProjectUuid = mapping.projectUuid;
        if mappingProjectUuid is string {
            mappingScope.projectUuid = mappingProjectUuid;
        }
        string? mappingIntegrationUuid = mapping.integrationUuid;
        if mappingIntegrationUuid is string {
            mappingScope.integrationUuid = mappingIntegrationUuid;
        }
        boolean|error hasPermission = auth:hasAnyPermission(userContext.userId,
            [auth:PERMISSION_USER_MANAGE_GROUPS, auth:PERMISSION_USER_UPDATE_GROUP_ROLES], mappingScope);
        if hasPermission is error {
            log:printError("Error checking permissions", hasPermission, userId = userContext.userId);
            return utils:createInternalServerError("Error checking permissions");
        }
        if !hasPermission {
            return <http:Forbidden>{
                body: {
                    message: "Insufficient permissions to delete SSO group mappings at this scope"
                }
            };
        }

        error? deleteResult = storage:deleteSSOGroupMapping(mappingId, storage:DEFAULT_ORG_ID);
        if deleteResult is error {
            log:printError("Error deleting SSO group mapping", deleteResult, mappingId = mappingId);
            if deleteResult.message().includes("not found") {
                return <http:NotFound>{
                    body: {
                        message: "SSO group mapping not found"
                    }
                };
            }
            return utils:createInternalServerError("Failed to delete SSO group mapping");
        }

        return <http:Ok>{
            body: {
                message: "SSO group mapping deleted successfully",
                mappingId: mappingId
            }
        };
    }

    // ============================================================================
    // Group-User Mapping Endpoints (RBAC v2)
    // ============================================================================

    // POST /auth/orgs/{orgHandle}/groups/{groupId}/users - Add users to group
    @http:ResourceConfig {
        auth: [
            {
                jwtValidatorConfig: {
                    issuer: frontendJwtIssuer,
                    audience: frontendJwtAudience,
                    signatureConfig: {
                        secret: resolvedFrontendJwtHMACSecret
                    }
                }
            }
        ]
    }
    isolated resource function post orgs/[string orgHandle]/groups/[string groupId]/users(types:AddUsersToGroupInput input, http:Request req) returns http:Ok|http:BadRequest|http:NotFound|http:Unauthorized|http:Forbidden|http:InternalServerError|error {
        log:printInfo("Adding users to group", orgHandle = orgHandle, groupId = groupId, userCount = input.userIds.length());

        // Permission check: org-level user/group management
        types:UserContextV2|error userContext = extractUserContextFromRequest(req);
        if userContext is error {
            return utils:createUnauthorizedError("Invalid or missing authentication token");
        }
        types:AccessScope orgScope = {orgUuid: storage:DEFAULT_ORG_ID};
        boolean|error hasPermission = auth:hasAnyPermission(userContext.userId, [auth:PERMISSION_USER_MANAGE_GROUPS, auth:PERMISSION_USER_UPDATE_USERS, auth:PERMISSION_USER_MANAGE_USERS], orgScope);
        if hasPermission is error {
            log:printError("Error checking permissions", hasPermission, userId = userContext.userId);
            return utils:createInternalServerError("Error checking permissions");
        }
        if !hasPermission {
            return <http:Forbidden>{
                body: {
                    message: "Insufficient permissions to add users to group"
                }
            };
        }

        if federatedAccessControlEnabled {
            return <http:Forbidden>{
                body: {
                    message: "Manual group membership additions are disabled because federated access control is enabled. Manage memberships through SSO group mappings."
                }
            };
        }

        // Validate input
        if input.userIds.length() == 0 {
            return <http:BadRequest>{
                body: {
                    message: "At least one user ID must be provided"
                }
            };
        }

        // Verify group exists
        types:Group|error existingGroup = storage:getGroupById(groupId);
        if existingGroup is error {
            log:printError("Group not found", existingGroup, groupId = groupId);
            return <http:NotFound>{
                body: {
                    message: "Group not found"
                }
            };
        }

        // Add each user to the group
        int successCount = 0;
        int failureCount = 0;
        string[] errors = [];

        foreach string userId in input.userIds {
            error? addResult = storage:addUserToGroup(userId, groupId);
            if addResult is error {
                failureCount += 1;
                errors.push(string `Failed to add user ${userId}: ${addResult.message()}`);
                log:printError(string `Error adding user ${userId} to group ${groupId}`, addResult);
            } else {
                successCount += 1;
            }
        }

        log:printInfo("Users added to group", groupId = groupId, successCount = successCount, failureCount = failureCount);

        if failureCount > 0 && successCount == 0 {
            // All operations failed
            return utils:createInternalServerError(string `Failed to add all users to group: ${errors[0]}`);
        }

        return <http:Ok>{
            body: {
                message: string `Successfully added ${successCount} user(s) to group`,
                groupId: groupId,
                successCount: successCount,
                failureCount: failureCount,
                errors: errors
            }
        };
    }

    // GET /auth/orgs/{orgHandle}/groups/{groupId}/users - Get users in a group
    @http:ResourceConfig {
        auth: [
            {
                jwtValidatorConfig: {
                    issuer: frontendJwtIssuer,
                    audience: frontendJwtAudience,
                    signatureConfig: {
                        secret: resolvedFrontendJwtHMACSecret
                    }
                }
            }
        ]
    }
    isolated resource function get orgs/[string orgHandle]/groups/[string groupId]/users(http:Request req) returns http:Ok|http:BadRequest|http:NotFound|http:Unauthorized|http:Forbidden|http:InternalServerError|error {
        log:printInfo("Fetching users for group", orgHandle = orgHandle, groupId = groupId);

        // Permission check: org-level user/group management
        types:UserContextV2|error userContext = extractUserContextFromRequest(req);
        if userContext is error {
            return utils:createUnauthorizedError("Invalid or missing authentication token");
        }
        types:AccessScope orgScope = {orgUuid: storage:DEFAULT_ORG_ID};
        boolean|error hasPermission = auth:hasAnyPermission(userContext.userId, [auth:PERMISSION_USER_MANAGE_GROUPS, auth:PERMISSION_USER_UPDATE_USERS, auth:PERMISSION_USER_MANAGE_USERS], orgScope);
        if hasPermission is error {
            log:printError("Error checking permissions", hasPermission, userId = userContext.userId);
            return utils:createInternalServerError("Error checking permissions");
        }
        if !hasPermission {
            return <http:Forbidden>{
                body: {
                    message: "Insufficient permissions to list group users"
                }
            };
        }

        // Verify group exists
        types:Group|error existingGroup = storage:getGroupById(groupId);
        if existingGroup is error {
            log:printError("Group not found", existingGroup, groupId = groupId);
            return <http:NotFound>{
                body: {
                    message: "Group not found"
                }
            };
        }

        // Get effective users and whether each membership is manual or SSO-owned.
        types:EffectiveGroupUserMembership[]|error memberships =
            storage:getGroupUsersWithMembershipSource(groupId);
        if memberships is error {
            log:printError("Error fetching group users", memberships, groupId = groupId);
            return utils:createInternalServerError("Failed to fetch group users");
        }

        // Fetch details for each user
        json[] users = [];
        foreach types:EffectiveGroupUserMembership membership in memberships {
            types:User|error user = storage:getUserDetailsById(membership.userUuid);
            if user is types:User {
                users.push({
                    userId: user.userId,
                    username: user.username,
                    displayName: user.displayName,
                    membershipSource: membership.membershipSource
                });
            } else {
                log:printWarn(string `Failed to fetch details for user ${membership.userUuid}`, user);
            }
        }

        log:printInfo(string `Successfully fetched ${users.length()} users for group ${groupId}`);
        return <http:Ok>{
            body: {
                users: users,
                count: users.length()
            }
        };
    }

    // DELETE /auth/orgs/{orgHandle}/groups/{groupId}/users/{userId} - Remove user from group
    @http:ResourceConfig {
        auth: [
            {
                jwtValidatorConfig: {
                    issuer: frontendJwtIssuer,
                    audience: frontendJwtAudience,
                    signatureConfig: {
                        secret: resolvedFrontendJwtHMACSecret
                    }
                }
            }
        ]
    }
    isolated resource function delete orgs/[string orgHandle]/groups/[string groupId]/users/[string userId](http:Request req) returns http:Ok|http:BadRequest|http:NotFound|http:Unauthorized|http:Forbidden|http:InternalServerError|error {
        log:printInfo("Removing user from group", orgHandle = orgHandle, groupId = groupId, userId = userId);

        // Permission check: org-level user/group management
        types:UserContextV2|error userContext = extractUserContextFromRequest(req);
        if userContext is error {
            return utils:createUnauthorizedError("Invalid or missing authentication token");
        }
        types:AccessScope orgScope = {orgUuid: storage:DEFAULT_ORG_ID};
        boolean|error hasPermission = auth:hasAnyPermission(userContext.userId, [auth:PERMISSION_USER_MANAGE_GROUPS, auth:PERMISSION_USER_UPDATE_USERS, auth:PERMISSION_USER_MANAGE_USERS], orgScope);
        if hasPermission is error {
            log:printError("Error checking permissions", hasPermission, userId = userContext.userId);
            return utils:createInternalServerError("Error checking permissions");
        }
        if !hasPermission {
            return <http:Forbidden>{
                body: {
                    message: "Insufficient permissions to remove user from group"
                }
            };
        }

        // Remove user from group
        error? removeResult = storage:removeUserFromGroup(userId, groupId);
        if removeResult is error {
            log:printError("Error removing user from group", removeResult, userId = userId, groupId = groupId);
            if removeResult.message().includes("not found") {
                return <http:NotFound>{
                    body: {
                        message: "User not found in group"
                    }
                };
            }
            return utils:createInternalServerError("Failed to remove user from group");
        }

        log:printInfo("Successfully removed user from group", userId = userId, groupId = groupId);
        return <http:Ok>{
            body: {
                message: "User removed from group successfully",
                groupId: groupId,
                userId: userId
            }
        };
    }

    // PUT /auth/orgs/{orgHandle}/users/{userId}/groups - Replace user's group memberships
    @http:ResourceConfig {
        auth: [
            {
                jwtValidatorConfig: {
                    issuer: frontendJwtIssuer,
                    audience: frontendJwtAudience,
                    signatureConfig: {
                        secret: resolvedFrontendJwtHMACSecret
                    }
                }
            }
        ]
    }
    isolated resource function put orgs/[string orgHandle]/users/[string userId]/groups(@http:Payload types:UpdateUserGroupsInput input, http:Request req) returns http:Ok|http:BadRequest|http:NotFound|http:Unauthorized|http:Forbidden|http:InternalServerError|error {
        log:printInfo("Updating groups for user", orgHandle = orgHandle, userId = userId);

        // Permission check: org-level user/group management
        types:UserContextV2|error userContext = extractUserContextFromRequest(req);
        if userContext is error {
            return utils:createUnauthorizedError("Invalid or missing authentication token");
        }
        types:AccessScope orgScope = {orgUuid: storage:DEFAULT_ORG_ID};
        boolean|error hasPermission = auth:hasAnyPermission(userContext.userId, [auth:PERMISSION_USER_MANAGE_GROUPS, auth:PERMISSION_USER_UPDATE_USERS, auth:PERMISSION_USER_MANAGE_USERS], orgScope);
        if hasPermission is error {
            log:printError("Error checking permissions", hasPermission, userId = userContext.userId);
            return utils:createInternalServerError("Error checking permissions");
        }
        if !hasPermission {
            return <http:Forbidden>{
                body: {
                    message: "Insufficient permissions to update user groups"
                }
            };
        }

        // Fetch current group memberships
        types:Group[]|error currentGroups = storage:getUserManualGroups(userId);
        if currentGroups is error {
            log:printError("Failed to fetch current user groups", currentGroups, userId = userId);
            return utils:createInternalServerError("Failed to fetch current user groups");
        }

        string[] currentIds = [];
        foreach types:Group g in currentGroups {
            currentIds.push(g.groupId);
        }

        string[] desiredIds = input.groupIds;

        // Compute differences
        string[] toAdd = [];
        foreach string gid in desiredIds {
            boolean exists = false;
            foreach string cid in currentIds {
                if cid == gid {
                    exists = true;
                    break;
                }
            }
            if !exists {
                toAdd.push(gid);
            }
        }

        string[] toRemove = [];
        foreach string cid in currentIds {
            boolean keep = false;
            foreach string gid in desiredIds {
                if gid == cid {
                    keep = true;
                    break;
                }
            }
            if !keep {
                toRemove.push(cid);
            }
        }

        // In federated mode manual memberships come from SSO group mappings;
        // admins may still remove manual rows (e.g. a stale super admin grant)
        // but must not add new ones.
        if federatedAccessControlEnabled && toAdd.length() > 0 {
            return <http:Forbidden>{
                body: {
                    message: "Manual group membership additions are disabled because federated access control is enabled. Only removals are allowed."
                }
            };
        }

        int added = 0;
        int removed = 0;
        string[] errors = [];

        // Apply removals first
        foreach string gid in toRemove {
            error? rem = storage:removeUserFromGroup(userId, gid);
            if rem is error {
                errors.push(string `Failed removing from ${gid}: ${rem.message()}`);
                log:printError("Error removing user from group", rem, userId = userId, groupId = gid);
            } else {
                removed += 1;
            }
        }

        // Apply additions
        foreach string gid in toAdd {
            error? add = storage:addUserToGroup(userId, gid);
            if add is error {
                errors.push(string `Failed adding to ${gid}: ${add.message()}`);
                log:printError("Error adding user to group", add, userId = userId, groupId = gid);
            } else {
                added += 1;
            }
        }

        // Fetch the final manual memberships. This endpoint only ever adds or removes
        // manual rows, so the result deliberately excludes SSO-owned (federated)
        // memberships. The response field is named accordingly so callers do not read
        // it as the user's effective group set — use GET /users, which reports
        // membershipSource, for that.
        types:Group[]|error finalGroups = storage:getUserManualGroups(userId);
        if finalGroups is error {
            log:printError("Failed to fetch final user groups", finalGroups, userId = userId);
            return utils:createInternalServerError("Failed to fetch final user groups");
        }

        string[] manualGroupIds = [];
        foreach types:Group g in <types:Group[]>finalGroups {
            manualGroupIds.push(g.groupId);
        }

        return <http:Ok>{
            body: {
                message: string `User groups updated. Added: ${added}, Removed: ${removed}`,
                userId: userId,
                addedCount: added,
                removedCount: removed,
                errors: errors,
                manualGroupIds: manualGroupIds
            }
        };
    }

    // ============================================================================
    // Group-Role Mapping Endpoints (RBAC v2)
    // ============================================================================

    // POST /auth/orgs/{orgHandle}/groups/{groupId}/roles - Assign roles to group with scope
    @http:ResourceConfig {
        auth: [
            {
                jwtValidatorConfig: {
                    issuer: frontendJwtIssuer,
                    audience: frontendJwtAudience,
                    signatureConfig: {
                        secret: resolvedFrontendJwtHMACSecret
                    }
                }
            }
        ]
    }
    isolated resource function post orgs/[string orgHandle]/groups/[string groupId]/roles(types:AssignRolesToGroupInput input, http:Request req) returns http:Ok|http:BadRequest|http:NotFound|http:Unauthorized|http:Forbidden|http:InternalServerError|error {
        log:printInfo("Assigning roles to group", orgHandle = orgHandle, groupId = groupId, roleCount = input.roleIds.length());

        // Extract user context for granular permission checks
        types:UserContextV2|error userContext = extractUserContextFromRequest(req);
        if userContext is error {
            log:printError("Failed to extract user context for token revocation", userContext);
            return utils:createUnauthorizedError("Invalid or missing authentication token");
        }

        // Note: Basic permission validation is handled by @http:ResourceConfig scopes
        // Additional granular checks below ensure user has permissions at the specified scope level

        // Validate input
        if input.roleIds.length() == 0 {
            return <http:BadRequest>{
                body: {
                    message: "At least one role ID must be provided"
                }
            };
        }

        // Verify group exists
        types:Group|error existingGroup = storage:getGroupById(groupId);
        if existingGroup is error {
            log:printError("Group not found", existingGroup, groupId = groupId);
            return <http:NotFound>{
                body: {
                    message: "Group not found"
                }
            };
        }

        // Validate scope context
        if input.integrationUuid is string && input.projectUuid is () {
            return <http:BadRequest>{
                body: {
                    message: "projectUuid is required when integrationUuid is provided"
                }
            };
        }

        // Granular permission checks based on scope level
        // Check user has appropriate permissions at the specified scope
        types:AccessScope scope = {orgUuid: storage:DEFAULT_ORG_ID};
        if input.integrationUuid is string {
            // Integration-level scope - most restrictive
            string integrationUuid = <string>input.integrationUuid;
            string projectUuid = <string>input.projectUuid;
            scope.projectUuid = projectUuid;
            scope.integrationUuid = integrationUuid;
        } else if input.projectUuid is string {
            // Project-level scope
            string projectUuid = <string>input.projectUuid;
            scope.projectUuid = projectUuid;
        }

        string[] permissionsList = [auth:PERMISSION_USER_MANAGE_GROUPS, auth:PERMISSION_USER_UPDATE_GROUP_ROLES, auth:PERMISSION_USER_MANAGE_USERS];
        if scope.integrationUuid is string {
            permissionsList.push(auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE);
        } else if scope.projectUuid is string {
            permissionsList.push(auth:PERMISSION_PROJECT_EDIT, auth:PERMISSION_PROJECT_MANAGE);
        }
        boolean|error canAssign = auth:hasAnyPermission(userContext.userId,
                permissionsList,
                scope
        );
        if canAssign is error {
            log:printError("Error checking project scope permissions", canAssign, userId = userContext.userId);
            return utils:createInternalServerError("Error checking permissions");
        }

        if !canAssign {
            log:printWarn("User lacks permission to assign roles at this scope",
                    userId = userContext.userId, projectUuid = input.projectUuid ?: "N/A", integrationUuid = input.integrationUuid ?: "N/A");
            return <http:Forbidden>{
                body: {
                    message: "You do not have permission to assign roles at this scope"
                }
            };
        }

        // Assign each role to the group with the specified scope
        int successCount = 0;
        int failureCount = 0;
        string[] errors = [];
        int[] mappingIds = [];

        int orgUuid = input.orgUuid ?: 1;

        foreach string roleId in input.roleIds {
            // Verify role exists
            types:RoleV2|error role = storage:getRoleV2ById(roleId);
            if role is error {
                failureCount += 1;
                errors.push(string `Role ${roleId} not found`);
                log:printError(string `Role not found: ${roleId}`, role);
                continue;
            }

            // Create assignment input for this role
            types:AssignRoleToGroupInput assignInput = {
                groupId: groupId,
                roleId: roleId,
                orgUuid: orgUuid,
                projectUuid: input.projectUuid,
                envUuid: input.envUuid,
                integrationUuid: input.integrationUuid
            };

            // Assign role to group
            int|error mappingId = storage:assignRoleToGroup(assignInput);
            if mappingId is error {
                failureCount += 1;
                errors.push(string `Failed to assign role ${roleId}: ${mappingId.message()}`);
                log:printError(string `Error assigning role ${roleId} to group ${groupId}`, mappingId);
            } else {
                successCount += 1;
                mappingIds.push(mappingId);
            }
        }

        log:printInfo("Roles assigned to group", groupId = groupId, successCount = successCount, failureCount = failureCount);

        if failureCount > 0 && successCount == 0 {
            // All operations failed
            return utils:createInternalServerError(string `Failed to assign all roles to group: ${errors[0]}`);
        }

        return <http:Ok>{
            body: {
                message: string `Successfully assigned ${successCount} role(s) to group`,
                groupId: groupId,
                successCount: successCount,
                failureCount: failureCount,
                mappingIds: mappingIds,
                errors: errors
            }
        };
    }

    // DELETE /auth/orgs/{orgHandle}/groups/{groupId}/roles/{mappingId} - Remove role from group
    @http:ResourceConfig {
        auth: [
            {
                jwtValidatorConfig: {
                    issuer: frontendJwtIssuer,
                    audience: frontendJwtAudience,
                    signatureConfig: {
                        secret: resolvedFrontendJwtHMACSecret
                    }
                }
            }
        ]
    }
    resource function delete orgs/[string orgHandle]/groups/[string groupId]/roles/[int mappingId](http:Request req)
            returns http:Ok|http:NotFound|http:Forbidden|http:InternalServerError|http:Unauthorized|error {

        log:printInfo("Removing role from group", orgHandle = orgHandle, groupId = groupId, mappingId = mappingId);

        // Extract user context for granular permission checks
        types:UserContextV2|error userContext = extractUserContextFromRequest(req);
        if userContext is error {
            log:printError("Failed to extract user context for token revocation", userContext);
            return utils:createUnauthorizedError("Invalid or missing authentication token");
        }

        // Verify group exists
        types:Group|error existingGroup = storage:getGroupById(groupId);
        if existingGroup is error {
            log:printWarn("Group not found", groupId = groupId, 'error = existingGroup);
            return <http:NotFound>{
                body: {
                    message: string `Group not found: ${groupId}`
                }
            };
        }

        // Get the mapping to determine its scope for permission validation
        types:GroupRoleMapping|error mapping = storage:getGroupRoleMappingById(mappingId);
        if mapping is error {
            log:printWarn("Group-role mapping not found", mappingId = mappingId, 'error = mapping);
            return <http:NotFound>{
                body: {
                    message: string `Group-role mapping not found: ${mappingId}`
                }
            };
        }

        // Verify the mapping belongs to the specified group
        if mapping.groupId != groupId {
            log:printWarn("Mapping does not belong to specified group",
                    mappingId = mappingId,
                    mappingGroupId = mapping.groupId,
                    requestedGroupId = groupId);
            return <http:NotFound>{
                body: {
                    message: string `Group-role mapping ${mappingId} does not belong to group ${groupId}`
                }
            };
        }

        // Granular permission checks based on mapping scope
        // Check user has appropriate permissions at the specified scope
        types:AccessScope scope = {orgUuid: storage:DEFAULT_ORG_ID};
        if mapping.integrationUuid is string {
            // Integration-level scope - most restrictive
            string integrationUuid = <string>mapping.integrationUuid;
            string projectUuid = <string>mapping.projectUuid;
            scope.projectUuid = projectUuid;
            scope.integrationUuid = integrationUuid;
        } else if mapping.projectUuid is string {
            // Project-level scope
            string projectUuid = <string>mapping.projectUuid;
            scope.projectUuid = projectUuid;
        }

        string[] permissionsList = [auth:PERMISSION_USER_MANAGE_GROUPS, auth:PERMISSION_USER_UPDATE_GROUP_ROLES, auth:PERMISSION_USER_MANAGE_USERS];
        if scope.integrationUuid is string {
            permissionsList.push(auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE);
        }
        if scope.projectUuid is string {
            permissionsList.push(auth:PERMISSION_PROJECT_EDIT, auth:PERMISSION_PROJECT_MANAGE);
        }
        boolean|error canAssign = auth:hasAnyPermission(userContext.userId,
                permissionsList,
                scope
        );
        if canAssign is error {
            log:printError("Error checking project scope permissions", canAssign, userId = userContext.userId);
            return utils:createInternalServerError("Error checking permissions");
        }

        if !canAssign {
            log:printWarn("User lacks permission to remove roles at this scope",
                    userId = userContext.userId, projectUuid = mapping.projectUuid ?: "N/A", integrationUuid = mapping.integrationUuid ?: "N/A");
            return <http:Forbidden>{
                body: {
                    message: "You do not have permission to remove roles at this scope"
                }
            };
        }

        // Guard: prevent removing the org-level Super Admin role from the Super Admins group
        string|error superAdminsGroupId = storage:getSuperAdminsGroupId();
        if superAdminsGroupId is error {
            log:printError("Could not resolve Super Admins group ID", superAdminsGroupId);
            return utils:createInternalServerError("Could not resolve Super Admins group");
        }
        string|error superAdminRoleId = storage:getSuperAdminRoleId();
        if superAdminRoleId is error {
            log:printError("Could not resolve Super Admin role ID", superAdminRoleId);
            return utils:createInternalServerError("Could not resolve Super Admin role");
        }
        if groupId == superAdminsGroupId && mapping.roleId == superAdminRoleId && mapping.projectUuid is () {
            log:printWarn("Attempted to remove Super Admin role from Super Admins group",
                    mappingId = mappingId, groupId = groupId, userId = userContext.userId);
            return <http:Forbidden>{
                body: {
                    message: "Cannot remove the Super Admin role from the Super Admins group"
                }
            };
        }

        // Remove the role mapping
        error? result = storage:removeRoleFromGroup(mappingId);
        if result is error {
            log:printError(string `Failed to remove role mapping ${mappingId}`, result);
            return utils:createInternalServerError(string `Failed to remove role from group: ${result.message()}`);
        }

        log:printInfo("Successfully removed role from group", mappingId = mappingId, groupId = groupId);

        return <http:Ok>{
            body: {
                message: string `Successfully removed role from group`,
                mappingId: mappingId,
                groupId: groupId
            }
        };
    }

    // GET /auth/orgs/{orgHandle}/groups/{groupId}/roles - List group's role assignments
    @http:ResourceConfig {
        auth: [
            {
                jwtValidatorConfig: {
                    issuer: frontendJwtIssuer,
                    audience: frontendJwtAudience,
                    signatureConfig: {
                        secret: resolvedFrontendJwtHMACSecret
                    }
                }
            }
        ]
    }
    resource function get orgs/[string orgHandle]/groups/[string groupId]/roles(http:Request req, string? projectId = (), string? integrationId = ())
            returns http:Ok|http:NotFound|http:Forbidden|http:Unauthorized|http:InternalServerError|error {

        log:printInfo("Fetching role assignments for group", orgHandle = orgHandle, groupId = groupId, projectId = projectId ?: "N/A", integrationId = integrationId ?: "N/A");

        // Permission check at specified scope level
        types:UserContextV2|error userContext = extractUserContextFromRequest(req);
        if userContext is error {
            return utils:createUnauthorizedError("Invalid or missing authentication token");
        }

        // Build scope based on provided parameters
        types:AccessScope scope = {orgUuid: storage:DEFAULT_ORG_ID};
        if projectId is string {
            scope.projectUuid = projectId;
        }
        if integrationId is string {
            scope.integrationUuid = integrationId;
        }

        boolean|error hasPermission = auth:hasAnyPermission(userContext.userId, [auth:PERMISSION_USER_MANAGE_GROUPS, auth:PERMISSION_USER_UPDATE_GROUP_ROLES, auth:PERMISSION_USER_MANAGE_USERS, auth:PERMISSION_USER_UPDATE_USERS, auth:PERMISSION_PROJECT_EDIT, auth:PERMISSION_PROJECT_MANAGE, auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope);
        if hasPermission is error {
            log:printError("Error checking permissions", hasPermission, userId = userContext.userId);
            return utils:createInternalServerError("Error checking permissions");
        }
        if !hasPermission {
            return <http:Forbidden>{
                body: {
                    message: "Insufficient permissions to list group role assignments"
                }
            };
        }

        // Verify group exists
        types:Group|error existingGroup = storage:getGroupById(groupId);
        if existingGroup is error {
            log:printWarn("Group not found", groupId = groupId, 'error = existingGroup);
            return <http:NotFound>{
                body: {
                    message: string `Group not found: ${groupId}`
                }
            };
        }

        // Get all role mappings for this group
        types:GroupRoleMapping[]|error mappings = storage:getGroupRoleMappings(groupId);
        if mappings is error {
            log:printError(string `Failed to fetch role mappings for group ${groupId}`, mappings);
            return utils:createInternalServerError(string `Failed to fetch role assignments: ${mappings.message()}`);
        }

        // Enrich mappings with role details
        json[] enrichedMappings = [];
        foreach types:GroupRoleMapping mapping in mappings {
            // Get role details
            types:RoleV2|error role = storage:getRoleV2ById(mapping.roleId);
            if role is error {
                log:printWarn(string `Role not found for mapping ${mapping.id}`, roleId = mapping.roleId);
                // Skip this mapping if role doesn't exist (orphaned mapping)
                continue;
            }

            // Build enriched mapping with role name
            json enrichedMapping = {
                id: mapping.id,
                groupId: mapping.groupId,
                roleId: mapping.roleId,
                roleName: role.roleName,
                roleDescription: role.description,
                // Scope information
                orgUuid: mapping.orgUuid,
                projectUuid: mapping.projectUuid,
                envUuid: mapping.envUuid,
                integrationUuid: mapping.integrationUuid,
                createdAt: mapping.createdAt
            };

            enrichedMappings.push(enrichedMapping);
        }

        log:printInfo(string `Found ${enrichedMappings.length()} role assignments for group ${groupId}`);

        return <http:Ok>{
            body: {
                groupId: groupId,
                mappings: enrichedMappings,
                count: enrichedMappings.length()
            }
        };
    }

    // ============================================================================
    // User Management Endpoints (RBAC v2)
    // ============================================================================

    // GET /auth/orgs/{orgHandle}/users - List all users with group memberships
    @http:ResourceConfig {
        auth: [
            {
                jwtValidatorConfig: {
                    issuer: frontendJwtIssuer,
                    audience: frontendJwtAudience,
                    signatureConfig: {
                        secret: resolvedFrontendJwtHMACSecret
                    }
                }
            }
        ]
    }
    resource function get orgs/[string orgHandle]/users(http:Request req)
            returns http:Ok|http:Forbidden|http:Unauthorized|http:InternalServerError|error {

        log:printInfo("Fetching users for organization", orgHandle = orgHandle);

        // Permission check: org-level user management
        types:UserContextV2|error userContext = extractUserContextFromRequest(req);
        if userContext is error {
            return utils:createUnauthorizedError("Invalid or missing authentication token");
        }
        types:AccessScope orgScope = {orgUuid: storage:DEFAULT_ORG_ID};
        boolean|error hasPermission = auth:hasAnyPermission(userContext.userId, [auth:PERMISSION_USER_UPDATE_USERS, auth:PERMISSION_USER_MANAGE_USERS], orgScope);
        if hasPermission is error {
            log:printError("Error checking permissions", hasPermission, userId = userContext.userId);
            return utils:createInternalServerError("Error checking permissions");
        }
        if !hasPermission {
            return <http:Forbidden>{
                body: {
                    message: "Insufficient permissions to list users"
                }
            };
        }

        // Get all users with their group memberships
        json[]|error users = storage:getAllUsersV2();
        if users is error {
            log:printError("Failed to fetch users", users);
            return utils:createInternalServerError(string `Failed to fetch users: ${users.message()}`);
        }

        log:printInfo(string `Successfully fetched ${users.length()} users`);

        return <http:Ok>{
            body: {
                users: users,
                count: users.length()
            }
        };
    }

    // GET /auth/orgs/{orgHandle}/users/{userId} - Get single user details
    @http:ResourceConfig {
        auth: [
            {
                jwtValidatorConfig: {
                    issuer: frontendJwtIssuer,
                    audience: frontendJwtAudience,
                    signatureConfig: {
                        secret: resolvedFrontendJwtHMACSecret
                    }
                }
            }
        ]
    }
    resource function get orgs/[string orgHandle]/users/[string userId](http:Request req)
            returns http:Ok|http:NotFound|http:Forbidden|http:Unauthorized|http:InternalServerError|error {

        log:printInfo("Fetching user details", orgHandle = orgHandle, userId = userId);

        // Permission check: user can only fetch their own details
        types:UserContextV2|error userContext = extractUserContextFromRequest(req);
        if userContext is error {
            return utils:createUnauthorizedError("Invalid or missing authentication token");
        }

        // Verify the requesting user is fetching their own details
        if userContext.userId != userId {
            log:printWarn("User attempted to fetch another user's details", requestingUserId = userContext.userId, targetUserId = userId);
            return <http:Forbidden>{
                body: {
                    message: "You can only view your own user details"
                }
            };
        }

        // Get user details with group memberships
        json|error userDetails = storage:getUserWithGroupsById(userId);
        if userDetails is error {
            log:printWarn("User not found", userId = userId, 'error = userDetails);
            return <http:NotFound>{
                body: {
                    message: string `User not found: ${userId}`
                }
            };
        }

        log:printInfo("Successfully fetched user details", userId = userId);

        return <http:Ok>{
            body: userDetails
        };
    }

    // POST /auth/orgs/{orgHandle}/users - Create a new user
    @http:ResourceConfig {
        auth: [
            {
                jwtValidatorConfig: {
                    issuer: frontendJwtIssuer,
                    audience: frontendJwtAudience,
                    signatureConfig: {
                        secret: resolvedFrontendJwtHMACSecret
                    }
                }
            }
        ]
    }
    resource function post orgs/[string orgHandle]/users(@http:Payload json payload, http:Request req)
            returns http:Created|http:BadRequest|http:Forbidden|http:Unauthorized|http:InternalServerError|error {

        log:printInfo("Creating new user", orgHandle = orgHandle);

        // Permission check: org-level user management
        types:UserContextV2|error userContext = extractUserContextFromRequest(req);
        if userContext is error {
            return utils:createUnauthorizedError("Invalid or missing authentication token");
        }
        types:AccessScope orgScope = {orgUuid: storage:DEFAULT_ORG_ID};
        boolean|error hasPermission = auth:hasPermission(userContext.userId, auth:PERMISSION_USER_MANAGE_USERS, orgScope);
        if hasPermission is error {
            log:printError("Error checking permissions", hasPermission, userId = userContext.userId);
            return utils:createInternalServerError("Error checking permissions");
        }
        if !hasPermission {
            return <http:Forbidden>{
                body: {
                    message: "Insufficient permissions to create users"
                }
            };
        }

        // SSO-only deployments (modes 2 and 3) provision users through SSO login.
        if passwordLoginDisabled {
            return <http:Forbidden>{
                body: {
                    message: "User creation is disabled because password login is disabled. Users are provisioned through SSO login."
                }
            };
        }

        // Extract and validate payload
        string username = check payload.username;
        string password = check payload.password;
        string displayName = check payload.displayName;

        // Handle optional groupIds array
        string[] groupIds = [];
        json|error groupIdsField = payload.groupIds;
        if groupIdsField is json[] {
            groupIds = from var id in groupIdsField
                select id.toString();
        }

        // Validate required fields
        if username.trim().length() == 0 {
            return utils:createBadRequestError("Username is required");
        }
        if !re `^[a-zA-Z0-9_.]+$`.isFullMatch(username) {
            return utils:createBadRequestError("Username may only contain letters, digits, underscores, and dots");
        }
        if password.trim().length() == 0 {
            return utils:createBadRequestError("Password is required");
        }
        if displayName.trim().length() == 0 {
            return utils:createBadRequestError("Display name is required");
        }

        // Call auth backend to create user credentials
        json createUserRequest = {
            username: username,
            password: password,
            displayName: displayName
        };

        http:Response|error authResponse = authBackendClient->post("/users", createUserRequest);

        if authResponse is error {
            log:printError("Failed to create user credentials in auth backend", authResponse);
            return utils:createInternalServerError("Failed to create user credentials");
        }

        if authResponse.statusCode == 400 {
            json|error errorBody = authResponse.getJsonPayload();
            if errorBody is json {
                json|error messageField = errorBody.message;
                string message = messageField is string ? messageField : "Username already exists";
                return utils:createBadRequestError(message);
            }
            return utils:createBadRequestError("Username already exists");
        }

        if authResponse.statusCode != 201 {
            log:printError(string `Auth backend returned error status: ${authResponse.statusCode}`);
            return utils:createInternalServerError("Failed to create user credentials");
        }

        // Get the created user ID from auth backend response
        json authResponseBody = check authResponse.getJsonPayload();
        string userId = check authResponseBody.userId;

        // Create user in main database with group assignments
        json|error createdUser = storage:createUserV2(userId, username, displayName, groupIds);
        if createdUser is error {
            log:printError("Failed to create user in main database", createdUser);
            // TODO: Consider cleanup - delete from credentials DB if main DB creation fails
            // Cleanup: delete from credentials DB because main DB creation failed
            log:printInfo(string `Attempting to cleanup user from credentials DB after main DB failure`, userId = userId);
            http:Response|error deleteResponse = authBackendClient->delete(string `/users/${userId}`);
            if deleteResponse is error {
                log:printError("Failed to cleanup user from credentials DB after main DB failure", deleteResponse, userId = userId);
            } else if deleteResponse.statusCode != 204 && deleteResponse.statusCode != 200 {
                log:printError(string `Credentials DB cleanup returned unexpected status code: ${deleteResponse.statusCode}`, userId = userId);
            } else {
                log:printInfo(string `Successfully cleaned up user from credentials DB`, userId = userId);
            }

            return utils:createInternalServerError(string `Failed to create user: ${createdUser.message()}`);
        }

        log:printInfo(string `Successfully created user: ${username}`);
        storage:logAuditEvent(storage:AUDIT_USER_CREATE, userId = userContext.userId,
                resourceType = storage:AUDIT_RESOURCE_USER, resourceId = userId,
                details = string `User '${username}' created by '${userContext.username}'`,
                clientIp = extractClientIp(req));

        return <http:Created>{
            body: createdUser
        };
    }

    // DELETE /auth/orgs/{orgHandle}/users/{userId} - Delete a user
    @http:ResourceConfig {
        auth: [
            {
                jwtValidatorConfig: {
                    issuer: frontendJwtIssuer,
                    audience: frontendJwtAudience,
                    signatureConfig: {
                        secret: resolvedFrontendJwtHMACSecret
                    }
                }
            }
        ]
    }
    resource function delete orgs/[string orgHandle]/users/[string userId](http:Request req)
            returns http:NoContent|http:Unauthorized|http:Forbidden|http:NotFound|http:InternalServerError|error {

        log:printInfo("Deleting user", orgHandle = orgHandle, userId = userId);

        // Extract user context for permission checks
        types:UserContextV2|error userContext = extractUserContextFromRequest(req);
        if userContext is error {
            return utils:createUnauthorizedError("Invalid or missing authentication token");
        }

        // Permission check: org-level user management
        types:AccessScope orgScope = {orgUuid: storage:DEFAULT_ORG_ID};
        boolean|error hasPermission = auth:hasPermission(userContext.userId, auth:PERMISSION_USER_MANAGE_USERS, orgScope);
        if hasPermission is error {
            log:printError("Error checking permissions", hasPermission, userId = userContext.userId);
            return utils:createInternalServerError("Error checking permissions");
        }
        if !hasPermission {
            return <http:Forbidden>{
                body: {
                    message: "Insufficient permissions to delete users"
                }
            };
        }

        // Delete user with safety checks (cannot delete self or system admin)
        error? deleteResult = storage:deleteUserV2(userId, userContext.userId);
        if deleteResult is error {
            string errorMsg = deleteResult.message();
            if errorMsg.includes("system administrator") {
                log:printWarn(string `Attempted to delete system administrator`, userId = userId);
                return utils:createForbiddenError("Cannot delete system administrator");
            }
            if errorMsg.includes("own user account") {
                log:printWarn(string `User attempted to delete own account`, userId = userId);
                return utils:createForbiddenError("Cannot delete your own user account");
            }
            if errorMsg.includes("not found") {
                log:printWarn(string `User not found for deletion`, userId = userId);
                return <http:NotFound>{
                    body: {
                        message: string `User not found: ${userId}`
                    }
                };
            }
            log:printError("Failed to delete user", deleteResult);
            return utils:createInternalServerError(string `Failed to delete user: ${errorMsg}`);
        }

        log:printInfo(string `Successfully deleted user ${userId}`);
        storage:logAuditEvent(storage:AUDIT_USER_DELETE, userId = userContext.userId,
                resourceType = storage:AUDIT_RESOURCE_USER, resourceId = userId,
                details = string `User '${userId}' deleted by '${userContext.username}'`,
                clientIp = extractClientIp(req));

        return <http:NoContent>{};
    }

    // POST /auth/orgs/{orgHandle}/users/{userId}/reset-password - Admin password reset
    @http:ResourceConfig {
        auth: [
            {
                jwtValidatorConfig: {
                    issuer: frontendJwtIssuer,
                    audience: frontendJwtAudience,
                    signatureConfig: {
                        secret: resolvedFrontendJwtHMACSecret
                    }
                }
            }
        ]
    }
    isolated resource function post orgs/[string orgHandle]/users/[string userId]/'reset\-password(http:Request req) returns http:Ok|http:BadRequest|http:Unauthorized|http:Forbidden|http:InternalServerError|error {
        log:printInfo("Admin password reset requested", orgHandle = orgHandle, targetUserId = userId);

        // Permission check: org-level user management
        types:UserContextV2|error userContext = extractUserContextFromRequest(req);
        if userContext is error {
            return utils:createUnauthorizedError("Invalid or missing authentication token");
        }
        types:AccessScope orgScope = {orgUuid: storage:DEFAULT_ORG_ID};
        boolean|error hasPermission = auth:hasPermission(userContext.userId, auth:PERMISSION_USER_MANAGE_USERS, orgScope);
        if hasPermission is error {
            log:printError("Error checking permissions", hasPermission, userId = userContext.userId);
            return utils:createInternalServerError("Error checking permissions");
        }
        if !hasPermission {
            return <http:Forbidden>{
                body: {
                    message: "Insufficient permissions to reset user passwords"
                }
            };
        }

        // Proxy to auth backend
        json resetPayload = {
            userId: userId
        };

        http:Response|error authResponse = authBackendClient->post("/reset-password", resetPayload);

        if authResponse is error {
            log:printError("Error calling auth backend for password reset", authResponse);
            return utils:createInternalServerError("Password reset service unavailable");
        }

        if authResponse.statusCode == http:STATUS_BAD_REQUEST {
            json|error errorBody = authResponse.getJsonPayload();
            if errorBody is json {
                json|error messageField = errorBody.message;
                string message = messageField is string ? messageField : "Invalid request";
                return utils:createBadRequestError(message);
            }
            return utils:createBadRequestError("Invalid request");
        }

        if authResponse.statusCode != http:STATUS_OK {
            log:printError("Unexpected status from auth backend for password reset", statusCode = authResponse.statusCode);
            return utils:createInternalServerError("Password reset failed");
        }

        // Set require_password_change flag in main DB
        error? flagResult = storage:setRequirePasswordChange(userId, true);
        if flagResult is error {
            log:printError("Error setting require_password_change flag", flagResult, userId = userId);
            return utils:createInternalServerError("Password reset succeeded but failed to set password change flag");
        }

        // Revoke all existing refresh tokens so the user must re-authenticate
        error? revokeResult = storage:revokeAllUserRefreshTokens(userId);
        if revokeResult is error {
            log:printWarn("Failed to revoke refresh tokens after password reset", userId = userId);
        }

        // Return the generated password to the admin
        json|error responseBody = authResponse.getJsonPayload();
        if responseBody is error {
            log:printError("Error reading auth backend response", responseBody);
            return utils:createInternalServerError("Password reset succeeded but failed to read response");
        }

        log:printInfo("Password reset successfully by admin", targetUserId = userId, adminUserId = userContext.userId);
        storage:logAuditEvent(storage:AUDIT_PASSWORD_RESET, userId = userContext.userId,
                resourceType = storage:AUDIT_RESOURCE_USER, resourceId = userId,
                details = string `Password reset for user '${userId}' by admin '${userContext.username}'`,
                clientIp = extractClientIp(req));
        return <http:Ok>{
            headers: {
                "Cache-Control": "no-store, no-cache, must-revalidate",
                "Pragma": "no-cache"
            },
            body: responseBody
        };
    }

    // POST /auth/orgs/{orgHandle}/users/{userId}/revoke-tokens - Revoke all user sessions
    @http:ResourceConfig {
        auth: [
            {
                jwtValidatorConfig: {
                    issuer: frontendJwtIssuer,
                    audience: frontendJwtAudience,
                    signatureConfig: {
                        secret: resolvedFrontendJwtHMACSecret
                    }
                }
            }
        ]
    }
    isolated resource function post orgs/[string orgHandle]/users/[string userId]/'revoke\-tokens(http:Request req) returns http:Ok|http:Unauthorized|http:Forbidden|http:InternalServerError|error {
        log:printInfo("Revoke tokens requested", orgHandle = orgHandle, targetUserId = userId);

        // Permission check: org-level user management
        types:UserContextV2|error userContext = extractUserContextFromRequest(req);
        if userContext is error {
            return utils:createUnauthorizedError("Invalid or missing authentication token");
        }
        types:AccessScope orgScope = {orgUuid: storage:DEFAULT_ORG_ID};
        boolean|error hasPermission = auth:hasPermission(userContext.userId, auth:PERMISSION_USER_MANAGE_USERS, orgScope);
        if hasPermission is error {
            log:printError("Error checking permissions", hasPermission, userId = userContext.userId);
            return utils:createInternalServerError("Error checking permissions");
        }
        if !hasPermission {
            return <http:Forbidden>{
                body: {
                    message: "Insufficient permissions to revoke user sessions"
                }
            };
        }

        // Prevent revoking own tokens (admin should use regular logout)
        if userContext.userId == userId {
            return <http:Forbidden>{
                body: {
                    message: "Cannot revoke your own sessions. Use the regular logout instead."
                }
            };
        }

        // Revoke all refresh tokens
        error? revokeResult = storage:revokeAllUserRefreshTokens(userId);
        if revokeResult is error {
            log:printError("Error revoking refresh tokens", revokeResult, userId = userId);
            return utils:createInternalServerError("Failed to revoke user sessions");
        }

        log:printInfo("All sessions revoked successfully", targetUserId = userId, adminUserId = userContext.userId);
        storage:logAuditEvent(storage:AUDIT_USER_SESSIONS_REVOKE, userId = userContext.userId,
                resourceType = storage:AUDIT_RESOURCE_USER, resourceId = userId,
                details = string `All sessions revoked for user '${userId}' by admin '${userContext.username}'`,
                clientIp = extractClientIp(req));
        return <http:Ok>{
            body: {
                message: "All sessions revoked successfully"
            }
        };
    }

    // ============================================================================
    // Role Management Endpoints (RBAC v2)
    // ============================================================================

    // GET /auth/orgs/{orgHandle}/roles - List all roles
    @http:ResourceConfig {
        auth: [
            {
                jwtValidatorConfig: {
                    issuer: frontendJwtIssuer,
                    audience: frontendJwtAudience,
                    signatureConfig: {
                        secret: resolvedFrontendJwtHMACSecret
                    }
                }
            }
        ]
    }
    isolated resource function get orgs/[string orgHandle]/roles(http:Request req, string? projectId = (), string? integrationId = ()) returns http:Ok|http:BadRequest|http:Unauthorized|http:Forbidden|http:InternalServerError|error {
        log:printInfo("Fetching all roles for organization", orgHandle = orgHandle, projectId = projectId ?: "N/A", integrationId = integrationId ?: "N/A");

        // Permission check: user must have any of these permissions at specified scope level
        types:UserContextV2|error userContext = extractUserContextFromRequest(req);
        if userContext is error {
            return utils:createUnauthorizedError("Invalid or missing authentication token");
        }

        // Build scope based on provided parameters
        types:AccessScope scope = {orgUuid: storage:DEFAULT_ORG_ID};
        if projectId is string {
            scope.projectUuid = projectId;
        }
        if integrationId is string {
            scope.integrationUuid = integrationId;
        }

        boolean|error hasPermission = auth:hasAnyPermission(userContext.userId, [auth:PERMISSION_USER_MANAGE_ROLES, auth:PERMISSION_USER_UPDATE_GROUP_ROLES, auth:PERMISSION_PROJECT_EDIT, auth:PERMISSION_PROJECT_MANAGE, auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope);
        if hasPermission is error {
            log:printError("Error checking permissions", hasPermission, userId = userContext.userId);
            return utils:createInternalServerError("Error checking permissions");
        }
        if !hasPermission {
            return <http:Forbidden>{
                body: {
                    message: "Insufficient permissions to list roles"
                }
            };
        }

        // Resolve org handle to org ID
        // TODO: use when multiple tenants are supported
        // int|error orgId = storage:getOrgIdByHandle(orgHandle);
        // if orgId is error {
        //     log:printWarn("Invalid or unknown organization handle", orgHandle = orgHandle, 'error = orgId);
        //     return utils:createBadRequestError("Invalid or unknown organization");
        // }

        // Fetch all roles with counts for the organization
        // TODO: use orgId when multiple tenants are supported
        types:RoleResponse[]|error rolesWithCounts = storage:getRolesWithCountsByOrgId(storage:DEFAULT_ORG_ID);
        if rolesWithCounts is error {
            log:printError("Error fetching roles", rolesWithCounts, orgHandle = orgHandle);
            return utils:createInternalServerError("Failed to fetch roles");
        }

        log:printInfo(string `Successfully fetched ${rolesWithCounts.length()} roles`, orgHandle = orgHandle);
        return <http:Ok>{
            body: rolesWithCounts
        };
    }

    // POST /auth/orgs/{orgHandle}/roles - Create a new role
    @http:ResourceConfig {
        auth: [
            {
                jwtValidatorConfig: {
                    issuer: frontendJwtIssuer,
                    audience: frontendJwtAudience,
                    signatureConfig: {
                        secret: resolvedFrontendJwtHMACSecret
                    }
                }
            }
        ]
    }
    isolated resource function post orgs/[string orgHandle]/roles(@http:Payload types:RoleV2Input roleInput, http:Request req) returns http:Created|http:BadRequest|http:Unauthorized|http:Forbidden|http:InternalServerError|error {
        log:printInfo("Creating new role", orgHandle = orgHandle, roleName = roleInput.roleName);

        // Permission check: org-level role management
        types:UserContextV2|error userContext = extractUserContextFromRequest(req);
        if userContext is error {
            return utils:createUnauthorizedError("Invalid or missing authentication token");
        }
        types:AccessScope orgScope = {orgUuid: storage:DEFAULT_ORG_ID};
        boolean|error hasPermission = auth:hasPermission(userContext.userId, auth:PERMISSION_USER_MANAGE_ROLES, orgScope);
        if hasPermission is error {
            log:printError("Error checking permissions", hasPermission, userId = userContext.userId);
            return utils:createInternalServerError("Error checking permissions");
        }
        if !hasPermission {
            return <http:Forbidden>{
                body: {
                    message: "Insufficient permissions to create roles"
                }
            };
        }

        // Validate roleName is not blank
        if roleInput.roleName.trim().length() == 0 {
            return utils:createBadRequestError("roleName must not be empty or whitespace");
        }

        // Resolve org handle to org ID
        // TODO: use when multiple tenants are supported
        // int|error orgId = storage:getOrgIdByHandle(orgHandle);
        // if orgId is error {
        //     log:printWarn("Invalid or unknown organization handle", orgHandle = orgHandle, 'error = orgId);
        //     return utils:createBadRequestError("Invalid or unknown organization");
        // }

        // Set org ID in the input (default to 1 for now)
        types:RoleV2Input inputWithOrg = {
            roleName: roleInput.roleName,
            description: roleInput.description,
            orgId: storage:DEFAULT_ORG_ID
        };

        // Create the role
        string|error roleId = storage:createRoleV2(inputWithOrg);
        if roleId is error {
            log:printError("Error creating role", roleId, roleName = roleInput.roleName);
            return utils:createInternalServerError("Failed to create role");
        }

        // Assign permissions if provided
        if roleInput.permissionIds is string[] {
            string[] permissionIds = <string[]>roleInput.permissionIds;
            if permissionIds.length() > 0 {
                error? assignResult = storage:assignPermissionsToRole(roleId, permissionIds);
                if assignResult is error {
                    log:printError("Error assigning permissions to role", assignResult, roleId = roleId);
                    return utils:createInternalServerError("Role created but failed to assign permissions");
                }
                log:printInfo("Successfully assigned permissions to role", roleId = roleId, count = permissionIds.length());
            }
        }

        // Fetch the created role
        types:RoleV2|error createdRole = storage:getRoleV2ById(roleId);
        if createdRole is error {
            log:printError("Error fetching created role", createdRole, roleId = roleId);
            return utils:createInternalServerError("Role created but failed to fetch details");
        }

        log:printInfo("Successfully created role", roleId = roleId, roleName = roleInput.roleName);
        storage:logAuditEvent(storage:AUDIT_ROLE_CREATE, userId = userContext.userId,
                resourceType = storage:AUDIT_RESOURCE_ROLE, resourceId = roleId,
                details = string `Role '${roleInput.roleName}' created by user '${userContext.username}'`,
                clientIp = extractClientIp(req));
        return <http:Created>{
            body: createdRole
        };
    }

    // GET /auth/orgs/{orgHandle}/roles/{roleId} - Get role details with permissions
    @http:ResourceConfig {
        auth: [
            {
                jwtValidatorConfig: {
                    issuer: frontendJwtIssuer,
                    audience: frontendJwtAudience,
                    signatureConfig: {
                        secret: resolvedFrontendJwtHMACSecret
                    }
                }
            }
        ]
    }
    isolated resource function get orgs/[string orgHandle]/roles/[string roleId](http:Request req, string? projectId = (), string? integrationId = ()) returns http:Ok|http:NotFound|http:Unauthorized|http:Forbidden|http:InternalServerError|error {
        log:printInfo("Fetching role details", orgHandle = orgHandle, roleId = roleId, projectId = projectId ?: "N/A", integrationId = integrationId ?: "N/A");

        // Permission check: user must have any of these permissions at specified scope level
        types:UserContextV2|error userContext = extractUserContextFromRequest(req);
        if userContext is error {
            return utils:createUnauthorizedError("Invalid or missing authentication token");
        }

        // Build scope based on provided parameters
        types:AccessScope scope = {orgUuid: storage:DEFAULT_ORG_ID};
        if projectId is string {
            scope.projectUuid = projectId;
        }
        if integrationId is string {
            scope.integrationUuid = integrationId;
        }

        boolean|error hasPermission = auth:hasAnyPermission(userContext.userId, [auth:PERMISSION_USER_MANAGE_ROLES, auth:PERMISSION_USER_UPDATE_GROUP_ROLES, auth:PERMISSION_PROJECT_EDIT, auth:PERMISSION_PROJECT_MANAGE, auth:PERMISSION_INTEGRATION_EDIT, auth:PERMISSION_INTEGRATION_MANAGE], scope);
        if hasPermission is error {
            log:printError("Error checking permissions", hasPermission, userId = userContext.userId);
            return utils:createInternalServerError("Error checking permissions");
        }
        if !hasPermission {
            return <http:Forbidden>{
                body: {
                    message: "Insufficient permissions to view role details"
                }
            };
        }

        // Fetch role by ID
        types:RoleV2|error role = storage:getRoleV2ById(roleId);
        if role is error {
            log:printWarn("Role not found", roleId = roleId, 'error = role);
            return <http:NotFound>{
                body: {
                    message: "Role not found"
                }
            };
        }

        // Fetch role permissions
        types:Permission[]|error permissions = storage:getRolePermissions(roleId);
        if permissions is error {
            log:printError("Error fetching role permissions", permissions, roleId = roleId);
            return utils:createInternalServerError("Failed to fetch role permissions");
        }

        // Build response with role and permissions
        types:RoleV2WithPermissions roleWithPermissions = {
            roleId: role.roleId,
            roleName: role.roleName,
            orgId: role.orgId,
            description: role.description,
            createdAt: role.createdAt,
            updatedAt: role.updatedAt,
            permissions: permissions
        };

        log:printInfo("Successfully fetched role details", roleId = roleId);
        return <http:Ok>{
            body: roleWithPermissions
        };
    }

    // PUT /auth/orgs/{orgHandle}/roles/{roleId} - Update role
    @http:ResourceConfig {
        auth: [
            {
                jwtValidatorConfig: {
                    issuer: frontendJwtIssuer,
                    audience: frontendJwtAudience,
                    signatureConfig: {
                        secret: resolvedFrontendJwtHMACSecret
                    }
                }
            }
        ]
    }
    isolated resource function put orgs/[string orgHandle]/roles/[string roleId](@http:Payload types:RoleV2Input roleInput, http:Request req) returns http:Ok|http:BadRequest|http:NotFound|http:Unauthorized|http:Forbidden|http:InternalServerError|error {
        log:printInfo("Updating role", orgHandle = orgHandle, roleId = roleId);

        // Permission check: org-level role management
        types:UserContextV2|error userContext = extractUserContextFromRequest(req);
        if userContext is error {
            return utils:createUnauthorizedError("Invalid or missing authentication token");
        }
        types:AccessScope orgScope = {orgUuid: storage:DEFAULT_ORG_ID};
        boolean|error hasPermission = auth:hasPermission(userContext.userId, auth:PERMISSION_USER_MANAGE_ROLES, orgScope);
        if hasPermission is error {
            log:printError("Error checking permissions", hasPermission, userId = userContext.userId);
            return utils:createInternalServerError("Error checking permissions");
        }
        if !hasPermission {
            return <http:Forbidden>{
                body: {
                    message: "Insufficient permissions to update roles"
                }
            };
        }

        // Validate roleName is not blank
        if roleInput.roleName.trim().length() == 0 {
            return utils:createBadRequestError("roleName must not be empty or whitespace");
        }

        // Update the role (name, description)
        error? updateResult = storage:updateRoleV2(roleId, roleInput);
        if updateResult is error {
            log:printError("Error updating role", updateResult, roleId = roleId);
            if updateResult.message().includes("not found") {
                return <http:NotFound>{
                    body: {
                        message: "Role not found"
                    }
                };
            }
            return utils:createInternalServerError("Failed to update role");
        }

        // Update permissions if provided
        if roleInput.permissionIds is string[] {
            string[] newPermissionIds = <string[]>roleInput.permissionIds;
            log:printInfo("Updating role permissions", roleId = roleId, permissionCount = newPermissionIds.length());

            // Get current permissions
            types:Permission[]|error currentPermissions = storage:getRolePermissions(roleId);
            if currentPermissions is error {
                log:printError("Error fetching current permissions", currentPermissions, roleId = roleId);
                return utils:createInternalServerError("Failed to fetch current permissions");
            }

            // Calculate permissions to add and remove
            string[] currentPermissionIds = from var p in currentPermissions
                select p.permissionId;

            // Permissions to add: in new but not in current
            string[] toAdd = from var permId in newPermissionIds
                where !currentPermissionIds.some(id => id == permId)
                select permId;

            // Permissions to remove: in current but not in new
            string[] toRemove = from var permId in currentPermissionIds
                where !newPermissionIds.some(id => id == permId)
                select permId;

            // Remove permissions
            if toRemove.length() > 0 {
                error? removeResult = storage:removePermissionsFromRole(roleId, toRemove);
                if removeResult is error {
                    log:printError("Error removing permissions from role", removeResult, roleId = roleId);
                    return utils:createInternalServerError("Failed to remove permissions from role");
                }
                log:printInfo("Removed permissions from role", roleId = roleId, count = toRemove.length());
            }

            // Add permissions
            if toAdd.length() > 0 {
                error? addResult = storage:assignPermissionsToRole(roleId, toAdd);
                if addResult is error {
                    log:printError("Error adding permissions to role", addResult, roleId = roleId);
                    return utils:createInternalServerError("Failed to add permissions to role");
                }
                log:printInfo("Added permissions to role", roleId = roleId, count = toAdd.length());
            }

            log:printInfo("Successfully updated role permissions", roleId = roleId, added = toAdd.length(), removed = toRemove.length());
        }

        // Fetch the updated role
        types:RoleV2|error updatedRole = storage:getRoleV2ById(roleId);
        if updatedRole is error {
            log:printError("Error fetching updated role", updatedRole, roleId = roleId);
            return utils:createInternalServerError("Role updated but failed to fetch details");
        }

        log:printInfo("Successfully updated role", roleId = roleId);
        storage:logAuditEvent(storage:AUDIT_ROLE_UPDATE, userId = userContext.userId,
                resourceType = storage:AUDIT_RESOURCE_ROLE, resourceId = roleId,
                details = string `Role '${roleInput.roleName}' updated by user '${userContext.username}'`,
                clientIp = extractClientIp(req));
        return <http:Ok>{
            body: updatedRole
        };
    }

    // DELETE /auth/orgs/{orgHandle}/roles/{roleId} - Delete role
    @http:ResourceConfig {
        auth: [
            {
                jwtValidatorConfig: {
                    issuer: frontendJwtIssuer,
                    audience: frontendJwtAudience,
                    signatureConfig: {
                        secret: resolvedFrontendJwtHMACSecret
                    }
                }
            }
        ]
    }
    isolated resource function delete orgs/[string orgHandle]/roles/[string roleId](http:Request req) returns http:Ok|http:NotFound|http:Unauthorized|http:Forbidden|http:Conflict|http:InternalServerError|error {
        log:printInfo("Deleting role", orgHandle = orgHandle, roleId = roleId);

        // Permission check: org-level role management
        types:UserContextV2|error userContext = extractUserContextFromRequest(req);
        if userContext is error {
            return utils:createUnauthorizedError("Invalid or missing authentication token");
        }
        types:AccessScope orgScope = {orgUuid: storage:DEFAULT_ORG_ID};
        boolean|error hasPermission = auth:hasPermission(userContext.userId, auth:PERMISSION_USER_MANAGE_ROLES, orgScope);
        if hasPermission is error {
            log:printError("Error checking permissions", hasPermission, userId = userContext.userId);
            return utils:createInternalServerError("Error checking permissions");
        }
        if !hasPermission {
            return <http:Forbidden>{
                body: {
                    message: "Insufficient permissions to delete roles"
                }
            };
        }

        // Guard: prevent deletion of roles that are still mapped to groups
        int|error groupMappingCount = storage:getRoleMappedGroupCount(roleId);
        if groupMappingCount is error {
            log:printError("Error checking group mappings for role", groupMappingCount, roleId = roleId);
            return utils:createInternalServerError("Error checking role group assignments");
        }
        if groupMappingCount > 0 {
            log:printWarn("Attempted to delete role with active group mappings", roleId = roleId, groupCount = groupMappingCount);
            return <http:Conflict>{
                body: {
                    message: string `Role is assigned to ${groupMappingCount} group(s) and cannot be deleted. Remove the role from all groups first.`
                }
            };
        }

        // Delete the role
        error? deleteResult = storage:deleteRoleV2(roleId);
        if deleteResult is error {
            log:printError("Error deleting role", deleteResult, roleId = roleId);
            if deleteResult.message().includes("not found") {
                return <http:NotFound>{
                    body: {
                        message: "Role not found"
                    }
                };
            }
            return utils:createInternalServerError("Failed to delete role");
        }

        log:printInfo("Successfully deleted role", roleId = roleId);
        storage:logAuditEvent(storage:AUDIT_ROLE_DELETE, userId = userContext.userId,
                resourceType = storage:AUDIT_RESOURCE_ROLE, resourceId = roleId,
                details = string `Role '${roleId}' deleted by user '${userContext.username}'`,
                clientIp = extractClientIp(req));
        return <http:Ok>{
            body: {
                message: "Role deleted successfully",
                roleId: roleId
            }
        };
    }

    // GET /auth/orgs/{orgHandle}/roles/{roleId}/groups - List groups that have this role
    @http:ResourceConfig {
        auth: [
            {
                jwtValidatorConfig: {
                    issuer: frontendJwtIssuer,
                    audience: frontendJwtAudience,
                    signatureConfig: {
                        secret: resolvedFrontendJwtHMACSecret
                    }
                }
            }
        ]
    }
    isolated resource function get orgs/[string orgHandle]/roles/[string roleId]/groups(http:Request req, string? projectId = (), string? integrationId = ()) returns http:Ok|http:NotFound|http:Unauthorized|http:Forbidden|http:InternalServerError|error {
        log:printInfo("Fetching group assignments for role", orgHandle = orgHandle, roleId = roleId, projectId = projectId ?: "N/A", integrationId = integrationId ?: "N/A");

        // Permission check at specified scope level
        types:UserContextV2|error userContext = extractUserContextFromRequest(req);
        if userContext is error {
            return utils:createUnauthorizedError("Invalid or missing authentication token");
        }

        // Build scope based on provided parameters
        types:AccessScope scope = {orgUuid: storage:DEFAULT_ORG_ID};
        if projectId is string {
            scope.projectUuid = projectId;
        }
        if integrationId is string {
            scope.integrationUuid = integrationId;
        }

        boolean|error hasPermission = auth:hasAnyPermission(
                userContext.userId,
                [
                    auth:PERMISSION_USER_MANAGE_ROLES,
                    auth:PERMISSION_USER_MANAGE_GROUPS,
                    auth:PERMISSION_USER_UPDATE_GROUP_ROLES,
                    auth:PERMISSION_PROJECT_EDIT,
                    auth:PERMISSION_PROJECT_MANAGE,
                    auth:PERMISSION_INTEGRATION_EDIT,
                    auth:PERMISSION_INTEGRATION_MANAGE
                ],
                scope
        );
        if hasPermission is error {
            log:printError("Error checking permissions", hasPermission, userId = userContext.userId);
            return utils:createInternalServerError("Error checking permissions");
        }
        if !hasPermission {
            return <http:Forbidden>{
                body: {
                    message: "Insufficient permissions to view role group assignments"
                }
            };
        }

        // Verify role exists
        types:RoleV2|error existingRole = storage:getRoleV2ById(roleId);
        if existingRole is error {
            log:printWarn("Role not found", roleId = roleId, 'error = existingRole);
            return <http:NotFound>{
                body: {
                    message: string `Role not found: ${roleId}`
                }
            };
        }

        // Get all group mappings for this role
        types:GroupRoleMapping[]|error mappings = storage:getRoleMappings(roleId);
        if mappings is error {
            log:printError(string `Failed to fetch group mappings for role ${roleId}`, mappings);
            return utils:createInternalServerError(string `Failed to fetch group assignments: ${mappings.message()}`);
        }

        // Enrich mappings with group details
        json[] enrichedMappings = [];
        foreach types:GroupRoleMapping mapping in mappings {
            // Get group details
            types:Group|error group = storage:getGroupById(mapping.groupId);
            if group is error {
                log:printWarn(string `Group not found for mapping ${mapping.id}`, groupId = mapping.groupId);
                // Skip this mapping if group doesn't exist (orphaned mapping)
                continue;
            }

            // Build enriched mapping with group name
            json enrichedMapping = {
                id: mapping.id,
                groupId: mapping.groupId,
                groupName: group.groupName,
                groupDescription: group.description,
                roleId: mapping.roleId,
                // Scope information
                orgUuid: mapping.orgUuid,
                projectUuid: mapping.projectUuid,
                envUuid: mapping.envUuid,
                integrationUuid: mapping.integrationUuid,
                createdAt: mapping.createdAt
            };

            enrichedMappings.push(enrichedMapping);
        }

        log:printInfo(string `Found ${enrichedMappings.length()} group assignments for role ${roleId}`);

        return <http:Ok>{
            body: {
                roleId: roleId,
                roleName: existingRole.roleName,
                mappings: enrichedMappings,
                count: enrichedMappings.length()
            }
        };
    }

    // ============================================================================
    // Permission Endpoints (RBAC v2)
    // ============================================================================

    // GET /auth/permissions - List all available permissions
    @http:ResourceConfig {
        auth: [
            {
                jwtValidatorConfig: {
                    issuer: frontendJwtIssuer,
                    audience: frontendJwtAudience,
                    signatureConfig: {
                        secret: resolvedFrontendJwtHMACSecret
                    }
                }
                // No specific scopes required - all authenticated users can see available permissions
            }
        ]
    }
    isolated resource function get permissions() returns http:Ok|http:Unauthorized|http:InternalServerError {
        log:printInfo("Fetching all available permissions");

        // Fetch all permissions
        types:Permission[]|error permissions = storage:getAllPermissions();
        if permissions is error {
            log:printError("Error fetching permissions", permissions);
            return utils:createInternalServerError("Failed to fetch permissions");
        }

        // Group permissions by domain for easier consumption
        map<types:Permission[]> groupedPermissions = {};
        foreach types:Permission permission in permissions {
            string domain = permission.permissionDomain.toString();
            if !groupedPermissions.hasKey(domain) {
                groupedPermissions[domain] = [];
            }
            types:Permission[]? domainPerms = groupedPermissions[domain];
            if domainPerms is types:Permission[] {
                domainPerms.push(permission);
            }
        }

        log:printInfo(string `Successfully fetched ${permissions.length()} permissions across ${groupedPermissions.length()} domains`);
        return <http:Ok>{
            body: {
                permissions: permissions,
                groupedByDomain: groupedPermissions
            }
        };
    }

    // GET /auth/orgs/{orgHandle}/users/{userId}/permissions - Get user's effective permissions
    @http:ResourceConfig {
        auth: [
            {
                jwtValidatorConfig: {
                    issuer: frontendJwtIssuer,
                    audience: frontendJwtAudience,
                    signatureConfig: {
                        secret: resolvedFrontendJwtHMACSecret
                    }
                }
            }
        ]
    }
    isolated resource function get orgs/[string orgHandle]/users/[string userId]/permissions(
            http:Request req,
            string? projectId = (),
            string? integrationId = (),
            string? environmentId = ()
    ) returns http:Ok|http:BadRequest|http:Unauthorized|http:Forbidden|http:InternalServerError|error {
        log:printDebug("Fetching effective permissions for user",
                orgHandle = orgHandle,
                userId = userId,
                projectId = projectId,
                integrationId = integrationId,
                environmentId = environmentId
        );

        // Extract user context from token to verify access
        types:UserContextV2|error userContext = extractUserContextFromRequest(req);
        if userContext is error {
            log:printError("Failed to extract user context", userContext);
            return utils:createUnauthorizedError("Invalid or missing authentication token");
        }

        // Check if user is fetching their own permissions or has admin privileges
        boolean isSelfAccess = userContext.userId == userId;
        if !isSelfAccess {
            types:AccessScope orgScope = {orgUuid: storage:DEFAULT_ORG_ID};
            boolean|error hasAdminAccess = auth:hasPermission(userContext.userId, auth:PERMISSION_USER_MANAGE_USERS, orgScope);
            if hasAdminAccess is error {
                log:printError("Error checking permissions", hasAdminAccess, userId = userContext.userId);
                return utils:createInternalServerError("Error checking permissions");
            }
            if !hasAdminAccess {
                log:printWarn("User attempted to fetch permissions for another user without admin privileges",
                        requestingUserId = userContext.userId,
                        targetUserId = userId
                );
                return <http:Forbidden>{
                    body: {
                        message: "You can only view your own permissions unless you have user management privileges"
                    }
                };
            }
        }

        // Resolve org handle to org ID
        // TODO: use when multiple tenants are supported
        // int|error orgId = storage:getOrgIdByHandle(orgHandle);
        // if orgId is error {
        //     log:printWarn("Invalid or unknown organization handle", orgHandle = orgHandle, 'error = orgId);
        //     return utils:createBadRequestError("Invalid or unknown organization");
        // }

        // Build access scope from query parameters
        types:AccessScope scope = {
            orgUuid: storage:DEFAULT_ORG_ID,
            projectUuid: projectId,
            integrationUuid: integrationId,
            envUuid: environmentId
        };

        // Get user's effective permissions for the given scope
        types:Permission[]|error permissions = storage:getUserEffectivePermissions(userId, scope);
        if permissions is error {
            log:printError("Error fetching user permissions", permissions, userId = userId);
            return utils:createInternalServerError("Failed to fetch user permissions");
        }

        // Extract permission names for easier use
        string[] permissionNames = from types:Permission p in permissions
            select p.permissionName;

        log:printDebug(string `Successfully fetched ${permissions.length()} effective permissions for user`, userId = userId);
        return <http:Ok>{
            body: {
                userId: userId,
                scope: scope,
                permissions: permissions,
                permissionNames: permissionNames
            }
        };
    }

    @http:ResourceConfig {
        auth: [
            {
                jwtValidatorConfig: {
                    issuer: frontendJwtIssuer,
                    audience: frontendJwtAudience,
                    signatureConfig: {
                        secret: resolvedFrontendJwtHMACSecret
                    }
                }
            }
        ]
    }
    isolated resource function post orgs/[string orgHandle]/users/[string userId]/unlock\-account(http:Request req) returns http:Ok|http:Unauthorized|http:Forbidden|http:NotFound|http:InternalServerError|error {
        log:printInfo("Admin unlock account requested", orgHandle = orgHandle, targetUserId = userId);

        types:UserContextV2|error userContext = extractUserContextFromRequest(req);
        if userContext is error {
            return utils:createUnauthorizedError("Invalid or missing authentication token");
        }
        types:AccessScope orgScope = {orgUuid: storage:DEFAULT_ORG_ID};
        boolean|error hasPermission = auth:hasPermission(userContext.userId, auth:PERMISSION_USER_MANAGE_USERS, orgScope);
        if hasPermission is error {
            log:printError("Error checking permissions", hasPermission, userId = userContext.userId);
            return utils:createInternalServerError("Error checking permissions");
        }
        if !hasPermission {
            return <http:Forbidden>{body: {message: "Insufficient permissions to unlock accounts"}};
        }

        types:User|error targetUser = storage:getUserDetailsById(userId);
        if targetUser is sql:NoRowsError {
            log:printDebug("Unlock: user not found in main DB", userId = userId);
            return <http:NotFound>{
                body: {
                    message: "User not found"
                }
            };
        }
        if targetUser is error {
            log:printError("Unlock: DB error looking up user", 'error = targetUser, userId = userId);
            return utils:createInternalServerError("Error looking up user");
        }

        http:Response|error authResponse = authBackendClient->post("/unlock-account", {username: targetUser.username});
        if authResponse is error {
            log:printError("Error calling auth backend for account unlock", authResponse);
            return utils:createInternalServerError("Account unlock service unavailable");
        }
        if authResponse.statusCode == http:STATUS_NOT_FOUND {
            log:printError("User not found in auth backend for unlock", statusCode = authResponse.statusCode);
            return <http:NotFound>{
                body: {
                    message: "User not found in auth backend"
                }
            };
        }
        if authResponse.statusCode != http:STATUS_OK {
            log:printError("Unexpected status from auth backend for unlock", statusCode = authResponse.statusCode);
            return utils:createInternalServerError("Account unlock failed");
        }

        log:printInfo("Account unlocked by admin", targetUserId = userId, targetUsername = targetUser.username, adminUserId = userContext.userId);
        return <http:Ok>{body: {message: "Account unlocked"}};
    }
}

isolated function extractUserContextFromRequest(http:Request req) returns types:UserContextV2|error {
    string|http:HeaderNotFoundError authHeader = req.getHeader("Authorization");
    if authHeader is http:HeaderNotFoundError {
        log:printError("Authorization header not found");
        return error("Authorization header not found");
    }

    types:UserContextV2|error userContext = auth:extractUserContextV2(authHeader);
    if userContext is error {
        log:printError("Failed to extract user context", userContext);
        return error("Failed to extract user context");
    }

    return userContext;
}

isolated function validateSSOGroupMappingInput(types:SSOGroupMappingInput input) returns string? {
    string issuer = input.issuer.trim();
    string claimName = input.claimName.trim();
    string claimValue = input.claimValue.trim();
    string groupId = input.groupId.trim();

    if issuer == "" {
        return "Issuer must not be empty";
    }
    if claimName == "" {
        return "Claim name must not be empty";
    }
    if claimValue == "" {
        return "Claim value must not be empty";
    }
    if groupId == "" {
        return "Group ID must not be empty";
    }
    if issuer.length() > 255 {
        return "Issuer must not exceed 255 characters";
    }
    if claimName.length() > 128 {
        return "Claim name must not exceed 128 characters";
    }
    if claimValue.length() > 255 {
        return "Claim value must not exceed 255 characters";
    }
    if groupId.length() > 36 {
        return "Group ID must not exceed 36 characters";
    }

    string? projectUuid = normalizeOptionalId(input?.projectUuid);
    string? integrationUuid = normalizeOptionalId(input?.integrationUuid);
    if projectUuid is string && projectUuid.length() > 36 {
        return "Project ID must not exceed 36 characters";
    }
    if integrationUuid is string && integrationUuid.length() > 36 {
        return "Integration ID must not exceed 36 characters";
    }
    if integrationUuid is string && projectUuid is () {
        return "Integration-scoped mappings require a project ID";
    }

    return ();
}

// Trim an optional ID; blank values are treated as absent (org-level scope).
isolated function normalizeOptionalId(string? value) returns string? {
    if value is () {
        return ();
    }
    string trimmed = value.trim();
    return trimmed == "" ? () : trimmed;
}

// The sso_group_mappings unique constraint ignores scope, so a duplicate may
// have been created at a level the caller's tab does not manage. Name the
// existing mapping's scope in the conflict message to avoid confusion.
# Checks whether the caller may target a group in an SSO mapping.
#
# The mapping's own scope only decides where it is administered; the access it
# hands out comes from the target group's `group_role_mapping` rows, which may be
# scoped more widely. The caller must therefore hold user-management permission at
# every scope those roles apply to, otherwise a narrowly-scoped administrator could
# grant org-wide access (including Super Admins) through a scoped mapping.
#
# + userId - The calling user's ID.
# + groupId - The target ICP group.
# + return - true if the caller may target the group, false otherwise, or an error.
isolated function canManageTargetGroupScopes(string userId, string groupId) returns boolean|error {
    types:GroupRoleMapping[] roleMappings = check storage:getGroupRoleMappings(groupId);

    foreach types:GroupRoleMapping roleMapping in roleMappings {
        types:AccessScope roleScope = {orgUuid: roleMapping.orgUuid ?: storage:DEFAULT_ORG_ID};
        string? roleProject = roleMapping.projectUuid;
        if roleProject is string {
            roleScope.projectUuid = roleProject;
        }
        string? roleIntegration = roleMapping.integrationUuid;
        if roleIntegration is string {
            roleScope.integrationUuid = roleIntegration;
        }

        boolean hasScopedPermission = check auth:hasAnyPermission(userId,
                [auth:PERMISSION_USER_MANAGE_GROUPS, auth:PERMISSION_USER_UPDATE_GROUP_ROLES], roleScope);
        if !hasScopedPermission {
            return false;
        }
    }

    return true;
}

isolated function describeSSOMappingConflict(types:SSOGroupMappingInput input) returns string {
    string baseMessage = "This SSO group mapping already exists";
    types:SSOGroupMappingResponse[]|error mappings =
        storage:getSSOGroupMappingsWithGroupNamesByOrgId(input.orgUuid ?: storage:DEFAULT_ORG_ID);
    if mappings is error {
        return baseMessage;
    }
    foreach types:SSOGroupMappingResponse mapping in mappings {
        if mapping.issuer == input.issuer && mapping.claimName == input.claimName
                && mapping.claimValue == input.claimValue && mapping.groupId == input.groupId {
            string? integrationName = mapping.integrationName;
            string? projectName = mapping.projectName;
            if integrationName is string {
                return string `${baseMessage} for integration '${integrationName}'`;
            }
            if projectName is string {
                return string `${baseMessage} in project '${projectName}'`;
            }
            return string `${baseMessage} at the organization level`;
        }
    }
    return baseMessage;
}

isolated function grantSuperAdminFromSSOClaims(string userId, string username, types:OIDCIdTokenClaims claims,
        types:SSOConfig ssoConfig) returns error? {
    if ssoConfig.adminClaim.trim() == "" || ssoConfig.adminValues.length() == 0 {
        return;
    }

    string[] claimValues = auth:extractClaimValues(claims, ssoConfig.adminClaim);
    if !hasMatchingSSOAdminValue(claimValues, ssoConfig.adminValues) {
        log:printDebug("SSO admin claim did not match configured values", username = username,
                claim = ssoConfig.adminClaim);
        return;
    }

    string|error superAdminsGroupId = storage:getSuperAdminsGroupId();
    if superAdminsGroupId is error {
        return error("Could not resolve Super Admins group", superAdminsGroupId);
    }

    boolean|error alreadyMember = storage:isUserInGroup(userId, superAdminsGroupId);
    if alreadyMember is error {
        return error("Could not check Super Admins group membership", alreadyMember);
    }
    if alreadyMember {
        log:printDebug("SSO user is already in Super Admins group", username = username);
        return;
    }

    error? addResult = storage:addUserToGroup(userId, superAdminsGroupId);
    if addResult is error {
        return error("Could not add SSO user to Super Admins group", addResult);
    }

    log:printInfo("Granted Super Admins group membership from SSO claim", username = username,
            claim = ssoConfig.adminClaim);
}

isolated function syncFederatedGroupsFromSSOClaims(string userId, string username,
        types:OIDCIdTokenClaims claims) returns error? {
    types:SSOGroupMapping[] mappings =
        check storage:getSSOGroupMappingsByIssuer(storage:DEFAULT_ORG_ID, claims.iss);
    types:FederatedGroupMembershipInput[] desiredMemberships =
        auth:resolveFederatedGroupMemberships(claims, mappings);

    check storage:reconcileFederatedGroupUserMappings(
        storage:DEFAULT_ORG_ID,
        claims.iss,
        userId,
        desiredMemberships
    );

    log:printDebug("Synchronized SSO group memberships", username = username,
            issuer = claims.iss, membershipCount = desiredMemberships.length());
}

// Shown to an authenticated user who resolved to no ICP authorization. Kept free
// of configuration detail — it must not reveal which claim or values gate access.
const string LOGIN_NOT_AUTHORIZED_MESSAGE = "Your account is not authorized to access this instance. " +
    "Contact your administrator to have your identity provider groups mapped.";

// Only federated access control makes the IdP the sole source of group membership,
// so it is the only mode where "no mapping" means "no access". SSO-only mode
// deliberately admits zero-permission users so an admin can assign groups by hand.
isolated function isLoginAuthorizationRequired() returns boolean {
    return federatedAccessControlEnabled;
}

// The gate reads the effective permission set rather than group membership, so a
// user in a group carrying no group_role_mapping rows is refused just like a user
// in no group at all — neither can do anything with a token.
isolated function isLoginAuthorized(boolean authorizationRequired, string[] permissions) returns boolean {
    return !authorizationRequired || permissions.length() > 0;
}

isolated function hasMatchingSSOAdminValue(string[] claimValues, string[] configuredAdminValues) returns boolean {
    foreach string claimValue in claimValues {
        foreach string configuredValue in configuredAdminValues {
            if configuredValue.trim() != "" && claimValue == configuredValue.trim() {
                return true;
            }
        }
    }
    return false;
}
