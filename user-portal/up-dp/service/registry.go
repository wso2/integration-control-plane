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

package service

import (
	"github.com/wso2-enterprise/integration-user-portal-service/shared/external-services/ipaas-portal"
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

	return &Registry{
		TokenService: NewTokenService(),
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
