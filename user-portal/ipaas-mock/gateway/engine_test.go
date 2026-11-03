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
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const testStep = time.Second

func newTestEngine(definitions ...*definition) (*Engine, *time.Time) {
	now := time.Date(2026, 11, 1, 9, 0, 0, 0, time.UTC)
	e := NewEngine("test-queue", definitions, testStep)
	e.now = func() time.Time { return now }
	return e, &now
}

func (e *Engine) at(now *time.Time, d time.Duration) {
	*now = now.Add(d)
	for _, r := range e.runs {
		e.advance(r, *now)
	}
}

func nodeNames(r *run) []string {
	names := make([]string, 0, len(r.nodes))
	for _, n := range r.nodes {
		names = append(names, n.Name+":"+n.Status)
	}
	return names
}

func TestPurchaseWaitsForApprovalThenOrders(t *testing.T) {
	e, now := newTestEngine(purchaseApproval())
	r := e.begin(e.definitions[0], map[string]any{"item": "Monitor", "amount": 1500.0, "requester": "Alex"}, nil, *now, testStep)

	e.at(now, 10*testStep)
	assert.Equal(t, StatusRunning, r.status)
	assert.Equal(t, []string{"validateRequest:COMPLETED", "checkBudget:COMPLETED", "approvePurchase:RUNNING"}, nodeNames(r))

	task := e.pendingFor(r)
	require.NotNil(t, task)
	assert.ErrorIs(t, e.completeTask(task, "dana", nil, map[string]any{}, *now), ErrInvalidPayload)
	require.NoError(t, e.completeTask(task, "dana", nil, map[string]any{"approved": true}, *now))
	assert.ErrorIs(t, e.completeTask(task, "dana", nil, map[string]any{"approved": true}, *now), ErrConflict)
	assert.Equal(t, "purchaseApproval.approvePurchase", task.taskName)
	assert.Equal(t, map[string]any{"approved": true}, task.node.Output.(map[string]any)["result"])

	e.at(now, 10*testStep)
	assert.Equal(t, StatusCompleted, r.status)
	assert.Equal(t, "ORDERED", r.result.(map[string]any)["status"])
	assert.Equal(t, "dana", *task.completedBy)
}

func TestSmallPurchaseSkipsApprovalAndOverBudgetExits(t *testing.T) {
	e, now := newTestEngine(purchaseApproval())
	small := e.begin(e.definitions[0], map[string]any{"item": "Mouse", "amount": 40.0, "requester": "Alex"}, nil, *now, testStep)
	large := e.begin(e.definitions[0], map[string]any{"item": "Car", "amount": 90000.0, "requester": "Alex"}, nil, *now, testStep)

	e.at(now, 10*testStep)

	assert.Equal(t, StatusCompleted, small.status)
	assert.NotContains(t, nodeNames(small), "approvePurchase:RUNNING")
	assert.Equal(t, StatusCompleted, large.status)
	assert.Equal(t, "REJECTED", large.result.(map[string]any)["status"])
}

func TestAFailingActivityIsRetriedInOneNodeThenFailsTheRun(t *testing.T) {
	e, now := newTestEngine(purchaseApproval())
	r := e.begin(e.definitions[0], map[string]any{"item": "fail me", "amount": 10.0, "requester": "Alex"}, nil, *now, testStep)

	e.at(now, 20*testStep)

	assert.Equal(t, StatusFailed, r.status)
	var placeOrder []*activityNode
	for _, n := range r.nodes {
		if n.Name == "placeOrder" {
			placeOrder = append(placeOrder, n)
		}
	}
	require.Len(t, placeOrder, 1)
	assert.Equal(t, NodeFailed, placeOrder[0].Status)
	assert.Equal(t, 3, placeOrder[0].Attempt)
}

func TestAReviewRejectionFailsTheRunAndCancelStopsIt(t *testing.T) {
	e, now := newTestEngine(onboardEmployee())
	rejected := e.begin(e.definitions[0], map[string]any{"name": "Sam", "email": "sam@example", "department": "Sales"}, nil, *now, testStep)
	canceled := e.begin(e.definitions[0], map[string]any{"name": "Kim", "email": "kim@example", "department": "Sales"}, nil, *now, testStep)

	e.at(now, 5*testStep)
	review := e.pendingFor(rejected)
	require.NotNil(t, review)
	assert.Equal(t, TriggerPreRun, review.trigger)
	require.NoError(t, e.decideReview(review, "sam", nil, "reject", nil, "wrong team", *now))
	assert.Equal(t, StatusFailed, rejected.status)
	assert.Equal(t, "Review of 'provisionAccounts' was rejected: wrong team", *rejected.errorMsg)
	assert.Equal(t, TaskCompleted, review.status)
	assert.Equal(t, NodeCompleted, review.node.Status)
	assert.Equal(t, "reject", review.node.Output.(map[string]any)["action"])
	assert.Equal(t, "onboardEmployee.provisionAccounts", review.node.Name)

	pending := e.pendingFor(canceled)
	require.NotNil(t, pending)
	require.NoError(t, e.cancel(canceled, *now))
	assert.Equal(t, StatusCanceled, canceled.status)
	assert.Equal(t, TaskCanceled, pending.status)
	assert.ErrorIs(t, e.cancel(canceled, *now), errExecution)
}

func TestSeedLeavesTheSampleTasksWaiting(t *testing.T) {
	e, _ := newTestEngine(purchaseApproval(), onboardEmployee(), offboardEmployee())
	e.now = time.Now

	e.Seed()

	pending := map[string]int{}
	for _, it := range e.items {
		if it.status == TaskPending {
			pending[it.kind]++
		}
	}
	assert.Equal(t, map[string]int{NodeHumanTask: 2, NodeReview: 1}, pending)
}

func TestProceedingAfterAFailureRunsTheActivityAgainAsANewNode(t *testing.T) {
	e, now := newTestEngine(onboardEmployee())
	r := e.begin(e.definitions[0], map[string]any{"name": "Fail Case", "email": "f@example", "department": "IT"}, nil, *now, testStep)

	e.at(now, 5*testStep)
	gate := e.pendingFor(r)
	require.NotNil(t, gate)
	require.NoError(t, e.decideReview(gate, "sam", nil, "proceed-with-input", map[string]any{"systems": []any{"email"}}, "", *now))
	assert.Equal(t, map[string]any{"email": "f@example", "systems": []any{"email"}}, r.overrides[gate.stepIdx], "edits merge over the proposed arguments")

	e.at(now, 5*testStep)
	retry := e.pendingFor(r)
	require.NotNil(t, retry)
	assert.Equal(t, TriggerOnFailure, retry.trigger)
	require.NoError(t, e.decideReview(retry, "sam", nil, "proceed", nil, "", *now))

	e.at(now, testStep)
	var provision []*activityNode
	for _, n := range r.nodes {
		if n.Type == NodeActivity && n.Name == "provisionAccounts" {
			provision = append(provision, n)
		}
	}
	require.Len(t, provision, 2)
	assert.Equal(t, NodeFailed, provision[0].Status)
	assert.Equal(t, 1, provision[1].Attempt)
}
