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
import org.glassfish.jersey.server.ContainerRequest;
import org.wso2.ei.dashboard.core.commons.audit.AuditLogger;
import org.wso2.micro.integrator.dashboard.utils.SSOConfig;
import org.wso2.micro.integrator.dashboard.utils.SSOConstants;

import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

import static org.wso2.ei.dashboard.core.commons.Constants.TOKEN_CACHE_TIMEOUT;

import javax.annotation.Priority;
import javax.servlet.http.HttpServletRequest;
import javax.ws.rs.Priorities;
import javax.ws.rs.container.ContainerRequestContext;
import javax.ws.rs.container.ContainerRequestFilter;
import javax.ws.rs.core.Context;
import javax.ws.rs.core.Cookie;
import javax.ws.rs.core.HttpHeaders;
import javax.ws.rs.core.PathSegment;
import javax.ws.rs.core.Response;
import javax.ws.rs.ext.Provider;

import static org.wso2.ei.dashboard.core.commons.Constants.JWT_COOKIE;
import static org.wso2.ei.dashboard.core.commons.auth.JwtUtil.isJWTToken;

/**
 * Authenticate the request coming to the rest api.
 * <p>
 * This filter is registered globally, so every resource served by the dashboard rest api is authenticated
 * unless its root resource is listed in {@link #UNAUTHENTICATED_PATHS}. A newly added resource is therefore
 * authenticated by default, and exposing one anonymously is a deliberate change to that list rather than an
 * omission at the resource class.
 */
@Provider
@Priority(Priorities.AUTHENTICATION)
public class AuthenticationFilter implements ContainerRequestFilter {
    private static final String AUTHENTICATION_SCHEME = "Bearer";
    // Resource types under /groups/{group-id}/ that only an admin may reach, in any form: the
    // collection itself and every sub-path below it.
    private static final Set<String> ADMIN_ONLY_RESOURCES = new HashSet<>(
            Arrays.asList("log-configs", "users", "roles", "all-roles"));
    private static final String GROUPS_RESOURCE = "groups";
    // Root resources reachable without a dashboard session. Anything not listed here requires authentication.
    //   login     - credential submission and the CSRF token used to submit it
    //   logout    - session teardown, which cannot require the session it is tearing down
    //   heartbeat - the endpoint managed MI nodes call to register themselves with the dashboard
    //   healthz   - liveness probe, consumed by deployment tooling that holds no dashboard session
    private static final List<String> UNAUTHENTICATED_PATHS =
            Arrays.asList("login", "logout", "heartbeat", "healthz");
    private static final String MAKE_NON_ADMIN_USERS_READ_ONLY = "make_non_admin_users_read_only";
    private static final String ADMIN_ONLY_DENIAL = "Admin only resource";
    private static final String READ_ONLY_DENIAL = "Read only mode is enabled for non-admin users";
    private static final String LOGIN_FORBIDDEN_ERROR = "LOGIN_FORBIDDEN";
    // Tracks SSO Bearer tokens that have already produced a login audit entry.
    // expireAfterAccess: an active session keeps the entry alive; eviction only happens on inactivity,
    // so a long-lived token does not generate repeated Login entries while it is in continuous use.
    private static final Cache<String, Boolean> SSO_LOGIN_AUDITED =
            CacheBuilder.newBuilder().expireAfterAccess(TOKEN_CACHE_TIMEOUT, TimeUnit.MINUTES).build();

    @Context
    private HttpServletRequest servletRequest;

