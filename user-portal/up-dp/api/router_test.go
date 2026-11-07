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

package api

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"

	"github.com/wso2-enterprise/integration-user-portal-service/shared/upstream"
	"github.com/wso2-enterprise/integration-user-portal-service/up-dp/config"
	"github.com/wso2-enterprise/integration-user-portal-service/up-dp/domain"
	"github.com/wso2-enterprise/integration-user-portal-service/up-dp/service"
)

// anyCaller admits every bearer token as one user; the token service has its own tests.
type anyCaller struct{}

func (anyCaller) Read(context.Context, string) (*domain.TokenIdentity, error) {
	return &domain.TokenIdentity{UserID: "user-1"}, nil
}

// fixedScopes always answers the same scopes.
type fixedScopes []string

func (f fixedScopes) Scopes(context.Context) ([]string, error) { return f, nil }

const testIndex = `<html><head><title>User Portal</title><script src="/config.js"></script></head><body>spa</body></html>`

func newTestRouter(t *testing.T) http.Handler {
	t.Helper()

	dir := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(dir, "index.html"), []byte(testIndex), 0o600))
	require.NoError(t, os.MkdirAll(filepath.Join(dir, "assets"), 0o750))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "assets", "app.js"), []byte("console.log(1)"), 0o600))

	cfg := config.Config{
		SPADir: dir,
		Portal: config.Portal{
			Name:        "Acme <Apps>",
			ProductName: "Integration Platform",
			Links:       map[string]string{"terms": "https://acme.example/terms", "support": ""},
			Logo:        config.Logo{Light: "https://acme.example/logo.svg", Dark: "https://acme.example/logo-white.svg"},
		},
		Org:  config.Org{Handle: "acme", Name: "Acme Corporation"},
		OIDC: config.OIDC{Issuer: "https://idp.example", ClientID: "up-portal", Resource: "https://portal.example", Scopes: "openid profile"},
	}
	return Mount(&service.Registry{TokenService: anyCaller{}, ScopeService: fixedScopes{"openid", "offline_access"}}, cfg, zap.NewNop())
}

// unknownScopes has never read the published scopes.
type unknownScopes struct{}

func (unknownScopes) Scopes(context.Context) ([]string, error) {
	return nil, fmt.Errorf("scopes: %w", upstream.ErrUnavailable)
}

func TestScopesAnswer503UntilThePublishedOnesAreKnown(t *testing.T) {
	router := Mount(&service.Registry{TokenService: anyCaller{}, ScopeService: unknownScopes{}}, config.Config{SPADir: t.TempDir()}, zap.NewNop())

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/auth/scopes", nil))

	assert.Equal(t, http.StatusServiceUnavailable, rec.Code)
	assert.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
}

func TestRouterSplitsTheAPIFromTheSPA(t *testing.T) {
	router := newTestRouter(t)

	for _, tc := range []struct {
		path      string
		status    int
		body      string
		cacheCtrl string
	}{
		{path: "/", status: http.StatusOK, body: "<title>Acme &lt;Apps&gt; · Integration Platform</title>", cacheCtrl: "no-cache"},
		{path: "/auth/callback", status: http.StatusOK, body: "<title>Acme &lt;Apps&gt; · Integration Platform</title>", cacheCtrl: "no-cache"},
		{path: "/workflows/abc/runs", status: http.StatusOK, body: "<title>Acme &lt;Apps&gt; · Integration Platform</title>", cacheCtrl: "no-cache"},
		{path: "/assets/app.js", status: http.StatusOK, body: "console.log(1)", cacheCtrl: "public, max-age=31536000, immutable"},
		{path: "/assets/missing.js", status: http.StatusOK, body: "<title>Acme &lt;Apps&gt; · Integration Platform</title>", cacheCtrl: "no-cache"},
		{path: "/config.js", status: http.StatusOK, body: "window.__UP_DP_CONFIG__ = ", cacheCtrl: "no-store"},
		{path: "/api/v1/no-such-route", status: http.StatusNotFound, body: `{"error":"Resource not found"}`},
		{path: "/api/v1/integrations", status: http.StatusUnauthorized, body: `{"error":"Unauthorized"}`},
		{path: "/api/v1/integrations/i1", status: http.StatusUnauthorized},
		{path: "/api/v1/projects", status: http.StatusUnauthorized},
		{path: "/api/v1/integrations/i1/deployment-tracks/t1/deployment", status: http.StatusUnauthorized},
		{path: "/api/v1/me", status: http.StatusNotFound},
		{path: "/api/v1/config", status: http.StatusNotFound},
		{path: "/api/v1/config.js", status: http.StatusNotFound},
		{path: "/api/v1/auth/login", status: http.StatusNotFound},
		{path: "/api/v1/auth/scopes", status: http.StatusOK, body: `{"scopes":["openid","offline_access"]}`, cacheCtrl: "no-store"},
	} {
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, tc.path, nil))

		assert.Equal(t, tc.status, rec.Code, tc.path)
		if tc.body != "" {
			assert.Contains(t, rec.Body.String(), tc.body, tc.path)
		}
		if tc.cacheCtrl != "" {
			assert.Equal(t, tc.cacheCtrl, rec.Header().Get("Cache-Control"), tc.path)
		}
	}
}

