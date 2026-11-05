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

package gateway

import (
	"context"
	"errors"
	"fmt"
	"maps"
	"slices"
	"sort"
	"strconv"
	"sync"
	"time"

	"github.com/google/uuid"
)

// Wire values of the workflow Management API. CANCELED has one L, as the API spells it.
const (
	StatusRunning   = "RUNNING"
	StatusCompleted = "COMPLETED"
	StatusFailed    = "FAILED"
	StatusCanceled  = "CANCELED"

	TaskPending   = "PENDING"
	TaskCompleted = "COMPLETED"
	TaskCanceled  = "CANCELED"

	NodeActivity  = "ACTIVITY"
	NodeHumanTask = "HUMAN_TASK"
	NodeReview    = "REVIEW_ACTIVITY"

	// A task or review waiting on a person is a RUNNING child: the engine sets WAITING only on data events.
	NodeRunning   = "RUNNING"
	NodeCompleted = "COMPLETED"
	NodeFailed    = "FAILED"
	NodeCanceled  = "CANCELED"

	TriggerPreRun    = "PRE_RUN"
	TriggerOnFailure = "ON_FAILURE"

	// completedAsAudience is how the engine records a task completed by someone it was assigned to.
	completedAsAudience = "audience"

	// namespace is the Temporal namespace the engine reports: its default.
	namespace = "default"

	timeLayout = "2006-01-02T15:04:05.000Z07:00"

	// seedStepDuration is how long a step of a seeded, historical run took.
	seedStepDuration = 45 * time.Second
	tickInterval     = 500 * time.Millisecond
)

// Each sentinel is one of the engine's error codes, and so one HTTP status.
var (
	ErrNotFound       = errors.New("not found")       // 404
	ErrForbidden      = errors.New("access denied")   // 403
	ErrInvalid        = errors.New("invalid request") // 400
	ErrConflict       = errors.New("conflict")        // 409
	ErrInvalidPayload = errors.New("invalid payload") // 422
)

// engineError carries the engine's message as is, and the code it maps to.
type engineError struct {
	code    error
	message string
}

func (e *engineError) Error() string { return e.message }
func (e *engineError) Unwrap() error { return e.code }

func newError(code error, format string, args ...any) error {
	return &engineError{code: code, message: fmt.Sprintf(format, args...)}
}

type phase int

const (
	phaseIdle phase = iota
	phaseRunning
	phaseWaitTask
	phaseWaitReview
)

type failure struct {
	Message string  `json:"message"`
	Type    *string `json:"type"`
	Cause   *string `json:"cause"`
}

// activityNode is the engine's ActivityTreeNode. reviewStepId is in the record but the engine never
// fills it, and displayName stays null because these definitions declare no @display labels.
type activityNode struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Type         string   `json:"type"`
	Status       string   `json:"status"`
	StartTime    *string  `json:"startTime"`
	EndTime      *string  `json:"endTime"`
	Input        any      `json:"input"`
	Output       any      `json:"output"`
	Failure      *failure `json:"failure"`
	Attempt      int      `json:"attempt"`
	StepID       *string  `json:"stepId"`
	ReviewStepID *string  `json:"reviewStepId"`
	DisplayName  *string  `json:"displayName"`
	Children     []any    `json:"children"`

	// args is what an activity node runs with; its Input on the wire.
	args map[string]any
}

type run struct {
	def        *definition
	workflowID string
	runID      string
	status     string
	start      time.Time
	close      *time.Time
	startedBy  *string
	input      map[string]any
	vars       map[string]any
	result     any
	errorMsg   *string
	nodes      []*activityNode
	lastEvent  int

	idx          int
	phase        phase
	cursor       time.Time
	stepDuration time.Duration
	attempt      int
	current      *activityNode
	reviewed     map[int]bool
	overrides    map[int]map[string]any
}

