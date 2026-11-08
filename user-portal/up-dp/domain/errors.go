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

package domain

import "errors"

var ErrNotFound = errors.New("resource not found")

var ErrForbidden = errors.New("token lacks the scope for this operation")

var (
	ErrMalformedToken = errors.New("token is malformed")
	ErrTokenExpired   = errors.New("token is expired")
	ErrInvalidToken   = errors.New("token is not valid for this portal")
)

// ErrKeysUnavailable is the issuer's signing keys being out of reach, which says nothing
// about the token.
var ErrKeysUnavailable = errors.New("issuer signing keys are unavailable")

func IsTokenRejection(err error) bool {
	return errors.Is(err, ErrMalformedToken) || errors.Is(err, ErrTokenExpired) || errors.Is(err, ErrInvalidToken)
}
