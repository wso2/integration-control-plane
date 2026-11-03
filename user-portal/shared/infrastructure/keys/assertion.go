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
	"fmt"
	"time"

	"github.com/lestrrat-go/jwx/v3/jwa"
	"github.com/lestrrat-go/jwx/v3/jwk"
	"github.com/lestrrat-go/jwx/v3/jwt"

	"github.com/wso2-enterprise/integration-user-portal-service/shared/common"
)

// assertionTTL bounds how long a captured assertion is replayable.
const assertionTTL = 60 * time.Second

// AssertionSigner hands out a signed client assertion for one organization
type AssertionSigner interface {
	// SignAssertion signs a private_key_jwt for one organization
	SignAssertion(clientID, audience string) (string, error)
}

type signer struct {
	key jwk.Key
	alg jwa.SignatureAlgorithm

	// now is injected so the assertion's lifetime is testable.
	now func() time.Time
}

func NewSigner(key jwk.Key, alg string) (AssertionSigner, error) {
	signatureAlg, ok := jwa.LookupSignatureAlgorithm(alg)
	if !ok {
		return nil, fmt.Errorf("keys:NewSigner: unknown signing algorithm %q", alg)
	}

	if signatureAlg == jwa.NoSignature() {
		return nil, fmt.Errorf("keys:NewSigner: signing algorithm %q is not allowed", alg)
	}

	if kid, ok := key.KeyID(); !ok || kid == "" {
		return nil, fmt.Errorf("keys:NewSigner: signing key carries no kid")
	}

	return &signer{key: key, alg: signatureAlg, now: time.Now}, nil
}

func (s *signer) SignAssertion(clientID, audience string) (string, error) {
	now := s.now()

	assertion, err := jwt.NewBuilder().
		Issuer(clientID).
		Subject(clientID).
		Audience([]string{audience}).
		JwtID(common.NewID().String()).
		IssuedAt(now).
		Expiration(now.Add(assertionTTL)).
		Build()
	if err != nil {
		return "", fmt.Errorf("keys:SignAssertion: build assertion: %w", err)
	}

	signed, err := jwt.Sign(assertion, jwt.WithKey(s.alg, s.key))
	if err != nil {
		return "", fmt.Errorf("keys:SignAssertion: sign assertion: %w", err)
	}

	return string(signed), nil
}
