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

import com.google.common.cache.Cache;
import com.google.common.cache.CacheBuilder;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import org.apache.http.HttpStatus;
import org.apache.http.client.methods.CloseableHttpResponse;
import org.apache.http.client.methods.HttpGet;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.wso2.ei.dashboard.core.commons.Constants;
import org.wso2.ei.dashboard.core.commons.utils.HttpUtils;
import org.wso2.ei.dashboard.core.commons.utils.TokenUtils;
import org.wso2.ei.dashboard.core.exception.DashboardServerException;
import org.wso2.ei.dashboard.core.exception.ManagementApiException;
import org.wso2.micro.integrator.dashboard.utils.SSOConfig;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.wso2.ei.dashboard.core.commons.Constants.TOKEN_CACHE_TIMEOUT;

/**
 * This class implements SecurityHandler to implement the authentication logic for a Opaque token.
 */
public class OpaqueTokenSecurityHandler implements SecurityHandler {

    private static final Logger logger = LogManager.getLogger(OpaqueTokenSecurityHandler.class);
    private static final long MAX_LOGIN_CLAIM_CACHE_SIZE = 10_000L;
    private static final Cache<String, Boolean> adminClaimMap =
            CacheBuilder.newBuilder().expireAfterWrite(TOKEN_CACHE_TIMEOUT, TimeUnit.MINUTES).build();
    private static final Cache<String, Boolean> loginClaimMap =
            CacheBuilder.newBuilder().maximumSize(MAX_LOGIN_CLAIM_CACHE_SIZE)
                    .expireAfterWrite(TOKEN_CACHE_TIMEOUT, TimeUnit.MINUTES).build();
    private static final Cache<String, String> subjectCache =
            CacheBuilder.newBuilder().expireAfterWrite(TOKEN_CACHE_TIMEOUT, TimeUnit.MINUTES).build();
    private static final AtomicBoolean PREFERRED_USERNAME_MISSING_WARNED = new AtomicBoolean(false);

    @Override
    public boolean isAuthenticated(SSOConfig config, String token) {

        if (config.getIntrospectionEndpoint() == null) {
            config.setIntrospectionEndpoint(
                    getIntrospectionEndpointFromWellKnownEndpoint(config.getWellKnownEndpoint()));
        }

        Map<String, String> introspectionRequestBody = new HashMap<>();
        introspectionRequestBody.put(Constants.TOKEN, token);
        introspectionRequestBody.put(Constants.CLIENT_ID, config.getOidcAgentConfig().getConsumerKey().getValue());
        introspectionRequestBody
                .put(Constants.CLIENT_SECRET, config.getOidcAgentConfig().getConsumerSecret().getValue());

        try (CloseableHttpResponse httpResponse =
                     HttpUtils.doPost(config.getIntrospectionEndpoint(), introspectionRequestBody)) {
            int httpSc = httpResponse.getStatusLine().getStatusCode();

            if (httpSc == HttpStatus.SC_OK) {
                JsonObject introspectionResponse = HttpUtils.getJsonResponse(httpResponse);
                boolean active = introspectionResponse.get(Constants.ACTIVE).getAsBoolean();
                if (active) {
                    String subject = extractSubjectFromIntrospection(introspectionResponse);
                    if (subject != null) {
                        subjectCache.put(token, subject);
                    }
                }
                return active;
            }
            if (logger.isDebugEnabled()) {
                logger.error("Error validating the token using introspection endpoint. ",
                        httpResponse.getStatusLine().getReasonPhrase());
            }
        } catch (IOException e) {
            // The introspection endpoint could not be reached. This is a server/IdP side failure, not an invalid
            // token, so surface it as such instead of reporting the token as unauthorized.
            logger.error("Unable to reach the introspection endpoint to validate the token.", e);
            throw new TokenValidationException("Unable to reach the introspection endpoint to validate the token", e);
        } catch (DashboardServerException e) {
            logger.error("Error validating the token using introspection endpoint. ", e);
        }
        return false;
    }

    @Override
    public boolean isAuthorized(SSOConfig ssoConfig, String token) {

        return validateWithCache(token) || validateAdminWithUserInfoEndpoint(ssoConfig, token);
    }

    @Override
    public boolean isLoginAllowed(SSOConfig ssoConfig, String token) {

        if (!TokenUtils.hasConfiguredGroups(ssoConfig.getAllowedLoginRoles())) {
            return true;
        }
        Boolean cachedResult = loginClaimMap.getIfPresent(token);
        if (cachedResult != null) {
            return cachedResult;
        }
        JsonElement claimElement = getGroupClaimFromUserInfoEndpoint(ssoConfig, token);
        boolean allowed = TokenUtils.isUserInAllowedGroup(claimElement, ssoConfig.getAllowedLoginRoles());
        loginClaimMap.put(token, allowed);
        return allowed;
    }

