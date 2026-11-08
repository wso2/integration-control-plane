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
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"testing"
	"time"

	"github.com/lestrrat-go/jwx/v3/jwa"
	"github.com/lestrrat-go/jwx/v3/jwk"
	"github.com/lestrrat-go/jwx/v3/jws"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	"go.uber.org/zap/zaptest/observer"

	"github.com/wso2-enterprise/integration-user-portal-service/shared/infrastructure/logging"
	"github.com/wso2-enterprise/integration-user-portal-service/up-dp/domain"
)

var testNow = time.Date(2026, 11, 1, 9, 0, 0, 0, time.UTC)

const (
	testIssuer   = "https://widp-dp.example/oauth2/token"
	testAudience = "urn:integration:user-portal"
	testKid      = "k1"
	testClientID = "INTEGRATION_USER_PORTAL"
)

// signer is an issuer's private key, and the public key set it publishes.
type signer struct {
	private jwk.Key
	public  jwk.Set
}

func newSigner(t *testing.T, kid string) signer {
	t.Helper()

	raw, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	private, err := jwk.Import(raw)
	require.NoError(t, err)
	require.NoError(t, private.Set(jwk.KeyIDKey, kid))

	// ThunderID publishes its keys without alg, so the verifier must infer it.
	public, err := jwk.PublicKeyOf(private)
	require.NoError(t, err)
	set := jwk.NewSet()
	require.NoError(t, set.AddKey(public))

	return signer{private: private, public: set}
}

// sign is a compact JWS of claims, signed with RS256 and the signer's kid, typed as an
// access token.
func (s signer) sign(t *testing.T, claims map[string]any) string {
	t.Helper()
	return s.signTyped(t, claims, "at+jwt")
}

// signTyped is sign with typ in the header, or none when typ is empty.
func (s signer) signTyped(t *testing.T, claims map[string]any, typ string) string {
	t.Helper()

	payload, err := json.Marshal(claims)
	require.NoError(t, err)
	headers := jws.NewHeaders()
	if typ != "" {
		require.NoError(t, headers.Set(jws.TypeKey, typ))
	}
	signed, err := jws.Sign(payload, jws.WithKey(jwa.RS256(), s.private, jws.WithProtectedHeaders(headers)))
	require.NoError(t, err)
	return string(signed)
}

// staticKeys answers one key set, or err.
type staticKeys struct {
	set jwk.Set
	err error
}

func (k staticKeys) Get(context.Context, string) (jwk.Set, error) { return k.set, k.err }

func newTestTokenService(keys KeyProvider) *TokenService {
	svc := NewTokenService(TokenConfig{Issuer: testIssuer, Audience: testAudience, ClientID: testClientID}, keys).(*TokenService)
	svc.now = func() time.Time { return testNow }
	return svc
}

// userToken is the claims of a ThunderID access token issued to a signed-in user.
// Each test edits the one claim it is about.
func userToken() map[string]any {
	return map[string]any{
		"iss":        testIssuer,
		"sub":        "user-1",
		"aud":        testAudience,
		"client_id":  testClientID,
		"grant_type": "authorization_code",
		"scope":      "openid profile automation:trigger",
		"iat":        testNow.Add(-time.Minute).Unix(),
		"exp":        testNow.Add(time.Hour).Unix(),
	}
}

func TestReadReturnsTheCallerAVerifiedTokenNames(t *testing.T) {
	s := newSigner(t, testKid)

	identity, err := newTestTokenService(staticKeys{set: s.public}).Read(context.Background(), s.sign(t, userToken()))

	require.NoError(t, err)
	assert.Equal(t, &domain.TokenIdentity{
		UserID: "user-1",
		Scopes: []string{"openid", "profile", "automation:trigger"},
	}, identity)
}

func TestReadAcceptsTheMediaTypeFormOfTyp(t *testing.T) {
	s := newSigner(t, testKid)

	_, err := newTestTokenService(staticKeys{set: s.public}).Read(context.Background(), s.signTyped(t, userToken(), "application/AT+JWT"))

	assert.NoError(t, err)
}

func TestReadDoesNotFetchKeysForAnotherTokenType(t *testing.T) {
	s := newSigner(t, testKid)
	keys := &recordingKeys{set: s.public}

	_, err := newTestTokenService(keys).Read(context.Background(), s.signTyped(t, userToken(), "JWT"))

	assert.ErrorIs(t, err, domain.ErrInvalidToken)
	assert.Empty(t, keys.kids)
}

