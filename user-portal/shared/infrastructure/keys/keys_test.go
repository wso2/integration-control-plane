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
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"strings"
	"sync"
	"testing"

	"github.com/lestrrat-go/jwx/v3/jwk"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// generatedKey caches one generated key for the whole package
var generatedKey = sync.OnceValue(func() *rsa.PrivateKey {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		panic(err)
	}
	return key
})

// testKeyPEM returns a private key as a PEM.
func testKeyPEM(t *testing.T) []byte {
	t.Helper()

	der, err := x509.MarshalPKCS8PrivateKey(generatedKey())
	require.NoError(t, err)

	return pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der})
}

func testKeyEncoded(t *testing.T) string {
	t.Helper()

	return base64.StdEncoding.EncodeToString(testKeyPEM(t))
}

// wantThumbprint is the RFC 7638 kid LoadSigningKey must derive.
func wantThumbprint(t *testing.T, key jwk.Key) string {
	t.Helper()

	sum, err := key.Thumbprint(crypto.SHA256)
	require.NoError(t, err)

	return base64.RawURLEncoding.EncodeToString(sum)
}

func TestLoadSigningKeyDerivesThumbprintKeyID(t *testing.T) {
	key, err := LoadSigningKey(testKeyEncoded(t))

	require.NoError(t, err)

	kid, ok := key.KeyID()
	require.True(t, ok, "the assertion must always carry a kid, so the key must always have one")
	assert.Equal(t, wantThumbprint(t, key), kid)

	// The private half has to survive the round trip, or nothing can be signed.
	assert.True(t, key.Has("d"), "the parsed key must be the private key")
}

// The same key always derives the same kid, and a different key a different one.
// That property is what makes a derived kid safe to publish and impossible to
// leave stale after a rotation.
func TestLoadSigningKeyIDIsStablePerKey(t *testing.T) {
	first, err := LoadSigningKey(testKeyEncoded(t))
	require.NoError(t, err)
	again, err := LoadSigningKey(testKeyEncoded(t))
	require.NoError(t, err)

	firstKid, _ := first.KeyID()
	againKid, _ := again.KeyID()
	assert.Equal(t, firstKid, againKid)

	other, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	der, err := x509.MarshalPKCS8PrivateKey(other)
	require.NoError(t, err)
	otherPEM := pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der})

	otherKey, err := LoadSigningKey(base64.StdEncoding.EncodeToString(otherPEM))
	require.NoError(t, err)

	otherKid, _ := otherKey.KeyID()
	assert.NotEqual(t, firstKid, otherKid)
}

// An env var picks up a trailing newline on the way through .env files and k8s
// manifests, which would otherwise make a correct key a boot failure.
func TestLoadSigningKeyIgnoresSurroundingWhitespace(t *testing.T) {
	_, err := LoadSigningKey("\n  " + testKeyEncoded(t) + "  \n")

	assert.NoError(t, err)
}

func TestLoadSigningKeyRejectsMalformedInput(t *testing.T) {
	tests := []struct {
		name    string
		encoded string
	}{
		{name: "empty", encoded: ""},
		{name: "not base64", encoded: "this is not base64!!"},
		{name: "base64 of garbage", encoded: base64.StdEncoding.EncodeToString([]byte("not a pem at all"))},
		{name: "raw pem, not base64 encoded", encoded: string(testKeyPEM(t))},
		{name: "pem with an empty body", encoded: base64.StdEncoding.EncodeToString([]byte("-----BEGIN PRIVATE KEY-----\n-----END PRIVATE KEY-----\n"))},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			key, err := LoadSigningKey(tt.encoded)

			require.Error(t, err)
			assert.Nil(t, key)
		})
	}
}

// A parse error must never carry the input
func TestLoadSigningKeyErrorCarriesNoKeyMaterial(t *testing.T) {
	encoded := testKeyEncoded(t)

	truncated := encoded[:len(encoded)-40]

	_, err := LoadSigningKey(truncated)

	require.Error(t, err)
	assert.NotContains(t, err.Error(), truncated)
	assert.NotContains(t, err.Error(), "PRIVATE KEY")

	body := strings.ReplaceAll(string(testKeyPEM(t)), "\n", "")
	assert.NotContains(t, err.Error(), body[40:80])
}
