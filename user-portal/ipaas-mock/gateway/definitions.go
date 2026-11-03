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

package gateway

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// failMarker in a text input makes the sample activities that read it fail.
const failMarker = "fail"

type modelNode struct {
	StepID string `json:"stepId"`
	Kind   string `json:"kind"`
	Target string `json:"target,omitempty"`
	Label  string `json:"label,omitempty"`
	Parent string `json:"parent,omitempty"`
	Branch string `json:"branch,omitempty"`
}

type modelEdge struct {
	From string `json:"from"`
	To   string `json:"to"`
	When string `json:"when,omitempty"`
}

type modelGraph struct {
	File  string      `json:"file,omitempty"`
	Nodes []modelNode `json:"nodes"`
	Edges []modelEdge `json:"edges"`
}

type taskSpec struct {
	title       func(r *run) string
	description string
	roles       []string
	formSchema  string
}

type reviewSpec struct {
	title       func(r *run) string
	description string
	roles       []string
	formSchema  string
}

// step is one call site of a workflow. An ACTIVITY runs for the run's step
// duration; a HUMAN_TASK waits for someone to complete it.
type step struct {
	id   string
	name string
	kind string

	// when skips the step when it returns false.
	when  func(r *run) bool
	input func(r *run) map[string]any
	run   func(r *run, input map[string]any) (any, error)

	// attempts is how many times a failing activity is tried.
	attempts int

	task      *taskSpec
	review    *reviewSpec // asked before the activity runs
	onFailure *reviewSpec // asked once its attempts are spent

	// exit ends the run successfully after this step, with the result it returns.
	exit func(r *run) (bool, any)
}

type seedAction struct {
	after    time.Duration
	by       string
	result   map[string]any
	reject   bool
	feedback string
}

type seedRun struct {
	ago     time.Duration
	input   map[string]any
	actions []seedAction
}

type definition struct {
	workflowType string
	inputSchema  string
	graph        modelGraph
	steps        []step
	result       func(r *run) any
	seeds        []seedRun
}

func definitionsFor(component string) []*definition {
	switch component {
	case "purchase-request":
		return []*definition{purchaseApproval()}
	case "employee-lifecycle":
		return []*definition{onboardEmployee(), offboardEmployee()}
	}
	return nil
}

func str(m map[string]any, key string) string {
	v, _ := m[key].(string)
	return v
}

func num(m map[string]any, key string) float64 {
	switch v := m[key].(type) {
	case float64:
		return v
	case int:
		return float64(v)
	case string:
		var f float64
		_, _ = fmt.Sscanf(v, "%g", &f)
		return f
	}
	return 0
}

func flag(v any, key string) bool {
	m, _ := v.(map[string]any)
	b, _ := m[key].(bool)
	return b
}

func orderNumber() string {
	return "PO-" + strings.ToUpper(uuid.NewString()[:8])
}

const budgetLimit = 5000
const approvalThreshold = 1000

