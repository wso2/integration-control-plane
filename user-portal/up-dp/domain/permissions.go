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

const (
	ScopeAIAgentView       = "aiagent:view"
	ScopeAutomationView    = "automation:view"
	ScopeAutomationTrigger = "automation:trigger"
	ScopeWorkflowView      = "workflow:view"
)

// PortalScopes are the org-level scopes the portal's permission model checks.
var PortalScopes = []string{ScopeAIAgentView, ScopeAutomationView, ScopeAutomationTrigger, ScopeWorkflowView}

var kinds = []IntegrationKind{KindAIAgent, KindAutomation, KindWorkflow}

var viewScopes = map[IntegrationKind]string{
	KindAIAgent:    ScopeAIAgentView,
	KindAutomation: ScopeAutomationView,
	KindWorkflow:   ScopeWorkflowView,
}

type Permissions struct {
	scopes map[string]bool
}

func NewPermissions(scopes []string) Permissions {
	held := make(map[string]bool, len(scopes))
	for _, scope := range scopes {
		held[scope] = true
	}
	return Permissions{scopes: held}
}

func (p Permissions) CanView(kind IntegrationKind) bool {
	scope, ok := viewScopes[kind]
	return ok && p.scopes[scope]
}

func (p Permissions) ViewableKinds() []IntegrationKind {
	var out []IntegrationKind
	for _, kind := range kinds {
		if p.CanView(kind) {
			out = append(out, kind)
		}
	}
	return out
}

func (p Permissions) CanTrigger() bool {
	return p.scopes[ScopeAutomationTrigger]
}
