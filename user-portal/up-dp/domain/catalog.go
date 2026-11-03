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
