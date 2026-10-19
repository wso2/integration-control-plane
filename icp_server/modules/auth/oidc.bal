import icp_server.types as types;
import icp_server.utils as utils;

import ballerina/data.jsondata;
import ballerina/http;
import ballerina/jwt;
import ballerina/log;
import ballerina/url;

// Build OIDC authorization URL with query parameters
public isolated function buildAuthorizationUrl(types:SSOConfig config, string? state = ()) returns string|error {
    // Use provided state or generate a default one
    string stateParam = state ?: "default";

    // Build query parameters
    map<string> params = {
        "response_type": "code",
        "client_id": config.clientId,
        "redirect_uri": config.redirectUri,
        "scope": string:'join(" ", ...config.scopes),
        "state": stateParam // CSRF protection token
    };

    // URL encode each parameter
    string[] queryParts = [];
    foreach var [key, value] in params.entries() {
        string encodedKey = check url:encode(key, "UTF-8");
        string encodedValue = check url:encode(value, "UTF-8");
        queryParts.push(string `${encodedKey}=${encodedValue}`);
    }

    // Construct full authorization URL
    string queryString = string:'join("&", ...queryParts);
    string authorizationUrl = string `${config.authorizationEndpoint}?${queryString}`;

    return authorizationUrl;
}

// Build OIDC RP-initiated logout URL. The id_token_hint lets the provider skip its
// confirmation page and honour the post_logout_redirect_uri.
public isolated function buildLogoutUrl(types:SSOConfig config, string postLogoutRedirectUri,
        string? idTokenHint = ()) returns string|error {
    map<string> params = {
        "post_logout_redirect_uri": postLogoutRedirectUri,
        "client_id": config.clientId
    };
    if idTokenHint is string && idTokenHint.trim().length() > 0 {
        params["id_token_hint"] = idTokenHint;
    }

    string[] queryParts = [];
    foreach var [key, value] in params.entries() {
        string encodedKey = check url:encode(key, "UTF-8");
        string encodedValue = check url:encode(value, "UTF-8");
        queryParts.push(string `${encodedKey}=${encodedValue}`);
    }

    string queryString = string:'join("&", ...queryParts);
    return string `${config.logoutEndpoint}?${queryString}`;
}

public isolated function exchangeCodeForTokens(string code, types:SSOConfig config)
    returns types:OIDCTokenResponse|http:Unauthorized|http:InternalServerError {

    log:printInfo("Exchanging authorization code with OIDC provider", tokenEndpoint = config.tokenEndpoint);

    // Create HTTP client for the token endpoint
    http:Client|error oidcClient = config.allowInsecureTLS
        ? new (config.tokenEndpoint, {secureSocket: {enable: false}})
        : new (config.tokenEndpoint);
    if oidcClient is error {
        log:printError("Failed to create OIDC client", oidcClient);
        return utils:createInternalServerError("Failed to connect to OIDC provider");
    }

    // Prepare token request body (application/x-www-form-urlencoded)
    string tokenRequestBody = string `grant_type=authorization_code&code=${code}&redirect_uri=${config.redirectUri}`;

    // Prepare Basic Auth header (clientId:clientSecret)
    string credentials = string `${config.clientId}:${config.clientSecret}`;
    string encodedCredentials = credentials.toBytes().toBase64();

    // Make token exchange request
    http:Response|error tokenHttpResponse = oidcClient->post("", tokenRequestBody, {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": string `Basic ${encodedCredentials}`
    });

    if tokenHttpResponse is error {
        log:printError("Error calling OIDC token endpoint", tokenHttpResponse);
        return utils:createInternalServerError("Failed to communicate with OIDC provider");
    }

    // Check status code
    int statusCode = tokenHttpResponse.statusCode;

    if statusCode == http:STATUS_BAD_REQUEST || statusCode == http:STATUS_UNAUTHORIZED {
        // Get error details from response
        json|error errorPayload = tokenHttpResponse.getJsonPayload();
        string errorMessage = "Invalid authorization code or authentication failed";

        if errorPayload is json {
            json|error errorDesc = errorPayload.error_description;
            if errorDesc is string {
                errorMessage = errorDesc;
            }
        }

        log:printError("OIDC token exchange failed", statusCode = statusCode, errorMsg = errorMessage);
        return utils:createUnauthorizedError(errorMessage);
    }

    if statusCode != http:STATUS_OK {
        log:printError("Unexpected status code from OIDC token endpoint", statusCode = statusCode);
        return utils:createInternalServerError("OIDC provider returned an error");
    }

    // Parse token response
    json|error tokenPayload = tokenHttpResponse.getJsonPayload();
    if tokenPayload is error {
        log:printError("Failed to parse token response from OIDC provider", tokenPayload);
        return utils:createInternalServerError("Invalid response from OIDC provider");
    }

    // Projection drops provider-specific fields (e.g. Keycloak's session_state)
    types:OIDCTokenResponse|error tokenData = jsondata:parseAsType(tokenPayload);
    if tokenData is error {
        log:printError("Token response does not match expected schema", tokenData);
        return utils:createInternalServerError("Invalid token response from OIDC provider");
    }

    log:printInfo("Successfully received tokens from OIDC provider");
    return tokenData;
}

