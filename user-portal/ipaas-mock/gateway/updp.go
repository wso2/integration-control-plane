/*
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

package gateway

import (
	"errors"
	"fmt"
	"net/http"
	"net/http/httputil"
	"slices"
	"strings"
	"time"

	"github.com/lestrrat-go/jwx/v3/jwt"

	"github.com/wso2-enterprise/integration-user-portal-service/shared/infrastructure/logging"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/web"
)

const (
	upDPConfigScript = "/config.js"
	upDPHealth       = "/api/v1/health"
	upDPScopes       = "/api/v1/auth/scopes"
)

// userGrants are jwt-auth's claims.anyOf on grant_type: a client-credentials
// token is not a user.
var userGrants = []string{"authorization_code", "refresh_token"}

var errNoBearer = errors.New("no bearer token")

// upDP is UP-DP behind the gateway, with the checks jwt-auth makes in the
// published environment. The token goes through in Authorization unchanged.
func (g *Gateway) upDP() http.Handler {
	proxy := &httputil.ReverseProxy{
		Rewrite: func(pr *httputil.ProxyRequest) {
			pr.SetURL(g.cfg.UPDPUpstream)
			pr.SetXForwarded()
		},
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			logging.S(r.Context()).Warnw("UP-DP did not answer", "upstream", g.cfg.UPDPUpstream.String(), "error", err)
			web.WriteResponse(w, r, http.StatusBadGateway, map[string]string{"error": "Bad Gateway"})
		},
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !needsToken(r.URL.Path) {
			proxy.ServeHTTP(w, r)
			return
		}

		if _, err := g.upDPToken(r); err != nil {
			web.StatusUnauthorized(w, r, err)
			return
		}

		proxy.ServeHTTP(w, r)
	})
}

// needsToken is every API path but the health check and the scope list. The
// config script and the SPA answer without one.
func needsToken(path string) bool {
	if path == upDPConfigScript || path == upDPHealth || path == upDPScopes {
		return false
	}
	return path == "/api" || strings.HasPrefix(path, "/api/")
}

// upDPToken is the request's bearer token, verified as jwt-auth verifies it for UP-DP.
func (g *Gateway) upDPToken(r *http.Request) (jwt.Token, error) {
	header := r.Header.Get("Authorization")
	if len(header) < len("Bearer ") || !strings.EqualFold(header[:len("Bearer ")], "Bearer ") {
		return nil, errNoBearer
	}
	raw := strings.TrimSpace(header[len("Bearer "):])
	if raw == "" {
		return nil, errNoBearer
	}

	token, err := g.parse(r.Context(), raw)
	if err != nil {
		return nil, err
	}

	opts := []jwt.ValidateOption{jwt.WithAcceptableSkew(30 * time.Second), jwt.WithValidator(jwt.IsRequired(jwt.ExpirationKey))}
	if g.cfg.Issuer != "" {
		opts = append(opts, jwt.WithIssuer(g.cfg.Issuer))
	}
	if err := jwt.Validate(token, opts...); err != nil {
		return nil, fmt.Errorf("gateway: validate token: %w", err)
	}

	if len(g.cfg.Audiences) > 0 {
		audience, _ := token.Audience()
		if !slices.ContainsFunc(audience, func(aud string) bool { return slices.Contains(g.cfg.Audiences, aud) }) {
			return nil, fmt.Errorf("gateway: audience %v is not one of %v", audience, g.cfg.Audiences)
		}
	}

	var grantType string
	_ = token.Get("grant_type", &grantType)
	if !slices.Contains(userGrants, grantType) {
		return nil, fmt.Errorf("gateway: grant_type %q is not a user's", grantType)
	}

	return token, nil
}
