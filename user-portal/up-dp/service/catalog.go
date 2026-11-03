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
	"net/url"
	"slices"
	"sort"
	"strconv"
	"time"

	ipaasportal "github.com/wso2-enterprise/integration-user-portal-service/shared/external-services/ipaas-portal"
	"github.com/wso2-enterprise/integration-user-portal-service/up-dp/cache"
	"github.com/wso2-enterprise/integration-user-portal-service/up-dp/domain"
)

type CatalogConfig struct {
	Scope ipaasportal.Scope

	// TTL is how long a read is served from memory. Stale is how long a copy may
	// stand in when iPaaS-Service can't be reached.
	TTL   time.Duration
	Stale time.Duration
}

type CatalogService struct {
	ipaas ipaasportal.Client
	cfg   CatalogConfig
	cache *cache.Cache
}

func NewCatalogService(ipaas ipaasportal.Client, cfg CatalogConfig) domain.CatalogService {
	return &CatalogService{ipaas: ipaas, cfg: cfg, cache: cache.New(cfg.TTL, cfg.Stale)}
}

func (svc *CatalogService) Integrations(ctx context.Context, perms domain.Permissions, query domain.IntegrationQuery) (*domain.IntegrationPage, error) {
	kinds, err := viewable(perms, query.Kinds)
	if err != nil {
		return nil, err
	}
	if len(kinds) == 0 {
		return &domain.IntegrationPage{Items: []domain.Integration{}}, nil
	}

	projects := slices.Clone(query.Projects)
	slices.Sort(projects)
	key := url.Values{
		"kind": kindNames(kinds), "project": projects, "search": {query.Search}, "limit": {strconv.Itoa(query.Limit)}, "cursor": {query.Cursor},
	}.Encode()
	val, err := svc.cache.Get(ctx, "integrations?"+key, func(ctx context.Context) (any, error) {
		page, err := svc.ipaas.GetComponents(ctx, svc.cfg.Scope, ipaasportal.ComponentQuery{
			Kinds: displayTypes(kinds), Projects: projects, Search: query.Search, Limit: query.Limit, Cursor: query.Cursor,
		})
		if err != nil {
			return nil, fmt.Errorf("catalog: components: %w", err)
		}
		out := &domain.IntegrationPage{Items: make([]domain.Integration, 0, len(page.Items)), NextCursor: page.NextCursor, TotalCount: page.TotalCount}
		for _, component := range page.Items {
			out.Items = append(out.Items, toIntegration(component))
		}
		return out, nil
	})
	if err != nil {
		return nil, err
	}
	return val.(*domain.IntegrationPage), nil
}

func (svc *CatalogService) Projects(ctx context.Context, perms domain.Permissions) ([]ipaasportal.Project, error) {
	kinds := perms.ViewableKinds()
	if len(kinds) == 0 {
		return []ipaasportal.Project{}, nil
	}
	key := url.Values{"kind": kindNames(kinds)}.Encode()
	val, err := svc.cache.Get(ctx, "projects?"+key, func(ctx context.Context) (any, error) {
		projects, err := svc.ipaas.GetProjects(ctx, svc.cfg.Scope, displayTypes(kinds))
		if err != nil {
			return nil, fmt.Errorf("catalog: projects: %w", err)
		}
		return projects, nil
	})
	if err != nil {
		return nil, err
	}
	return val.([]ipaasportal.Project), nil
}

func (svc *CatalogService) Integration(ctx context.Context, perms domain.Permissions, integrationID string) (*domain.Integration, error) {
	integration, err := svc.integration(ctx, integrationID)
	if err != nil {
		return nil, err
	}
	if !perms.CanView(integration.Kind) {
		return nil, fmt.Errorf("catalog: %s is a %s: %w", integrationID, integration.Kind, domain.ErrNotFound)
	}
	return integration, nil
}

func (svc *CatalogService) integration(ctx context.Context, integrationID string) (*domain.Integration, error) {
	val, err := svc.cache.Get(ctx, "integration/"+integrationID, func(ctx context.Context) (any, error) {
		component, err := svc.ipaas.GetComponent(ctx, svc.cfg.Scope, integrationID)
		if err != nil {
			return nil, err
		}
		integration := toIntegration(*component)
		return &integration, nil
	})
	if err != nil {
		return nil, err
	}
	return val.(*domain.Integration), nil
}