// Validate ID token signature using the provider's JWKS and return claims
public isolated function decodeAndValidateIdToken(string idToken, types:SSOConfig config)
    returns types:OIDCIdTokenClaims|http:Unauthorized|http:InternalServerError {

    log:printInfo("Validating ID token signature and claims");

    // Build validator config with JWKS-based signature verification
    jwt:ValidatorSignatureConfig signatureConfig = {
        jwksConfig: {url: config.jwksUrl}
    };
    if config.allowInsecureTLS {
        signatureConfig = {
            jwksConfig: {
                url: config.jwksUrl,
                clientConfig: {secureSocket: {disable: true}}
            }
        };
    }

    jwt:ValidatorConfig validatorConfig = {
        issuer: config.issuer,
        audience: config.clientId,
        clockSkew: 30, // 30 seconds tolerance for clock drift
        signatureConfig: signatureConfig
    };

    jwt:Payload|jwt:Error validatedPayload = jwt:validate(idToken, validatorConfig);
    if validatedPayload is jwt:Error {
        string errMsg = validatedPayload.message();
        // Distinguish infrastructure/transport failures from actual token validation failures.
        // JWKS retrieval errors, connection issues, and TLS failures are provider-side problems
        // and should not be reported as 401 (which implies a bad token from the user).
        if errMsg.includes("JWKS") || errMsg.includes("connection") || errMsg.includes("Failed to retrieve")
                || errMsg.includes("TLS") || errMsg.includes("SSL") {
            log:printError("Infrastructure error during ID token validation", validatedPayload);
            return utils:createInternalServerError("Failed to validate ID token: OIDC provider unavailable");
        }
        log:printError("ID token validation failed", validatedPayload);
        return utils:createUnauthorizedError("Invalid or untrusted ID token");
    }

    // Manually construct OIDCIdTokenClaims from validated payload
    // This is necessary because jwt:Payload may contain additional fields (like nbf, jti)
    // that are not part of our closed OIDCIdTokenClaims record
    types:OIDCIdTokenClaims|error claims = buildIdTokenClaims(validatedPayload);
    if claims is error {
        log:printError("Failed to build ID token claims structure", claims);
        return utils:createUnauthorizedError("Invalid ID token structure");
    }

    log:printInfo("ID token validation successful", sub = claims.sub);
    return claims;
}

// Build OIDCIdTokenClaims from JWT payload
isolated function buildIdTokenClaims(jwt:Payload payload) returns types:OIDCIdTokenClaims|error {
    // Extract required claims
    string|error sub = payload.sub.ensureType();
    if sub is error {
        return error("Missing or invalid 'sub' claim");
    }

    string|error iss = payload.iss.ensureType();
    if iss is error {
        return error("Missing or invalid 'iss' claim");
    }

    string|string[]|error aud = payload.aud.ensureType();
    if aud is error {
        return error("Missing or invalid 'aud' claim");
    }

    int|error exp = payload.exp.ensureType();
    if exp is error {
        return error("Missing or invalid 'exp' claim");
    }

    int|error iat = payload.iat.ensureType();
    if iat is error {
        return error("Missing or invalid 'iat' claim");
    }

    // Extract optional claims from the payload map
    // Cast payload to map<json> to access additional claims
    map<json> payloadMap = <map<json>>payload.toJson();

    string? email = ();
    json emailJson = payloadMap["email"];
    if emailJson is string {
        email = emailJson;
    }

    string? name = ();
    json nameJson = payloadMap["name"];
    if nameJson is string {
        name = nameJson;
    }

    string? preferredUsername = ();
    json preferredUsernameJson = payloadMap["preferred_username"];
    if preferredUsernameJson is string {
        preferredUsername = preferredUsernameJson;
    }

    // Construct OIDCIdTokenClaims record
    types:OIDCIdTokenClaims claims = {
        sub: sub,
        iss: iss,
        aud: aud,
        exp: exp,
        iat: iat,
        email: email,
        name: name,
        preferred_username: preferredUsername,
        rawClaims: payloadMap
    };

    return claims;
}

