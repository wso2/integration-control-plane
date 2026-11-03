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
