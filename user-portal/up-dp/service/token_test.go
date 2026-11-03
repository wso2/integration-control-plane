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
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/wso2-enterprise/integration-user-portal-service/up-dp/domain"
)

var testNow = time.Date(2026, 11, 1, 9, 0, 0, 0, time.UTC)

func newTestTokenService(now time.Time) *TokenService {
	svc := NewTokenService().(*TokenService)
	svc.now = func() time.Time { return now }
	return svc
}

// userToken is the claims of a ThunderID access token issued to a signed-in user.
// Each test edits the one claim it is about.
func userToken() map[string]any {
	return map[string]any{
		"iss":        "https://widp-dp.example",
		"sub":        "user-1",
		"aud":        "up-portal",
		"grant_type": "authorization_code",
		"scope":      "openid profile automation:trigger",
		"iat":        testNow.Add(-time.Minute).Unix(),
		"exp":        testNow.Add(time.Hour).Unix(),
	}
}

// encodeTestToken is a JWT of claims with a signature nothing checks.
func encodeTestToken(t *testing.T, claims map[string]any) string {
	t.Helper()

	payload, err := json.Marshal(claims)
	require.NoError(t, err)

	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"RS256","typ":"at+jwt","kid":"k1"}`))
	return header + "." + base64.RawURLEncoding.EncodeToString(payload) + ".c2lnbmF0dXJl"
}

func TestReadReturnsTheCallerTheClaimsName(t *testing.T) {
	identity, err := newTestTokenService(testNow).Read(encodeTestToken(t, userToken()))

	require.NoError(t, err)
	assert.Equal(t, &domain.TokenIdentity{
		UserID: "user-1",
		Scopes: []string{"openid", "profile", "automation:trigger"},
	}, identity)
}

func TestReadWithoutScope(t *testing.T) {
	claims := userToken()
	delete(claims, "scope")

	identity, err := newTestTokenService(testNow).Read(encodeTestToken(t, claims))

	require.NoError(t, err)
	assert.Empty(t, identity.Scopes)
}

func TestReadAcceptsATokenWithinTheClockSkew(t *testing.T) {
	claims := userToken()
	claims["exp"] = testNow.Add(-clockSkew / 2).Unix()

	_, err := newTestTokenService(testNow).Read(encodeTestToken(t, claims))

	assert.NoError(t, err)
}

func TestReadRejects(t *testing.T) {
	for name, tc := range map[string]struct {
		token func(t *testing.T) string
		want  error
	}{
		"an empty token": {token: func(*testing.T) string { return "" }, want: domain.ErrMalformedToken},
		"two parts":      {token: func(*testing.T) string { return "a.b" }, want: domain.ErrMalformedToken},
		"a payload that is not base64url": {
			token: func(*testing.T) string { return "e30.!!!.c2ln" }, want: domain.ErrMalformedToken,
		},
		"a payload that is not JSON": {
			token: func(*testing.T) string {
				return "e30." + base64.RawURLEncoding.EncodeToString([]byte("nope")) + ".c2ln"
			},
			want: domain.ErrMalformedToken,
		},
		"no subject": {
			token: func(t *testing.T) string { c := userToken(); delete(c, "sub"); return encodeTestToken(t, c) },
			want:  domain.ErrMalformedToken,
		},
		"an empty subject": {
			token: func(t *testing.T) string { c := userToken(); c["sub"] = ""; return encodeTestToken(t, c) },
			want:  domain.ErrMalformedToken,
		},
		"no exp": {
			token: func(t *testing.T) string { c := userToken(); delete(c, "exp"); return encodeTestToken(t, c) },
			want:  domain.ErrMalformedToken,
		},
		"an expired token": {
			token: func(t *testing.T) string {
				c := userToken()
				c["exp"] = testNow.Add(-time.Hour).Unix()
				return encodeTestToken(t, c)
			},
			want: domain.ErrTokenExpired,
		},
	} {
		t.Run(name, func(t *testing.T) {
			_, err := newTestTokenService(testNow).Read(tc.token(t))

			assert.ErrorIs(t, err, tc.want)
			assert.True(t, domain.IsTokenRejection(err))
		})
	}
}
