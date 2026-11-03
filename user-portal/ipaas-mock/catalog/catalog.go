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

// Package catalog is the mock's in-memory organization: its projects, the
// integrations in them, what is deployed on each track, and automation runs.
package catalog

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/wso2-enterprise/integration-user-portal-service/ipaas-mock/config"
	ipaasportal "github.com/wso2-enterprise/integration-user-portal-service/shared/external-services/ipaas-portal"
)

var (
	ErrNotFound      = errors.New("not found")
	ErrInvalidArgs   = errors.New("invalid arguments")
	ErrInvalidCursor = errors.New("invalid cursor")
)

// Status is a deployment's state. iPaaS-Service keeps it to itself: the portal
// never sees it.
type Status string

const (
	StatusActive    Status = "ACTIVE"
	StatusSuspended Status = "SUSPENDED"
)

const (
	defaultPageSize = 20
	maxPageSize     = 100
)

// FailValue makes a triggered automation fail when any argument carries it.
const FailValue = "fail"

// Environment is one environment of the org the portal can be enabled in.
type Environment struct {
	ID   string
	Name string
}

// Integration is one component and everything the mock knows about it.
type Integration struct {
	Component ipaasportal.Component
	// Project is the handle of the project it belongs to.
	Project string

	// Scopes are the permissions its endpoints require, as the User Portal
	// resource server carries them.
	Scopes []string

	// publishedIn is the environments, by name, it is published to the portal in.
	// Guarded by the catalog's mu.
	publishedIn map[string]bool

	// Tracks is the deployment on each track, by track id.
	Tracks map[string]*Track

	// Endpoints are the gateway endpoints of an agent or a workflow, by track id.
	Endpoints map[string][]Endpoint
}

// Endpoint is one API the gateway exposes for an integration.
type Endpoint struct {
	Name        string
	DisplayName string
	// Path is the endpoint's path on the gateway, without the origin.
	Path string
}

// Track is what is deployed on one track.
type Track struct {
	EnvironmentName string
	ReleaseName     string
	Status          Status
	Schedule        *ipaasportal.Schedule
	RuntimeArgs     []ipaasportal.RuntimeArg
}

type run struct {
	execution ipaasportal.Execution
	fails     bool
	finishAt  time.Time
}

type Catalog struct {
	org        config.Org
	gatewayURL string

	// runDuration is how long a triggered automation runs.
	runDuration time.Duration

	environments []Environment
	projects     []ipaasportal.Project
	integrations []*Integration

	mu   sync.Mutex
	runs map[string][]*run // by componentUID/trackID, newest first

	now func() time.Time
}

func New(org config.Org, gatewayURL string, runDuration time.Duration) *Catalog {
	c := &Catalog{
		org:         org,
		gatewayURL:  gatewayURL,
		runDuration: runDuration,
		runs:        map[string][]*run{},
		now:         time.Now,
	}
	c.seed()
	return c
}

func (c *Catalog) Org() config.Org { return c.org }

// Environment finds an environment by its id.
func (c *Catalog) Environment(id string) (Environment, error) {
	for _, env := range c.environments {
		if env.ID == id {
			return env, nil
		}
	}
	return Environment{}, fmt.Errorf("catalog: environment %q: %w", id, ErrNotFound)
}

// IsPublished reports whether the integration is published in the environment.
func (c *Catalog) IsPublished(integration *Integration, env string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return integration.publishedIn[env]
}

// SetPublished publishes or unpublishes an integration in an environment.
func (c *Catalog) SetPublished(env, uid string, published bool) error {
	for _, integration := range c.integrations {
		if integration.Component.UID == uid {
			c.mu.Lock()
			defer c.mu.Unlock()
			integration.publishedIn[env] = published
			return nil
		}
	}
	return fmt.Errorf("catalog: component %q: %w", uid, ErrNotFound)
}

// Scopes are the scopes of the integrations published in the environment, each
// once, sorted.
func (c *Catalog) Scopes(env string) []string {
	out := []string{}
	for _, integration := range c.integrations {
		if c.IsPublished(integration, env) {
			out = append(out, integration.Scopes...)
		}
	}
	slices.Sort(out)
	return slices.Compact(out)
}