func TestReadAsksForTheKeysByTheTokensKid(t *testing.T) {
	s := newSigner(t, "rotated")
	keys := &recordingKeys{set: s.public}

	_, err := newTestTokenService(keys).Read(context.Background(), s.sign(t, userToken()))

	require.NoError(t, err)
	assert.Equal(t, []string{"rotated"}, keys.kids)
}

func TestReadAccepts(t *testing.T) {
	for name, edit := range map[string]func(map[string]any){
		"no scope":                      func(c map[string]any) { delete(c, "scope") },
		"the audience among others":     func(c map[string]any) { c["aud"] = []string{"other", testAudience} },
		"a token within the clock skew": func(c map[string]any) { c["exp"] = testNow.Add(-clockSkew / 2).Unix() },
	} {
		t.Run(name, func(t *testing.T) {
			s := newSigner(t, testKid)
			claims := userToken()
			edit(claims)

			_, err := newTestTokenService(staticKeys{set: s.public}).Read(context.Background(), s.sign(t, claims))

			assert.NoError(t, err)
		})
	}
}

func TestReadLogsAScopeThatIsNotAString(t *testing.T) {
	core, logs := observer.New(zap.WarnLevel)
	ctx := logging.WithLogger(context.Background(), zap.New(core))
	s := newSigner(t, testKid)
	claims := userToken()
	claims["scope"] = []string{"automation:trigger"}

	identity, err := newTestTokenService(staticKeys{set: s.public}).Read(ctx, s.sign(t, claims))

	require.NoError(t, err)
	assert.Empty(t, identity.Scopes)
	require.Equal(t, 1, logs.Len())
	assert.Contains(t, logs.All()[0].Message, "scope claim is not a string")
}

func TestReadDoesNotLogAMissingScope(t *testing.T) {
	core, logs := observer.New(zap.WarnLevel)
	ctx := logging.WithLogger(context.Background(), zap.New(core))
	s := newSigner(t, testKid)
	claims := userToken()
	delete(claims, "scope")

	_, err := newTestTokenService(staticKeys{set: s.public}).Read(ctx, s.sign(t, claims))

	require.NoError(t, err)
	assert.Zero(t, logs.Len())
}