func TestCallbackMayBeFramedByThePortalOnly(t *testing.T) {
	rec := httptest.NewRecorder()
	newTestRouter(t).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/auth/callback", nil))

	require.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "SAMEORIGIN", rec.Header().Get("X-Frame-Options"))
}

func TestConfigScriptSetsTheSPAConfig(t *testing.T) {
	rec := httptest.NewRecorder()
	newTestRouter(t).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/config.js", nil))

	require.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "text/javascript; charset=utf-8", rec.Header().Get("Content-Type"))
	assert.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
	assert.Equal(t, `window.__UP_DP_CONFIG__ = {"portalName":"Acme \u003cApps\u003e","productName":"Integration Platform","theme":"",`+
		`"links":{"terms":"https://acme.example/terms"},"logo":{"light":"https://acme.example/logo.svg","dark":"https://acme.example/logo-white.svg"},`+
		`"orgHandle":"acme","orgName":"Acme Corporation",`+
		`"auth":{"issuer":"https://idp.example","clientId":"up-portal","resource":"https://portal.example"}};`+"\n", rec.Body.String())
}

func TestPageIsTheBuildWithItsTitleOnly(t *testing.T) {
	rec := httptest.NewRecorder()
	newTestRouter(t).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))

	assert.Equal(t, `<html><head><title>Acme &lt;Apps&gt; · Integration Platform</title><script src="/config.js"></script></head><body>spa</body></html>`,
		rec.Body.String())
}

func TestPageWithoutABuildIsUnavailable(t *testing.T) {
	router := Mount(&service.Registry{TokenService: anyCaller{}}, config.Config{SPADir: t.TempDir()}, zap.NewNop())

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))

	assert.Equal(t, http.StatusServiceUnavailable, rec.Code)
	assert.Contains(t, rec.Body.String(), "not built")
}

func TestIntegrationsRefusesAQueryOutOfBounds(t *testing.T) {
	router := newTestRouter(t)

	queries := []string{
		"kind=project", "limit=0", "limit=101", "limit=ten",
		"search=" + strings.Repeat("é", 101),
		strings.TrimSuffix(strings.Repeat("project=p&", 101), "&"),
		"project=" + strings.Repeat("p", 129),
	}
	for _, query := range queries {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/integrations?"+query, nil)
		req.Header.Set("Authorization", "Bearer token")
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code, query)
	}
}

func TestExecutionsRefusesALimitOutOfBounds(t *testing.T) {
	router := newTestRouter(t)

	for _, query := range []string{"limit=0", "limit=101", "limit=1000000", "limit=ten"} {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/integrations/i1/deployment-tracks/t1/executions?"+query, nil)
		req.Header.Set("Authorization", "Bearer token")
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code, query)
		assert.Contains(t, rec.Body.String(), "limit must be a number from 1 to 100.", query)
	}
}
