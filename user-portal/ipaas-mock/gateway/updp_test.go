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
		cfg:     config.GatewayConfig{UPDPUpstream: upstreamURL},
		catalog: catalog.New(config.Org{UUID: common.NewID(), Handle: "acme"}, "http://gw.example", time.Second),
	}
	return g.Routes()
}

// The route stands in for kgateway, which only routes: UP-DP answers every token itself.
func TestUpDPRouteSendsEveryPathToUpDP(t *testing.T) {
	gw := newTestUpDPGateway(t)

	for name, tc := range map[string]struct {
		method string
		path   string
		token  string
	}{
		"the config script":           {path: "/config.js"},
		"the health check":            {path: "/api/v1/health"},
		"an SPA path":                 {path: "/workflows/abc"},
		"an API path without a token": {path: "/api/v1/integrations"},
		"an API path with any token":  {path: "/api/v1/integrations", token: "not-a-jwt"},
		"a trigger":                   {method: http.MethodPost, path: "/api/v1/integrations/i1/deployment-tracks/t1/executions", token: "t"},
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

			assert.Equal(t, http.StatusOK, rec.Code)
			assert.Equal(t, "up-dp "+tc.path, rec.Body.String())
		})
	}
}

func TestUpDPRoutePassesTheTokenThroughUnchanged(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/v1/integrations", nil)
	req.Header.Set("Authorization", "Bearer abc.def.ghi")

	rec := httptest.NewRecorder()
	newTestUpDPGateway(t).ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "Bearer abc.def.ghi", rec.Header().Get("X-Seen-Authorization"))
}

func TestUpDPRouteAnswers502WhenUpDPIsDown(t *testing.T) {
	down, err := url.Parse("http://127.0.0.1:1")
	require.NoError(t, err)
	g := &Gateway{
		cfg:     config.GatewayConfig{UPDPUpstream: down},
		catalog: catalog.New(config.Org{UUID: common.NewID(), Handle: "acme"}, "http://gw.example", time.Second),
	}

	rec := httptest.NewRecorder()
	g.Routes().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/health", nil))

	assert.Equal(t, http.StatusBadGateway, rec.Code)
}