func purchaseApproval() *definition {
	return &definition{
		workflowType: "purchaseApproval",
		inputSchema: `{
  "type": "object",
  "required": ["item", "amount", "requester"],
  "properties": {
    "item": {"type": "string", "title": "Item", "description": "What to buy."},
    "amount": {"type": "number", "title": "Amount (USD)", "minimum": 1},
    "requester": {"type": "string", "title": "Requester"},
    "justification": {"type": "string", "title": "Justification", "format": "textarea"}
  }
}`,
		graph: modelGraph{
			File: "purchase_approval.bal",
			Nodes: []modelNode{
				{StepID: "validateRequest#1", Kind: "ACTIVITY", Target: "validateRequest"},
				{StepID: "checkBudget#1", Kind: "ACTIVITY", Target: "checkBudget"},
				{StepID: "if#1", Kind: "BRANCH", Label: "!withinBudget"},
				{StepID: "exit#1", Kind: "EXIT", Parent: "if#1", Branch: "then"},
				{StepID: "if#2", Kind: "BRANCH", Label: fmt.Sprintf("amount > %d", approvalThreshold)},
				{StepID: "approvePurchase#1", Kind: "HUMAN_TASK", Target: "approvePurchase", Parent: "if#2", Branch: "then"},
				{StepID: "if#3", Kind: "BRANCH", Label: "!approved", Parent: "if#2", Branch: "then"},
				{StepID: "exit#2", Kind: "EXIT", Parent: "if#3", Branch: "then"},
				{StepID: "placeOrder#1", Kind: "ACTIVITY", Target: "placeOrder"},
				{StepID: "notifyRequester#1", Kind: "ACTIVITY", Target: "notifyRequester"},
			},
			Edges: []modelEdge{
				{From: "validateRequest#1", To: "checkBudget#1"},
				{From: "checkBudget#1", To: "if#1"},
				{From: "if#1", To: "exit#1", When: "then"},
				{From: "if#1", To: "if#2"},
				{From: "if#2", To: "approvePurchase#1", When: "then"},
				{From: "approvePurchase#1", To: "if#3"},
				{From: "if#3", To: "exit#2", When: "then"},
				{From: "if#2", To: "placeOrder#1"},
				{From: "placeOrder#1", To: "notifyRequester#1"},
			},
		},
		steps: []step{
			{
				id: "validateRequest#1", name: "validateRequest", kind: NodeActivity,
				input: func(r *run) map[string]any { return r.input },
				run: func(_ *run, in map[string]any) (any, error) {
					if strings.TrimSpace(str(in, "item")) == "" || num(in, "amount") <= 0 {
						return nil, errors.New("item and a positive amount are required")
					}
					return map[string]any{"valid": true}, nil
				},
			},
			{
				id: "checkBudget#1", name: "checkBudget", kind: NodeActivity,
				input: func(r *run) map[string]any {
					return map[string]any{"amount": r.input["amount"], "costCentre": "CC-100"}
				},
				run: func(_ *run, in map[string]any) (any, error) {
					amount := num(in, "amount")
					return map[string]any{"withinBudget": amount <= budgetLimit, "remaining": budgetLimit - amount}, nil
				},
				exit: func(r *run) (bool, any) {
					if flag(r.vars["checkBudget"], "withinBudget") {
						return false, nil
					}
					return true, map[string]any{"status": "REJECTED", "reason": "Over the cost centre's budget"}
				},
			},
			{
				id: "approvePurchase#1", name: "approvePurchase", kind: NodeHumanTask,
				when: func(r *run) bool { return num(r.input, "amount") > approvalThreshold },
				input: func(r *run) map[string]any {
					return map[string]any{
						"item": r.input["item"], "amount": r.input["amount"],
						"requester": r.input["requester"], "justification": r.input["justification"],
					}
				},
				task: &taskSpec{
					title: func(r *run) string {
						return fmt.Sprintf("Purchase %s for %s", str(r.input, "item"), str(r.input, "requester"))
					},
					description: "Approve or reject this purchase. Purchases over 1,000 USD need Finance approval.",
					roles:       []string{"finance-approver"},
					formSchema: `{
  "type": "object",
  "required": ["approved"],
  "properties": {
    "approved": {"type": "boolean", "title": "Approve this purchase"},
    "comment": {"type": "string", "title": "Comment", "format": "textarea"}
  }
}`,
				},
				exit: func(r *run) (bool, any) {
					if flag(r.vars["approvePurchase"], "approved") {
						return false, nil
					}
					comment, _ := r.vars["approvePurchase"].(map[string]any)["comment"].(string)
					return true, map[string]any{"status": "REJECTED", "reason": "Rejected by Finance", "comment": comment}
				},
			},
			{
				id: "placeOrder#1", name: "placeOrder", kind: NodeActivity, attempts: 3,
				input: func(r *run) map[string]any {
					return map[string]any{"item": r.input["item"], "amount": r.input["amount"], "vendor": "Default vendor"}
				},
				run: func(_ *run, in map[string]any) (any, error) {
					if strings.Contains(strings.ToLower(str(in, "item")), failMarker) {
						return nil, errors.New("vendor API answered 503 Service Unavailable")
					}
					return map[string]any{"orderId": orderNumber(), "eta": "3 business days"}, nil
				},
			},
			{
				id: "notifyRequester#1", name: "notifyRequester", kind: NodeActivity,
				input: func(r *run) map[string]any {
					return map[string]any{"to": r.input["requester"], "order": r.vars["placeOrder"]}
				},
				run: func(_ *run, in map[string]any) (any, error) {
					return map[string]any{"notified": in["to"], "channel": "email"}, nil
				},
			},
		},
		result: func(r *run) any {
			order, _ := r.vars["placeOrder"].(map[string]any)
			return map[string]any{"status": "ORDERED", "orderId": order["orderId"]}
		},
		seeds: []seedRun{
			{ago: 72 * time.Hour, input: map[string]any{"item": "Ergonomic chair", "amount": 420.0, "requester": "Priya Raman", "justification": "Back pain."}},
			{ago: 50 * time.Hour, input: map[string]any{"item": "Conference booth", "amount": 8200.0, "requester": "Marco Silva", "justification": "Trade show in March."}},
			{ago: 30 * time.Hour, input: map[string]any{"item": "Studio monitors", "amount": 1600.0, "requester": "Lena Fischer"},
				actions: []seedAction{{after: 40 * time.Minute, by: "dana", result: map[string]any{"approved": true, "comment": "Within the AV budget."}}}},
			{ago: 26 * time.Hour, input: map[string]any{"item": "Team offsite", "amount": 4800.0, "requester": "Marco Silva"},
				actions: []seedAction{{after: 2 * time.Hour, by: "dana", result: map[string]any{"approved": false, "comment": "Postpone to next quarter."}}}},
			{ago: 20 * time.Hour, input: map[string]any{"item": "Server rack (fail test)", "amount": 900.0, "requester": "Ops"}},
			{ago: 14 * time.Minute, input: map[string]any{"item": "MacBook Neo", "amount": 2400.0, "requester": "John Doe", "justification": "Replacement for a failed laptop."}},
		},
	}
}

