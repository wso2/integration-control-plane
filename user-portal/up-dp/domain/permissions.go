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
