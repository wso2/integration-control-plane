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

// Package platformidp stands in for the Platform IdP: a client-credentials token
// endpoint for the org's one portal client, and the keys that verify its tokens.
package platformidp

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/lestrrat-go/jwx/v3/jwa"
	"github.com/lestrrat-go/jwx/v3/jwk"
	"github.com/lestrrat-go/jwx/v3/jwt"

	"github.com/wso2-enterprise/integration-user-portal-service/ipaas-mock/config"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/infrastructure/keys"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/infrastructure/logging"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/infrastructure/oauth"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/web"
)

const keyID = "platform-idp-mock"

// Claims is what a portal client token establishes.
type Claims struct {
	ClientID string
	OUID     string
	OUHandle string
}

type IdP struct {
	cfg      config.IdPConfig
	org      config.Org
	audience string

	key       jwk.Key
	verifyKey jwk.Key
	published json.RawMessage

	now func() time.Time
}

// New makes a fresh signing key on every start, so tokens from a previous run stop
// verifying.
func New(cfg config.IdPConfig, org config.Org, audience string) (*IdP, error) {
	raw, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, fmt.Errorf("platformidp:New: generate key: %w", err)
	}
	key, err := jwk.Import(raw)
	if err != nil {
		return nil, fmt.Errorf("platformidp:New: import key: %w", err)
	}
	if err := key.Set(jwk.KeyIDKey, keyID); err != nil {
		return nil, fmt.Errorf("platformidp:New: set kid: %w", err)
	}

	published, err := keys.PublishedSet(key)
	if err != nil {
		return nil, fmt.Errorf("platformidp:New: %w", err)
	}
	verifyKey, err := key.PublicKey()
	if err != nil {
		return nil, fmt.Errorf("platformidp:New: public key: %w", err)
	}

	return &IdP{
		cfg:       cfg,
		org:       org,
		audience:  audience,
		key:       key,
		verifyKey: verifyKey,
		published: published,
		now:       time.Now,
	}, nil
}

func (idp *IdP) Routes() http.Handler {
	r := chi.NewRouter()
	r.Post("/oauth2/token", idp.token)
	r.Get("/oauth2/jwks", idp.jwks)
	return r
}

type tokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int    `json:"expires_in"`
}

type oauthError struct {
	Code        string `json:"error"`
	Description string `json:"error_description"`
}

func (idp *IdP) token(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		web.WriteResponse(w, r, http.StatusBadRequest, oauthError{"invalid_request", "form body expected"})
		return
	}
	if grant := r.PostForm.Get("grant_type"); grant != oauth.GrantClientCredentials {
		web.WriteResponse(w, r, http.StatusBadRequest, oauthError{"unsupported_grant_type", "only client_credentials is supported"})
		return
	}

	clientID, secret, ok := r.BasicAuth()
	if !ok || subtle.ConstantTimeCompare([]byte(clientID), []byte(idp.cfg.ClientID)) != 1 ||
		subtle.ConstantTimeCompare([]byte(secret), []byte(idp.cfg.ClientSecret)) != 1 {
		logging.S(r.Context()).Warnw("client authentication failed", "clientId", clientID)
		w.Header().Set("WWW-Authenticate", `Basic realm="platform-idp"`)
		web.WriteResponse(w, r, http.StatusUnauthorized, oauthError{"invalid_client", "client authentication failed"})
		return
	}

	now := idp.now()
	token, err := jwt.NewBuilder().
		Issuer(idp.cfg.Issuer).
		Subject(clientID).
		Audience([]string{idp.audience}).
		IssuedAt(now).
		Expiration(now.Add(idp.cfg.TokenTTL)).
		Claim("client_id", clientID).
		Claim("ouId", idp.org.UUID.String()).
		Claim("ouHandle", idp.org.Handle).
		Claim("ouName", idp.org.Name).
		Build()
	if err != nil {
		web.StatusInternalServerError(w, r, err, nil)
		return
	}

	signed, err := jwt.Sign(token, jwt.WithKey(jwa.RS256(), idp.key))
	if err != nil {
		web.StatusInternalServerError(w, r, err, nil)
		return
	}

	w.Header().Set("Cache-Control", "no-store")
	web.WriteResponse(w, r, http.StatusOK, tokenResponse{
		AccessToken: string(signed),
		TokenType:   "Bearer",
		ExpiresIn:   int(idp.cfg.TokenTTL.Seconds()),
	})
}

func (idp *IdP) jwks(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(idp.published)
}

var ErrInvalidToken = errors.New("token is not a valid platform idp token")

// Verify checks a bearer token the way iPaaS-Service's gateway would: signature,
// issuer, audience and lifetime.
func (idp *IdP) Verify(raw string) (*Claims, error) {
	token, err := jwt.Parse([]byte(raw),
		jwt.WithKey(jwa.RS256(), idp.verifyKey),
		jwt.WithIssuer(idp.cfg.Issuer),
		jwt.WithAudience(idp.audience),
		jwt.WithClock(jwt.ClockFunc(idp.now)),
	)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrInvalidToken, err)
	}

	var claims Claims
	for name, into := range map[string]*string{"client_id": &claims.ClientID, "ouId": &claims.OUID, "ouHandle": &claims.OUHandle} {
		if err := token.Get(name, into); err != nil {
			return nil, fmt.Errorf("%w: no %s claim", ErrInvalidToken, name)
		}
	}
	return &claims, nil
}
