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

package domain

// TokenService reads the caller from a bearer token the published environment's
// gateway has already verified.
type TokenService interface {
	Read(rawToken string) (*TokenIdentity, error)
}

// TokenIdentity is who the caller is, as the access token's claims say.
type TokenIdentity struct {
	UserID string
	Scopes []string
}
