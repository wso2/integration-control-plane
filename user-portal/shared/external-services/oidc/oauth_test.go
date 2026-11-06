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
	"bytes"
	"context"
	"errors"
	"net/http"
	"net/url"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/wso2-enterprise/integration-user-portal-service/shared/infrastructure/httpclient"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/upstream"
)

const (
	jwksPath   = "/t/acme/oauth2/jwks"
	tokenPath  = "/t/acme/oauth2/token"
	revokePath = "/t/acme/oauth2/revoke"
)

func TestFetchJWKSRequestPath(t *testing.T) {
	c, req := startServer(t, jsonResponse(http.StatusOK, `{"keys":[]}`))

	_, err := c.FetchJWKS(context.Background(), req.BaseURL+jwksPath)

	require.NoError(t, err)
	assert.Equal(t, http.MethodGet, req.Method)
	assert.Equal(t, jwksPath, req.Path)
}

func TestFetchJWKSReturnsRawBytesUnaltered(t *testing.T) {
	body := `{"keys":[{"kty":"RSA","e":"AQAB","use":"sig","kid":"abc","alg":"RS256","n":"xGOr-H7A"}]}`

	c, req := startServer(t, jsonResponse(http.StatusOK, body))

	got, err := c.FetchJWKS(context.Background(), req.BaseURL+jwksPath)

	require.NoError(t, err)
	assert.Equal(t, body, string(got))
}

func TestFetchJWKSRejectsEmptyAndNullBodies(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{name: "empty", body: ``},
		{name: "null", body: `null`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c, req := startServer(t, jsonResponse(http.StatusOK, tt.body))

			got, err := c.FetchJWKS(context.Background(), req.BaseURL+jwksPath)

			require.Error(t, err)
			assert.Nil(t, got)
		})
	}
}

func TestFetchJWKSAcceptsAnEmptyKeySet(t *testing.T) {
	c, req := startServer(t, jsonResponse(http.StatusOK, `{"keys":[]}`))

	got, err := c.FetchJWKS(context.Background(), req.BaseURL+jwksPath)

	require.NoError(t, err)
	assert.Equal(t, `{"keys":[]}`, string(got))
}

func TestFetchJWKSNotFoundIsClassified(t *testing.T) {
	c, req := startServer(t, jsonResponse(http.StatusNotFound, `{"code":"no-tenant"}`))

	got, err := c.FetchJWKS(context.Background(), req.BaseURL+jwksPath)

	require.Error(t, err)
	assert.Nil(t, got)
	assert.ErrorIs(t, err, upstream.ErrNotFound)
}

func TestFetchJWKSOtherStatusesAreNotClassifiedAsNotFound(t *testing.T) {
	for _, status := range []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusInternalServerError, http.StatusBadGateway} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			c, req := startServer(t, jsonResponse(status, `{}`))

			got, err := c.FetchJWKS(context.Background(), req.BaseURL+jwksPath)

			require.Error(t, err)
			assert.Nil(t, got)
			assert.NotErrorIs(t, err, upstream.ErrNotFound)
		})
	}
}

func TestFetchJWKSOversizedBodyIsAnError(t *testing.T) {
	c, req := startServer(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"keys":[{"n":"`))
		_, _ = w.Write(bytes.Repeat([]byte("A"), 2<<20))
		_, _ = w.Write([]byte(`"}]}`))
	})

	got, err := c.FetchJWKS(context.Background(), req.BaseURL+jwksPath)

	require.Error(t, err)
	assert.Nil(t, got)
	assert.NotErrorIs(t, err, upstream.ErrUnavailable)
}

func TestFetchJWKSRefusesARedirect(t *testing.T) {
	c, req := startServer(t, func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Location", "https://evil.example.com/jwks")
		w.WriteHeader(http.StatusFound)
	})

	got, err := c.FetchJWKS(context.Background(), req.BaseURL+jwksPath)

	require.Error(t, err)
	assert.Nil(t, got)
	assert.Contains(t, err.Error(), "refusing redirect")
}

// The three grants below share one POST to the token endpoint, so every test that
// exercises that path runs against all three. A grant differs only in its form, its
// op and the response it gets back.
type grant struct {
	op   string
	form url.Values
	call func(c Client, ctx context.Context, tokenEndpoint string, form url.Values) (*TokenResponse, error)
}

func grants() []grant {
	return []grant{
		{
			op:   "ExchangeToken",
			form: exchangeForm(),
			call: func(c Client, ctx context.Context, tokenEndpoint string, form url.Values) (*TokenResponse, error) {
				return c.ExchangeToken(ctx, tokenEndpoint, form)
			},
		},
		{
			op:   "RedeemCode",
			form: codeForm(),
			call: func(c Client, ctx context.Context, tokenEndpoint string, form url.Values) (*TokenResponse, error) {
				return c.RedeemCode(ctx, tokenEndpoint, form)
			},
		},
		{
			op:   "RefreshToken",
			form: refreshForm(),
			call: func(c Client, ctx context.Context, tokenEndpoint string, form url.Values) (*TokenResponse, error) {
				return c.RefreshToken(ctx, tokenEndpoint, form)
			},
		},
	}
}