// viewable is the kinds a query lists: those asked for, all of which perms must
// allow, or every kind perms allows.
func viewable(perms domain.Permissions, asked []domain.IntegrationKind) ([]domain.IntegrationKind, error) {
	if len(asked) == 0 {
		return perms.ViewableKinds(), nil
	}
	kinds := slices.Clone(asked)
	slices.Sort(kinds)
	kinds = slices.Compact(kinds)
	for _, kind := range kinds {
		if !perms.CanView(kind) {
			return nil, fmt.Errorf("catalog: listing %s: %w", kind, domain.ErrForbidden)
		}
	}
	return kinds, nil
}

func kindNames(kinds []domain.IntegrationKind) []string {
	out := make([]string, len(kinds))
	for i, kind := range kinds {
		out[i] = string(kind)
	}
	return out
}

func displayTypes(kinds []domain.IntegrationKind) []ipaasportal.DisplayType {
	out := make([]ipaasportal.DisplayType, len(kinds))
	for i, kind := range kinds {
		out[i] = ipaasportal.DisplayType(kind)
	}
	return out
}

func toIntegration(component ipaasportal.Component) domain.Integration {
	integration := domain.Integration{
		ID:               component.UID,
		Name:             component.Name,
		DisplayName:      component.DisplayName,
		Description:      component.Description,
		Kind:             domain.IntegrationKind(component.DisplayType),
		Project:          component.Project,
		DeploymentTracks: latestFirst(component.DeploymentTracks),
	}
	if integration.DisplayName == "" {
		integration.DisplayName = component.Name
	}
	return integration
}

// latestFirst puts the latest track first and keeps the rest in their order.
func latestFirst(tracks []ipaasportal.DeploymentTrack) []ipaasportal.DeploymentTrack {
	out := append([]ipaasportal.DeploymentTrack{}, tracks...)
	sort.SliceStable(out, func(i, j int) bool { return out[i].Latest && !out[j].Latest })
	return out
}

func (svc *CatalogService) Deployment(ctx context.Context, perms domain.Permissions, integrationID, trackID string) (*ipaasportal.Deployment, error) {
	if _, err := svc.Integration(ctx, perms, integrationID); err != nil {
		return nil, err
	}
	val, err := svc.cache.Get(ctx, "deployment/"+integrationID+"/"+trackID, func(ctx context.Context) (any, error) {
		return svc.ipaas.GetDeployment(ctx, svc.cfg.Scope, integrationID, trackID)
	})
	if err != nil {
		return nil, err
	}
	return val.(*ipaasportal.Deployment), nil
}

// Executions is never cached: the SPA polls it to follow a run.
func (svc *CatalogService) Executions(ctx context.Context, perms domain.Permissions, integrationID, trackID string, limit int, before string) (*ipaasportal.ExecutionPage, error) {
	integration, err := svc.Integration(ctx, perms, integrationID)
	if err != nil {
		return nil, err
	}
	if integration.Kind != domain.KindAutomation {
		return nil, fmt.Errorf("catalog: %s is not an automation: %w", integrationID, domain.ErrNotFound)
	}
	return svc.ipaas.GetExecutions(ctx, svc.cfg.Scope, integrationID, trackID, limit, before)
}

func (svc *CatalogService) Trigger(ctx context.Context, perms domain.Permissions, integrationID, trackID string, args []ipaasportal.ExecutionArg) (*ipaasportal.Execution, error) {
	if !perms.CanTrigger() {
		return nil, fmt.Errorf("catalog: triggering %s: %w", integrationID, domain.ErrForbidden)
	}
	integration, err := svc.integration(ctx, integrationID)
	if err != nil {
		return nil, err
	}
	if integration.Kind != domain.KindAutomation {
		return nil, fmt.Errorf("catalog: %s is not an automation: %w", integrationID, domain.ErrNotFound)
	}
	return svc.ipaas.TriggerExecution(ctx, svc.cfg.Scope, integrationID, trackID, args)
}
