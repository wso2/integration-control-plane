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
	"context"
	"slices"
	"strings"
	"sync"
	"time"

	ipaasportal "github.com/wso2-enterprise/integration-user-portal-service/shared/external-services/ipaas-portal"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/infrastructure/logging"
	"github.com/wso2-enterprise/integration-user-portal-service/up-dp/cache"
	"github.com/wso2-enterprise/integration-user-portal-service/up-dp/domain"
)

const offlineAccess = "offline_access"

const scopesKey = "scopes"

type ScopeConfig struct {
	Scope ipaasportal.Scope

	OIDCScopes string

	TTL time.Duration
}

type ScopeService struct {
	ipaas ipaasportal.Client
	scope ipaasportal.Scope
	own   []string
	cache *cache.Cache

	mu   sync.Mutex
	last []string
}

func NewScopeService(ipaas ipaasportal.Client, cfg ScopeConfig) domain.ScopeService {
	own := strings.Fields(cfg.OIDCScopes)
	own = append(own, offlineAccess)
	own = append(own, domain.PortalScopes...)
	return &ScopeService{ipaas: ipaas, scope: cfg.Scope, own: unique(own), cache: cache.New(cfg.TTL, 0)}
}

func (svc *ScopeService) Scopes(ctx context.Context) []string {
	val, err := svc.cache.Get(ctx, scopesKey, func(ctx context.Context) (any, error) {
		return svc.ipaas.GetScopes(ctx, svc.scope)
	})

	svc.mu.Lock()
	defer svc.mu.Unlock()
	if err != nil {
		logging.S(ctx).Warnw("serving the last published scopes", "error", err)
	} else {
		svc.last = val.([]string)
	}

	published := slices.Clone(svc.last)
	slices.Sort(published)
	return unique(append(slices.Clone(svc.own), published...))
}

func unique(scopes []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(scopes))
	for _, scope := range scopes {
		if scope != "" && !seen[scope] {
			seen[scope] = true
			out = append(out, scope)
		}
	}
	return out
}
