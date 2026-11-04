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
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/wso2-enterprise/integration-user-portal-service/shared/common"
	ipaasportal "github.com/wso2-enterprise/integration-user-portal-service/shared/external-services/ipaas-portal"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/upstream"
	"github.com/wso2-enterprise/integration-user-portal-service/up-dp/cache"
)

// fakeScopes answers GetScopes with published, or fails with err.
type fakeScopes struct {
	ipaasportal.Client
	published []string
	err       error
	reads     int
	scope     ipaasportal.Scope
}

func (f *fakeScopes) GetScopes(_ context.Context, scope ipaasportal.Scope) ([]string, error) {
	f.reads++
	f.scope = scope
	if f.err != nil {
		return nil, f.err
	}
	return f.published, nil
}

func newTestScopes(ipaas ipaasportal.Client) (*ScopeService, *clock) {
	svc := NewScopeService(ipaas, ScopeConfig{
		Scope:      ipaasportal.Scope{OrgUUID: common.NewID(), EnvID: common.NewID()},
		OIDCScopes: "openid profile email offline_access",
		TTL:        10 * time.Minute,
	}).(*ScopeService)
	clk := newClock()
	svc.cache = cache.New(10*time.Minute, 0, cache.WithClock(clk.Now))
	return svc, clk
}

// scopesOf answers svc's scopes, which must be known.
func scopesOf(t *testing.T, svc *ScopeService) []string {
	t.Helper()
	scopes, err := svc.Scopes(context.Background())
	require.NoError(t, err)
	return scopes
}

func TestScopesAreThePortalsOwnThenThePublishedOnes(t *testing.T) {
	ipaas := &fakeScopes{published: []string{"purchase:request", "automation:trigger", "hr:read"}}
	svc, _ := newTestScopes(ipaas)

	assert.Equal(t, []string{
		"openid", "profile", "email", "offline_access", "aiagent:view", "automation:view", "automation:trigger", "workflow:view",
		"hr:read", "purchase:request",
	}, scopesOf(t, svc))
	assert.Equal(t, svc.scope, ipaas.scope)
}

func TestScopesAreReadOnceForTheTTL(t *testing.T) {
	ipaas := &fakeScopes{published: []string{"hr:read"}}
	svc, clk := newTestScopes(ipaas)

	scopesOf(t, svc)
	ipaas.published = []string{"hr:read", "hr:write"}
	assert.NotContains(t, scopesOf(t, svc), "hr:write")
	assert.Equal(t, 1, ipaas.reads)

	clk.advance(10 * time.Minute)
	assert.Contains(t, scopesOf(t, svc), "hr:write")
	assert.Equal(t, 2, ipaas.reads)
}

func TestScopesKeepTheLastListWhenIPaaSFails(t *testing.T) {
	ipaas := &fakeScopes{published: []string{"hr:read"}}
	svc, clk := newTestScopes(ipaas)
	scopesOf(t, svc)

	clk.advance(time.Hour)
	ipaas.err = fmt.Errorf("ipaas: %w", upstream.ErrUnavailable)
	assert.Contains(t, scopesOf(t, svc), "hr:read")

	ipaas.err = fmt.Errorf("ipaas: %w", upstream.ErrNotFound)
	assert.Contains(t, scopesOf(t, svc), "hr:read")
}

func TestScopesAreUnavailableUntilAListIsRead(t *testing.T) {
	ipaas := &fakeScopes{err: fmt.Errorf("ipaas: %w", upstream.ErrNotFound)}
	svc, _ := newTestScopes(ipaas)

	_, err := svc.Scopes(context.Background())
	assert.ErrorIs(t, err, upstream.ErrUnavailable, "the portal's own scopes alone would read as every published scope withdrawn")

	ipaas.err = nil
	assert.Equal(t, []string{
		"openid", "profile", "email", "offline_access", "aiagent:view", "automation:view", "automation:trigger", "workflow:view",
	}, scopesOf(t, svc), "an empty list read from iPaaS-Service is known")
}
