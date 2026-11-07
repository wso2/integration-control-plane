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

package service

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/lestrrat-go/jwx/v3/jwk"
	"github.com/lestrrat-go/jwx/v3/jws"
	"github.com/lestrrat-go/jwx/v3/jwt"

	"github.com/wso2-enterprise/integration-user-portal-service/shared/infrastructure/logging"
	"github.com/wso2-enterprise/integration-user-portal-service/up-dp/domain"
)

const clockSkew = 30 * time.Second

// userGrants are the grants that issue a token to a signed-in user. ThunderID gives a
// refreshed access token its original grant's grant_type, so refresh_token never appears.
var userGrants = []string{"authorization_code"}

// accessTokenTypes are the typ headers of a JWT access token (RFC 9068 §2.1). The WIdP-DP
// signs ID tokens, refresh tokens and ID-JAGs with the same keys and other types.
var accessTokenTypes = []string{"at+jwt", "application/at+jwt"}

type KeyProvider interface {
	Get(ctx context.Context, kid string) (jwk.Set, error)
}

type TokenConfig struct {
	Issuer   string
	Audience string
	// ClientID is the portal app. Any app on the WIdP-DP may ask for the portal's resource
	// as its audience, so a token is the portal's only when the portal app was issued it.
	ClientID string
}

type TokenService struct {
	cfg  TokenConfig
	keys KeyProvider
	// now is injected so expiry is testable
	now func() time.Time
}

func NewTokenService(cfg TokenConfig, keys KeyProvider) domain.TokenService {
	return &TokenService{cfg: cfg, keys: keys, now: time.Now}
}

// Read verifies rawToken as the WIdP-DP's access token for this portal, issued to the
// portal app for a signed-in user, and returns the identity its claims carry.
func (svc *TokenService) Read(ctx context.Context, rawToken string) (*domain.TokenIdentity, error) {
	// A compact JWS always has exactly one signature.
	msg, err := jws.Parse([]byte(rawToken), jws.WithCompact())
	if err != nil {
		return nil, fmt.Errorf("tokenservice:Read: parse: %v: %w", err, domain.ErrMalformedToken)
	}
	headers := msg.Signatures()[0].ProtectedHeaders()
	typ, _ := headers.Type()
	if !slices.Contains(accessTokenTypes, strings.ToLower(typ)) {
		return nil, fmt.Errorf("tokenservice:Read: typ %q is not an access token's: %w", typ, domain.ErrInvalidToken)
	}
	kid, _ := headers.KeyID()
	if kid == "" {
		return nil, fmt.Errorf("tokenservice:Read: token names no kid: %w", domain.ErrInvalidToken)
	}

	set, err := svc.keys.Get(ctx, kid)
	if err != nil {
		return nil, fmt.Errorf("tokenservice:Read: %w", err)
	}

	token, err := jwt.Parse([]byte(rawToken),
		jwt.WithKeySet(set, jws.WithInferAlgorithmFromKey(true)),
		jwt.WithValidate(false))
	if err != nil {
		return nil, fmt.Errorf("tokenservice:Read: verify signature: %v: %w", err, domain.ErrInvalidToken)
	}

	err = jwt.Validate(token,
		jwt.WithClock(jwt.ClockFunc(svc.now)),
		jwt.WithAcceptableSkew(clockSkew),
		jwt.WithRequiredClaim(jwt.ExpirationKey),
		jwt.WithIssuer(svc.cfg.Issuer),
		jwt.WithAudience(svc.cfg.Audience),
		jwt.WithClaimValue("client_id", svc.cfg.ClientID))
	switch {
	case errors.Is(err, jwt.TokenExpiredError()):
		return nil, fmt.Errorf("tokenservice:Read: %v: %w", err, domain.ErrTokenExpired)
	case err != nil:
		return nil, fmt.Errorf("tokenservice:Read: %v: %w", err, domain.ErrInvalidToken)
	}

	// UP-DP checks no DPoP proof, so a sender-constrained token would pass as a bearer one.
	if token.Has("cnf") {
		return nil, fmt.Errorf("tokenservice:Read: token is sender-constrained (cnf): %w", domain.ErrInvalidToken)
	}

	var grantType string
	_ = token.Get("grant_type", &grantType)
	if !slices.Contains(userGrants, grantType) {
		return nil, fmt.Errorf("tokenservice:Read: grant_type %q is not a user's: %w", grantType, domain.ErrInvalidToken)
	}

	subject, _ := token.Subject()
	if subject == "" {
		return nil, fmt.Errorf("tokenservice:Read: token carries no subject: %w", domain.ErrInvalidToken)
	}

	// A scope that isn't the RFC 9068 space-separated string reads as no scopes, so the
	// caller is let in but may do nothing. Log it, or that reaches support as a 403.
	var scope string
	if err := token.Get("scope", &scope); err != nil && token.Has("scope") {
		logging.S(ctx).Warnw("token's scope claim is not a string, so the caller gets no scopes",
			"subject", subject, "error", err)
	}

	return &domain.TokenIdentity{
		UserID: subject,
		Scopes: strings.Fields(scope),
	}, nil
}
