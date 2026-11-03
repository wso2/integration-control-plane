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

package domain

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestPermissionsFollowTheViewScopeOfEachKind(t *testing.T) {
	perms := NewPermissions([]string{"openid", ScopeAIAgentView, ScopeWorkflowView})

	assert.True(t, perms.CanView(KindAIAgent))
	assert.False(t, perms.CanView(KindAutomation))
	assert.True(t, perms.CanView(KindWorkflow))
	assert.False(t, perms.CanView("project"))
	assert.Equal(t, []IntegrationKind{KindAIAgent, KindWorkflow}, perms.ViewableKinds())
	assert.False(t, perms.CanTrigger())
}

func TestTriggeringNeedsItsOwnScope(t *testing.T) {
	assert.True(t, NewPermissions([]string{ScopeAutomationTrigger}).CanTrigger())
	assert.Empty(t, NewPermissions(nil).ViewableKinds())
}