    @Override
    public void filter(ContainerRequestContext requestContext) {
        if (isUnauthenticatedResource(requestContext)) {
            return;
        }
        String httpMethod = requestContext.getMethod();
        String token = extractToken(requestContext);
        SecurityHandler securityHandler = getSecurityHandler(requestContext, token);
        if (token == null || securityHandler == null) {
            abortWithUnauthorized(requestContext);
            return;
        }

        SSOConfig config = getSsoConfig();
        try {
            if (!securityHandler.isAuthenticated(config, token)) {
                // The token is missing, expired or otherwise invalid: the session is dead.
                abortWithUnauthorized(requestContext);
                return;
            }
            if (isTokenBasedAuthentication(requestContext.getHeaderString(HttpHeaders.AUTHORIZATION))
                    && !securityHandler.isLoginAllowed(config, token)) {
                // Authentication succeeded, but the user has no role configured for console access.
                abortWithLoginForbidden(requestContext);
                return;
            }
        } catch (TokenValidationException e) {
            // The token could not be validated because of a server/IdP side failure (e.g. the JWKS or introspection
            // endpoint is unreachable or untrusted). The session may well be valid, so do not report it as a 401.
            abortWithServiceUnavailable(requestContext);
            return;
        }

        // Resolved before the authorization checks so a denial can be attributed to a user in the
        // audit log. Every SecurityHandler reads the subject from the token itself or from a cache
        // populated during authentication, so this costs no additional remote call.
        String performedBy = securityHandler.getSubject(config, token);
        requestContext.setProperty(AuthorizationUtils.ACTION_PERFORMED_BY, performedBy);

        // Evaluated lazily and at most once: for opaque SSO tokens isAuthorized() calls the
        // userInfo endpoint whenever the caller is not a cached admin, so it must stay off the
        // path of requests that do not need it.
        Boolean isAdmin = null;
        if (isAdminResource(requestContext)) {
            isAdmin = resolveIsAdmin(requestContext, securityHandler, config, token);
            if (!isAdmin) {
                // The user is authenticated but not permitted to access this resource.
                abortWithForbidden(requestContext, performedBy, ADMIN_ONLY_DENIAL);
                return;
            }
        }
        boolean makeNonAdminUsersReadOnly = Boolean.parseBoolean(System.getProperty(MAKE_NON_ADMIN_USERS_READ_ONLY));
        if (!"GET".equalsIgnoreCase(httpMethod) && makeNonAdminUsersReadOnly) {
            if (isAdmin == null) {
                isAdmin = resolveIsAdmin(requestContext, securityHandler, config, token);
            }
            if (!isAdmin) {
                // For non-admin resources, request except GET are blocked
                // if the 'makeNonAdminUsersReadOnly' is set to 'true'
                abortWithForbidden(requestContext, performedBy, READ_ONLY_DENIAL);
                return;
            }
        }

        // Log SSO logins on first use of each Bearer token (cookie-based = local login, already audited in LoginDelegate)
        if (isTokenBasedAuthentication(requestContext.getHeaderString(HttpHeaders.AUTHORIZATION))
                && SSO_LOGIN_AUDITED.getIfPresent(token) == null) {
            SSO_LOGIN_AUDITED.put(token, Boolean.TRUE);
            AuditLogger.logLogin(performedBy, true);
        }
    }

    private SSOConfig getSsoConfig() {
        Object config = this.servletRequest.getServletContext().getAttribute(SSOConstants.CONFIG_BEAN_NAME);
        return config instanceof SSOConfig ? (SSOConfig) config : null;
    }

    private static boolean isUnauthenticatedResource(ContainerRequestContext requestContext) {
        String rootResource = getRootResource(requestContext);
        return UNAUTHENTICATED_PATHS.contains(rootResource);
    }

    /**
     * Returns the first segment of the request path, which identifies the root resource being addressed.
     * <p>
     * Matched on the whole segment rather than as a prefix, so that a resource whose name merely starts with
     * an unauthenticated one (for example a future "login-attempts" alongside "login") is not exempted by
     * accident.
     */
    private static String getRootResource(ContainerRequestContext requestContext) {
        // Relative to the rest api base path and carries no leading slash, e.g. "groups/g1/apis" or "healthz".
        String path = ((ContainerRequest) requestContext).getPath(false);
        int separator = path.indexOf('/');
        return separator < 0 ? path : path.substring(0, separator);
    }

    /**
     * Resolves whether the caller is an admin and records the verdict on the request, so that
     * resource methods can assert on it without recomputing it.
     */
    private static boolean resolveIsAdmin(ContainerRequestContext requestContext, SecurityHandler securityHandler,
                                          SSOConfig config, String token) {
        boolean isAdmin = securityHandler.isAuthorized(config, token);
        requestContext.setProperty(AuthorizationUtils.CALLER_IS_ADMIN, isAdmin);
        return isAdmin;
    }

