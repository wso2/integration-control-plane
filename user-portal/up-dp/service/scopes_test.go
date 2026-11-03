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
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

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

func TestScopesAreThePortalsOwnThenThePublishedOnes(t *testing.T) {
	ipaas := &fakeScopes{published: []string{"purchase:request", "automation:trigger", "hr:read"}}
	svc, _ := newTestScopes(ipaas)

	assert.Equal(t, []string{
		"openid", "profile", "email", "offline_access", "aiagent:view", "automation:view", "automation:trigger", "workflow:view",
		"hr:read", "purchase:request",
	}, svc.Scopes(context.Background()))
	assert.Equal(t, svc.scope, ipaas.scope)
}

func TestScopesAreReadOnceForTheTTL(t *testing.T) {
	ipaas := &fakeScopes{published: []string{"hr:read"}}
	svc, clk := newTestScopes(ipaas)

	svc.Scopes(context.Background())
	ipaas.published = []string{"hr:read", "hr:write"}
	assert.NotContains(t, svc.Scopes(context.Background()), "hr:write")
	assert.Equal(t, 1, ipaas.reads)

	clk.advance(10 * time.Minute)
	assert.Contains(t, svc.Scopes(context.Background()), "hr:write")
	assert.Equal(t, 2, ipaas.reads)
}

func TestScopesKeepTheLastListWhenIPaaSFails(t *testing.T) {
	ipaas := &fakeScopes{published: []string{"hr:read"}}
	svc, clk := newTestScopes(ipaas)
	svc.Scopes(context.Background())

	clk.advance(time.Hour)
	ipaas.err = fmt.Errorf("ipaas: %w", upstream.ErrUnavailable)
	assert.Contains(t, svc.Scopes(context.Background()), "hr:read")

	ipaas.err = fmt.Errorf("ipaas: %w", upstream.ErrNotFound)
	assert.Contains(t, svc.Scopes(context.Background()), "hr:read")
}

func TestScopesWithoutAnyListAreThePortalsOwn(t *testing.T) {
	svc, _ := newTestScopes(&fakeScopes{err: fmt.Errorf("ipaas: %w", upstream.ErrUnavailable)})

	assert.Equal(t, []string{
		"openid", "profile", "email", "offline_access", "aiagent:view", "automation:view", "automation:trigger", "workflow:view",
	}, svc.Scopes(context.Background()))
}
