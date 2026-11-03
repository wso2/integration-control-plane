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

package oidc

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/wso2-enterprise/integration-user-portal-service/shared/infrastructure/httpclient"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/upstream"
)

// wellKnownPath is only where the stub answers. This client derives no path: the
// caller names the whole URL.
const wellKnownPath = tokenPath + WellKnownSuffix

// received records what the stub was asked for. Every test makes one request.
type received struct {
	BaseURL string

	Method      string
	Path        string
	ContentType string
	Body        string
}

func startServer(t *testing.T, h http.HandlerFunc, opts ...httpclient.Option) (Client, *received) {
	t.Helper()

	got := &received{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got.Method = r.Method
		got.Path = r.URL.Path
		got.ContentType = r.Header.Get("Content-Type")

		body, err := io.ReadAll(r.Body)
		assert.NoError(t, err)
		got.Body = string(body)

		h(w, r)
	}))
	t.Cleanup(srv.Close)
	got.BaseURL = srv.URL

	base := []httpclient.Option{httpclient.WithRetry(httpclient.RetryParams{MaxAttempts: 1})}

	return NewClient(append(base, opts...)...), got
}

func jsonResponse(status int, body string) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}
}

const completeDocument = `{
	"issuer": "https://idp.example/t/acme/oauth2/token",
	"authorization_endpoint": "https://idp.example/t/acme/oauth2/authorize",
	"token_endpoint": "https://idp.example/t/acme/oauth2/token",
	"userinfo_endpoint": "https://idp.example/t/acme/oauth2/userinfo",
	"jwks_uri": "https://idp.example/t/acme/oauth2/jwks",
	"revocation_endpoint": "https://idp.example/t/acme/oauth2/revoke",
	"registration_endpoint": "https://idp.example/t/acme/identity/connect/register"
}`

func TestDiscoverReadsTheWholeDocument(t *testing.T) {
	c, req := startServer(t, jsonResponse(http.StatusOK, completeDocument))

	got, err := c.Discover(context.Background(), req.BaseURL+wellKnownPath)

	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, http.MethodGet, req.Method)
	// The URL the caller passed, unaltered: this client builds no path of its own.
	assert.Equal(t, wellKnownPath, req.Path)

	assert.Equal(t, "https://idp.example/t/acme/oauth2/token", got.Issuer)
	assert.Equal(t, "https://idp.example/t/acme/oauth2/authorize", got.AuthorizationEndpoint)
	assert.Equal(t, "https://idp.example/t/acme/oauth2/token", got.TokenEndpoint)
	assert.Equal(t, "https://idp.example/t/acme/oauth2/userinfo", got.UserInfoEndpoint)
	assert.Equal(t, "https://idp.example/t/acme/oauth2/jwks", got.JWKSURI)
	assert.Equal(t, "https://idp.example/t/acme/oauth2/revoke", got.RevocationEndpoint)
	assert.Equal(t, "https://idp.example/t/acme/identity/connect/register", got.RegistrationEndpoint)
}

func TestDiscoverRejectsADocumentMissingARequiredEndpoint(t *testing.T) {
	complete := map[string]string{
		"issuer":                 "https://idp.example/t/acme/oauth2/token",
		"authorization_endpoint": "https://idp.example/t/acme/oauth2/authorize",
		"token_endpoint":         "https://idp.example/t/acme/oauth2/token",
		"jwks_uri":               "https://idp.example/t/acme/oauth2/jwks",
	}

	for missing := range complete {
		t.Run("without "+missing, func(t *testing.T) {
			body := map[string]string{}
			for k, v := range complete {
				if k != missing {
					body[k] = v
				}
			}
			encoded, err := json.Marshal(body)
			require.NoError(t, err)

			c, req := startServer(t, jsonResponse(http.StatusOK, string(encoded)))

			got, err := c.Discover(context.Background(), req.BaseURL+wellKnownPath)

			require.Error(t, err)
			assert.Nil(t, got)
			assert.Contains(t, err.Error(), missing)
		})
	}
}

func TestDiscoverAcceptsADocumentWithoutTheOptionalEndpoints(t *testing.T) {
	c, req := startServer(t, jsonResponse(http.StatusOK, `{
		"issuer": "https://idp.example/t/acme/oauth2/token",
		"authorization_endpoint": "https://idp.example/t/acme/oauth2/authorize",
		"token_endpoint": "https://idp.example/t/acme/oauth2/token",
		"jwks_uri": "https://idp.example/t/acme/oauth2/jwks"
	}`))

	got, err := c.Discover(context.Background(), req.BaseURL+wellKnownPath)

	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Empty(t, got.RevocationEndpoint)
	assert.Empty(t, got.RegistrationEndpoint)
}