func TestReadRejects(t *testing.T) {
	s := newSigner(t, testKid)
	other := newSigner(t, testKid)
	with := func(edit func(map[string]any)) func(*testing.T) string {
		return func(t *testing.T) string { c := userToken(); edit(c); return s.sign(t, c) }
	}

	for name, tc := range map[string]struct {
		token func(t *testing.T) string
		want  error
	}{
		"an empty token":   {token: func(*testing.T) string { return "" }, want: domain.ErrMalformedToken},
		"two parts":        {token: func(*testing.T) string { return "a.b" }, want: domain.ErrMalformedToken},
		"a garbled header": {token: func(*testing.T) string { return "!!!.e30.c2ln" }, want: domain.ErrMalformedToken},
		"another key's signature": {
			token: func(t *testing.T) string { return other.sign(t, userToken()) }, want: domain.ErrInvalidToken,
		},
		"an unsigned token": {
			token: func(t *testing.T) string {
				payload, err := json.Marshal(userToken())
				require.NoError(t, err)
				return base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"none","kid":"k1"}`)) + "." +
					base64.RawURLEncoding.EncodeToString(payload) + "."
			},
			want: domain.ErrInvalidToken,
		},
		"another issuer":             {token: with(func(c map[string]any) { c["iss"] = "https://other.example" }), want: domain.ErrInvalidToken},
		"another audience":           {token: with(func(c map[string]any) { c["aud"] = "other" }), want: domain.ErrInvalidToken},
		"no audience":                {token: with(func(c map[string]any) { delete(c, "aud") }), want: domain.ErrInvalidToken},
		"no exp":                     {token: with(func(c map[string]any) { delete(c, "exp") }), want: domain.ErrInvalidToken},
		"an expired token":           {token: with(func(c map[string]any) { c["exp"] = testNow.Add(-time.Hour).Unix() }), want: domain.ErrTokenExpired},
		"a token not yet valid":      {token: with(func(c map[string]any) { c["nbf"] = testNow.Add(time.Hour).Unix() }), want: domain.ErrInvalidToken},
		"a client-credentials token": {token: with(func(c map[string]any) { c["grant_type"] = "client_credentials" }), want: domain.ErrInvalidToken},
		"no grant_type":              {token: with(func(c map[string]any) { delete(c, "grant_type") }), want: domain.ErrInvalidToken},
		"no subject":                 {token: with(func(c map[string]any) { delete(c, "sub") }), want: domain.ErrInvalidToken},
		"another app's token":        {token: with(func(c map[string]any) { c["client_id"] = "some-other-app" }), want: domain.ErrInvalidToken},
		"no client_id":               {token: with(func(c map[string]any) { delete(c, "client_id") }), want: domain.ErrInvalidToken},
		// ThunderID gives a refreshed token its original grant's grant_type.
		"a refresh_token grant": {token: with(func(c map[string]any) { c["grant_type"] = "refresh_token" }), want: domain.ErrInvalidToken},
		"no kid": {
			token: func(t *testing.T) string { return withoutKid(t, s).sign(t, userToken()) }, want: domain.ErrInvalidToken,
		},
		"a kid the key set lacks": {
			token: func(t *testing.T) string { return newSigner(t, "k2").sign(t, userToken()) }, want: domain.ErrInvalidToken,
		},
		"an iat in the future": {
			token: with(func(c map[string]any) { c["iat"] = testNow.Add(time.Hour).Unix() }), want: domain.ErrInvalidToken,
		},
		"HS256 keyed with the RSA public key": {
			token: func(t *testing.T) string { return hmacWithPublicKey(t, s, userToken()) }, want: domain.ErrInvalidToken,
		},
		"a DPoP-bound token": {
			token: with(func(c map[string]any) {
				c["cnf"] = map[string]any{"jkt": "0ZcOCORZNYy-DWpqq30jZyJGHTN0d2HglBV3uiguA4I"}
			}),
			want: domain.ErrInvalidToken,
		},
		"an ID token's typ": {
			token: func(t *testing.T) string { return s.signTyped(t, userToken(), "JWT") }, want: domain.ErrInvalidToken,
		},
		"no typ": {
			token: func(t *testing.T) string { return s.signTyped(t, userToken(), "") }, want: domain.ErrInvalidToken,
		},
	} {
		t.Run(name, func(t *testing.T) {
			_, err := newTestTokenService(staticKeys{set: s.public}).Read(context.Background(), tc.token(t))

			assert.ErrorIs(t, err, tc.want)
			assert.True(t, domain.IsTokenRejection(err))
		})
	}
}

func TestReadDoesNotFetchKeysWithoutAKid(t *testing.T) {
	keys := &recordingKeys{set: newSigner(t, testKid).public}

	_, err := newTestTokenService(keys).Read(context.Background(), withoutKid(t, newSigner(t, testKid)).sign(t, userToken()))

	assert.ErrorIs(t, err, domain.ErrInvalidToken)
	assert.Empty(t, keys.kids)
}

// withoutKid is s with its private key's kid removed, so its tokens name none.
func withoutKid(t *testing.T, s signer) signer {
	t.Helper()

	private, err := s.private.Clone()
	require.NoError(t, err)
	require.NoError(t, private.Remove(jwk.KeyIDKey))
	return signer{private: private, public: s.public}
}

// hmacWithPublicKey signs claims with HS256, keyed with the PEM of s's public key: the
// algorithm-confusion attack on a verifier that takes alg from the token.
func hmacWithPublicKey(t *testing.T, s signer, claims map[string]any) string {
	t.Helper()

	public, ok := s.public.Key(0)
	require.True(t, ok)
	var raw rsa.PublicKey
	require.NoError(t, jwk.Export(public, &raw))
	der, err := x509.MarshalPKIXPublicKey(&raw)
	require.NoError(t, err)
	secret := pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: der})

	payload, err := json.Marshal(claims)
	require.NoError(t, err)
	headers := jws.NewHeaders()
	require.NoError(t, headers.Set(jws.TypeKey, "at+jwt"))
	require.NoError(t, headers.Set(jws.KeyIDKey, testKid))
	signed, err := jws.Sign(payload, jws.WithKey(jwa.HS256(), secret, jws.WithProtectedHeaders(headers)))
	require.NoError(t, err)
	return string(signed)
}

func TestReadWithoutKeysIsNotARejection(t *testing.T) {
	s := newSigner(t, testKid)
	keys := staticKeys{err: errors.Join(domain.ErrKeysUnavailable, errors.New("issuer down"))}

	_, err := newTestTokenService(keys).Read(context.Background(), s.sign(t, userToken()))

	assert.ErrorIs(t, err, domain.ErrKeysUnavailable)
	assert.False(t, domain.IsTokenRejection(err))
}

// recordingKeys answers one key set and records the kids it was asked for.
type recordingKeys struct {
	set  jwk.Set
	kids []string
}

func (k *recordingKeys) Get(_ context.Context, kid string) (jwk.Set, error) {
	k.kids = append(k.kids, kid)
	return k.set, nil
}
