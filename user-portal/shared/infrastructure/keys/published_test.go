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

package keys

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"testing"

	"github.com/lestrrat-go/jwx/v3/jwk"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// otherSigningKey loads a second key, so "two slots" means two distinct keys.
func otherSigningKey(t *testing.T) jwk.Key {
	t.Helper()

	other, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	der, err := x509.MarshalPKCS8PrivateKey(other)
	require.NoError(t, err)
	encoded := base64.StdEncoding.EncodeToString(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}))

	key, err := LoadSigningKey(encoded)
	require.NoError(t, err)
	return key
}

// The private parameters of an RSA key. Publishing any one of them hands anyone
// the ability to authenticate as the token-exchange client in every tenant, so
// this assertion is the one in the package that must never be relaxed.
var privateParams = []string{"d", "p", "q", "dp", "dq", "qi"}

func TestPublishedSetCarriesNoPrivateParameters(t *testing.T) {
	key, err := LoadSigningKey(testKeyEncoded(t))
	require.NoError(t, err)

	raw, err := PublishedSet(key)
	require.NoError(t, err)

	set, err := jwk.Parse(raw)
	require.NoError(t, err)
	require.Equal(t, 1, set.Len())

	published, ok := set.Key(0)
	require.True(t, ok)
	for _, param := range privateParams {
		assert.False(t, published.Has(param), "the published document must not carry %q", param)
	}
	assert.NotContains(t, string(raw), `"d"`)
}

// The kid survives onto the public half: it is what the IdP selects by
func TestPublishedSetKeepsTheDerivedKeyID(t *testing.T) {
	key, err := LoadSigningKey(testKeyEncoded(t))
	require.NoError(t, err)
	wantKid, ok := key.KeyID()
	require.True(t, ok)

	raw, err := PublishedSet(key)
	require.NoError(t, err)

	set, err := jwk.Parse(raw)
	require.NoError(t, err)
	published, ok := set.Key(0)
	require.True(t, ok)

	gotKid, ok := published.KeyID()
	require.True(t, ok)
	assert.Equal(t, wantKid, gotKid)
}

func TestPublishedSetServesBothSlotsWithDistinctKeyIDs(t *testing.T) {
	primary, err := LoadSigningKey(testKeyEncoded(t))
	require.NoError(t, err)
	secondary := otherSigningKey(t)

	raw, err := PublishedSet(primary, secondary)
	require.NoError(t, err)

	set, err := jwk.Parse(raw)
	require.NoError(t, err)
	require.Equal(t, 2, set.Len())

	first, _ := set.Key(0)
	second, _ := set.Key(1)
	firstKid, _ := first.KeyID()
	secondKid, _ := second.KeyID()
	assert.NotEqual(t, firstKid, secondKid)
}

func TestPublishedSetRejectsAnEmptyKeySet(t *testing.T) {
	raw, err := PublishedSet()

	require.Error(t, err)
	assert.Nil(t, raw)
}