// item is a human task or a review: the engine keeps them apart on the wire, and
// together here.
type item struct {
	kind        string
	id          string
	name        string // the step's plain name
	taskName    string // qualified, <workflowType>.<name>, as the engine lists it
	title       string
	description string
	run         *run
	stepIdx     int
	stepID      string
	node        *activityNode
	status      string
	start       time.Time
	close       *time.Time
	completedBy *string
	completedAs *string
	roles       []string
	input       map[string]any
	formSchema  string
	result      any

	// Reviews only.
	trigger      string
	errorMessage string
	decision     *reviewDecision
}

// reviewDecision is the engine's ReviewDecision record, which a review's detail reports once decided.
type reviewDecision struct {
	Action   string         `json:"action"`
	Input    map[string]any `json:"input"`
	Feedback *string        `json:"feedback"`
}

type Engine struct {
	taskQueue    string
	definitions  []*definition
	stepDuration time.Duration

	mu    sync.Mutex
	runs  []*run // newest first
	items []*item

	now func() time.Time
}

func NewEngine(taskQueue string, definitions []*definition, stepDuration time.Duration) *Engine {
	return &Engine{
		taskQueue:    taskQueue,
		definitions:  definitions,
		stepDuration: stepDuration,
		now:          time.Now,
	}
}

// Start advances every running run on a ticker until ctx ends.
func (e *Engine) Start(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(tickInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				e.mu.Lock()
				now := e.now()
				for _, r := range e.runs {
					e.advance(r, now)
				}
				e.mu.Unlock()
			}
		}
	}()
}

// Seed plays each definition's sample runs through from the past, acting on their
// tasks as it goes, so the portal opens on a history.
func (e *Engine) Seed() {
	e.mu.Lock()
	defer e.mu.Unlock()

	now := e.now()
	for _, def := range e.definitions {
		for _, s := range def.seeds {
			r := e.begin(def, s.input, nil, now.Add(-s.ago), seedStepDuration)
			for _, act := range s.actions {
				e.advance(r, now)
				pending := e.pendingFor(r)
				if pending == nil {
					break
				}
				at := r.cursor.Add(act.after)
				if at.After(now) {
					break
				}
				var err error
				switch {
				case pending.kind == NodeHumanTask:
					err = e.completeTask(pending, act.by, pending.roles, act.result, at)
				case act.reject:
					err = e.decideReview(pending, act.by, pending.roles, "reject", nil, act.feedback, at)
				case act.result != nil:
					err = e.decideReview(pending, act.by, pending.roles, "proceed-with-input", act.result, "", at)
				default:
					err = e.decideReview(pending, act.by, pending.roles, "proceed", nil, "", at)
				}
				if err != nil {
					panic(fmt.Sprintf("gateway: seed %s: %v", def.workflowType, err))
				}
			}
			e.advance(r, now)
		}
	}

	sort.SliceStable(e.runs, func(i, j int) bool { return e.runs[i].start.After(e.runs[j].start) })
	sort.SliceStable(e.items, func(i, j int) bool { return e.items[i].start.After(e.items[j].start) })
}

func (e *Engine) definition(workflowType string) *definition {
	for _, def := range e.definitions {
		if def.workflowType == workflowType {
			return def
		}
	}
	return nil
}

// begin starts a run. The caller holds mu.
func (e *Engine) begin(def *definition, input map[string]any, startedBy *string, at time.Time, stepDuration time.Duration) *run {
	r := &run{
		def:          def,
		workflowID:   uuid.Must(uuid.NewV7()).String(),
		runID:        uuid.NewString(),
		status:       StatusRunning,
		start:        at,
		startedBy:    startedBy,
		input:        input,
		vars:         map[string]any{},
		cursor:       at,
		stepDuration: stepDuration,
		attempt:      1,
		reviewed:     map[int]bool{},
		overrides:    map[int]map[string]any{},
	}
	e.runs = append([]*run{r}, e.runs...)
	e.advance(r, at)
	return r
}

