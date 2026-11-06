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

package config

import (
	"context"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/wso2-enterprise/integration-user-portal-service/shared/common"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/infrastructure/env"
)

// PortalClientPrefix starts a portal client's ID, which is this prefix and its org's UUID,
// as core's UserPortalClientID names it.
const PortalClientPrefix = "wc-user-portal-"

type Config struct {
	Org Org

	IdP     IdPConfig
	Portal  PortalConfig
	Gateway GatewayConfig
}

// Org is the one organization the mock serves.
type Org struct {
	UUID   common.ID
	Handle string
	Name   string
}

type IdPConfig struct {
	Addr string

	// Issuer is the iss of every token, and the public origin of the token endpoint.
	Issuer       string
	ClientID     string
	ClientSecret string
	TokenTTL     time.Duration
}

type PortalConfig struct {
	Addr string

	// Audience is the aud the portal routes require.
	Audience string

	// RunDuration is how long a triggered automation runs before it finishes.
	RunDuration time.Duration
}

type GatewayConfig struct {
	Addr string

	// URL is the public origin endpoint URLs are built on.
	URL string

	AllowedOrigins []string

	// JWKSURL, when set, makes the gateway verify bearer tokens. Without it a
	// token is only read.
	JWKSURL     string
	Issuer      string
	InsecureTLS bool

	// UPDPUpstream is UP-DP, which the gateway fronts at every path that is not
	// an agent's or a workflow's.
	UPDPUpstream *url.URL

	// Audiences are the aud values a token for UP-DP may carry. None accepts any.
	Audiences []string

	// StepDuration is how long one workflow step runs.
	StepDuration time.Duration
}

func Load(ctx context.Context) (Config, error) {
	l := env.NewLoader(ctx)

	orgUUID := l.String("MOCK_ORG_UUID", "8f7c2a0e-4d1b-4c6a-9b3e-2f5d7a1c9e40")
	upDPUpstream := l.String("UP_DP_UPSTREAM", "http://localhost:8080")
	cfg := Config{
		Org: Org{
			Handle: l.String("MOCK_ORG_HANDLE", "acme"),
			Name:   l.String("MOCK_ORG_NAME", "Acme Corporation"),
		},
		IdP: IdPConfig{
			Addr:         l.String("MOCK_IDP_ADDR", ":9100"),
			Issuer:       l.String("MOCK_IDP_ISSUER", "http://localhost:9100"),
			ClientID:     l.String("MOCK_PORTAL_CLIENT_ID", PortalClientPrefix+orgUUID),
			ClientSecret: l.String("MOCK_PORTAL_CLIENT_SECRET", "portal-client-secret"),
			TokenTTL:     l.Duration("MOCK_TOKEN_TTL", time.Hour),
		},
		Portal: PortalConfig{
			Addr:        l.String("MOCK_IPAAS_ADDR", ":9090"),
			Audience:    l.String("MOCK_IPAAS_AUDIENCE", "ipaas-service"),
			RunDuration: l.Duration("MOCK_RUN_DURATION", 8*time.Second),
		},
		Gateway: GatewayConfig{
			Addr:           l.String("MOCK_GATEWAY_ADDR", ":9200"),
			URL:            l.String("GATEWAY_URL", "http://localhost:9200"),
			AllowedOrigins: l.Strings("GATEWAY_ALLOWED_ORIGINS", []string{"http://localhost:8080", "http://localhost:5173"}),
			JWKSURL:        l.String("GATEWAY_JWKS_URL", ""),
			Issuer:         l.String("GATEWAY_ISSUER", ""),
			InsecureTLS:    l.Bool("GATEWAY_INSECURE_TLS", false),
			Audiences:      l.Strings("GATEWAY_AUDIENCES", []string{}),
			StepDuration:   l.Duration("MOCK_STEP_DURATION", 4*time.Second),
		},
	}

	if l.Err() != nil {
		return Config{}, l.Err()
	}

	id, err := common.ParseID(orgUUID)
	if err != nil {
		return Config{}, fmt.Errorf("config:Load: MOCK_ORG_UUID is not a uuid: %w", err)
	}
	cfg.Org.UUID = id

	// iPaaS-Service admits only the org's own portal client, so any other ID would get 403
	// on every call.
	if want := PortalClientPrefix + orgUUID; cfg.IdP.ClientID != want {
		return Config{}, fmt.Errorf("config:Load: MOCK_PORTAL_CLIENT_ID must be %q", want)
	}

	cfg.Gateway.URL = strings.TrimSuffix(cfg.Gateway.URL, "/")

	upstream, err := url.Parse(upDPUpstream)
	if err != nil || (upstream.Scheme != "http" && upstream.Scheme != "https") || upstream.Host == "" {
		return Config{}, fmt.Errorf("config:Load: UP_DP_UPSTREAM %q is not a URL like http://localhost:8080", upDPUpstream)
	}
	cfg.Gateway.UPDPUpstream = upstream

	return cfg, nil
}
