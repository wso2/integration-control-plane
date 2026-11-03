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
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	ipaasportal "github.com/wso2-enterprise/integration-user-portal-service/shared/external-services/ipaas-portal"
)

const workflowManagementTitle = "Workflow Management API"

// Environments the mock org has. The gateway is GatewayEnvironment's.
const (
	DevelopmentEnvironment = "development"
	GatewayEnvironment     = "production"
)

// stableID keeps ids across restarts, so a bookmarked link or a cached list
// stays valid.
func stableID(parts ...string) string {
	return uuid.NewSHA1(uuid.NameSpaceURL, []byte("ipaas-mock/"+strings.Join(parts, "/"))).String()
}

type track struct {
	branch     string
	apiVersion string
	latest     bool
	status     Status
	schedule   *ipaasportal.Schedule
	args       []ipaasportal.RuntimeArg
	history    int
	interval   time.Duration
}

type seedIntegration struct {
	project     string
	name        string
	displayName string
	description string
	kind        ipaasportal.DisplayType
	// published is the environments it is published to the portal in.
	published []string
	scopes    []string
	tracks    []track
	// endpoints are the gateway endpoint names and titles; each track gets them all.
	endpoints [][2]string
}

func (c *Catalog) seed() {
	for _, p := range [][2]string{{"demo", "Demo"}, {"finance", "Finance Ops"}, {"people", "People"}, {"engineering", "Engineering"}} {
		c.projects = append(c.projects, ipaasportal.Project{ID: stableID("project", p[0]), Name: p[1], Handle: p[0]})
	}

	for _, name := range []string{DevelopmentEnvironment, GatewayEnvironment} {
		c.environments = append(c.environments, Environment{ID: stableID("environment", name), Name: name})
	}

	for _, s := range seedIntegrations() {
		c.add(s)
	}
}

func (c *Catalog) add(s seedIntegration) {
	uid := stableID("component", s.project, s.name)
	integration := &Integration{
		Component: ipaasportal.Component{
			UID:         uid,
			Name:        s.name,
			DisplayName: s.displayName,
			Description: s.description,
			DisplayType: s.kind,
		},
		Project:     s.project,
		Scopes:      s.scopes,
		publishedIn: map[string]bool{},
		Tracks:      map[string]*Track{},
		Endpoints:   map[string][]Endpoint{},
	}
	for _, env := range s.published {
		integration.publishedIn[env] = true
	}

	for _, t := range s.tracks {
		trackID := stableID("track", s.project, s.name, t.branch)
		release := fmt.Sprintf("%s-%s-%s", s.name, GatewayEnvironment, trackID[:6])
		integration.Component.DeploymentTracks = append(integration.Component.DeploymentTracks, ipaasportal.DeploymentTrack{
			ID:         trackID,
			Branch:     t.branch,
			APIVersion: t.apiVersion,
			Latest:     t.latest,
		})
		integration.Tracks[trackID] = &Track{
			EnvironmentName: GatewayEnvironment,
			ReleaseName:     release,
			Status:          t.status,
			Schedule:        t.schedule,
			RuntimeArgs:     t.args,
		}

		for _, endpoint := range s.endpoints {
			integration.Endpoints[trackID] = append(integration.Endpoints[trackID], Endpoint{
				Name:        endpoint[0],
				DisplayName: endpoint[1],
				Path:        fmt.Sprintf("/%s/%s/%s-%s/%s", c.org.Handle, s.project, s.name, endpoint[0], t.apiVersion),
			})
		}

		if s.kind == ipaasportal.DisplayTypeAutomation && t.history > 0 {
			c.seedRuns(uid, trackID, release, t.history, t.interval)
		}
	}

	c.integrations = append(c.integrations, integration)
}

