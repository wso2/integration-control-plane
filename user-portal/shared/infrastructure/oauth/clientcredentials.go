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

// Package oauth is the client_credentials grant an upstream client authenticates
// *itself* with.
package oauth

import (
	"context"
	"encoding/base64"
	"fmt"
	"net/http"
	"net/url"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"

	"github.com/wso2-enterprise/integration-user-portal-service/shared/infrastructure/httpclient"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/infrastructure/logging"
)

// expirySkew is how far before the stated expiry a cached token stops being served.
// The RFC grant-type strings. They are here rather than in either service because
// registration writes them into a tenant's application and the grants send them:
// two copies is how the tenant comes to reject what the service asks for.
const (
	GrantClientCredentials = "client_credentials"
	GrantAuthorizationCode = "authorization_code"
	GrantTokenExchange     = "urn:ietf:params:oauth:grant-type:token-exchange" // #nosec G101 -- RFC 8693 grant type, not a credential
	GrantRefreshToken      = "refresh_token"
)

const expirySkew = 60 * time.Second

// fillKey is the singleflight key.
const fillKey = "token"

const operationName = "MintToken"

// tokenResponse is the RFC 6749 body the grant answers with.
type tokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int    `json:"expires_in"`
	Scope       string `json:"scope"`
}

// Config describes one upstream's grant.
type Config struct {
	ServiceName  string
	TokenURL     string
	ClientID     string
	ClientSecret string
	Scopes       string
}

// ClientCredentials holds the one access token a client authenticates itself
// with.
type ClientCredentials struct {
	client *httpclient.Client

	serviceName string
	tokenURL    string
	scopes      string

	// basicAuth is the pre-encoded credential header
	basicAuth string

	// now is injected so expiry is testable without sleeping.
	now func() time.Time

	mu          sync.Mutex
	accessToken string
	expiresAt   time.Time

	group singleflight.Group
}

func New(client *httpclient.Client, cfg Config) *ClientCredentials {
	return &ClientCredentials{
		client:      client,
		serviceName: cfg.ServiceName,
		tokenURL:    cfg.TokenURL,
		scopes:      cfg.Scopes,
		basicAuth:   "Basic " + base64.StdEncoding.EncodeToString([]byte(cfg.ClientID+":"+cfg.ClientSecret)),
		now:         time.Now,
	}
}

func (c *ClientCredentials) TokenURL() string { return c.tokenURL }

// Token returns a usable access token, minting one when the cached token is
// absent or within expirySkew of expiring.
func (c *ClientCredentials) Token(ctx context.Context) (string, error) {
	if cached, ok := c.cached(); ok {
		return cached, nil
	}

	// The fill outlives whichever caller led it, so that caller's cancellation
	// must not abort what the others are waiting on. Each attempt is still
	// bounded by the client's own timeout.
	fillCtx := context.WithoutCancel(ctx)

	minted, err, _ := c.group.Do(fillKey, func() (any, error) {
		// A queued caller arrives here after the leader stored its token.
		if cached, ok := c.cached(); ok {
			return cached, nil
		}
		return c.fetch(fillCtx)
	})
	if err != nil {
		return "", err
	}

	return minted.(string), nil
}

func (c *ClientCredentials) Invalidate() {
	c.mu.Lock()
	c.accessToken = ""
	c.expiresAt = time.Time{}
	c.mu.Unlock()

	c.group.Forget(fillKey)
}

func (c *ClientCredentials) cached() (string, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.accessToken == "" || !c.now().Before(c.expiresAt) {
		return "", false
	}
	return c.accessToken, true
}

func (c *ClientCredentials) store(token string, expiresIn int) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.accessToken = token

	// An upstream that reports no lifetime is not cached
	if expiresIn <= 0 {
		c.expiresAt = time.Time{}
		return
	}
	lifetime := time.Duration(expiresIn) * time.Second
	c.expiresAt = c.now().Add(lifetime - min(expirySkew, lifetime/2))
}

// fetch runs the grant.
func (c *ClientCredentials) fetch(ctx context.Context) (string, error) {
	form := url.Values{"grant_type": {GrantClientCredentials}}
	if c.scopes != "" {
		form.Set("scope", c.scopes)
	}

	resp, err := c.client.PostForm(ctx, c.tokenURL, form, httpclient.WithHeader("Authorization", c.basicAuth))
	if err != nil {
		return "", fmt.Errorf("%s:%s: %w", c.serviceName, operationName, err)
	}

	if !resp.IsSuccess() {
		logging.S(ctx).Warnw("token grant was rejected",
			"service", c.serviceName, "op", operationName, "status", resp.StatusCode,
		)
		return "", httpclient.ClassifyUnavailable(fmt.Errorf("%s:%s: %w", c.serviceName, operationName,
			resp.StatusError(http.MethodPost, c.tokenURL)))
	}

	var out tokenResponse
	if err := resp.DecodeJSON(&out); err != nil {
		return "", fmt.Errorf("%s:%s: unmarshal response: %w", c.serviceName, operationName, err)
	}
	if out.AccessToken == "" {
		return "", fmt.Errorf("%s:%s: unexpected empty data in response", c.serviceName, operationName)
	}

	c.store(out.AccessToken, out.ExpiresIn)

	return out.AccessToken, nil
}