    private boolean validateWithCache(String token) {

        if (adminClaimMap.getIfPresent(token) != null) {
            return adminClaimMap.getIfPresent(token);
        }
        return false;
    }

    private boolean validateAdminWithUserInfoEndpoint(SSOConfig config, String token) {

        JsonElement claimElement = getGroupClaimFromUserInfoEndpoint(config, token);
        boolean isAdmin = TokenUtils.isUserInAllowedAdminGroup(claimElement, config.getAllowedAdminGroups());
        adminClaimMap.put(token, isAdmin);
        return isAdmin;
    }

    private JsonElement getGroupClaimFromUserInfoEndpoint(SSOConfig config, String token) {

        if (config.getUserInfoEndpoint() == null) {
            config.setUserInfoEndpoint(
                    getUserInfoEndpointFromWellKnownEndpoint(config.getWellKnownEndpoint()));
        }

        try (CloseableHttpResponse httpResponse =
                     HttpUtils.doGet(token, config.getUserInfoEndpoint())) {
            int httpSc = httpResponse.getStatusLine().getStatusCode();
            if (httpSc == HttpStatus.SC_OK) {
                return HttpUtils.getJsonResponse(httpResponse).get(config.getAdminGroupAttribute());
            }
            String errorMessage = "UserInfo endpoint returned " + httpSc + ": "
                    + httpResponse.getStatusLine().getReasonPhrase();
            logger.error(errorMessage);
            throw new TokenValidationException(errorMessage);
        } catch (IOException | ManagementApiException | DashboardServerException e) {
            logger.error("Unable to retrieve group membership from the UserInfo endpoint.", e);
            throw new TokenValidationException(
                    "Unable to retrieve group membership from the UserInfo endpoint", e);
        }
    }

    private String getUserInfoEndpointFromWellKnownEndpoint(String wellKnownEndpoint) {

        HttpGet httpGet = new HttpGet(wellKnownEndpoint);
        try (CloseableHttpResponse httpResponse = HttpUtils.doGet(httpGet)) {
            int httpSc = httpResponse.getStatusLine().getStatusCode();
            if (httpSc == HttpStatus.SC_OK) {
                JsonObject jsonResponse = HttpUtils.getJsonResponse(httpResponse);
                if (jsonResponse.has(Constants.USERINFO_URI)) {
                    return jsonResponse.get(Constants.USERINFO_URI).getAsString();
                }
            }
            throw new DashboardServerException("Cannot find " + Constants.USERINFO_URI + " in well known endpoint " +
                    "response. " +
                    httpResponse.getStatusLine().getReasonPhrase());
        } catch (IOException| DashboardServerException e) {
            throw new DashboardServerException("Error while retrieving userinfo endpoint"
                    + " from well known endpoint. ", e);
        }
    }

    private String getIntrospectionEndpointFromWellKnownEndpoint(String wellKnownEndpoint) {

        HttpGet httpGet = new HttpGet(wellKnownEndpoint);
        try (CloseableHttpResponse httpResponse = HttpUtils.doGet(httpGet)) {
            int httpSc = httpResponse.getStatusLine().getStatusCode();

            if (httpSc == HttpStatus.SC_OK) {
                JsonObject jsonResponse = HttpUtils.getJsonResponse(httpResponse);
                if (jsonResponse.has(Constants.INTROSPECTION_URI)) {
                    return jsonResponse.get(Constants.INTROSPECTION_URI).getAsString();
                }
            }
            throw new DashboardServerException("Cannot find " + Constants.INTROSPECTION_URI + " in well known endpoint "
                    + "response. " +
                    httpResponse.getStatusLine().getReasonPhrase());

        } catch (IOException | DashboardServerException e) {
            throw new DashboardServerException("Error while retrieving introspection endpoint"
                    + " from well known endpoint. ", e);
        }

    }

    @Override
    public String getSubject(SSOConfig ssoConfig, String token) {

        return subjectCache.getIfPresent(token);
    }

    /**
     * Extracts the subject identifier from an RFC 7662 introspection response.
     * Prefers human-readable claims: preferred_username → username → sub.
     * IS 7.2.0 puts a UUID in "sub" but the readable login name in "username".
     */
    private String extractSubjectFromIntrospection(JsonObject response) {

        for (String claim : new String[]{"preferred_username", "username", "sub"}) {
            if (response.has(claim) && !response.get(claim).isJsonNull()) {
                String value = response.get(claim).getAsString();
                if ("sub".equals(claim) && PREFERRED_USERNAME_MISSING_WARNED.compareAndSet(false, true)) {
                    logger.warn("SSO introspection response contains neither 'preferred_username' nor 'username'. "
                            + "Audit log will use 'sub' value '{}', which may be an internal UUID on IS 7.2.0+. "
                            + "To fix, add 'preferred_username' to the OIDC application's access token "
                            + "attributes in the IdP.", value);
                }
                return value;
            }
        }
        return null;
    }
}