// advance moves a run as far as now allows. The caller holds mu.
func (e *Engine) advance(r *run, now time.Time) {
	steps := r.def.steps
	for r.status == StatusRunning {
		if r.idx >= len(steps) {
			// A step that ended the run early has already set its result.
			result := r.result
			if result == nil {
				result = r.def.result(r)
			}
			e.finish(r, StatusCompleted, result, nil, r.cursor)
			return
		}
		st := &steps[r.idx]

		switch r.phase {
		case phaseIdle:
			if st.when != nil && !st.when(r) {
				r.idx++
				continue
			}
			if st.review != nil && !r.reviewed[r.idx] {
				e.openReview(r, st, st.review, TriggerPreRun, "", r.cursor)
				r.phase = phaseWaitReview
				return
			}
			if st.kind == NodeHumanTask {
				e.openTask(r, st, r.cursor)
				r.phase = phaseWaitTask
				return
			}
			args := r.stepInput(st)
			r.current = r.addNode(st, NodeActivity, st.name, args, r.cursor)
			r.current.args = args
			r.phase = phaseRunning

		case phaseRunning:
			end := r.cursor.Add(r.stepDuration)
			if now.Before(end) {
				return
			}
			r.cursor = end

			out, err := st.run(r, r.current.args)
			if err != nil {
				// Temporal retries an activity under the one scheduled event: the node keeps
				// running and counts the attempt, and shows a failure only once none are left.
				if r.attempt < max(st.attempts, 1) {
					r.attempt++
					r.current.Attempt = r.attempt
					continue
				}
				r.current.fail(err.Error(), end)
				if st.onFailure != nil {
					e.openReview(r, st, st.onFailure, TriggerOnFailure, err.Error(), end)
					r.phase = phaseWaitReview
					return
				}
				message := fmt.Sprintf("Activity %s failed after %d attempts: %s", st.name, r.attempt, err)
				e.finish(r, StatusFailed, nil, &message, end)
				return
			}

			r.current.complete(out, end)
			r.vars[st.name] = out
			r.next(st)

		case phaseWaitTask, phaseWaitReview:
			return
		}
	}
}

// next moves past a finished step, unless it ends the run.
func (r *run) next(st *step) {
	r.attempt = 1
	r.current = nil
	r.phase = phaseIdle
	if st.exit != nil {
		if done, result := st.exit(r); done {
			r.result = result
			r.idx = len(r.def.steps)
			return
		}
	}
	r.idx++
}

func (r *run) stepInput(st *step) map[string]any {
	if override, ok := r.overrides[r.idx]; ok {
		return override
	}
	if st.input == nil {
		return map[string]any{}
	}
	return st.input(r)
}

// addNode adds a node under the next history event id, as the engine numbers nodes.
func (r *run) addNode(st *step, kind, name string, input any, at time.Time) *activityNode {
	r.lastEvent += 6
	stepID := st.id
	start := at.UTC().Format(timeLayout)
	node := &activityNode{
		ID:        strconv.Itoa(r.lastEvent - 1),
		Name:      name,
		Type:      kind,
		Status:    NodeRunning,
		StartTime: &start,
		Input:     input,
		Attempt:   1,
		StepID:    &stepID,
	}
	if kind == NodeActivity {
		node.Attempt = r.attempt
	}
	r.nodes = append(r.nodes, node)
	return node
}

func (n *activityNode) complete(output any, at time.Time) {
	end := at.UTC().Format(timeLayout)
	n.Status, n.Output, n.EndTime = NodeCompleted, output, &end
}

func (n *activityNode) fail(message string, at time.Time) {
	end := at.UTC().Format(timeLayout)
	kind := "ApplicationError"
	n.Status, n.EndTime, n.Failure = NodeFailed, &end, &failure{Message: message, Type: &kind}
}

func (n *activityNode) cancel(at time.Time) {
	end := at.UTC().Format(timeLayout)
	n.Status, n.EndTime = NodeCanceled, &end
}

func (e *Engine) finish(r *run, status string, result any, message *string, at time.Time) {
	if result == nil {
		result = r.result
	}
	r.status, r.result, r.errorMsg = status, result, message
	r.close = &at
	r.phase = phaseIdle
}

