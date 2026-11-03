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

package oidcmock

import (
	"context"
	"encoding/json"
	"net/url"

	"github.com/wso2-enterprise/integration-user-portal-service/shared/external-services/oidc"
)

// Mock satisfies oidc.Client, and therefore oidc.Discovery too: a suite that only
// discovers sets DiscoverFunc and leaves the rest nil.
type Mock struct {
	DiscoverFunc      func(ctx context.Context, wellKnownURL string) (*oidc.Metadata, error)
	FetchJWKSFunc     func(ctx context.Context, jwksURI string) (json.RawMessage, error)
	ExchangeTokenFunc func(ctx context.Context, tokenEndpoint string, form url.Values) (*oidc.TokenResponse, error)
	RedeemCodeFunc    func(ctx context.Context, tokenEndpoint string, form url.Values) (*oidc.TokenResponse, error)
	RefreshTokenFunc  func(ctx context.Context, tokenEndpoint string, form url.Values) (*oidc.TokenResponse, error)
	RevokeFunc        func(ctx context.Context, revokeEndpoint string, form url.Values) error

	// records method names in invocation order, for ordering assertions
	Calls []string
}

func (m *Mock) Discover(ctx context.Context, wellKnownURL string) (*oidc.Metadata, error) {
	m.Calls = append(m.Calls, "Discover")
	if m.DiscoverFunc == nil {
		return nil, nil
	}
	return m.DiscoverFunc(ctx, wellKnownURL)
}

func (m *Mock) FetchJWKS(ctx context.Context, jwksURI string) (json.RawMessage, error) {
	m.Calls = append(m.Calls, "FetchJWKS")
	if m.FetchJWKSFunc == nil {
		return nil, nil
	}
	return m.FetchJWKSFunc(ctx, jwksURI)
}

func (m *Mock) ExchangeToken(ctx context.Context, tokenEndpoint string, form url.Values) (*oidc.TokenResponse, error) {
	m.Calls = append(m.Calls, "ExchangeToken")
	if m.ExchangeTokenFunc == nil {
		return nil, nil
	}
	return m.ExchangeTokenFunc(ctx, tokenEndpoint, form)
}

func (m *Mock) RedeemCode(ctx context.Context, tokenEndpoint string, form url.Values) (*oidc.TokenResponse, error) {
	m.Calls = append(m.Calls, "RedeemCode")
	if m.RedeemCodeFunc == nil {
		return nil, nil
	}
	return m.RedeemCodeFunc(ctx, tokenEndpoint, form)
}

func (m *Mock) RefreshToken(ctx context.Context, tokenEndpoint string, form url.Values) (*oidc.TokenResponse, error) {
	m.Calls = append(m.Calls, "RefreshToken")
	if m.RefreshTokenFunc == nil {
		return nil, nil
	}
	return m.RefreshTokenFunc(ctx, tokenEndpoint, form)
}

func (m *Mock) Revoke(ctx context.Context, revokeEndpoint string, form url.Values) error {
	m.Calls = append(m.Calls, "Revoke")
	if m.RevokeFunc == nil {
		return nil
	}
	return m.RevokeFunc(ctx, revokeEndpoint, form)
}

var (
	_ oidc.Client    = (*Mock)(nil)
	_ oidc.Discovery = (*Mock)(nil)
)