const accountSystems = `["email", "github", "jira", "slack", "vpn"]`

func onboardEmployee() *definition {
	return &definition{
		workflowType: "onboardEmployee",
		inputSchema: `{
  "type": "object",
  "required": ["name", "email", "department"],
  "properties": {
    "name": {"type": "string", "title": "Full name"},
    "email": {"type": "string", "title": "Work email", "format": "email"},
    "department": {"type": "string", "title": "Department", "enum": ["Engineering", "Finance", "People", "Sales"]},
    "startDate": {"type": "string", "title": "Start date", "format": "date"},
    "remote": {"type": "boolean", "title": "Works remotely"}
  }
}`,
		graph: modelGraph{
			File: "onboarding.bal",
			Nodes: []modelNode{
				{StepID: "createProfile#1", Kind: "ACTIVITY", Target: "createProfile"},
				{StepID: "provisionAccounts#1", Kind: "ACTIVITY", Target: "provisionAccounts"},
				{StepID: "assignBuddy#1", Kind: "HUMAN_TASK", Target: "assignBuddy"},
				{StepID: "sendWelcome#1", Kind: "ACTIVITY", Target: "sendWelcome"},
			},
			Edges: []modelEdge{
				{From: "createProfile#1", To: "provisionAccounts#1"},
				{From: "provisionAccounts#1", To: "assignBuddy#1"},
				{From: "assignBuddy#1", To: "sendWelcome#1"},
			},
		},
		steps: []step{
			{
				id: "createProfile#1", name: "createProfile", kind: NodeActivity,
				input: func(r *run) map[string]any { return r.input },
				run: func(_ *run, in map[string]any) (any, error) {
					return map[string]any{"employeeId": "E-" + strings.ToUpper(uuid.NewString()[:6]), "department": in["department"]}, nil
				},
			},
			{
				id: "provisionAccounts#1", name: "provisionAccounts", kind: NodeActivity,
				input: func(r *run) map[string]any {
					return map[string]any{"email": r.input["email"], "systems": []any{"email", "github", "jira", "slack"}}
				},
				run: func(r *run, in map[string]any) (any, error) {
					if strings.Contains(strings.ToLower(str(r.input, "name")), failMarker) {
						return nil, errors.New("directory API rejected the account: duplicate email")
					}
					return map[string]any{"provisioned": in["systems"]}, nil
				},
				review: &reviewSpec{
					title:       func(r *run) string { return "Review accounts for " + str(r.input, "name") },
					description: "IT checks which systems the new employee gets before the accounts are created.",
					roles:       []string{"it-admin"},
					formSchema: `{
  "type": "object",
  "required": ["email", "systems"],
  "properties": {
    "email": {"type": "string", "title": "Work email", "format": "email"},
    "systems": {"type": "array", "title": "Systems", "items": {"type": "string", "enum": ` + accountSystems + `}, "uniqueItems": true}
  }
}`,
				},
				onFailure: &reviewSpec{
					title:       func(r *run) string { return "Account provisioning failed for " + str(r.input, "name") },
					description: "Fix the input and retry, or reject to stop onboarding.",
					roles:       []string{"it-admin"},
					formSchema: `{
  "type": "object",
  "required": ["email", "systems"],
  "properties": {
    "email": {"type": "string", "title": "Work email", "format": "email"},
    "systems": {"type": "array", "title": "Systems", "items": {"type": "string", "enum": ` + accountSystems + `}, "uniqueItems": true}
  }
}`,
				},
			},
			{
				id: "assignBuddy#1", name: "assignBuddy", kind: NodeHumanTask,
				input: func(r *run) map[string]any {
					return map[string]any{"name": r.input["name"], "department": r.input["department"], "startDate": r.input["startDate"]}
				},
				task: &taskSpec{
					title:       func(r *run) string { return "Assign a buddy to " + str(r.input, "name") },
					description: "Pick someone in the team to help the new employee through their first weeks.",
					roles:       []string{"people-partner"},
					formSchema: `{
  "type": "object",
  "required": ["buddy"],
  "properties": {
    "buddy": {"type": "string", "title": "Buddy's email", "format": "email"},
    "note": {"type": "string", "title": "Note for the buddy", "format": "textarea"}
  }
}`,
				},
			},
			{
				id: "sendWelcome#1", name: "sendWelcome", kind: NodeActivity,
				input: func(r *run) map[string]any {
					buddy, _ := r.vars["assignBuddy"].(map[string]any)
					return map[string]any{"to": r.input["email"], "buddy": buddy["buddy"]}
				},
				run: func(_ *run, in map[string]any) (any, error) {
					return map[string]any{"sent": true, "to": in["to"]}, nil
				},
			},
		},
		result: func(r *run) any {
			profile, _ := r.vars["createProfile"].(map[string]any)
			return map[string]any{"employeeId": profile["employeeId"], "status": "ONBOARDED"}
		},
		seeds: []seedRun{
			{ago: 96 * time.Hour, input: map[string]any{"name": "Aiko Tanaka", "email": "aiko@acme.example", "department": "Engineering", "startDate": "2026-10-26"},
				actions: []seedAction{
					{after: 20 * time.Minute, by: "sam"},
					{after: 3 * time.Hour, by: "jordan", result: map[string]any{"buddy": "ravi@acme.example", "note": "Aiko joins the platform team."}},
				}},
			{ago: 6 * time.Hour, input: map[string]any{"name": "Noah Becker", "email": "noah@acme.example", "department": "Finance", "startDate": "2026-11-09"},
				actions: []seedAction{{after: 30 * time.Minute, by: "sam", result: map[string]any{"email": "noah@acme.example", "systems": []any{"email", "jira", "slack"}}}}},
			{ago: 40 * time.Minute, input: map[string]any{"name": "Grace Okafor", "email": "grace@acme.example", "department": "Sales", "startDate": "2026-11-16", "remote": true}},
		},
	}
}