func exchangeForm() url.Values {
	return url.Values{
		"grant_type":         {"urn:ietf:params:oauth:grant-type:token-exchange"},
		"subject_token":      {"header.payload.signature"},
		"subject_token_type": {"urn:ietf:params:oauth:token-type:access_token"},
		"client_assertion":   {"assertion.payload.signature"},
	}
}

func codeForm() url.Values {
	return url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {"authorization-code"},
		"redirect_uri":  {"https://portal.example.com/api/v1/auth/callback"},
		"code_verifier": {"pkce-code-verifier"},
		"client_id":     {"tkx-client-id"},
	}
}

func refreshForm() url.Values {
	return url.Values{
		"grant_type":    {"refresh_token"},
		"refresh_token": {"opaque-refresh-token"},
		"client_id":     {"tkx-client-id"},
	}
}

func TestGrantsPostFormToTheTokenEndpoint(t *testing.T) {
	for _, g := range grants() {
		t.Run(g.op, func(t *testing.T) {
			c, req := startServer(t, jsonResponse(http.StatusOK, `{"access_token":"issued"}`))

			_, err := g.call(c, context.Background(), req.BaseURL+tokenPath, g.form)

			require.NoError(t, err)
			assert.Equal(t, http.MethodPost, req.Method)
			// One endpoint for every grant.
			assert.Equal(t, tokenPath, req.Path)
			assert.Equal(t, "application/x-www-form-urlencoded", req.ContentType)
			assert.Equal(t, g.form.Encode(), req.Body)
		})
	}
}

func TestGrantsDecodeTheTokenResponse(t *testing.T) {
	body := `{
		"access_token": "issued-access-token",
		"issued_token_type": "urn:ietf:params:oauth:token-type:access_token",
		"token_type": "Bearer",
		"expires_in": 3600,
		"scope": "openid profile",
		"refresh_token": "issued-refresh-token",
		"id_token": "id.token.value"
	}`

	for _, g := range grants() {
		t.Run(g.op, func(t *testing.T) {
			c, req := startServer(t, jsonResponse(http.StatusOK, body))

			got, err := g.call(c, context.Background(), req.BaseURL+tokenPath, g.form)

			require.NoError(t, err)
			require.NotNil(t, got)
			assert.Equal(t, "issued-access-token", got.AccessToken)
			assert.Equal(t, "urn:ietf:params:oauth:token-type:access_token", got.IssuedTokenType)
			assert.Equal(t, "Bearer", got.TokenType)
			assert.Equal(t, 3600, got.ExpiresIn)
			assert.Equal(t, "openid profile", got.Scope)
			assert.Equal(t, "issued-refresh-token", got.RefreshToken)
			// Byte for byte: the callback reads a claim off this string.
			assert.Equal(t, "id.token.value", got.IDToken)
		})
	}
}

func TestGrantsRejectAnEmptyAccessToken(t *testing.T) {
	for _, g := range grants() {
		t.Run(g.op, func(t *testing.T) {
			c, req := startServer(t, jsonResponse(http.StatusOK, `{"token_type":"Bearer","expires_in":3600}`))

			got, err := g.call(c, context.Background(), req.BaseURL+tokenPath, g.form)

			require.Error(t, err)
			assert.Nil(t, got)
			assert.Contains(t, err.Error(), "unexpected empty data")
		})
	}
}

func TestGrantsPreserveTheOAuthErrorCode(t *testing.T) {
	tests := []struct {
		name        string
		status      int
		body        string
		wantCode    string
		wantMessage string
	}{
		{
			name:        "invalid token",
			status:      http.StatusBadRequest,
			body:        `{"error":"invalid_token","error_description":"Subject token is not active"}`,
			wantCode:    "invalid_token",
			wantMessage: "Subject token is not active",
		},
		{
			name:        "invalid grant",
			status:      http.StatusBadRequest,
			body:        `{"error":"invalid_grant","error_description":"Inactive authorization code"}`,
			wantCode:    "invalid_grant",
			wantMessage: "Inactive authorization code",
		},
		{
			name:        "insufficient scope",
			status:      http.StatusForbidden,
			body:        `{"error":"insufficient_scope","error_description":"Requested scopes are not granted"}`,
			wantCode:    "insufficient_scope",
			wantMessage: "Requested scopes are not granted",
		},
		{
			name:        "invalid client",
			status:      http.StatusUnauthorized,
			body:        `{"error":"invalid_client","error_description":"Client assertion validation failed"}`,
			wantCode:    "invalid_client",
			wantMessage: "Client assertion validation failed",
		},
	}

	for _, g := range grants() {
		for _, tt := range tests {
			t.Run(g.op+"/"+tt.name, func(t *testing.T) {
				c, req := startServer(t, jsonResponse(tt.status, tt.body))

				got, err := g.call(c, context.Background(), req.BaseURL+tokenPath, g.form)

				require.Error(t, err)
				assert.Nil(t, got)

				var oauthErr *OAuthError
				require.ErrorAs(t, err, &oauthErr)
				assert.Equal(t, tt.wantCode, oauthErr.Code)
				assert.Equal(t, tt.wantMessage, oauthErr.Description)
				assert.Equal(t, tt.status, oauthErr.StatusCode)

				// The transport status stays reachable alongside the OAuth code.
				var statusErr *httpclient.StatusError
				require.ErrorAs(t, err, &statusErr)
				assert.Equal(t, tt.status, statusErr.StatusCode)
			})
		}
	}
}