    /**
     * Decides whether a request targets an admin-only resource.
     *
     * The resource type is the segment following the group id in
     * {@code groups/{group-id}/<resource-type>/...}, so sub-paths such as
     * {@code users/{user-id}} are covered along with the collection itself. Matching the last
     * segment instead would leave every sub-path of an admin-only resource unprotected.
     * Segments are compared decoded, so percent-encoded spellings cannot slip past.
     */
    private static boolean isAdminResource(ContainerRequestContext requestContext) {
        List<PathSegment> segments = requestContext.getUriInfo().getPathSegments();
        if (segments.size() < 3 || !GROUPS_RESOURCE.equals(segments.get(0).getPath())) {
            return false;
        }
        return ADMIN_ONLY_RESOURCES.contains(segments.get(2).getPath());
    }

    private void abortWithUnauthorized(ContainerRequestContext requestContext) {
        abortWith(requestContext, Response.Status.UNAUTHORIZED, "Unauthorized");
    }

    private void abortWithForbidden(ContainerRequestContext requestContext, String performedBy, String reason) {
        AuditLogger.logAccessDenied(performedBy, requestContext.getMethod(),
                requestContext.getUriInfo().getPath(), reason);
        abortWith(requestContext, Response.Status.FORBIDDEN, "Forbidden");
    }

    private void abortWithLoginForbidden(ContainerRequestContext requestContext) {
        abortWith(requestContext, Response.Status.FORBIDDEN, "Forbidden", LOGIN_FORBIDDEN_ERROR);
    }

    private void abortWithServiceUnavailable(ContainerRequestContext requestContext) {
        abortWith(requestContext, Response.Status.SERVICE_UNAVAILABLE,
                "Unable to validate the session with the identity provider");
    }

    private void abortWith(ContainerRequestContext requestContext, Response.Status status, String message) {
        abortWith(requestContext, status, message, null);
    }

    private void abortWith(ContainerRequestContext requestContext, Response.Status status, String message,
                           String errorCode) {
        Map<String, String> responseBody = new HashMap<>();
        responseBody.put("message", message);
        if (errorCode != null) {
            responseBody.put("code", errorCode);
        }
        Response response = Response.status(status).entity(responseBody)
                .header("content-type", "application/json").build();
        requestContext.abortWith(response);
    }

    private String extractToken(ContainerRequestContext requestContext) {
        String authorizationHeader = requestContext.getHeaderString(HttpHeaders.AUTHORIZATION);
        if (isTokenBasedAuthentication(authorizationHeader)) {
            return authorizationHeader.substring(AUTHENTICATION_SCHEME.length()).trim();
        }
        Map<String, Cookie> cookies = requestContext.getCookies();
        if (isCookieBasedAuthentication(cookies)) {
            return cookies.get(JWT_COOKIE).getValue();
        }
        return null;
    }

    private boolean isTokenBasedAuthentication(String authorizationHeader) {
        return authorizationHeader != null && authorizationHeader.toLowerCase()
                .startsWith(AUTHENTICATION_SCHEME.toLowerCase() + " ");
    }

    private boolean isCookieBasedAuthentication(Map<String, Cookie> cookies) {
        return cookies != null && cookies.get(JWT_COOKIE) != null;
    }

    private SecurityHandler getSecurityHandler(ContainerRequestContext requestContext, String token) {
        String authorizationHeader = requestContext.getHeaderString(HttpHeaders.AUTHORIZATION);
        if (isTokenBasedAuthentication(authorizationHeader)) {
            return getSSOSecurityHandler(token);
        }
        if (isCookieBasedAuthentication(requestContext.getCookies())) {
            return new InMemorySecurityHandler();
        }
        return null;
    }

    private static SecurityHandler getSSOSecurityHandler(String token) {
        if (JwtUtil.isJWTToken(token)) {
            return new JWTSecurityHandler();
        }
        return new OpaqueTokenSecurityHandler();
    }
}
