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
	"encoding/json"
	"fmt"

	"github.com/lestrrat-go/jwx/v3/jwk"
)

// PublishedSet is the public key set the IdP fetches to verify our client assertions
func PublishedSet(signingKeys ...jwk.Key) (json.RawMessage, error) {
	set := jwk.NewSet()

	for _, key := range signingKeys {
		public, err := key.PublicKey()
		if err != nil {
			return nil, fmt.Errorf("keys:PublishedSet: derive public key: %w", err)
		}
		if err := set.AddKey(public); err != nil {
			return nil, fmt.Errorf("keys:PublishedSet: add key to set: %w", err)
		}
	}

	if set.Len() == 0 {
		return nil, fmt.Errorf("keys:PublishedSet: no signing keys to publish")
	}

	raw, err := json.Marshal(set)
	if err != nil {
		return nil, fmt.Errorf("keys:PublishedSet: marshal key set: %w", err)
	}

	return raw, nil
}
