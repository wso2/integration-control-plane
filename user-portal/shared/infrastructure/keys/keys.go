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