func seedIntegrations() []seedIntegration {
	return []seedIntegration{
		{
			project: "demo", name: "math-tutor", displayName: "AI Math Tutor Agent",
			description: "An AI-powered math tutor that uses Azure OpenAI's GPT models to assist with specific math problems, explain each step, and check your answers.",
			kind:        ipaasportal.DisplayTypeAIAgent,
			published:   []string{DevelopmentEnvironment, GatewayEnvironment},
			scopes:      []string{"tutor:chat"},
			tracks:      []track{{branch: "main", apiVersion: "v1.0", latest: true, status: StatusActive}},
			endpoints:   [][2]string{{"chat", "Chat API"}},
		},
		{
			project: "people", name: "hr-assistant", displayName: "HR Policy Assistant",
			description: "Answers questions about leave, benefits and travel policies, and points you to the right form.",
			kind:        ipaasportal.DisplayTypeAIAgent,
			published:   []string{GatewayEnvironment},
			scopes:      []string{"hr:policies:read", "hr:benefits:read"},
			tracks: []track{
				{branch: "main", apiVersion: "v2.0", latest: true, status: StatusActive},
				{branch: "release-1.x", apiVersion: "v1.0", status: StatusActive},
			},
			endpoints: [][2]string{{"chat", "Policy chat"}, {"benefits", "Benefits chat"}},
		},
		{
			project: "demo", name: "repo-creation", displayName: "Repository Creation",
			description: "Automates the creation of new Git repositories with standardized structure, permissions, and CI configuration.",
			kind:        ipaasportal.DisplayTypeAutomation,
			published:   []string{DevelopmentEnvironment, GatewayEnvironment},
			tracks: []track{{
				branch: "main", latest: true, status: StatusActive, history: 6, interval: 5 * time.Hour,
				args: []ipaasportal.RuntimeArg{
					{Name: "repoName", Type: "string", Required: true, Prefix: "--", DisplayName: "Repository name", Description: "Lower case, digits and dashes."},
					{Name: "visibility", Type: "string", Required: true, Prefix: "--", DisplayName: "Visibility", Values: []string{"private", "internal", "public"}},
					{Name: "template", Type: "string", Prefix: "--", DisplayName: "Template", Description: "Starter layout for the repository.", Values: []string{"ballerina-service", "go-service", "react-app", "empty"}},
					{Name: "maintainers", Type: "string", Prefix: "--", DisplayName: "Maintainers", Description: "GitHub user names.", Repeat: true, Delimiter: ","},
					{Name: "enableCI", Type: "boolean", Prefix: "--", DisplayName: "Enable CI", Description: "Adds the standard build workflow."},
				},
			}},
		},
		{
			project: "finance", name: "invoice-sync", displayName: "Nightly Invoice Sync",
			description: "Copies the day's approved invoices from the ERP to the ledger and flags mismatches for review.",
			kind:        ipaasportal.DisplayTypeAutomation,
			published:   []string{GatewayEnvironment},
			tracks: []track{{
				branch: "main", latest: true, status: StatusActive, history: 14, interval: 24 * time.Hour,
				schedule: &ipaasportal.Schedule{Cron: "0 2 * * *", Timezone: "Asia/Colombo"},
			}},
		},
		{
			project: "finance", name: "expense-report", displayName: "Expense Report",
			description: "Builds the expense report for a cost centre and a period, and mails it to the cost centre owner.",
			kind:        ipaasportal.DisplayTypeAutomation,
			published:   []string{GatewayEnvironment},
			tracks: []track{
				{
					branch: "main", latest: true, status: StatusActive, history: 8, interval: 7 * 24 * time.Hour,
					schedule: &ipaasportal.Schedule{Cron: "30 8 * * MON", Timezone: "UTC"},
					args: []ipaasportal.RuntimeArg{
						{Name: "costCentre", Type: "string", Required: true, Prefix: "--", DisplayName: "Cost centre", Values: []string{"CC-100", "CC-200", "CC-300"}},
						{Name: "days", Type: "int", Prefix: "--", DisplayName: "Days to cover", Description: "Defaults to 7."},
						{Name: "format", Type: "string", Prefix: "--", DisplayName: "Format", Values: []string{"pdf", "csv"}},
					},
				},
				{
					branch: "release-1.x", status: StatusSuspended, history: 3, interval: 30 * 24 * time.Hour,
					schedule: &ipaasportal.Schedule{Cron: "0 9 1 * *", Timezone: "UTC"},
				},
			},
		},
		{
			project: "engineering", name: "cache-warmup", displayName: "Cache Warm-up",
			description: "Pre-loads the product catalog cache before peak hours.",
			kind:        ipaasportal.DisplayTypeAutomation,
			tracks:      []track{{branch: "main", latest: true, status: StatusActive}},
		},
		{
			project: "finance", name: "purchase-request", displayName: "Purchase Request",
			description: "Routes employee purchase requests through validation and budget checks, pauses for Finance approval on high-value items, then places the order and notifies the requester. Small purchases are approved automatically.",
			kind:        ipaasportal.DisplayTypeWorkflow,
			published:   []string{GatewayEnvironment},
			scopes:      []string{"purchase:request", "purchase:approve"},
			tracks:      []track{{branch: "main", apiVersion: "v1.0", latest: true, status: StatusActive}},
			endpoints:   [][2]string{{"management", workflowManagementTitle}},
		},
		{
			project: "people", name: "employee-lifecycle", displayName: "Employee Lifecycle",
			description: "Onboards and offboards employees: creates or revokes accounts after a review by IT, assigns a buddy, and keeps HR records in step.",
			kind:        ipaasportal.DisplayTypeWorkflow,
			published:   []string{DevelopmentEnvironment, GatewayEnvironment},
			scopes:      []string{"people:lifecycle", "hr:policies:read"},
			tracks:      []track{{branch: "main", apiVersion: "v1.0", latest: true, status: StatusActive}},
			endpoints:   [][2]string{{"management", workflowManagementTitle}},
		},
	}
}