// Extract string values from a validated OIDC claim path.
//
// Supports top-level claims such as "groups" and nested paths such as
// "realm_access.roles" or "resource_access.icp.roles". Missing claims and
// unsupported shapes return an empty list so callers can treat absence as
// "no mapped values".
public isolated function extractClaimValues(types:OIDCIdTokenClaims claims, string claimPath) returns string[] {
    string normalizedPath = claimPath.trim();
    if normalizedPath == "" {
        return [];
    }

    string[] pathSegments = re `\.`.split(normalizedPath);
    json currentValue = claims.rawClaims;
    foreach string segment in pathSegments {
        string key = segment.trim();
        if key == "" {
            log:printDebug("Ignoring OIDC claim path with empty segment", claimPath = claimPath);
            return [];
        }
        if currentValue is map<json> {
            currentValue = currentValue[key];
        } else {
            log:printDebug("OIDC claim path cannot be resolved because an intermediate value is not an object",
                    claimPath = claimPath);
            return [];
        }
    }

    return normalizeClaimValues(currentValue, normalizedPath);
}

// Resolve mappings for the validated token issuer into desired federated
// memberships. Mapping persistence and stale-row cleanup remain in the
// storage layer.
public isolated function resolveFederatedGroupMemberships(types:OIDCIdTokenClaims claims,
        types:SSOGroupMapping[] mappings) returns types:FederatedGroupMembershipInput[] {
    types:FederatedGroupMembershipInput[] memberships = [];

    foreach types:SSOGroupMapping mapping in mappings {
        if mapping.issuer != claims.iss {
            continue;
        }

        string[] claimValues = extractClaimValues(claims, mapping.claimName);
        if claimValues.indexOf(mapping.claimValue) is int {
            memberships.push({
                groupId: mapping.groupId,
                claimName: mapping.claimName,
                claimValue: mapping.claimValue
            });
        }
    }

    return memberships;
}

isolated function normalizeClaimValues(json claimValue, string claimPath) returns string[] {
    string[] values = [];

    if claimValue is () {
        return values;
    }

    if claimValue is string {
        string trimmedValue = claimValue.trim();
        if trimmedValue != "" {
            values.push(trimmedValue);
        }
        return values;
    }

    if claimValue is json[] {
        foreach json item in claimValue {
            if item is string {
                string trimmedValue = item.trim();
                if trimmedValue != "" {
                    values.push(trimmedValue);
                }
            } else if item !is () {
                log:printDebug("Ignoring non-string value in OIDC claim array", claimPath = claimPath);
            }
        }
        return values;
    }

    log:printDebug("Ignoring OIDC claim because it is not a string or string array", claimPath = claimPath);
    return values;
}

// Extract user information from ID token claims
public isolated function extractUserInfo(types:OIDCIdTokenClaims claims, types:SSOConfig config)
    returns types:ExtractedUserInfo|http:InternalServerError {

    log:printInfo("Extracting user information from ID token claims");

    // Extract userId (sub claim is required)
    string userId = claims.sub;

    // Extract username from configured claim
    string? username = ();
    if config.usernameClaim == "email" {
        username = claims?.email;
    } else if config.usernameClaim == "preferred_username" {
        username = claims?.preferred_username;
    }

    if username is () {
        log:printError(string `Required claim '${config.usernameClaim}' not found in ID token`);
        return utils:createInternalServerError(string `ID token missing required claim: ${config.usernameClaim}`);
    }

    // Extract displayName with fallback logic
    string displayName = buildDisplayName(claims, username);

    log:printInfo("Successfully extracted user info", userId = userId, username = username, displayName = displayName);

    return {
        userId: userId,
        username: username,
        displayName: displayName
    };
}

// Build display name with fallback logic: name -> email -> username (strip domain if email)
isolated function buildDisplayName(types:OIDCIdTokenClaims claims, string username) returns string {
    // Priority 1: Use 'name' claim if available
    string? name = claims?.name;
    if name is string && name.trim() != "" {
        return name;
    }

    // Priority 2: Use 'email' claim if available
    string? email = claims?.email;
    if email is string && email.trim() != "" {
        return stripEmailDomain(email);
    }

    // Priority 3: Use username and strip domain if it's an email
    return stripEmailDomain(username);
}

// Strip domain from email address (part before @)
isolated function stripEmailDomain(string email) returns string {
    if email.includes("@") {
        string[] parts = re `@`.split(email);
        return parts[0];
    }
    return email;
}
