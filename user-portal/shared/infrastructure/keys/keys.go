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
	"encoding/base64"
	"fmt"
	"strings"

	"github.com/lestrrat-go/jwx/v3/jwk"
)

// LoadSigningKey decodes a base64-encoded PEM private key and derives its kid.
func LoadSigningKey(encoded string) (jwk.Key, error) {
	pemBytes, err := base64.StdEncoding.DecodeString(strings.TrimSpace(encoded))
	if err != nil {
		return nil, fmt.Errorf("keys:LoadSigningKey: decode base64: %w", err)
	}

	key, err := jwk.ParseKey(pemBytes, jwk.WithPEM(true))
	if err != nil {
		return nil, fmt.Errorf("keys:LoadSigningKey: parse signing key: %w", err)
	}

	if err := jwk.AssignKeyID(key, jwk.WithForceAssign(true)); err != nil {
		return nil, fmt.Errorf("keys:LoadSigningKey: assign key id: %w", err)
	}

	return key, nil
}
