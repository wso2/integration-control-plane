/*
 * Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com). All Rights Reserved.
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein is strictly forbidden, unless permitted by WSO2 in accordance with
 * the WSO2 Commercial License available at http://wso2.com/licenses.
 * For specific language governing the permissions and limitations under
 * this license, please see the license as well as any agreement you've
 * entered into with WSO2 governing the purchase of this software and any
 * associated services.
 */

package service

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/wso2-enterprise/integration-user-portal-service/up-dp/domain"
)

const clockSkew = 30 * time.Second

// TokenService reads the claims of a token the gateway verified. It checks no
// signature: only the gateway can reach UP-DP.
type TokenService struct {
	// now is injected so expiry is testable
	now func() time.Time
}

func NewTokenService() domain.TokenService {
	return &TokenService{now: time.Now}
}

type accessTokenClaims struct {
	Subject string   `json:"sub"`
	Expiry  *float64 `json:"exp"`
	Scope   string   `json:"scope"`
}

// Read returns the identity rawToken's claims carry.
func (svc *TokenService) Read(rawToken string) (*domain.TokenIdentity, error) {
	parts := strings.Split(rawToken, ".")
	if len(parts) != 3 {
		return nil, fmt.Errorf("tokenservice:Read: token has %d parts, want 3: %w", len(parts), domain.ErrMalformedToken)
	}

	payload, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(parts[1], "="))
	if err != nil {
		return nil, fmt.Errorf("tokenservice:Read: decode payload: %w", domain.ErrMalformedToken)
	}

	var claims accessTokenClaims
	if err := json.Unmarshal(payload, &claims); err != nil {
		return nil, fmt.Errorf("tokenservice:Read: parse claims: %w", domain.ErrMalformedToken)
	}

	if claims.Subject == "" {
		return nil, fmt.Errorf("tokenservice:Read: token carries no subject: %w", domain.ErrMalformedToken)
	}

	if claims.Expiry == nil {
		return nil, fmt.Errorf("tokenservice:Read: token carries no exp: %w", domain.ErrMalformedToken)
	}
	expiry := time.Unix(int64(*claims.Expiry), 0)
	if !svc.now().Before(expiry.Add(clockSkew)) {
		return nil, fmt.Errorf("tokenservice:Read: token expired at %s: %w", expiry.UTC().Format(time.RFC3339), domain.ErrTokenExpired)
	}

	return &domain.TokenIdentity{
		UserID: claims.Subject,
		Scopes: strings.Fields(claims.Scope),
	}, nil
}
