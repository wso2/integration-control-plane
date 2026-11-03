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
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/pem"
	"math/big"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// testCertPEM is a self-signed certificate, generated per run
func testCertPEM(t *testing.T) []byte {
	t.Helper()

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)

	template := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject:      pkix.Name{CommonName: "sts.example"},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(24 * time.Hour),
	}

	der, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	require.NoError(t, err)

	return pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
}

func TestLoadCertificateReturnsTheEncodingAsgardeoWants(t *testing.T) {
	encoded := base64.StdEncoding.EncodeToString(testCertPEM(t))

	got, err := LoadCertificate(encoded)

	require.NoError(t, err)
	assert.Equal(t, encoded, got)
}

func TestLoadCertificateAcceptsUnpaddedBase64(t *testing.T) {
	pemBytes := testCertPEM(t)

	padded := base64.StdEncoding.EncodeToString(pemBytes)
	unpadded := base64.RawStdEncoding.EncodeToString(pemBytes)
	require.NotEqual(t, padded, unpadded, "this certificate needs padding, or the case proves nothing")

	got, err := LoadCertificate(unpadded)

	require.NoError(t, err)
	assert.Equal(t, unpadded, got)
}

func TestLoadCertificateIgnoresSurroundingWhitespace(t *testing.T) {
	encoded := base64.StdEncoding.EncodeToString(testCertPEM(t))

	got, err := LoadCertificate("  \n" + encoded + "\n\t")

	require.NoError(t, err)
	assert.Equal(t, encoded, got)
}

func TestLoadCertificateRejectsMalformedInput(t *testing.T) {
	privateKeyPEM := pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: []byte("whatever")})

	for _, tc := range []struct {
		name    string
		encoded string
	}{
		{name: "empty", encoded: ""},
		{name: "not base64", encoded: "this is not base64!!"},
		{name: "base64 of garbage", encoded: base64.StdEncoding.EncodeToString([]byte("not a pem at all"))},
		{name: "raw pem, not base64 encoded", encoded: string(testCertPEM(t))},
		// A private key must not pass as a certificate: it is the one paste that
		// would put secret material into a request body.
		{name: "a private key", encoded: base64.StdEncoding.EncodeToString(privateKeyPEM)},
		{name: "pem with an empty body", encoded: base64.StdEncoding.EncodeToString([]byte("-----BEGIN CERTIFICATE-----\n-----END CERTIFICATE-----\n"))},
		{name: "a certificate followed by a private key",
			encoded: base64.StdEncoding.EncodeToString(append(testCertPEM(t), privateKeyPEM...))},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := LoadCertificate(tc.encoded)

			require.Error(t, err)
			assert.Empty(t, got)
		})
	}
}
