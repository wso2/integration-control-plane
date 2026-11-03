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
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"

	"go.uber.org/zap"

	"github.com/wso2-enterprise/integration-user-portal-service/shared/infrastructure/httpclient"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/infrastructure/logging"
)

// TokenResponse is the RFC 6749 success body every grant here answers with.
type TokenResponse struct {
	AccessToken     string `json:"access_token"`
	IssuedTokenType string `json:"issued_token_type"`
	TokenType       string `json:"token_type"`
	ExpiresIn       int    `json:"expires_in"`
	Scope           string `json:"scope"`
	RefreshToken    string `json:"refresh_token,omitempty"`
	IDToken         string `json:"id_token,omitempty"`
}

// OAuthError is the RFC 6749 error body.
type OAuthError struct {
	Code        string `json:"error"`
	Description string `json:"error_description"`

	// StatusCode is the transport status the body arrived with.
	StatusCode int `json:"-"`
}

func (e *OAuthError) Error() string {
	return fmt.Sprintf("upstream returned oauth error %q (status %d): %s", e.Code, e.StatusCode, e.Description)
}

// FetchJWKS returns the key set bytes unparsed.
func (svc *client) FetchJWKS(ctx context.Context, jwksURI string) (json.RawMessage, error) {
	operationName := "FetchJWKS"
	ctx = logging.With(ctx, zap.String("jwksUri", jwksURI))

	// GetJSON treats a non-2xx as an error and has already classified a 404.
	raw, err := httpclient.GetJSON[json.RawMessage](ctx, svc.http, operationName, jwksURI)
	if err != nil {
		return nil, err
	}
	// A null body unmarshals into the literal bytes rather than erroring, so it is
	// rejected here like every other client's null data.
	if len(raw) == 0 || bytes.Equal(raw, []byte("null")) {
		return nil, fmt.Errorf("%s:%s: unexpected empty data in response", serviceName, operationName)
	}

	return raw, nil
}

func (svc *client) ExchangeToken(ctx context.Context, tokenEndpoint string, form url.Values) (*TokenResponse, error) {
	return svc.postToken(ctx, "ExchangeToken", tokenEndpoint, form)
}

func (svc *client) RedeemCode(ctx context.Context, tokenEndpoint string, form url.Values) (*TokenResponse, error) {
	return svc.postToken(ctx, "RedeemCode", tokenEndpoint, form)
}

func (svc *client) RefreshToken(ctx context.Context, tokenEndpoint string, form url.Values) (*TokenResponse, error) {
	return svc.postToken(ctx, "RefreshToken", tokenEndpoint, form)
}

// postToken is the one POST to the token endpoint.
func (svc *client) postToken(ctx context.Context, op, tokenEndpoint string, form url.Values) (*TokenResponse, error) {
	ctx = logging.With(ctx, zap.String("tokenEndpoint", tokenEndpoint))

	resp, err := svc.http.PostForm(ctx, tokenEndpoint, form)
	if err != nil {
		return nil, fmt.Errorf("%s:%s: %w", serviceName, op, err)
	}

	if !resp.IsSuccess() {
		return nil, svc.oauthFailure(ctx, op, tokenEndpoint, resp)
	}

	var out TokenResponse
	if err := resp.DecodeJSON(&out); err != nil {
		return nil, fmt.Errorf("%s:%s: unmarshal response: %w", serviceName, op, err)
	}
	// Every grant that lands here answers with an RFC 6749 token body.
	if out.AccessToken == "" {
		return nil, fmt.Errorf("%s:%s: unexpected empty data in response", serviceName, op)
	}

	return &out, nil
}

func (svc *client) Revoke(ctx context.Context, revokeEndpoint string, form url.Values) error {
	operationName := "Revoke"
	ctx = logging.With(ctx, zap.String("revokeEndpoint", revokeEndpoint))

	resp, err := svc.http.PostForm(ctx, revokeEndpoint, form)
	if err != nil {
		return fmt.Errorf("%s:%s: %w", serviceName, operationName, err)
	}

	if !resp.IsSuccess() {
		return svc.oauthFailure(ctx, operationName, revokeEndpoint, resp)
	}

	return nil
}

func (svc *client) oauthFailure(ctx context.Context, op, requestURL string, resp *httpclient.Response) error {
	statusErr := resp.StatusError(http.MethodPost, requestURL)

	httpclient.LogUpstreamFailure(ctx, serviceName, op, resp)

	var oauthErr OAuthError
	if err := resp.DecodeJSON(&oauthErr); err == nil && oauthErr.Code != "" {
		oauthErr.StatusCode = resp.StatusCode
		return httpclient.Classify(fmt.Errorf("%s:%s: %w: %w", serviceName, op, &oauthErr, statusErr))
	}

	return httpclient.Classify(fmt.Errorf("%s:%s: %w", serviceName, op, statusErr))
}
