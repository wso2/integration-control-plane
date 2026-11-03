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
