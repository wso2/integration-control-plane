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
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/wso2-enterprise/integration-user-portal-service/shared/common"
	ipaasportal "github.com/wso2-enterprise/integration-user-portal-service/shared/external-services/ipaas-portal"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/upstream"
	"github.com/wso2-enterprise/integration-user-portal-service/up-dp/cache"
	"github.com/wso2-enterprise/integration-user-portal-service/up-dp/domain"
)

// fakeIPaaS answers from fixed data; down makes every read fail to get an answer.
type fakeIPaaS struct {
	ipaasportal.Client
	page         ipaasportal.ComponentPage
	queries      []ipaasportal.ComponentQuery
	projectKinds [][]ipaasportal.DisplayType
	triggered    int
	down         bool
}

func (f *fakeIPaaS) GetProjects(_ context.Context, _ ipaasportal.Scope, kinds []ipaasportal.DisplayType) ([]ipaasportal.Project, error) {
	f.projectKinds = append(f.projectKinds, kinds)
	return []ipaasportal.Project{{ID: "p1", Name: "Demo", Handle: "demo"}}, nil
}

func (f *fakeIPaaS) GetComponent(_ context.Context, _ ipaasportal.Scope, uid string) (*ipaasportal.Component, error) {
	for _, component := range f.page.Items {
		if component.UID == uid {
			return &component, nil
		}
	}
	return nil, fmt.Errorf("ipaas: %w", upstream.ErrNotFound)
}

func (f *fakeIPaaS) GetDeployment(_ context.Context, _ ipaasportal.Scope, _, trackID string) (*ipaasportal.Deployment, error) {
	return &ipaasportal.Deployment{DeploymentTrackID: trackID}, nil
}

func (f *fakeIPaaS) GetExecutions(context.Context, ipaasportal.Scope, string, string, int, string) (*ipaasportal.ExecutionPage, error) {
	return &ipaasportal.ExecutionPage{Items: []ipaasportal.Execution{}}, nil
}

func (f *fakeIPaaS) TriggerExecution(context.Context, ipaasportal.Scope, string, string, []ipaasportal.ExecutionArg) (*ipaasportal.Execution, error) {
	f.triggered++
	return &ipaasportal.Execution{JobID: "run-1"}, nil
}

var everyone = domain.NewPermissions(domain.PortalScopes)

func (f *fakeIPaaS) GetComponents(_ context.Context, _ ipaasportal.Scope, query ipaasportal.ComponentQuery) (*ipaasportal.ComponentPage, error) {
	f.queries = append(f.queries, query)
	if f.down {
		return nil, fmt.Errorf("ipaas: %w", upstream.ErrUnavailable)
	}
	page := f.page
	return &page, nil
}

func testCatalog() *fakeIPaaS {
	return &fakeIPaaS{page: ipaasportal.ComponentPage{
		Items: []ipaasportal.Component{
			{UID: "agent", Name: "agent", DisplayName: "Agent", DisplayType: ipaasportal.DisplayTypeAIAgent, Project: ipaasportal.Project{ID: "p1", Name: "Demo", Handle: "demo"}, DeploymentTracks: []ipaasportal.DeploymentTrack{
				{ID: "t2", Branch: "release"},
				{ID: "t1", Branch: "main", Latest: true, Endpoints: []ipaasportal.Endpoint{{Name: "chat", URL: "https://gw.example/agent"}}},
			}},
			{UID: "job", Name: "job", DisplayType: ipaasportal.DisplayTypeAutomation, DeploymentTracks: []ipaasportal.DeploymentTrack{{ID: "t1", Branch: "main", Latest: true}}},
		},
		NextCursor: "next",
		TotalCount: 5,
	}}
}

// clock is a settable time source for the cache.
type clock struct {
	mu  sync.Mutex
	now time.Time
}

func newClock() *clock {
	return &clock{now: time.Date(2026, 11, 1, 9, 0, 0, 0, time.UTC)}
}

func (c *clock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

func (c *clock) advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.now = c.now.Add(d)
}

func newTestCatalog(ipaas ipaasportal.Client) (*CatalogService, *clock) {
	svc := NewCatalogService(ipaas, CatalogConfig{Scope: ipaasportal.Scope{OrgUUID: common.NewID(), EnvID: common.NewID()}, TTL: 30 * time.Second, Stale: 15 * time.Minute}).(*CatalogService)
	clk := newClock()
	svc.cache = cache.New(30*time.Second, 15*time.Minute, cache.WithClock(clk.Now))
	return svc, clk
}

func TestIntegrationsArePagesOfComponents(t *testing.T) {
	ipaas := testCatalog()
	svc, _ := newTestCatalog(ipaas)

	page, err := svc.Integrations(context.Background(), everyone, domain.IntegrationQuery{
		Kinds: []domain.IntegrationKind{domain.KindAIAgent}, Projects: []string{"people", "demo"}, Search: "chat", Limit: 2, Cursor: "c1",
	})

	require.NoError(t, err)
	assert.Equal(t, []ipaasportal.ComponentQuery{{
		Kinds: []ipaasportal.DisplayType{ipaasportal.DisplayTypeAIAgent}, Projects: []string{"demo", "people"}, Search: "chat", Limit: 2, Cursor: "c1",
	}}, ipaas.queries)
	assert.Equal(t, "next", page.NextCursor)
	assert.Equal(t, 5, page.TotalCount)
	require.Len(t, page.Items, 2)
	assert.Equal(t, domain.KindAIAgent, page.Items[0].Kind)
	assert.Equal(t, ipaasportal.Project{ID: "p1", Name: "Demo", Handle: "demo"}, page.Items[0].Project)
	assert.Equal(t, "t1", page.Items[0].DeploymentTracks[0].ID, "the latest track comes first")
	assert.Equal(t, []ipaasportal.Endpoint{{Name: "chat", URL: "https://gw.example/agent"}}, page.Items[0].DeploymentTracks[0].Endpoints)
	assert.Equal(t, "job", page.Items[1].DisplayName, "the name stands in for a missing display name")
}

