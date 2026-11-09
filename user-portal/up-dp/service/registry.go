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

package service

import (
	"github.com/wso2-enterprise/integration-user-portal-service/shared/external-services/ipaas-portal"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/external-services/oidc"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/infrastructure/httpclient"
	"github.com/wso2-enterprise/integration-user-portal-service/up-dp/config"
	"github.com/wso2-enterprise/integration-user-portal-service/up-dp/domain"
)

type Registry struct {
	TokenService   domain.TokenService
	CatalogService domain.CatalogService
	ScopeService   domain.ScopeService
}

// NewRegistry builds every service from the loaded config.
func NewRegistry(cfg config.Config) *Registry {
	ipaas := ipaasportal.NewClient(cfg.IPaaS)
	scope := ipaasportal.Scope{OrgUUID: cfg.Org.UUID, EnvID: cfg.EnvironmentID}

	var oidcOpts []httpclient.Option
	if cfg.OIDC.InsecureTLS {
		oidcOpts = append(oidcOpts, httpclient.WithInsecureTLS())
	}

	return &Registry{
		TokenService: NewTokenService(TokenConfig{Issuer: cfg.OIDC.Issuer, Audience: cfg.OIDC.Resource, ClientID: cfg.OIDC.ClientID},
			NewIssuerKeys(cfg.OIDC.Issuer, oidc.NewClient(oidcOpts...))),
		CatalogService: NewCatalogService(ipaas, CatalogConfig{
			Scope: scope,
			TTL:   cfg.Cache.Catalog,
			Stale: cfg.Cache.CatalogStale,
		}),
		ScopeService: NewScopeService(ipaas, ScopeConfig{
			Scope:      scope,
			OIDCScopes: cfg.OIDC.Scopes,
			TTL:        cfg.Cache.Scopes,
		}),
	}
}
