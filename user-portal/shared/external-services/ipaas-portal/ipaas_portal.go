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

package ipaasportal

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	neturl "net/url"
	"strconv"

	"go.uber.org/zap"

	"github.com/wso2-enterprise/integration-user-portal-service/shared/common"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/infrastructure/httpclient"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/infrastructure/logging"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/infrastructure/oauth"
)

const serviceName = "ipaasPortal"

var ErrInvalidCursor = errors.New("cursor is not one this listing gave")

type DisplayType string

const (
	DisplayTypeAIAgent    DisplayType = "aiAgent"
	DisplayTypeAutomation DisplayType = "automation"
	DisplayTypeWorkflow   DisplayType = "workflow"
)

type ExecutionStatus string

const (
	ExecutionRunning   ExecutionStatus = "Running"
	ExecutionSucceeded ExecutionStatus = "Succeeded"
	ExecutionFailed    ExecutionStatus = "Failed"
)

type Project struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Handle string `json:"handle"`
}

type ProjectList struct {
	Items []Project `json:"items"`
}

type Component struct {
	UID              string            `json:"uid"`
	Name             string            `json:"name"`
	DisplayName      string            `json:"displayName"`
	Description      string            `json:"description"`
	DisplayType      DisplayType       `json:"displayType"`
	Project          Project           `json:"project"`
	DeploymentTracks []DeploymentTrack `json:"deploymentTracks"`
}

type ComponentPage struct {
	Items      []Component `json:"items"`
	NextCursor string      `json:"nextCursor,omitempty"`
	TotalCount int         `json:"totalCount"`
}

type ComponentQuery struct {
	Kinds    []DisplayType
	Projects []string
	Search   string
	Limit    int
	Cursor   string
}

type DeploymentTrack struct {
	ID         string     `json:"id"`
	Branch     string     `json:"branch"`
	APIVersion string     `json:"apiVersion,omitempty"`
	Latest     bool       `json:"latest"`
	Endpoints  []Endpoint `json:"endpoints,omitempty"`
}

type Deployment struct {
	DeploymentTrackID string       `json:"deploymentTrackId"`
	EnvironmentName   string       `json:"environmentName"`
	Schedule          *Schedule    `json:"schedule,omitempty"`
	RuntimeArgs       []RuntimeArg `json:"runtimeArgs,omitempty"`
}

type Schedule struct {
	Cron     string `json:"cron"`
	Timezone string `json:"timezone"`
}

type Endpoint struct {
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
	URL         string `json:"url"`
}

type RuntimeArg struct {
	Name        string   `json:"name"`
	Type        string   `json:"type"`
	Required    bool     `json:"required"`
	Prefix      string   `json:"prefix,omitempty"`
	DisplayName string   `json:"displayName,omitempty"`
	Description string   `json:"description,omitempty"`
	Delimiter   string   `json:"delimiter,omitempty"`
	Values      []string `json:"values,omitempty"`
	Repeat      bool     `json:"repeat,omitempty"`
}

type ExecutionArg struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

type TriggerRequest struct {
	Args []ExecutionArg `json:"args"`
}

type Execution struct {
	JobID          string          `json:"jobId"`
	Status         ExecutionStatus `json:"status"`
	StartTime      string          `json:"startTime"`
	CompletionTime string          `json:"completionTime,omitempty"`
	RevisionID     string          `json:"revisionId,omitempty"`
}

type ExecutionPage struct {
	Items      []Execution `json:"items"`
	NextCursor string      `json:"nextCursor,omitempty"`
}

type PublishedScopes struct {
	Scopes []string `json:"scopes"`
}

type ErrorBody struct {
	Error string `json:"error"`
}

type InvalidArgsError struct {
	Message string
}

func (e *InvalidArgsError) Error() string {
	return "arguments rejected: " + e.Message
}

type Scope struct {
	OrgUUID common.ID
	EnvID   common.ID
}

type Client interface {
	GetProjects(ctx context.Context, scope Scope, kinds []DisplayType) ([]Project, error)
	GetComponents(ctx context.Context, scope Scope, query ComponentQuery) (*ComponentPage, error)
	GetComponent(ctx context.Context, scope Scope, componentID string) (*Component, error)
	GetDeployment(ctx context.Context, scope Scope, componentID, trackID string) (*Deployment, error)
	GetExecutions(ctx context.Context, scope Scope, componentID, trackID string, limit int, before string) (*ExecutionPage, error)
	TriggerExecution(ctx context.Context, scope Scope, componentID, trackID string, args []ExecutionArg) (*Execution, error)
	GetScopes(ctx context.Context, scope Scope) ([]string, error)
}

