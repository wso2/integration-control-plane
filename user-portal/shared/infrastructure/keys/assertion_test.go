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

package keys

import (
	"crypto/rand"
	"crypto/rsa"
	"testing"
	"time"

	"github.com/lestrrat-go/jwx/v3/jwa"
	"github.com/lestrrat-go/jwx/v3/jwk"
	"github.com/lestrrat-go/jwx/v3/jws"
	"github.com/lestrrat-go/jwx/v3/jwt"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const (
	testClientID = "tkx-client-id"
	testAudience = "https://api.asgardeo.io/t/acme/oauth2/token"
)

var testNow = time.Date(2026, 8, 10, 12, 0, 0, 0, time.UTC)

func newTestSigner(t *testing.T) (*signer, jwk.Key) {
	t.Helper()

	key, err := LoadSigningKey(testKeyEncoded(t))
	require.NoError(t, err)

	built, err := NewSigner(key, "RS256")
	require.NoError(t, err)

	s, ok := built.(*signer)
	require.True(t, ok)
	s.now = func() time.Time { return testNow }

	pub, err := key.PublicKey()
	require.NoError(t, err)

	return s, pub
}

func parseAssertion(t *testing.T, assertion string, pub jwk.Key) jwt.Token {
	t.Helper()

	token, err := jwt.Parse([]byte(assertion), jwt.WithKey(jwa.RS256(), pub), jwt.WithValidate(false))
	require.NoError(t, err)

	return token
}

func TestNewSignerRejectsUnusableAlgorithm(t *testing.T) {
	key, err := LoadSigningKey(testKeyEncoded(t))
	require.NoError(t, err)

	for _, alg := range []string{"", "RS255", "rs256", "none", "HS256 "} {
		t.Run(alg, func(t *testing.T) {
			s, err := NewSigner(key, alg)

			require.Error(t, err)
			assert.Nil(t, s)
		})
	}
}

func TestNewSignerRejectsKeyWithoutKeyID(t *testing.T) {
	// Parsed without LoadSigningKey, so no kid was assigned.
	key, err := jwk.ParseKey(testKeyPEM(t), jwk.WithPEM(true))
	require.NoError(t, err)

	s, err := NewSigner(key, "RS256")

	require.Error(t, err)
	assert.Nil(t, s)
}

func TestSignAssertionVerifiesAndCarriesTheExpectedClaims(t *testing.T) {
	s, pub := newTestSigner(t)

	assertion, err := s.SignAssertion(testClientID, testAudience)
	require.NoError(t, err)

	token := parseAssertion(t, assertion, pub)

	// iss == sub == the client id: the assertion authenticates the client, it does
	// not speak for a user.
	iss, ok := token.Issuer()
	require.True(t, ok)
	assert.Equal(t, testClientID, iss)

	sub, ok := token.Subject()
	require.True(t, ok)
	assert.Equal(t, testClientID, sub)

	aud, ok := token.Audience()
	require.True(t, ok)
	assert.Equal(t, []string{testAudience}, aud)

	iat, ok := token.IssuedAt()
	require.True(t, ok)
	assert.True(t, iat.Equal(testNow), "iat must come from the injected clock, not time.Now")

	jti, ok := token.JwtID()
	require.True(t, ok)
	assert.NotEmpty(t, jti)
}

func TestSignAssertionAudienceIsTheEndpointPassedIn(t *testing.T) {
	s, pub := newTestSigner(t)

	const otherAudience = "https://api.asgardeo.io/t/other-tenant/oauth2/token"

	first, err := s.SignAssertion(testClientID, testAudience)
	require.NoError(t, err)
	second, err := s.SignAssertion("other-client-id", otherAudience)
	require.NoError(t, err)

	firstAud, _ := parseAssertion(t, first, pub).Audience()
	secondAud, _ := parseAssertion(t, second, pub).Audience()

	assert.Equal(t, []string{testAudience}, firstAud)
	assert.Equal(t, []string{otherAudience}, secondAud)

	secondIss, _ := parseAssertion(t, second, pub).Issuer()
	assert.Equal(t, "other-client-id", secondIss)
}

func TestSignAssertionExpiresWithinSixtySeconds(t *testing.T) {
	s, pub := newTestSigner(t)

	assertion, err := s.SignAssertion(testClientID, testAudience)
	require.NoError(t, err)

	exp, ok := parseAssertion(t, assertion, pub).Expiration()
	require.True(t, ok, "an assertion with no exp never expires")

	assert.False(t, exp.After(testNow.Add(60*time.Second)), "exp must be at most 60s after the injected now")
	assert.True(t, exp.After(testNow), "exp must be in the future relative to the injected now")
}

func TestSignAssertionUsesAFreshJTIEachTime(t *testing.T) {
	s, pub := newTestSigner(t)

	first, err := s.SignAssertion(testClientID, testAudience)
	require.NoError(t, err)
	second, err := s.SignAssertion(testClientID, testAudience)
	require.NoError(t, err)

	firstJTI, _ := parseAssertion(t, first, pub).JwtID()
	secondJTI, _ := parseAssertion(t, second, pub).JwtID()

	require.NotEmpty(t, firstJTI)
	assert.NotEqual(t, firstJTI, secondJTI)
	assert.NotEqual(t, first, second, "the frozen clock must not make two assertions identical")
}

func TestSignAssertionSetsKeyIDInProtectedHeader(t *testing.T) {
	s, _ := newTestSigner(t)

	assertion, err := s.SignAssertion(testClientID, testAudience)
	require.NoError(t, err)

	msg, err := jws.Parse([]byte(assertion))
	require.NoError(t, err)
	require.Len(t, msg.Signatures(), 1)

	headers := msg.Signatures()[0].ProtectedHeaders()

	kid, ok := headers.KeyID()
	require.True(t, ok)

	wantKid, _ := s.key.KeyID()
	assert.Equal(t, wantKid, kid)
	assert.Equal(t, wantThumbprint(t, s.key), kid)

	alg, ok := headers.Algorithm()
	require.True(t, ok)
	assert.Equal(t, jwa.RS256().String(), alg.String())
}

func TestSignAssertionDoesNotVerifyAgainstAnotherKey(t *testing.T) {
	s, _ := newTestSigner(t)

	assertion, err := s.SignAssertion(testClientID, testAudience)
	require.NoError(t, err)

	unrelated, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	unrelatedPub, err := jwk.Import(unrelated.Public())
	require.NoError(t, err)

	_, err = jwt.Parse([]byte(assertion), jwt.WithKey(jwa.RS256(), unrelatedPub), jwt.WithValidate(false))
	assert.Error(t, err)
}
