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

package catalog

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/wso2-enterprise/integration-user-portal-service/ipaas-mock/config"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/common"
	ipaasportal "github.com/wso2-enterprise/integration-user-portal-service/shared/external-services/ipaas-portal"
)

func TestPublishingIsPerEnvironment(t *testing.T) {
	c := New(config.Org{UUID: common.NewID(), Handle: "acme"}, "http://gw.example", time.Second)
	purchase := stableID("component", "finance", "purchase-request")

	_, err := c.Integration(GatewayEnvironment, purchase)
	require.NoError(t, err)
	_, err = c.Integration(DevelopmentEnvironment, purchase)
	require.ErrorIs(t, err, ErrNotFound)
	assert.NotContains(t, c.Scopes(DevelopmentEnvironment), "purchase:approve")

	require.NoError(t, c.SetPublished(DevelopmentEnvironment, purchase, true))
	_, err = c.Integration(DevelopmentEnvironment, purchase)
	require.NoError(t, err)
	assert.Contains(t, c.Scopes(DevelopmentEnvironment), "purchase:approve")
}

func TestScopesAreEachListedOnce(t *testing.T) {
	c := New(config.Org{UUID: common.NewID(), Handle: "acme"}, "http://gw.example", time.Second)

	assert.Equal(t, []string{
		"hr:benefits:read", "hr:policies:read", "people:lifecycle", "purchase:approve", "purchase:request", "tutor:chat",
	}, c.Scopes(GatewayEnvironment))
}

func TestEnvironmentsAreFoundByID(t *testing.T) {
	c := New(config.Org{UUID: common.NewID(), Handle: "acme"}, "http://gw.example", time.Second)

	env, err := c.Environment(stableID("environment", GatewayEnvironment))
	require.NoError(t, err)
	assert.Equal(t, GatewayEnvironment, env.Name)

	_, err = c.Environment("no-such-environment")
	require.ErrorIs(t, err, ErrNotFound)
}

func TestComponentsPageByCursorInNameOrder(t *testing.T) {
	c := New(config.Org{UUID: common.NewID(), Handle: "acme"}, "http://gw.example", time.Second)

	var names []string
	cursor := ""
	for pages := 0; ; pages++ {
		require.Less(t, pages, 10, "the cursor must reach the end")
		page, err := c.Components(GatewayEnvironment, ipaasportal.ComponentQuery{Limit: 3, Cursor: cursor})
		require.NoError(t, err)
		assert.Equal(t, 7, page.TotalCount)
		for _, component := range page.Items {
			names = append(names, component.DisplayName)
		}
		if page.NextCursor == "" {
			break
		}
		cursor = page.NextCursor
	}

	assert.Equal(t, []string{
		"AI Math Tutor Agent", "Employee Lifecycle", "Expense Report", "HR Policy Assistant",
		"Nightly Invoice Sync", "Purchase Request", "Repository Creation",
	}, names)
}

func TestComponentsFilterByKindAndSearch(t *testing.T) {
	c := New(config.Org{UUID: common.NewID(), Handle: "acme"}, "http://gw.example", time.Second)

	page, err := c.Components(GatewayEnvironment, ipaasportal.ComponentQuery{Kinds: []ipaasportal.DisplayType{ipaasportal.DisplayTypeAutomation}, Search: "LEDGER"})
	require.NoError(t, err)
	require.Len(t, page.Items, 1)
	assert.Equal(t, "invoice-sync", page.Items[0].Name)
	assert.Equal(t, 1, page.TotalCount)

	_, err = c.Components(GatewayEnvironment, ipaasportal.ComponentQuery{Cursor: "not-a-cursor"})
	assert.ErrorIs(t, err, ErrInvalidCursor)
}

func TestComponentsCarryEndpointsOnActiveTracksOnly(t *testing.T) {
	c := New(config.Org{UUID: common.NewID(), Handle: "acme"}, "http://gw.example", time.Second)

	agent, err := c.Component(GatewayEnvironment, stableID("component", "people", "hr-assistant"))
	require.NoError(t, err)
	require.Len(t, agent.DeploymentTracks, 2)
	assert.Len(t, agent.DeploymentTracks[0].Endpoints, 2)

	report := stableID("component", "finance", "expense-report")
	suspended := stableID("track", "finance", "expense-report", "release-1.x")
	deployment, err := c.Deployment(GatewayEnvironment, report, suspended)
	require.NoError(t, err)
	assert.Nil(t, deployment.Schedule, "a suspended deployment doesn't run on its schedule")
}

func TestComponentsFilterByProject(t *testing.T) {
	c := New(config.Org{UUID: common.NewID(), Handle: "acme"}, "http://gw.example", time.Second)

	page, err := c.Components(GatewayEnvironment, ipaasportal.ComponentQuery{Projects: []string{stableID("project", "people"), stableID("project", "demo")}})
	require.NoError(t, err)
	var names []string
	for _, component := range page.Items {
		names = append(names, component.Name)
	}
	assert.Equal(t, []string{"math-tutor", "employee-lifecycle", "hr-assistant", "repo-creation"}, names)
	assert.Equal(t, ipaasportal.Project{ID: stableID("project", "people"), Name: "People", Handle: "people"}, page.Items[1].Project)

	// Engineering's one integration is unpublished, so it has nothing to filter by.
	var handles []string
	for _, project := range c.Projects(GatewayEnvironment, nil) {
		handles = append(handles, project.Handle)
	}
	assert.Equal(t, []string{"demo", "finance", "people"}, handles)

	handles = nil
	for _, project := range c.Projects(GatewayEnvironment, []ipaasportal.DisplayType{ipaasportal.DisplayTypeAIAgent}) {
		handles = append(handles, project.Handle)
	}
	assert.Equal(t, []string{"demo", "people"}, handles)
}