func offboardEmployee() *definition {
	return &definition{
		workflowType: "offboardEmployee",
		inputSchema: `{
  "type": "object",
  "required": ["email", "lastDay"],
  "properties": {
    "email": {"type": "string", "title": "Work email", "format": "email"},
    "lastDay": {"type": "string", "title": "Last working day", "format": "date"},
    "keepMailbox": {"type": "boolean", "title": "Archive the mailbox"}
  }
}`,
		graph: modelGraph{
			File: "offboarding.bal",
			Nodes: []modelNode{
				{StepID: "revokeAccess#1", Kind: "ACTIVITY", Target: "revokeAccess"},
				{StepID: "if#1", Kind: "BRANCH", Label: "keepMailbox"},
				{StepID: "archiveMailbox#1", Kind: "ACTIVITY", Target: "archiveMailbox", Parent: "if#1", Branch: "then"},
				{StepID: "closeHrRecord#1", Kind: "ACTIVITY", Target: "closeHrRecord"},
			},
			Edges: []modelEdge{
				{From: "revokeAccess#1", To: "if#1"},
				{From: "if#1", To: "archiveMailbox#1", When: "then"},
				{From: "if#1", To: "closeHrRecord#1"},
			},
		},
		steps: []step{
			{
				id: "revokeAccess#1", name: "revokeAccess", kind: NodeActivity,
				input: func(r *run) map[string]any { return map[string]any{"email": r.input["email"]} },
				run: func(_ *run, _ map[string]any) (any, error) {
					return map[string]any{"revoked": []any{"email", "github", "jira", "slack", "vpn"}}, nil
				},
			},
			{
				id: "archiveMailbox#1", name: "archiveMailbox", kind: NodeActivity,
				when:  func(r *run) bool { b, _ := r.input["keepMailbox"].(bool); return b },
				input: func(r *run) map[string]any { return map[string]any{"email": r.input["email"]} },
				run: func(_ *run, _ map[string]any) (any, error) {
					return map[string]any{"archive": "s3://mail-archive/" + uuid.NewString()[:8]}, nil
				},
			},
			{
				id: "closeHrRecord#1", name: "closeHrRecord", kind: NodeActivity,
				input: func(r *run) map[string]any {
					return map[string]any{"email": r.input["email"], "lastDay": r.input["lastDay"]}
				},
				run: func(_ *run, _ map[string]any) (any, error) {
					return map[string]any{"closed": true}, nil
				},
			},
		},
		result: func(_ *run) any { return map[string]any{"status": "OFFBOARDED"} },
		seeds: []seedRun{
			{ago: 120 * time.Hour, input: map[string]any{"email": "pat@acme.example", "lastDay": "2026-10-27", "keepMailbox": true}},
		},
	}
}

// checkRequired holds a task's result to its form's required fields, as the
// engine does before it accepts a completion.
func checkRequired(formSchema string, result any) error {
	if formSchema == "" {
		return nil
	}
	var schema struct {
		Required []string `json:"required"`
	}
	if err := json.Unmarshal([]byte(formSchema), &schema); err != nil || len(schema.Required) == 0 {
		return nil
	}
	values, ok := result.(map[string]any)
	if !ok {
		return newError(ErrInvalidPayload, "Invalid payload: the value must be an object")
	}
	for _, name := range schema.Required {
		if v, present := values[name]; !present || v == nil || v == "" {
			return newError(ErrInvalidPayload, "Invalid payload: missing required field '%s'", name)
		}
	}
	return nil
}
