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
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/wso2-enterprise/integration-user-portal-service/ipaas-mock/catalog"
	"github.com/wso2-enterprise/integration-user-portal-service/ipaas-mock/config"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/common"
)

// newTestUpDPGateway fronts a stand-in UP-DP that echoes the Authorization it received.
func newTestUpDPGateway(t *testing.T) http.Handler {
	t.Helper()

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Seen-Authorization", r.Header.Get("Authorization"))
		_, _ = w.Write([]byte("up-dp " + r.URL.Path))
	}))
	t.Cleanup(upstream.Close)
	upstreamURL, err := url.Parse(upstream.URL)
	require.NoError(t, err)

	g := &Gateway{
		cfg: config.GatewayConfig{
			UPDPUpstream: upstreamURL,
			Issuer:       "https://widp-dp.example",
			Audiences:    []string{"up-portal-api"},
		},
		catalog: catalog.New(config.Org{UUID: common.NewID(), Handle: "acme"}, "http://gw.example", time.Second),
	}
	return g.Routes()
}

// testToken is an unsigned user access token: the gateway reads it without a key set.
func testToken(t *testing.T, edit func(map[string]any)) string {
	t.Helper()

	claims := map[string]any{
		"iss":        "https://widp-dp.example",
		"sub":        "user-1",
		"aud":        "up-portal-api",
		"grant_type": "authorization_code",
		"scope":      "openid automation:trigger",
		"exp":        time.Now().Add(time.Hour).Unix(),
	}
	if edit != nil {
		edit(claims)
	}
	payload, err := json.Marshal(claims)
	require.NoError(t, err)

	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"RS256","typ":"at+jwt"}`))
	return header + "." + base64.RawURLEncoding.EncodeToString(payload) + ".c2ln"
}

func TestUpDPRouteChecksTokensAsJWTAuthDoes(t *testing.T) {
	gw := newTestUpDPGateway(t)
	trigger := "/api/v1/integrations/i1/deployment-tracks/t1/executions"

	for name, tc := range map[string]struct {
		method string
		path   string
		token  string
		status int
	}{
		"the config script":               {path: "/config.js", status: http.StatusOK},
		"the health check":                {path: "/api/v1/health", status: http.StatusOK},
		"the scope list":                  {path: "/api/v1/auth/scopes", status: http.StatusOK},
		"an SPA path":                     {path: "/workflows/abc", status: http.StatusOK},
		"an API path without a token":     {path: "/api/v1/integrations", status: http.StatusUnauthorized},
		"an API path with a user's token": {path: "/api/v1/integrations", token: testToken(t, nil), status: http.StatusOK},
		"another issuer": {
			path: "/api/v1/integrations", token: testToken(t, func(c map[string]any) { c["iss"] = "https://other.example" }), status: http.StatusUnauthorized,
		},
		"another audience": {
			path: "/api/v1/integrations", token: testToken(t, func(c map[string]any) { c["aud"] = "some-app" }), status: http.StatusUnauthorized,
		},
		"an expired token": {
			path: "/api/v1/integrations", token: testToken(t, func(c map[string]any) { c["exp"] = time.Now().Add(-time.Hour).Unix() }), status: http.StatusUnauthorized,
		},
		"a client-credentials token": {
			path: "/api/v1/integrations", token: testToken(t, func(c map[string]any) { c["grant_type"] = "client_credentials" }), status: http.StatusUnauthorized,
		},
		"a trigger without the scope, which UP-DP checks": {
			method: http.MethodPost, path: trigger, token: testToken(t, func(c map[string]any) { c["scope"] = "openid" }), status: http.StatusOK,
		},
		"a run list without the scope": {
			path: trigger, token: testToken(t, func(c map[string]any) { c["scope"] = "openid" }), status: http.StatusOK,
		},
	} {
		t.Run(name, func(t *testing.T) {
			method := tc.method
			if method == "" {
				method = http.MethodGet
			}
			req := httptest.NewRequest(method, tc.path, nil)
			if tc.token != "" {
				req.Header.Set("Authorization", "Bearer "+tc.token)
			}

			rec := httptest.NewRecorder()
			gw.ServeHTTP(rec, req)

			assert.Equal(t, tc.status, rec.Code)
			if tc.status == http.StatusOK {
				assert.Equal(t, "up-dp "+tc.path, rec.Body.String())
			}
		})
	}
}

func TestUpDPRoutePassesTheTokenThroughUnchanged(t *testing.T) {
	token := testToken(t, nil)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/integrations", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	rec := httptest.NewRecorder()
	newTestUpDPGateway(t).ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "Bearer "+token, rec.Header().Get("X-Seen-Authorization"))
}
