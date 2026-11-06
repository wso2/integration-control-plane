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
	"regexp"
	"strings"
	"time"

	"github.com/wso2-enterprise/integration-user-portal-service/shared/common"
	ipaasportal "github.com/wso2-enterprise/integration-user-portal-service/shared/external-services/ipaas-portal"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/infrastructure/env"
)

// Version is set at build time from up-dp/VERSION.
var Version = "dev"

var hexColor = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

type Config struct {
	Addr            string
	Env             string
	Version         string
	LogHealthChecks bool
	SPADir          string
	Org             Org
	EnvironmentID   common.ID
	Portal          Portal
	OIDC            OIDC
	IPaaS           ipaasportal.Config
	Cache           CacheConfig
}

type Org struct {
	UUID   common.ID
	Handle string
	Name   string
}

type Portal struct {
	Name         string            `json:"portalName"`
	ProductName  string            `json:"productName"`
	Theme        string            `json:"theme"`
	PrimaryColor string            `json:"primaryColor,omitempty"`
	Links        map[string]string `json:"links"`
	Logo         Logo              `json:"logo"`
}

// Logo is the header's image per colour scheme. Empty, the SPA shows the bundled wordmark.
type Logo struct {
	Light string `json:"light,omitempty"`
	Dark  string `json:"dark,omitempty"`
}

type OIDC struct {
	Issuer   string
	ClientID string
	Resource string
	Scopes   string
}

type CacheConfig struct {
	Catalog      time.Duration
	CatalogStale time.Duration
	Scopes       time.Duration
}

// Load reads the whole environment once.
func Load(ctx context.Context) (Config, error) {
	l := env.NewLoader(ctx)

	orgUUID := l.String("ORG_UUID")
	environmentID := l.String("ENVIRONMENT_ID")

	cfg := Config{
		Addr:            l.String("ADDR", ":8080"),
		Env:             l.String("ENV", "Development"),
		Version:         Version,
		LogHealthChecks: l.Bool("LOG_HEALTH_CHECKS", false),
		SPADir:          l.String("SPA_DIR", "up-dp/web/dist"),
		Org: Org{
			Handle: l.String("ORG_HANDLE"),
			Name:   l.String("ORG_NAME", ""),
		},
		Portal: Portal{
			Name:         l.String("PORTAL_NAME", "User Portal"),
			ProductName:  l.String("PRODUCT_NAME", "Integration Platform"),
			Theme:        l.String("PORTAL_THEME", "acrylicOrange"),
			PrimaryColor: l.String("PORTAL_PRIMARY_COLOR", ""),
			Links: map[string]string{
				"terms":   l.String("PORTAL_TERMS_URL", "https://wso2.com/terms-of-use/"),
				"privacy": l.String("PORTAL_PRIVACY_URL", "https://wso2.com/privacy-policy/"),
				"support": l.String("PORTAL_SUPPORT_URL", ""),
			},
			Logo: Logo{
				Light: l.String("PORTAL_LOGO_LIGHT_URL", ""),
				Dark:  l.String("PORTAL_LOGO_DARK_URL", ""),
			},
		},
		OIDC: OIDC{
			Issuer:   l.String("OIDC_ISSUER"),
			ClientID: l.String("OIDC_CLIENT_ID"),
			Resource: l.String("OIDC_RESOURCE"),
			Scopes:   l.String("OIDC_SCOPES", "openid profile email roles"),
		},
		IPaaS: ipaasportal.Config{
			BaseURL:      strings.TrimSuffix(l.String("IPAAS_BASE_URL", "http://localhost:9090/user-portal"), "/"),
			TokenURL:     l.String("IPAAS_TOKEN_URL", "http://localhost:9100/oauth2/token"),
			ClientID:     l.String("IPAAS_CLIENT_ID"),
			ClientSecret: l.String("IPAAS_CLIENT_SECRET"),
			Scopes:       l.String("IPAAS_SCOPES", ""),
		},
		Cache: CacheConfig{
			Catalog:      l.Duration("CATALOG_CACHE_TTL", 30*time.Second),
			CatalogStale: l.Duration("CATALOG_STALE_TTL", 15*time.Minute),
			Scopes:       l.Duration("SCOPES_CACHE_TTL", 10*time.Minute),
		},
	}

	if l.Err() != nil {
		return Config{}, l.Err()
	}

	var err error
	if cfg.Org.UUID, err = common.ParseID(orgUUID); err != nil {
		return Config{}, fmt.Errorf("config:Load: ORG_UUID is not a uuid: %w", err)
	}
	if cfg.EnvironmentID, err = common.ParseID(environmentID); err != nil {
		return Config{}, fmt.Errorf("config:Load: ENVIRONMENT_ID is not a uuid: %w", err)
	}
	if cfg.Org.Name == "" {
		cfg.Org.Name = cfg.Org.Handle
	}

	if cfg.Portal.PrimaryColor != "" && !hexColor.MatchString(cfg.Portal.PrimaryColor) {
		return Config{}, fmt.Errorf("config:Load: PORTAL_PRIMARY_COLOR %q is not #RRGGBB", cfg.Portal.PrimaryColor)
	}

	// One logo set alone serves both schemes, rather than pairing it with the bundled wordmark.
	if cfg.Portal.Logo.Light == "" {
		cfg.Portal.Logo.Light = cfg.Portal.Logo.Dark
	}
	if cfg.Portal.Logo.Dark == "" {
		cfg.Portal.Logo.Dark = cfg.Portal.Logo.Light
	}

	return cfg, nil
}