// envelope is what the engine starts a task's or review's child workflow with, and so the
// child's node input: the TaskRecord's inputs.
func (it *item) envelope() map[string]any {
	inputs := map[string]any{
		"taskId":             it.id,
		"taskName":           it.taskName,
		"title":              it.title,
		"description":        it.description,
		"userRoles":          rolesList(it.roles),
		"taskInput":          it.input,
		"timeoutMillis":      nil,
		"parentWorkflowId":   it.run.workflowID,
		"parentWorkflowType": it.run.def.workflowType,
	}
	if it.kind == NodeReview {
		inputs["trigger"], inputs["activityName"], inputs["errorMessage"] = it.trigger, it.taskName, it.errorMessage
	}
	return inputs
}

func (e *Engine) openTask(r *run, st *step, at time.Time) {
	it := &item{
		kind:        NodeHumanTask,
		id:          uuid.NewString(),
		name:        st.name,
		taskName:    r.def.workflowType + "." + st.name,
		title:       st.task.title(r),
		description: st.task.description,
		run:         r,
		stepIdx:     r.idx,
		stepID:      st.id,
		status:      TaskPending,
		start:       at,
		roles:       st.task.roles,
		input:       r.stepInput(st),
		formSchema:  st.task.formSchema,
	}
	// A human task's node carries its plain name; the qualified one is the task's own.
	it.node = r.addNode(st, NodeHumanTask, st.name, it.envelope(), at)
	e.items = append([]*item{it}, e.items...)
}

func (e *Engine) openReview(r *run, st *step, rv *reviewSpec, trigger, errorMessage string, at time.Time) {
	it := &item{
		kind:         NodeReview,
		id:           uuid.NewString(),
		name:         st.name,
		taskName:     r.def.workflowType + "." + st.name,
		title:        rv.title(r),
		description:  rv.description,
		run:          r,
		stepIdx:      r.idx,
		stepID:       st.id,
		status:       TaskPending,
		start:        at,
		roles:        rv.roles,
		input:        r.stepInput(st),
		formSchema:   rv.formSchema,
		trigger:      trigger,
		errorMessage: errorMessage,
	}
	// A review's node is named by the qualified task name in its memo.
	it.node = r.addNode(st, NodeReview, it.taskName, it.envelope(), at)
	e.items = append([]*item{it}, e.items...)
}

// pendingFor is the task or review a run waits on, if any. The caller holds mu.
func (e *Engine) pendingFor(r *run) *item {
	for _, it := range e.items {
		if it.run == r && it.status == TaskPending {
			return it
		}
	}
	return nil
}

// visible is the engine's audience rule for a task that names only roles: a caller with no
// identity sees nothing, one that names no roles is anyone's, otherwise a role must match.
func visible(it *item, caller Caller) bool {
	if caller.Roles == nil && caller.UserID() == "" {
		return false
	}
	if len(it.roles) == 0 {
		return true
	}
	return slices.ContainsFunc(it.roles, func(role string) bool { return slices.Contains(caller.Roles, role) })
}

// completeTask delivers a completion as the engine's signal does: the node's output is the
// whole signal, of which the workflow reads only the result.
func (e *Engine) completeTask(it *item, by string, callerRoles []string, result any, at time.Time) error {
	if it.status != TaskPending || it.run.status != StatusRunning {
		return newError(ErrConflict, "Human task '%s' is not running", it.id)
	}
	if err := checkRequired(it.formSchema, result); err != nil {
		return err
	}

	r := it.run
	as := completedAsAudience
	it.status, it.result, it.close, it.completedBy, it.completedAs = TaskCompleted, result, &at, &by, &as
	it.node.complete(map[string]any{
		"result":      result,
		"completedBy": by,
		"completedAt": at.UTC().Format(timeLayout),
		"completedAs": as,
		"callerRoles": rolesOrNil(callerRoles),
	}, at)
	r.vars[it.name] = result
	r.cursor = at
	r.next(&r.def.steps[it.stepIdx])
	e.advance(r, e.now())
	return nil
}

