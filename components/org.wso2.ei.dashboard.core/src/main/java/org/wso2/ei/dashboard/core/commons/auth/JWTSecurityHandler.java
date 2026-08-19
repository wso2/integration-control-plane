/*
 *  Copyright (c) 2021, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
 *
 *  WSO2 Inc. licenses this file to you under the Apache License,
 *  Version 2.0 (the "License"); you may not use this file except
 *  in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing,
 *  software distributed under the License is distributed on an
 *  "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 *  KIND, either express or implied.  See the License for the
 *  specific language governing permissions and limitations
 *  under the License.
 */

package org.wso2.ei.dashboard.core.commons.auth;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.nimbusds.jwt.JWT;
import com.nimbusds.jwt.JWTParser;
import io.asgardeo.java.oidc.sdk.exception.SSOAgentServerException;
import io.asgardeo.java.oidc.sdk.validators.IDTokenValidator;
import org.apache.http.HttpStatus;
import org.apache.http.client.methods.CloseableHttpResponse;
import org.apache.http.client.methods.HttpGet;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.wso2.ei.dashboard.core.commons.Constants;
import org.wso2.ei.dashboard.core.commons.utils.HttpUtils;
import org.wso2.ei.dashboard.core.commons.utils.TokenUtils;
import org.wso2.ei.dashboard.core.exception.DashboardServerException;
import org.wso2.micro.integrator.dashboard.utils.SSOConfig;

import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.text.ParseException;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * This class implements SecurityHandler to implement the authentication logic for a JWT self contained token.
 */
public class JWTSecurityHandler implements SecurityHandler {

    private static final Logger logger = LogManager.getLogger(JWTSecurityHandler.class);
    private static final AtomicBoolean PREFERRED_USERNAME_MISSING_WARNED = new AtomicBoolean(false);

    @Override
    public boolean isAuthenticated(SSOConfig config, String token) {

        JWT idTokenJWT = null;
        try {
            idTokenJWT = JWTParser.parse(token);
            if (config.getOidcAgentConfig().getJwksEndpoint() == null) {
                config.getOidcAgentConfig()
                        .setJwksEndpoint(getJWKSEndpointFromWellKnownEndpoint(config.getWellKnownEndpoint()));
            }
            IDTokenValidator validator = new IDTokenValidator(config.getOidcAgentConfig(), idTokenJWT);
            validator.validate(null);
            return true;
        } catch (SSOAgentServerException e) {
            if (isCausedByConnectivityFailure(e)) {
                // The JWKS endpoint could not be reached (e.g. network failure or the IdP TLS certificate is not
                // trusted by this server's truststore). This is a server/IdP side failure, not an invalid token, so
                // surface it as such instead of reporting the token as unauthorized.
                logger.error("Unable to retrieve the JWKS to validate the access token. Verify that the identity "
                        + "provider's certificate is imported into the dashboard's client-truststore.jks.", e);
                throw new TokenValidationException("Unable to retrieve the JWKS to validate the access token", e);
            }
            logger.error("Error validating the access token", e);
        } catch (DashboardServerException | ParseException e) {
            logger.error("Error validating the access token", e);
        }
        return false;
    }

    /**
     * Returns true if the given throwable was caused by a connectivity/TLS failure (an {@link IOException}, which
     * includes SSL handshake failures). The OIDC SDK reports a failure to retrieve the JWKS as an
     * {@link SSOAgentServerException} whose cause chain carries the underlying {@link IOException}, which lets us
     * distinguish "could not reach the IdP to validate" from "the token is invalid".
     */
    private boolean isCausedByConnectivityFailure(Throwable throwable) {

        for (Throwable cause = throwable; cause != null; cause = cause.getCause()) {
            if (cause instanceof IOException) {
                return true;
            }
        }
        return false;
    }

    @Override
    public boolean isAuthorized(SSOConfig ssoConfig, String token) {

        JsonElement jsonElementPayload = TokenUtils.getParsedToken(token);
        return isUserInAdminGroup(jsonElementPayload, ssoConfig);
    }

    @Override
    public boolean isLoginAllowed(SSOConfig ssoConfig, String token) {

        if (!TokenUtils.hasConfiguredGroups(ssoConfig.getAllowedLoginRoles())) {
            return true;
        }
        JsonElement tokenPayload = TokenUtils.getParsedToken(token);
        JsonElement claimElement = tokenPayload.getAsJsonObject().get(ssoConfig.getAdminGroupAttribute());
        return TokenUtils.isUserInAllowedGroup(claimElement, ssoConfig.getAllowedLoginRoles());
    }

    @Override
    public String getSubject(SSOConfig ssoConfig, String token) {

        try {
            com.google.gson.JsonObject payload = TokenUtils.getParsedToken(token).getAsJsonObject();
            // preferred_username is the human-readable login name; sub may be an opaque UUID (e.g. IS 7.2.0)
            for (String claim : new String[]{"preferred_username", "username", "sub"}) {
                JsonElement el = payload.get(claim);
                if (el != null && !el.isJsonNull()) {
                    if ("sub".equals(claim) && PREFERRED_USERNAME_MISSING_WARNED.compareAndSet(false, true)) {
                        logger.warn("SSO access token contains neither 'preferred_username' nor 'username'. "
                                + "Audit log will use 'sub' value '{}', which may be an internal UUID on IS 7.2.0+. "
                                + "To fix, add 'preferred_username' to the OIDC application's access token "
                                + "attributes in the IdP.", el.getAsString());
                    }
                    return el.getAsString();
                }
            }
            return null;
        } catch (Exception e) {
            logger.debug("Could not extract subject from SSO JWT token", e);
            return null;
        }
    }

    private boolean isUserInAdminGroup(JsonElement tokenPayload, SSOConfig config) {

        JsonArray groupElement = tokenPayload.getAsJsonObject().getAsJsonArray(config.getAdminGroupAttribute());
        for (JsonElement group : groupElement) {
            if (config.getAllowedAdminGroups().contains(group.getAsString())) {
                return true;
            }
        }
        return false;
    }

    private URI getJWKSEndpointFromWellKnownEndpoint(String wellKnownEndpointPath) {

        HttpGet httpGet = new HttpGet(wellKnownEndpointPath);

        try (CloseableHttpResponse httpResponse = HttpUtils.doGet(httpGet)) {
            int httpSc = httpResponse.getStatusLine().getStatusCode();

            if (httpSc == HttpStatus.SC_OK) {
                try {
                    return new URI(HttpUtils.getJsonResponse(httpResponse).get(Constants.JWKS_URI).getAsString());
                } catch (URISyntaxException e) {
                    throw new DashboardServerException("Invalid url for " + Constants.JWKS_URI, e);
                }
            }
            throw new DashboardServerException("Cannot find " + Constants.JWKS_URI
                    + " in well known endpoint response. " + httpResponse.getStatusLine().getReasonPhrase());

        } catch (IOException e) {
            throw new DashboardServerException("Error while closing the http response", e);
        }
    }
}
