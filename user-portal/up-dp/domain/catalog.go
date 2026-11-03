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

import (
	"context"

	ipaasportal "github.com/wso2-enterprise/integration-user-portal-service/shared/external-services/ipaas-portal"
)

type IntegrationKind string

const (
	KindAIAgent    IntegrationKind = "aiAgent"
	KindAutomation IntegrationKind = "automation"
	KindWorkflow   IntegrationKind = "workflow"
)

func (k IntegrationKind) Valid() bool {
	return k == KindAIAgent || k == KindAutomation || k == KindWorkflow
}

type Integration struct {
	ID               string                        `json:"id"`
	Name             string                        `json:"name"`
	DisplayName      string                        `json:"displayName"`
	Description      string                        `json:"description"`
	Kind             IntegrationKind               `json:"kind"`
	Project          ipaasportal.Project           `json:"project"`
	DeploymentTracks []ipaasportal.DeploymentTrack `json:"deploymentTracks"`
}

type IntegrationPage struct {
	Items      []Integration `json:"items"`
	NextCursor string        `json:"nextCursor,omitempty"`
	TotalCount int           `json:"totalCount"`
}

type IntegrationQuery struct {
	Kinds    []IntegrationKind
	Projects []string
	Search   string
	Limit    int
	Cursor   string
}

// CatalogService answers what perms allow: a kind the caller may not view is
// left out of lists and not found by id.
type CatalogService interface {
	Projects(ctx context.Context, perms Permissions) ([]ipaasportal.Project, error)
	Integrations(ctx context.Context, perms Permissions, query IntegrationQuery) (*IntegrationPage, error)
	Integration(ctx context.Context, perms Permissions, integrationID string) (*Integration, error)
	Deployment(ctx context.Context, perms Permissions, integrationID, trackID string) (*ipaasportal.Deployment, error)
	Executions(ctx context.Context, perms Permissions, integrationID, trackID string, limit int, before string) (*ipaasportal.ExecutionPage, error)
	Trigger(ctx context.Context, perms Permissions, integrationID, trackID string, args []ipaasportal.ExecutionArg) (*ipaasportal.Execution, error)
}