func TestDiscoverReadsANonAsgardeoLayout(t *testing.T) {
	c, req := startServer(t, jsonResponse(http.StatusOK, `{
		"issuer": "https://login.microsoftonline.com/tenant/v2.0",
		"authorization_endpoint": "https://login.microsoftonline.com/tenant/oauth2/v2.0/authorize",
		"token_endpoint": "https://login.microsoftonline.com/tenant/oauth2/v2.0/token",
		"jwks_uri": "https://login.microsoftonline.com/tenant/discovery/v2.0/keys"
	}`))

	got, err := c.Discover(context.Background(), req.BaseURL+"/tenant/v2.0"+WellKnownSuffix)

	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, "https://login.microsoftonline.com/tenant/v2.0", got.Issuer)
}

func TestDiscoverRejectsEmptyAndNullBodies(t *testing.T) {
	for name, body := range map[string]string{"null": `null`, "empty object": `{}`} {
		t.Run(name, func(t *testing.T) {
			c, req := startServer(t, jsonResponse(http.StatusOK, body))

			got, err := c.Discover(context.Background(), req.BaseURL+wellKnownPath)

			require.Error(t, err)
			assert.Nil(t, got)
		})
	}
}

func TestDiscoverNotFoundIsClassified(t *testing.T) {
	c, req := startServer(t, jsonResponse(http.StatusNotFound, `{}`))

	got, err := c.Discover(context.Background(), req.BaseURL+wellKnownPath)

	require.Error(t, err)
	assert.Nil(t, got)
	assert.ErrorIs(t, err, upstream.ErrNotFound)
}

func TestDiscoverOtherStatusesAreNotClassifiedAsNotFound(t *testing.T) {
	for _, status := range []int{http.StatusInternalServerError, http.StatusBadGateway, http.StatusUnauthorized} {
		c, req := startServer(t, jsonResponse(status, `{}`))

		got, err := c.Discover(context.Background(), req.BaseURL+wellKnownPath)

		require.Error(t, err)
		assert.Nil(t, got)
		assert.NotErrorIs(t, err, upstream.ErrNotFound)
	}
}

func TestDiscoverRefusesARedirect(t *testing.T) {
	c, req := startServer(t, func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Location", "https://evil.example/.well-known/openid-configuration")
		w.WriteHeader(http.StatusFound)
	})

	got, err := c.Discover(context.Background(), req.BaseURL+wellKnownPath)

	require.Error(t, err)
	assert.Nil(t, got)
	assert.Contains(t, err.Error(), "refusing redirect")
}

func TestAuthorizeURLCarriesTheQuery(t *testing.T) {
	got := AuthorizeURL("https://idp.example/t/acme/oauth2/authorize", url.Values{
		"response_type": {"code"},
		"client_id":     {"portal-client-id"},
		"redirect_uri":  {"https://portal.example.com/api/v1/auth/callback"},
	})

	assert.Equal(t,
		"https://idp.example/t/acme/oauth2/authorize"+
			"?client_id=portal-client-id&redirect_uri=https%3A%2F%2Fportal.example.com%2Fapi%2Fv1%2Fauth%2Fcallback&response_type=code",
		got,
	)
}

func TestAuthorizeURLLeavesAnEmptyQueryOff(t *testing.T) {
	assert.Equal(t, "https://idp.example/t/acme/oauth2/authorize",
		AuthorizeURL("https://idp.example/t/acme/oauth2/authorize", nil))
}

func TestWellKnownForAndIssuerForWellKnownAreInverses(t *testing.T) {
	for _, issuer := range []string{
		"https://idp.example/t/acme/oauth2/token",
		"https://login.microsoftonline.com/tenant/v2.0",
	} {
		wellKnown := WellKnownFor(issuer)
		assert.True(t, strings.HasSuffix(wellKnown, WellKnownSuffix))

		got, ok := IssuerForWellKnown(wellKnown)
		require.True(t, ok)
		assert.Equal(t, issuer, got)
	}
}

func TestIssuerForWellKnownRejectsAURLThatIsNotOne(t *testing.T) {
	got, ok := IssuerForWellKnown("https://idp.example/t/acme/oauth2/token")

	assert.False(t, ok)
	assert.Equal(t, "https://idp.example/t/acme/oauth2/token", got)
}