type Config struct {
	BaseURL      string
	TokenURL     string
	ClientID     string
	ClientSecret string
	Scopes       string
}

type client struct {
	baseURL string
	http    *httpclient.Client

	// tokens is the portal client's M2M token every call carries.
	tokens *oauth.ClientCredentials
}

func NewClient(cfg Config, opts ...httpclient.Option) Client {
	opts = append([]httpclient.Option{httpclient.WithServiceName(serviceName)}, opts...)
	hc := httpclient.New(opts...)

	return &client{
		baseURL: cfg.BaseURL,
		http:    hc,
		tokens: oauth.New(hc, oauth.Config{
			ServiceName:  serviceName,
			TokenURL:     cfg.TokenURL,
			ClientID:     cfg.ClientID,
			ClientSecret: cfg.ClientSecret,
			Scopes:       cfg.Scopes,
		}),
	}
}

func (svc *client) bearer(ctx context.Context, op string) (httpclient.RequestOption, error) {
	token, err := svc.tokens.Token(ctx)
	if err != nil {
		return nil, fmt.Errorf("%s:%s: %w", serviceName, op, err)
	}
	return httpclient.WithHeader("Authorization", "Bearer "+token), nil
}

func (svc *client) tokenRejected(ctx context.Context, op string) {
	logging.S(ctx).Infow("ipaas-service token was rejected, minting a new one",
		"service", serviceName, "op", op,
	)
	svc.tokens.Invalidate()
}

func getJSON[T any](ctx context.Context, svc *client, op, url string, opts ...httpclient.RequestOption) (T, error) {
	get := func() (T, error) {
		auth, err := svc.bearer(ctx, op)
		if err != nil {
			var zero T
			return zero, err
		}
		return httpclient.GetJSON[T](ctx, svc.http, op, url, append([]httpclient.RequestOption{auth}, opts...)...)
	}

	out, err := get()
	var statusErr *httpclient.StatusError
	if errors.As(err, &statusErr) && statusErr.StatusCode == http.StatusUnauthorized {
		svc.tokenRejected(ctx, op)
		return get()
	}
	return out, err
}

func (svc *client) do(
	ctx context.Context, op, method, url string, body any, opts ...httpclient.RequestOption,
) (*httpclient.Response, error) {
	send := func() (*httpclient.Response, error) {
		auth, err := svc.bearer(ctx, op)
		if err != nil {
			return nil, err
		}
		resp, err := svc.http.Do(ctx, method, url, body, append([]httpclient.RequestOption{auth}, opts...)...)
		if err != nil {
			return nil, fmt.Errorf("%s:%s: %w", serviceName, op, err)
		}
		return resp, nil
	}

	resp, err := send()
	if err == nil && resp.StatusCode == http.StatusUnauthorized {
		svc.tokenRejected(ctx, op)
		return send()
	}
	return resp, err
}

func (svc *client) envURL(scope Scope, format string, args ...any) string {
	escaped := make([]any, len(args))
	for i, arg := range args {
		escaped[i] = neturl.PathEscape(fmt.Sprint(arg))
	}
	return fmt.Sprintf("%s/orgs/%s/environments/%s", svc.baseURL, scope.OrgUUID, scope.EnvID) + fmt.Sprintf(format, escaped...)
}

func (svc *client) GetProjects(ctx context.Context, scope Scope, kinds []DisplayType) ([]Project, error) {
	operationName := "GetProjects"
	params := neturl.Values{}
	for _, kind := range kinds {
		params.Add("kind", string(kind))
	}
	url := svc.envURL(scope, "/projects")
	if len(params) > 0 {
		url += "?" + params.Encode()
	}

	list, err := getJSON[*ProjectList](ctx, svc, operationName, url)
	if err != nil {
		return nil, err
	}
	if list == nil {
		return nil, fmt.Errorf("%s:%s: unexpected empty data in response", serviceName, operationName)
	}
	return list.Items, nil
}

func (svc *client) GetComponents(ctx context.Context, scope Scope, query ComponentQuery) (*ComponentPage, error) {
	operationName := "GetComponents"

	params := neturl.Values{}
	for _, kind := range query.Kinds {
		params.Add("kind", string(kind))
	}
	for _, project := range query.Projects {
		params.Add("project", project)
	}
	if query.Search != "" {
		params.Set("search", query.Search)
	}
	if query.Limit > 0 {
		params.Set("limit", strconv.Itoa(query.Limit))
	}
	if query.Cursor != "" {
		params.Set("cursor", query.Cursor)
	}
	url := svc.envURL(scope, "/components")
	if len(params) > 0 {
		url += "?" + params.Encode()
	}

	page, err := getJSON[*ComponentPage](ctx, svc, operationName, url)
	var statusErr *httpclient.StatusError
	if errors.As(err, &statusErr) && statusErr.StatusCode == http.StatusBadRequest && query.Cursor != "" {
		return nil, fmt.Errorf("%s:%s: %w", serviceName, operationName, ErrInvalidCursor)
	}
	if err != nil {
		return nil, err
	}
	if page == nil {
		return nil, fmt.Errorf("%s:%s: unexpected empty data in response", serviceName, operationName)
	}
	if page.Items == nil {
		page.Items = []Component{}
	}
	return page, nil
}

