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

import "context"

// TokenService verifies a bearer token and reads the caller from its claims.
type TokenService interface {
	Read(ctx context.Context, rawToken string) (*TokenIdentity, error)
}

// TokenIdentity is who the caller is, as the verified access token's claims say.
type TokenIdentity struct {
	UserID string
	Scopes []string
}