// Projects are the projects with an integration published in env, by name.
func (c *Catalog) Projects(env string, kinds []ipaasportal.DisplayType) []ipaasportal.Project {
	out := []ipaasportal.Project{}
	for _, project := range c.projects {
		if slices.ContainsFunc(c.integrations, func(integration *Integration) bool {
			_, reachable := c.view(integration)
			return integration.Project == project.Handle && reachable && c.IsPublished(integration, env) &&
				(len(kinds) == 0 || slices.Contains(kinds, integration.Component.DisplayType))
		}) {
			out = append(out, project)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

func (c *Catalog) project(handle string) ipaasportal.Project {
	for _, project := range c.projects {
		if project.Handle == handle {
			return project
		}
	}
	return ipaasportal.Project{Handle: handle, Name: handle}
}

// Components is one page of the components published in env that match query,
// in display name order. An agent or a workflow with no endpoint is left out.
func (c *Catalog) Components(env string, query ipaasportal.ComponentQuery) (*ipaasportal.ComponentPage, error) {
	after, err := decodeCursor(query.Cursor)
	if err != nil {
		return nil, err
	}
	limit := query.Limit
	if limit <= 0 {
		limit = defaultPageSize
	}
	limit = min(limit, maxPageSize)
	search := strings.ToLower(strings.TrimSpace(query.Search))

	var matched []ipaasportal.Component
	for _, integration := range c.integrations {
		if !c.IsPublished(integration, env) {
			continue
		}
		if len(query.Kinds) > 0 && !slices.Contains(query.Kinds, integration.Component.DisplayType) {
			continue
		}
		if len(query.Projects) > 0 && !slices.Contains(query.Projects, c.project(integration.Project).ID) {
			continue
		}
		component, ok := c.view(integration)
		if !ok {
			continue
		}
		if search != "" && !strings.Contains(strings.ToLower(component.DisplayName+" "+component.Description), search) {
			continue
		}
		matched = append(matched, component)
	}
	sort.Slice(matched, func(i, j int) bool { return orderKey(matched[i]).before(orderKey(matched[j])) })

	page := &ipaasportal.ComponentPage{Items: []ipaasportal.Component{}, TotalCount: len(matched)}
	for _, component := range matched {
		if after != nil && !after.before(orderKey(component)) {
			continue
		}
		if len(page.Items) == limit {
			page.NextCursor = encodeCursor(orderKey(page.Items[len(page.Items)-1]))
			break
		}
		page.Items = append(page.Items, component)
	}
	return page, nil
}

// Component is one component published in env, as Components lists it.
func (c *Catalog) Component(env, uid string) (*ipaasportal.Component, error) {
	integration, err := c.Integration(env, uid)
	if err != nil {
		return nil, err
	}
	component, ok := c.view(integration)
	if !ok {
		return nil, fmt.Errorf("catalog: component %q has no endpoint: %w", uid, ErrNotFound)
	}
	return &component, nil
}

// view is the component as the portal sees it: each track with the endpoints of
// its active deployment. ok is false for an agent or a workflow with none.
func (c *Catalog) view(integration *Integration) (ipaasportal.Component, bool) {
	component := integration.Component
	component.Project = c.project(integration.Project)
	component.DeploymentTracks = make([]ipaasportal.DeploymentTrack, 0, len(integration.Component.DeploymentTracks))
	reachable := false
	for _, track := range integration.Component.DeploymentTracks {
		if deployed, ok := integration.Tracks[track.ID]; ok && deployed.Status == StatusActive {
			for _, endpoint := range integration.Endpoints[track.ID] {
				track.Endpoints = append(track.Endpoints, ipaasportal.Endpoint{
					Name:        endpoint.Name,
					DisplayName: endpoint.DisplayName,
					URL:         c.gatewayURL + endpoint.Path,
				})
			}
		}
		reachable = reachable || len(track.Endpoints) > 0
		component.DeploymentTracks = append(component.DeploymentTracks, track)
	}
	return component, reachable || component.DisplayType == ipaasportal.DisplayTypeAutomation
}

// pageKey is where a component sits in the listing order.
type pageKey struct {
	Name string `json:"n"`
	UID  string `json:"u"`
}

func orderKey(component ipaasportal.Component) pageKey {
	return pageKey{Name: strings.ToLower(component.DisplayName), UID: component.UID}
}

func (k pageKey) before(other pageKey) bool {
	if k.Name != other.Name {
		return k.Name < other.Name
	}
	return k.UID < other.UID
}

// A cursor names the last component of the page before, so a page starts in the
// same place however the list changes around it.
func encodeCursor(key pageKey) string {
	raw, _ := json.Marshal(key)
	return base64.RawURLEncoding.EncodeToString(raw)
}

func decodeCursor(cursor string) (*pageKey, error) {
	if cursor == "" {
		return nil, nil
	}
	raw, err := base64.RawURLEncoding.DecodeString(cursor)
	var key pageKey
	if err != nil || json.Unmarshal(raw, &key) != nil || key.UID == "" {
		return nil, fmt.Errorf("catalog: cursor %q: %w", cursor, ErrInvalidCursor)
	}
	return &key, nil
}

// Integration finds an integration published in env by its component uid.
func (c *Catalog) Integration(env, uid string) (*Integration, error) {
	for _, integration := range c.integrations {
		if integration.Component.UID == uid && c.IsPublished(integration, env) {
			return integration, nil
		}
	}
	return nil, fmt.Errorf("catalog: component %q: %w", uid, ErrNotFound)
}

// ByEndpointPath finds the integration and endpoint the gateway path belongs to.
func (c *Catalog) ByEndpointPath(path string) (*Integration, *Endpoint, string, bool) {
	for _, integration := range c.integrations {
		for trackID, endpoints := range integration.Endpoints {
			for i := range endpoints {
				if path == endpoints[i].Path || strings.HasPrefix(path, endpoints[i].Path+"/") {
					return integration, &endpoints[i], trackID, true
				}
			}
		}
	}
	return nil, nil, "", false
}

// Integrations are every integration, published or not.
func (c *Catalog) Integrations() []*Integration {
	return slices.Clone(c.integrations)
}

// Deployment is what running a track takes. A suspended deployment's schedule
// is left out: it doesn't run on it.
func (c *Catalog) Deployment(env, uid, trackID string) (*ipaasportal.Deployment, error) {
	integration, err := c.Integration(env, uid)
	if err != nil {
		return nil, err
	}
	track, ok := integration.Tracks[trackID]
	if !ok {
		return nil, fmt.Errorf("catalog: component %q track %q: %w", uid, trackID, ErrNotFound)
	}

	deployment := &ipaasportal.Deployment{
		DeploymentTrackID: trackID,
		EnvironmentName:   track.EnvironmentName,
		Schedule:          track.Schedule,
		RuntimeArgs:       track.RuntimeArgs,
	}
	if track.Status == StatusSuspended {
		deployment.Schedule = nil
	}
	return deployment, nil
}

// Executions is one page of a track's runs, newest first. before is the start time
// of the last run of the previous page.
func (c *Catalog) Executions(env, uid, trackID string, limit int, before string) (*ipaasportal.ExecutionPage, error) {
	if _, err := c.automationTrack(env, uid, trackID); err != nil {
		return nil, err
	}
	if limit <= 0 || limit > 100 {
		limit = 10
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	c.settle()

	page := &ipaasportal.ExecutionPage{Items: []ipaasportal.Execution{}}
	for _, r := range c.runs[runKey(uid, trackID)] {
		if before != "" && r.execution.StartTime >= before {
			continue
		}
		if len(page.Items) == limit {
			page.NextCursor = page.Items[len(page.Items)-1].StartTime
			break
		}
		page.Items = append(page.Items, r.execution)
	}
	return page, nil
}

// Trigger starts a run that finishes on its own after runDuration.
func (c *Catalog) Trigger(env, uid, trackID string, args []ipaasportal.ExecutionArg) (*ipaasportal.Execution, error) {
	deployment, err := c.automationTrack(env, uid, trackID)
	if err != nil {
		return nil, err
	}
	if deployment.Status != StatusActive {
		return nil, fmt.Errorf("%w: the deployment on this track is %s", ErrInvalidArgs, deployment.Status)
	}
	if err := checkArgs(deployment.RuntimeArgs, args); err != nil {
		return nil, err
	}

	fails := slices.ContainsFunc(args, func(arg ipaasportal.ExecutionArg) bool {
		return strings.EqualFold(arg.Value, FailValue)
	})

	now := c.now()
	r := &run{
		execution: ipaasportal.Execution{
			JobID:      fmt.Sprintf("%s-manual-%s", deployment.ReleaseName, shortID()),
			Status:     ipaasportal.ExecutionRunning,
			StartTime:  now.UTC().Format(time.RFC3339),
			RevisionID: deployment.ReleaseName,
		},
		fails:    fails,
		finishAt: now.Add(c.runDuration),
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	key := runKey(uid, trackID)
	c.runs[key] = append([]*run{r}, c.runs[key]...)

	return &r.execution, nil
}

func (c *Catalog) automationTrack(env, uid, trackID string) (*Track, error) {
	integration, err := c.Integration(env, uid)
	if err != nil {
		return nil, err
	}
	if integration.Component.DisplayType != ipaasportal.DisplayTypeAutomation {
		return nil, fmt.Errorf("catalog: component %q is not an automation: %w", uid, ErrNotFound)
	}
	deployment, ok := integration.Tracks[trackID]
	if !ok {
		return nil, fmt.Errorf("catalog: component %q track %q: %w", uid, trackID, ErrNotFound)
	}
	return deployment, nil
}

// settle finishes every run whose time is up. The caller holds mu.
func (c *Catalog) settle() {
	now := c.now()
	for _, runs := range c.runs {
		for _, r := range runs {
			if r.execution.Status != ipaasportal.ExecutionRunning || now.Before(r.finishAt) {
				continue
			}
			r.execution.Status = ipaasportal.ExecutionSucceeded
			if r.fails {
				r.execution.Status = ipaasportal.ExecutionFailed
			}
			r.execution.CompletionTime = r.finishAt.UTC().Format(time.RFC3339)
		}
	}
}

func checkArgs(declared []ipaasportal.RuntimeArg, args []ipaasportal.ExecutionArg) error {
	byName := map[string]ipaasportal.RuntimeArg{}
	for _, arg := range declared {
		byName[arg.Name] = arg
	}

	given := map[string]bool{}
	for _, arg := range args {
		spec, ok := byName[arg.Name]
		if !ok {
			return fmt.Errorf("%w: unknown argument %q", ErrInvalidArgs, arg.Name)
		}
		if len(spec.Values) > 0 && !spec.Repeat && !slices.Contains(spec.Values, arg.Value) {
			return fmt.Errorf("%w: %q must be one of %s", ErrInvalidArgs, arg.Name, strings.Join(spec.Values, ", "))
		}
		if strings.TrimSpace(arg.Value) != "" {
			given[arg.Name] = true
		}
	}

	for _, spec := range declared {
		if spec.Required && !given[spec.Name] {
			return fmt.Errorf("%w: %q is required", ErrInvalidArgs, spec.Name)
		}
	}
	return nil
}

func runKey(uid, trackID string) string { return uid + "/" + trackID }

func shortID() string { return strings.ReplaceAll(uuid.NewString(), "-", "")[:8] }

// seedRuns gives a track a history: one run every interval back from now, a
// failure every fifth.
func (c *Catalog) seedRuns(uid, trackID, release string, count int, interval time.Duration) {
	now := c.now()
	runs := make([]*run, 0, count)
	for i := 1; i <= count; i++ {
		start := now.Add(-time.Duration(i) * interval)
		status := ipaasportal.ExecutionSucceeded
		if i%5 == 2 {
			status = ipaasportal.ExecutionFailed
		}
		runs = append(runs, &run{execution: ipaasportal.Execution{
			JobID:          fmt.Sprintf("%s-%d", release, start.Unix()),
			Status:         status,
			StartTime:      start.UTC().Format(time.RFC3339),
			CompletionTime: start.Add(time.Duration(40+i*7) * time.Second).UTC().Format(time.RFC3339),
			RevisionID:     release,
		}})
	}
	sort.Slice(runs, func(i, j int) bool { return runs[i].execution.StartTime > runs[j].execution.StartTime })
	c.runs[runKey(uid, trackID)] = runs
}