func (svc *client) GetComponent(ctx context.Context, scope Scope, componentID string) (*Component, error) {
	operationName := "GetComponent"
	ctx = logging.With(ctx, zap.String("componentId", componentID))
	url := svc.envURL(scope, "/components/%s", componentID)

	component, err := getJSON[*Component](ctx, svc, operationName, url)
	if err != nil {
		return nil, err
	}
	if component == nil {
		return nil, fmt.Errorf("%s:%s: unexpected empty data in response", serviceName, operationName)
	}
	return component, nil
}

func (svc *client) GetDeployment(ctx context.Context, scope Scope, componentID, trackID string) (*Deployment, error) {
	operationName := "GetDeployment"
	ctx = logging.With(ctx, zap.String("componentId", componentID), zap.String("deploymentTrackId", trackID))
	url := svc.envURL(scope, "/components/%s/deployment-tracks/%s/deployment", componentID, trackID)

	deployment, err := getJSON[*Deployment](ctx, svc, operationName, url)
	if err != nil {
		return nil, err
	}
	if deployment == nil {
		return nil, fmt.Errorf("%s:%s: unexpected empty data in response", serviceName, operationName)
	}
	return deployment, nil
}

func (svc *client) GetExecutions(
	ctx context.Context, scope Scope, componentID, trackID string, limit int, before string,
) (*ExecutionPage, error) {
	operationName := "GetExecutions"
	ctx = logging.With(ctx, zap.String("componentId", componentID), zap.String("deploymentTrackId", trackID))

	query := neturl.Values{}
	if limit > 0 {
		query.Set("limit", strconv.Itoa(limit))
	}
	if before != "" {
		query.Set("before", before)
	}
	url := svc.envURL(scope, "/components/%s/deployment-tracks/%s/executions", componentID, trackID)
	if len(query) > 0 {
		url += "?" + query.Encode()
	}

	page, err := getJSON[*ExecutionPage](ctx, svc, operationName, url)
	if err != nil {
		return nil, err
	}
	if page == nil {
		return nil, fmt.Errorf("%s:%s: unexpected empty data in response", serviceName, operationName)
	}
	if page.Items == nil {
		page.Items = []Execution{}
	}
	return page, nil
}

func (svc *client) TriggerExecution(
	ctx context.Context, scope Scope, componentID, trackID string, args []ExecutionArg,
) (*Execution, error) {
	operationName := "TriggerExecution"
	ctx = logging.With(ctx, zap.String("componentId", componentID), zap.String("deploymentTrackId", trackID))
	url := svc.envURL(scope, "/components/%s/deployment-tracks/%s/executions", componentID, trackID)

	if args == nil {
		args = []ExecutionArg{}
	}

	resp, err := svc.do(ctx, operationName, http.MethodPost, url, TriggerRequest{Args: args})
	if err != nil {
		return nil, err
	}
	if resp.StatusCode == http.StatusBadRequest {
		var body ErrorBody
		if err := resp.DecodeJSON(&body); err == nil && body.Error != "" {
			return nil, fmt.Errorf("%s:%s: %w", serviceName, operationName, &InvalidArgsError{Message: body.Error})
		}
	}
	// Do reports a non-2xx as a Response with a nil error, so classify it here.
	if !resp.IsSuccess() {
		httpclient.LogUpstreamFailure(ctx, serviceName, operationName, resp)
		return nil, httpclient.Classify(resp.StatusError(http.MethodPost, url))
	}

	var execution Execution
	if err := resp.DecodeJSON(&execution); err != nil {
		return nil, fmt.Errorf("%s:%s: unmarshal response: %w", serviceName, operationName, err)
	}
	return &execution, nil
}

func (svc *client) GetScopes(ctx context.Context, scope Scope) ([]string, error) {
	operationName := "GetScopes"
	url := svc.envURL(scope, "/scopes")

	published, err := getJSON[*PublishedScopes](ctx, svc, operationName, url)
	if err != nil {
		return nil, err
	}
	if published == nil {
		return nil, fmt.Errorf("%s:%s: unexpected empty data in response", serviceName, operationName)
	}
	return published.Scopes, nil
}