// decideReview records a decision as the engine does: the review completes whatever the
// decision, its node's output is the decision signal, and the workflow acts on it.
func (e *Engine) decideReview(it *item, by string, callerRoles []string, action string, input map[string]any, feedback string, at time.Time) error {
	if it.status != TaskPending || it.run.status != StatusRunning {
		return newError(ErrConflict, "Review activity '%s' is not running", it.id)
	}

	r := it.run
	as := completedAsAudience
	signal := map[string]any{
		"action":      action,
		"decidedBy":   by,
		"completedAs": as,
		"callerRoles": rolesOrNil(callerRoles),
		"decidedAt":   at.UTC().Format(timeLayout),
	}
	decision := &reviewDecision{Action: action}
	if action == "proceed-with-input" {
		signal["input"], decision.Input = input, input
	}
	if feedback != "" {
		signal["feedback"], decision.Feedback = feedback, &feedback
	}

	it.status, it.close, it.completedBy, it.completedAs, it.decision = TaskCompleted, &at, &by, &as, decision
	it.node.complete(signal, at)
	r.cursor = at

	switch action {
	case "proceed":
	case "proceed-with-input":
		// The reviewer's edits override; omitted keys keep their values.
		merged := maps.Clone(r.stepInput(&r.def.steps[it.stepIdx]))
		maps.Copy(merged, input)
		r.overrides[it.stepIdx] = merged
	case "reject":
		e.finish(r, StatusFailed, nil, rejectionMessage(it, feedback), at)
		return nil
	}

	r.reviewed[it.stepIdx] = true
	r.phase = phaseIdle
	// Proceeding after a failure schedules the activity again, as a new node from attempt 1.
	r.attempt = 1
	e.advance(r, e.now())
	return nil
}

// rejectionMessage is the error a rejected review hands the workflow, which fails the run with it.
func rejectionMessage(it *item, feedback string) *string {
	var message string
	if it.trigger == TriggerOnFailure {
		message = it.errorMessage
		if feedback != "" {
			message += " (reviewer: " + feedback + ")"
		}
	} else {
		message = "Review of '" + it.name + "' was rejected"
		if feedback != "" {
			message += ": " + feedback
		}
	}
	return &message
}

func (e *Engine) cancel(r *run, at time.Time) error {
	if r.status != StatusRunning {
		return newError(errExecution, "Failed to cancel workflow: workflow execution already completed")
	}
	for _, n := range r.nodes {
		if n.Status == NodeRunning {
			n.cancel(at)
		}
	}
	for _, it := range e.items {
		if it.run == r && it.status == TaskPending {
			it.status, it.close = TaskCanceled, &at
		}
	}
	e.finish(r, StatusCanceled, nil, nil, at)
	return nil
}

// errExecution is the engine's EXECUTION_ERROR: anything it can't classify, a 500.
var errExecution = errors.New("execution error")

func (e *Engine) findRun(workflowID, runID string) (*run, error) {
	for _, r := range e.runs {
		if r.workflowID == workflowID && r.runID == runID {
			return r, nil
		}
	}
	return nil, newError(ErrNotFound, "Workflow run not found: %s/%s", workflowID, runID)
}

func (e *Engine) findItem(kind, id string) (*item, error) {
	for _, it := range e.items {
		if it.kind == kind && it.id == id {
			return it, nil
		}
	}
	if kind == NodeHumanTask {
		return nil, newError(ErrNotFound, "Human task not found: %s", id)
	}
	return nil, newError(ErrNotFound, "Review activity not found: %s", id)
}

// rolesList is a task's roles as the engine lists them: never null.
func rolesList(roles []string) []string {
	if roles == nil {
		return []string{}
	}
	return roles
}

// rolesOrNil is a caller's roles as the engine records them: null when there are none.
func rolesOrNil(roles []string) []string {
	if len(roles) == 0 {
		return nil
	}
	return roles
}
