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
package oidc

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"go.uber.org/zap"

	"github.com/wso2-enterprise/integration-user-portal-service/shared/infrastructure/httpclient"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/infrastructure/logging"
)

const serviceName = "oidc"

const requestTimeout = 5 * time.Second

// WellKnownSuffix is the OIDC Discovery 1.0 path.
const WellKnownSuffix = "/.well-known/openid-configuration"

// Metadata is the discovery document
type Metadata struct {
	Issuer                string `json:"issuer"`
	AuthorizationEndpoint string `json:"authorization_endpoint"`
	TokenEndpoint         string `json:"token_endpoint"`
	UserInfoEndpoint      string `json:"userinfo_endpoint"`
	JWKSURI               string `json:"jwks_uri"`
	RevocationEndpoint    string `json:"revocation_endpoint"`
	RegistrationEndpoint  string `json:"registration_endpoint"`
	EndSessionEndpoint    string `json:"end_session_endpoint"`
}

type Discovery interface {
	Discover(ctx context.Context, wellKnownURL string) (*Metadata, error)
}

type Client interface {
	Discovery

	FetchJWKS(ctx context.Context, jwksURI string) (json.RawMessage, error)
	ExchangeToken(ctx context.Context, tokenEndpoint string, form url.Values) (*TokenResponse, error)
	RedeemCode(ctx context.Context, tokenEndpoint string, form url.Values) (*TokenResponse, error)
	RefreshToken(ctx context.Context, tokenEndpoint string, form url.Values) (*TokenResponse, error)
	Revoke(ctx context.Context, revokeEndpoint string, form url.Values) error
}

type client struct {
	http *httpclient.Client
}

func NewClient(opts ...httpclient.Option) Client {
	base := []httpclient.Option{
		httpclient.WithServiceName(serviceName),
		httpclient.WithHTTPClient(&http.Client{CheckRedirect: refuseRedirect}),
		httpclient.WithTimeout(requestTimeout),
	}
	return &client{http: httpclient.New(append(base, opts...)...)}
}

func refuseRedirect(req *http.Request, _ []*http.Request) error {
	return fmt.Errorf("%s: refusing redirect to %s", serviceName, req.URL.Redacted())
}

func WellKnownFor(issuer string) string {
	return issuer + WellKnownSuffix
}

func IssuerForWellKnown(wellKnownURL string) (string, bool) {
	return strings.CutSuffix(wellKnownURL, WellKnownSuffix)
}

func AuthorizeURL(authorizeEndpoint string, q url.Values) string {
	if len(q) == 0 {
		return authorizeEndpoint
	}
	return authorizeEndpoint + "?" + q.Encode()
}

// Discover reads the document at wellKnownURL.
func (svc *client) Discover(ctx context.Context, wellKnownURL string) (*Metadata, error) {
	const operationName = "Discover"
	ctx = logging.With(ctx, zap.String("wellKnownUrl", wellKnownURL))

	metadata, err := httpclient.GetJSON[*Metadata](ctx, svc.http, operationName, wellKnownURL)
	if err != nil {
		return nil, err
	}
	if metadata == nil {
		return nil, fmt.Errorf("%s:%s: unexpected empty data in response", serviceName, operationName)
	}

	for _, required := range []struct{ name, value string }{
		{"issuer", metadata.Issuer},
		{"authorization_endpoint", metadata.AuthorizationEndpoint},
		{"token_endpoint", metadata.TokenEndpoint},
		{"jwks_uri", metadata.JWKSURI},
	} {
		if required.value == "" {
			return nil, fmt.Errorf("%s:%s: discovery document at %q has no %s",
				serviceName, operationName, wellKnownURL, required.name)
		}
	}

	return metadata, nil
}