func TestIntegrationsCacheEachPageByItsQuery(t *testing.T) {
	ipaas := testCatalog()
	svc, clk := newTestCatalog(ipaas)
	first := domain.IntegrationQuery{Limit: 20, Projects: []string{"a", "b"}}
	second := domain.IntegrationQuery{Limit: 20, Cursor: "next"}

	page, err := svc.Integrations(context.Background(), everyone, first)
	require.NoError(t, err)
	_, err = svc.Integrations(context.Background(), everyone, domain.IntegrationQuery{Limit: 20, Projects: []string{"b", "a"}})
	require.NoError(t, err)
	_, err = svc.Integrations(context.Background(), everyone, second)
	require.NoError(t, err)
	assert.Len(t, ipaas.queries, 2, "a page inside the ttl must not reach iPaaS-Service again")

	ipaas.down = true
	clk.advance(time.Minute)
	stale, err := svc.Integrations(context.Background(), everyone, first)
	require.NoError(t, err)
	assert.Equal(t, page, stale)

	clk.advance(time.Hour)
	_, err = svc.Integrations(context.Background(), everyone, first)
	assert.ErrorIs(t, err, upstream.ErrUnavailable)
}

func TestIntegrationsListOnlyTheKindsTheCallerMayView(t *testing.T) {
	ipaas := testCatalog()
	svc, _ := newTestCatalog(ipaas)
	agentsAndWorkflows := domain.NewPermissions([]string{domain.ScopeWorkflowView, domain.ScopeAIAgentView})

	_, err := svc.Integrations(context.Background(), agentsAndWorkflows, domain.IntegrationQuery{Limit: 20})
	require.NoError(t, err)
	assert.Equal(t, []ipaasportal.DisplayType{ipaasportal.DisplayTypeAIAgent, ipaasportal.DisplayTypeWorkflow}, ipaas.queries[0].Kinds)

	_, err = svc.Integrations(context.Background(), agentsAndWorkflows, domain.IntegrationQuery{Kinds: []domain.IntegrationKind{domain.KindAutomation}})
	assert.ErrorIs(t, err, domain.ErrForbidden)

	page, err := svc.Integrations(context.Background(), domain.NewPermissions(nil), domain.IntegrationQuery{Limit: 20})
	require.NoError(t, err)
	assert.Empty(t, page.Items)
	assert.Len(t, ipaas.queries, 1, "a caller who may view nothing doesn't reach iPaaS-Service")
}

func TestProjectsAreThoseOfTheKindsTheCallerMayView(t *testing.T) {
	ipaas := testCatalog()
	svc, _ := newTestCatalog(ipaas)

	_, err := svc.Projects(context.Background(), domain.NewPermissions([]string{domain.ScopeAutomationView}))
	require.NoError(t, err)
	assert.Equal(t, [][]ipaasportal.DisplayType{{ipaasportal.DisplayTypeAutomation}}, ipaas.projectKinds)

	projects, err := svc.Projects(context.Background(), domain.NewPermissions(nil))
	require.NoError(t, err)
	assert.Empty(t, projects)
}

func TestAnIntegrationOfAKindTheCallerMayNotViewIsNotFound(t *testing.T) {
	svc, _ := newTestCatalog(testCatalog())
	agentsOnly := domain.NewPermissions([]string{domain.ScopeAIAgentView})

	_, err := svc.Integration(context.Background(), agentsOnly, "agent")
	require.NoError(t, err)

	_, err = svc.Integration(context.Background(), agentsOnly, "job")
	assert.ErrorIs(t, err, domain.ErrNotFound)
	_, err = svc.Deployment(context.Background(), agentsOnly, "job", "t1")
	assert.ErrorIs(t, err, domain.ErrNotFound)
	_, err = svc.Executions(context.Background(), agentsOnly, "job", "t1", 10, "")
	assert.ErrorIs(t, err, domain.ErrNotFound)
}

func TestRunsAreAnAutomationsOnly(t *testing.T) {
	svc, _ := newTestCatalog(testCatalog())

	_, err := svc.Executions(context.Background(), everyone, "job", "t1", 10, "")
	require.NoError(t, err)
	_, err = svc.Executions(context.Background(), everyone, "agent", "t1", 10, "")
	assert.ErrorIs(t, err, domain.ErrNotFound)
}

func TestTriggeringNeedsTheTriggerScope(t *testing.T) {
	ipaas := testCatalog()
	svc, _ := newTestCatalog(ipaas)

	_, err := svc.Trigger(context.Background(), domain.NewPermissions([]string{domain.ScopeAutomationView}), "job", "t1", nil)
	assert.ErrorIs(t, err, domain.ErrForbidden)

	trigger := domain.NewPermissions([]string{domain.ScopeAutomationTrigger})
	_, err = svc.Trigger(context.Background(), trigger, "agent", "t1", nil)
	assert.ErrorIs(t, err, domain.ErrNotFound)

	_, err = svc.Trigger(context.Background(), trigger, "job", "t1", nil)
	require.NoError(t, err)
	assert.Equal(t, 1, ipaas.triggered)
}
