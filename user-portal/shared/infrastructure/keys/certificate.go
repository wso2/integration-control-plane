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
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"fmt"
	"strings"
)

// LoadCertificate validates a base64-encoded PEM certificate.
// Only the encoding and the structure are checked.
func LoadCertificate(encoded string) (string, error) {
	trimmed := strings.TrimSpace(encoded)

	pemBytes, err := decodePaddedOrNot(trimmed)
	if err != nil {
		return "", fmt.Errorf("keys:LoadCertificate: decode base64: %w", err)
	}

	block, rest := pem.Decode(pemBytes)
	if block == nil {
		return "", fmt.Errorf("keys:LoadCertificate: no PEM block found")
	}
	if strings.TrimSpace(string(rest)) != "" {
		return "", fmt.Errorf("keys:LoadCertificate: multiple PEM blocks are not allowed")
	}
	if block.Type != "CERTIFICATE" {
		return "", fmt.Errorf("keys:LoadCertificate: PEM block is %q, not CERTIFICATE", block.Type)
	}

	if _, err := x509.ParseCertificate(block.Bytes); err != nil {
		return "", fmt.Errorf("keys:LoadCertificate: parse certificate: %w", err)
	}

	return trimmed, nil
}

func decodePaddedOrNot(encoded string) ([]byte, error) {
	if decoded, err := base64.StdEncoding.DecodeString(encoded); err == nil {
		return decoded, nil
	}
	return base64.RawStdEncoding.DecodeString(encoded)
}
