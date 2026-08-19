/*
 *  Copyright (c) 2026, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
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

/**
 * Thrown by a {@link SecurityHandler} when a token cannot be validated because of a server or identity provider side
 * failure (for example, the JWKS or introspection endpoint is unreachable or its TLS certificate is not trusted).
 *
 * This is deliberately distinct from a token that is simply invalid or expired: the request should be answered with a
 * 503 (the server could not complete the validation) rather than a 401 (the caller's session is dead). Returning 401 in
 * this case is misleading - it makes a server side misconfiguration look like a session timeout and sends the user into
 * a login loop, because re-authenticating cannot fix it.
 */
public class TokenValidationException extends RuntimeException {

    public TokenValidationException(String message) {
        super(message);
    }

    public TokenValidationException(String message, Throwable cause) {
        super(message, cause);
    }
}