func TestGrantsAreNotRetried(t *testing.T) {
	for _, g := range grants() {
		t.Run(g.op, func(t *testing.T) {
			var calls atomic.Int64
			c, req := startServer(t, func(w http.ResponseWriter, _ *http.Request) {
				calls.Add(1)
				w.WriteHeader(http.StatusInternalServerError)
			}, httpclient.WithRetry(httpclient.RetryParams{
				MaxAttempts: 3,
				BaseDelay:   time.Millisecond,
				MaxDelay:    time.Millisecond,
			}))

			_, err := g.call(c, context.Background(), req.BaseURL+tokenPath, g.form)

			require.Error(t, err)
			// A re-sent code cannot succeed, and a re-sent exchange mints a second token.
			assert.Equal(t, int64(1), calls.Load())
		})
	}
}

// The next two are transport behaviour of the shared path, so one grant pins them.

func TestGrantsFailOnANonOAuthErrorBody(t *testing.T) {
	c, req := startServer(t, jsonResponse(http.StatusBadGateway, `<html>gateway timeout</html>`))

	got, err := c.ExchangeToken(context.Background(), req.BaseURL+tokenPath, exchangeForm())

	require.Error(t, err)
	assert.Nil(t, got)

	var oauthErr *OAuthError
	assert.False(t, errors.As(err, &oauthErr), "an html body must not be reported as an oauth error")

	var statusErr *httpclient.StatusError
	require.ErrorAs(t, err, &statusErr)
	assert.Equal(t, http.StatusBadGateway, statusErr.StatusCode)
}

func TestGrantsRefuseARedirect(t *testing.T) {
	c, req := startServer(t, func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Location", "https://evil.example.com/token")
		w.WriteHeader(http.StatusFound)
	})

	got, err := c.ExchangeToken(context.Background(), req.BaseURL+tokenPath, exchangeForm())

	require.Error(t, err)
	assert.Nil(t, got)
	assert.Contains(t, err.Error(), "refusing redirect")
}

func revokeForm() url.Values {
	return url.Values{
		"token":           {"opaque-refresh-token"},
		"token_type_hint": {"refresh_token"},
		"client_id":       {"tkx-client-id"},
	}
}

func TestRevokePostsToTheRevokeEndpoint(t *testing.T) {
	c, req := startServer(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	// A successful revoke carries no body, which is why it stays out of postToken.
	err := c.Revoke(context.Background(), req.BaseURL+revokePath, revokeForm())

	require.NoError(t, err)
	assert.Equal(t, http.MethodPost, req.Method)
	assert.Equal(t, revokePath, req.Path)
	assert.Equal(t, "application/x-www-form-urlencoded", req.ContentType)
	assert.Equal(t, revokeForm().Encode(), req.Body)
}

func TestRevokePreservesTheOAuthErrorCode(t *testing.T) {
	c, req := startServer(t, jsonResponse(http.StatusUnauthorized, `{"error":"invalid_client","error_description":"Client authentication failed"}`))

	err := c.Revoke(context.Background(), req.BaseURL+revokePath, revokeForm())

	require.Error(t, err)

	var oauthErr *OAuthError
	require.ErrorAs(t, err, &oauthErr)
	assert.Equal(t, "invalid_client", oauthErr.Code)
	assert.Equal(t, http.StatusUnauthorized, oauthErr.StatusCode)
}

func TestErrorsIncludeServiceAndOperation(t *testing.T) {
	c, req := startServer(t, jsonResponse(http.StatusInternalServerError, `{}`))

	_, err := c.Discover(context.Background(), req.BaseURL+"/t/acme/oauth2/token"+WellKnownSuffix)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "oidc:Discover")

	_, err = c.FetchJWKS(context.Background(), req.BaseURL+jwksPath)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "oidc:FetchJWKS")

	err = c.Revoke(context.Background(), req.BaseURL+revokePath, revokeForm())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "oidc:Revoke")

	// Each grant passes its own op through the shared path, so a log line still
	// names the grant that failed.
	for _, g := range grants() {
		t.Run(g.op, func(t *testing.T) {
			_, err := g.call(c, context.Background(), req.BaseURL+tokenPath, g.form)

			require.Error(t, err)
			assert.Contains(t, err.Error(), "oidc:"+g.op)
		})
	}
}
