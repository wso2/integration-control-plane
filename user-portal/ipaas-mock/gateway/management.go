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
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/wso2-enterprise/integration-user-portal-service/shared/infrastructure/logging"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/web"
)

const (
	defaultPageSize = 20
	maxPageSize     = 100
)

// Routes serves the workflow Management API, in the shapes and spellings of
// module-ballerina-workflow's management.rest module.
func (e *Engine) Routes() http.Handler {
	r := chi.NewRouter()
	r.Get("/runtime", e.runtime)
	r.Get("/metadata", e.metadata)
	r.Get("/definitions", e.listDefinitions)
	r.Get("/workflows", e.listRuns)
	r.Post("/workflows", e.startRun)
	r.Get("/workflows/{workflowId}/{runId}", e.getRun)
	r.Get("/workflows/{workflowId}/{runId}/activity-tree", e.activityTree)
	r.Post("/workflows/{workflowId}/{runId}/cancel", e.cancelRun)
	r.Get("/human-tasks", e.listItems(NodeHumanTask))
	r.Get("/human-tasks/{taskId}", e.getItem(NodeHumanTask))
	r.Post("/human-tasks/{taskId}/complete", e.completeHumanTask)
	r.Get("/review-activities", e.listItems(NodeReview))
	r.Get("/review-activities/{taskId}", e.getItem(NodeReview))
	r.Post("/review-activities/{taskId}/{decision:proceed|proceed-with-input|reject}", e.decide)
	r.NotFound(func(w http.ResponseWriter, r *http.Request) {
		writeEngineError(w, r, newError(ErrNotFound, "no matching resource found for path"))
	})
	return r
}

type page[T any] struct {
	Items         []T     `json:"items"`
	NextPageToken *string `json:"nextPageToken"`
	HasMore       bool    `json:"hasMore"`
}

// pageLimit is the engine's clamp: nothing usable is the default, too many is the cap. Only a
// value that is not an integer fails, at query binding.
func pageLimit(r *http.Request) (int, error) {
	raw := r.URL.Query().Get("limit")
	if raw == "" {
		return defaultPageSize, nil
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		return 0, newError(ErrInvalid, "error in casting query param : 'limit'")
	}
	if n < 1 {
		n = defaultPageSize
	}
	return min(n, maxPageSize), nil
}

// paginate pages a listing. A token this listing can't read starts it again from the top, as
// the engine's task listings do.
func paginate[T any](r *http.Request, all []T) (page[T], error) {
	limit, err := pageLimit(r)
	if err != nil {
		return page[T]{}, err
	}
	offset := 0
	if raw := r.URL.Query().Get("pageToken"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n >= 0 {
			offset = n
		}
	}

	out := page[T]{Items: []T{}}
	if offset < len(all) {
		end := min(offset+limit, len(all))
		out.Items = append(out.Items, all[offset:end]...)
		if end < len(all) {
			token := strconv.Itoa(end)
			out.NextPageToken, out.HasMore = &token, true
		}
	}
	return out, nil
}

func formatTime(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := t.UTC().Format(timeLayout)
	return &s
}

func nullable(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// timeBounds reads the from/to query params the engine filters StartTime or CloseTime by.
type timeBounds struct {
	startFrom, startTo, closeFrom, closeTo *time.Time
}

func readTimeBounds(r *http.Request) (timeBounds, error) {
	var b timeBounds
	for name, target := range map[string]**time.Time{
		"startTimeFrom": &b.startFrom, "startTimeTo": &b.startTo,
		"closeTimeFrom": &b.closeFrom, "closeTimeTo": &b.closeTo,
	} {
		raw := r.URL.Query().Get(name)
		if raw == "" {
			continue
		}
		t, err := time.Parse(time.RFC3339Nano, raw)
		if err != nil {
			return b, newError(errExecution, "invalid %s: %s", name, raw)
		}
		*target = &t
	}
	return b, nil
}

func (b timeBounds) admit(start time.Time, close *time.Time) bool {
	if (b.startFrom != nil && start.Before(*b.startFrom)) || (b.startTo != nil && start.After(*b.startTo)) {
		return false
	}
	if b.closeFrom != nil || b.closeTo != nil {
		if close == nil || (b.closeFrom != nil && close.Before(*b.closeFrom)) || (b.closeTo != nil && close.After(*b.closeTo)) {
			return false
		}
	}
	return true
}

func (e *Engine) runtime(w http.ResponseWriter, r *http.Request) {
	web.WriteResponse(w, r, http.StatusOK, map[string]any{"taskQueue": e.taskQueue})
}

type descriptorEntry struct {
	Name  string     `json:"name"`
	Graph modelGraph `json:"graph"`
}

type definitionMeta struct {
	WorkflowType string  `json:"workflowType"`
	Kind         string  `json:"kind"`
	DisplayName  *string `json:"displayName"`
	Icon         *string `json:"icon"`
	InputSchema  *string `json:"inputSchema"`
}

type humanTaskMeta struct {
	Name         string  `json:"name"`
	Title        *string `json:"title"`
	ResultSchema *string `json:"resultSchema"`
}

type activityMeta struct {
	WorkflowType string  `json:"workflowType"`
	Name         string  `json:"name"`
	DisplayName  *string `json:"displayName"`
	Icon         *string `json:"icon"`
	InputSchema  *string `json:"inputSchema"`
}

// metadata is the engine's WorkflowMetadata document. Task titles are built from run data here,
// so none is a constant title, and the descriptor carries only what these definitions model.
func (e *Engine) metadata(w http.ResponseWriter, r *http.Request) {
	definitions := []definitionMeta{}
	humanTasks := []humanTaskMeta{}
	activities := []activityMeta{}
	entries := make([]descriptorEntry, 0, len(e.definitions))
	for _, def := range e.definitions {
		definitions = append(definitions, definitionMeta{WorkflowType: def.workflowType, Kind: "WORKFLOW", InputSchema: nullable(def.inputSchema)})
		for _, st := range def.steps {
			if st.kind == NodeHumanTask {
				humanTasks = append(humanTasks, humanTaskMeta{Name: def.workflowType + "." + st.name, ResultSchema: nullable(st.task.formSchema)})
				continue
			}
			var schema string
			if st.review != nil {
				schema = st.review.formSchema
			} else if st.onFailure != nil {
				schema = st.onFailure.formSchema
			}
			activities = append(activities, activityMeta{WorkflowType: def.workflowType, Name: st.name, InputSchema: nullable(schema)})
		}
		entries = append(entries, descriptorEntry{Name: def.workflowType, Graph: def.graph})
	}
	raw, _ := json.Marshal(entries)
	sum := sha256.Sum256(raw)

	web.WriteResponse(w, r, http.StatusOK, map[string]any{
		"metadataVersion": "1.0",
		"definitions":     definitions,
		"humanTasks":      humanTasks,
		"activities":      activities,
		"reviewActions":   []string{"proceed", "proceed-with-input", "reject"},
		"agents":          []any{},
		"descriptor": map[string]any{
			"descriptorVersion": "1.0",
			"org":               "acme",
			"package":           strings.ReplaceAll(e.taskQueue, "-", "_"),
			"checksum":          hex.EncodeToString(sum[:8]),
			"workflows":         entries,
			"agents":            []any{},
		},
	})
}

type definitionView struct {
	WorkflowType string  `json:"workflowType"`
	Kind         string  `json:"kind"`
	DisplayName  *string `json:"displayName"`
	Icon         *string `json:"icon"`
	InputSchema  *string `json:"inputSchema"`
	IsActive     bool    `json:"isActive"`
	WorkerCount  int     `json:"workerCount"`
}

func (e *Engine) listDefinitions(w http.ResponseWriter, r *http.Request) {
	views := make([]definitionView, 0, len(e.definitions))
	for _, def := range e.definitions {
		views = append(views, definitionView{
			WorkflowType: def.workflowType, Kind: "WORKFLOW", InputSchema: nullable(def.inputSchema), IsActive: true, WorkerCount: 1,
		})
	}
	web.WriteResponse(w, r, http.StatusOK, map[string]any{"definitions": views})
}

// runSummary is the engine's WorkflowInstanceSummary. A listing never carries the input.
type runSummary struct {
	Namespace    string  `json:"namespace"`
	TaskQueue    string  `json:"taskQueue"`
	WorkflowID   string  `json:"workflowId"`
	RunID        string  `json:"runId"`
	WorkflowType string  `json:"workflowType"`
	Status       string  `json:"status"`
	StartTime    string  `json:"startTime"`
	CloseTime    *string `json:"closeTime"`
	Kind         string  `json:"kind"`
	Input        any     `json:"input"`
}

func (e *Engine) listRuns(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	status := strings.ToUpper(query.Get("status"))
	bounds, err := readTimeBounds(r)
	if err != nil {
		writeEngineError(w, r, err)
		return
	}

	e.mu.Lock()
	summaries := []runSummary{}
	for _, run := range e.runs {
		if !e.runMatches(run, query, status, bounds) {
			continue
		}
		summaries = append(summaries, runSummary{
			Namespace:    namespace,
			TaskQueue:    e.taskQueue,
			WorkflowID:   run.workflowID,
			RunID:        run.runID,
			WorkflowType: run.def.workflowType,
			Status:       run.status,
			StartTime:    run.start.UTC().Format(timeLayout),
			CloseTime:    formatTime(run.close),
			Kind:         "WORKFLOW",
		})
	}
	e.mu.Unlock()

	out, err := paginate(r, summaries)
	if err != nil {
		writeEngineError(w, r, err)
		return
	}
	web.WriteResponse(w, r, http.StatusOK, out)
}

// runMatches applies the engine's instance filters. Only workflows are listed unless another
// kind is asked for, and these runs are all workflows; a status it doesn't know matches nothing.
func (e *Engine) runMatches(run *run, query map[string][]string, status string, bounds timeBounds) bool {
	get := func(name string) string {
		if v := query[name]; len(v) > 0 {
			return v[0]
		}
		return ""
	}
	if kind := strings.ToUpper(get("kind")); kind != "" && kind != "WORKFLOW" {
		return false
	}
	switch status {
	case "":
	case StatusRunning, StatusCompleted, StatusFailed, StatusCanceled:
		if run.status != status {
			return false
		}
	default:
		return false
	}
	if t := get("workflowType"); t != "" && run.def.workflowType != t {
		return false
	}
	if id := get("workflowId"); id != "" && !strings.HasPrefix(run.workflowID, id) {
		return false
	}
	if by := get("startedBy"); by != "" && (run.startedBy == nil || *run.startedBy != by) {
		return false
	}
	if q := get("taskQueue"); q != "" && q != e.taskQueue {
		return false
	}
	return bounds.admit(run.start, run.close)
}

func (e *Engine) startRun(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeEngineError(w, r, newError(ErrInvalid, "Invalid request payload"))
		return
	}
	raw, present := body["workflowType"]
	if !present || raw == nil {
		writeEngineError(w, r, newError(ErrInvalid, "workflowType is required"))
		return
	}
	workflowType, ok := raw.(string)
	if !ok {
		writeEngineError(w, r, newError(ErrInvalid, "workflowType must be a string"))
		return
	}
	def := e.definition(workflowType)
	if def == nil {
		writeEngineError(w, r, newError(ErrNotFound, "Workflow type not found: %s", workflowType))
		return
	}
	input, _ := body["input"].(map[string]any)
	if input == nil {
		input = map[string]any{}
	}
	if err := checkRequired(def.inputSchema, input); err != nil {
		writeEngineError(w, r, err)
		return
	}
	caller := callerFrom(r.Context())

	e.mu.Lock()
	run := e.begin(def, input, nullable(caller.UserID()), e.now(), e.stepDuration)
	e.mu.Unlock()

	logging.S(r.Context()).Infow("workflow started", "workflowType", def.workflowType,
		"workflowId", run.workflowID, "by", caller.UserID())
	web.WriteResponse(w, r, http.StatusCreated, map[string]any{"workflowId": run.workflowID, "runId": run.runID, "started": true})
}

// requireRoles is the engine's guard on workflow details: a caller with no roles sees none.
func requireRoles(caller Caller) error {
	if caller.Roles == nil {
		return newError(ErrForbidden, "Unauthorized: caller roles are required to view workflow details")
	}
	return nil
}

type activityInvocation struct {
	ActivityName string  `json:"activityName"`
	DisplayName  *string `json:"displayName"`
	Input        []any   `json:"input"`
	Output       any     `json:"output"`
	Status       string  `json:"status"`
	ErrorMessage *string `json:"errorMessage"`
	Attempt      int     `json:"attempt"`
}

// getRun is the engine's WorkflowExecutionInfo. Activity invocations are read from history
// only once a run has completed or failed, and carry neither input nor output.
func (e *Engine) getRun(w http.ResponseWriter, r *http.Request) {
	if err := requireRoles(callerFrom(r.Context())); err != nil {
		writeEngineError(w, r, err)
		return
	}
	e.mu.Lock()
	defer e.mu.Unlock()

	run, err := e.findRun(chi.URLParam(r, "workflowId"), chi.URLParam(r, "runId"))
	if err != nil {
		writeEngineError(w, r, err)
		return
	}
	invocations := []activityInvocation{}
	if run.status == StatusCompleted || run.status == StatusFailed {
		for _, n := range run.nodes {
			if n.Type != NodeActivity || n.Status == NodeRunning {
				continue
			}
			var message *string
			if n.Failure != nil {
				message = &n.Failure.Message
			}
			invocations = append(invocations, activityInvocation{
				ActivityName: n.Name, Input: []any{}, Status: n.Status, ErrorMessage: message, Attempt: n.Attempt,
			})
		}
	}
	web.WriteResponse(w, r, http.StatusOK, map[string]any{
		"workflowId":          run.workflowID,
		"workflowType":        run.def.workflowType,
		"status":              run.status,
		"kind":                "WORKFLOW",
		"result":              run.result,
		"errorMessage":        run.errorMsg,
		"activityInvocations": invocations,
	})
}

func (e *Engine) activityTree(w http.ResponseWriter, r *http.Request) {
	if err := requireRoles(callerFrom(r.Context())); err != nil {
		writeEngineError(w, r, err)
		return
	}
	e.mu.Lock()
	defer e.mu.Unlock()

	run, err := e.findRun(chi.URLParam(r, "workflowId"), chi.URLParam(r, "runId"))
	if err != nil {
		writeEngineError(w, r, err)
		return
	}
	nodes := make([]activityNode, 0, len(run.nodes))
	for _, n := range run.nodes {
		nodes = append(nodes, *n)
	}
	web.WriteResponse(w, r, http.StatusOK, map[string]any{"nodes": nodes})
}

func (e *Engine) cancelRun(w http.ResponseWriter, r *http.Request) {
	e.mu.Lock()
	defer e.mu.Unlock()

	run, err := e.findRun(chi.URLParam(r, "workflowId"), chi.URLParam(r, "runId"))
	if err == nil {
		err = e.cancel(run, e.now())
	}
	if err != nil {
		writeEngineError(w, r, err)
		return
	}
	web.WriteResponse(w, r, http.StatusOK, map[string]bool{"success": true})
}

// taskSummary is the engine's TaskSummary. These tasks assign by role only, so the other
// audience lists are empty, and no one administers them.
type taskSummary struct {
	Kind               string   `json:"kind"`
	TaskID             string   `json:"taskId"`
	TaskName           string   `json:"taskName"`
	Title              string   `json:"title"`
	Description        string   `json:"description"`
	Namespace          string   `json:"namespace"`
	TaskQueue          string   `json:"taskQueue"`
	ParentWorkflowID   string   `json:"parentWorkflowId"`
	ParentWorkflowType *string  `json:"parentWorkflowType"`
	StepID             *string  `json:"stepId"`
	Status             string   `json:"status"`
	StartTime          string   `json:"startTime"`
	CloseTime          *string  `json:"closeTime"`
	UserRoles          []string `json:"userRoles"`
	Users              []string `json:"users"`
	ExcludedUsers      []string `json:"excludedUsers"`
	ExcludedRoles      []string `json:"excludedRoles"`
	AdministratorRoles []string `json:"administratorRoles"`
	AdministratorUsers []string `json:"administratorUsers"`
	CompletedBy        *string  `json:"completedBy"`
	CompletedAt        *string  `json:"completedAt"`
	CompletedAs        *string  `json:"completedAs"`
	CanComplete        bool     `json:"canComplete"`
	CanAdminister      bool     `json:"canAdminister"`
}

type reviewSummary struct {
	taskSummary
	ActivityName string `json:"activityName"`
	Trigger      string `json:"trigger"`
}

type humanTaskInfo struct {
	taskSummary
	CreatedAt  string         `json:"createdAt"`
	FormSchema *string        `json:"formSchema"`
	TaskInput  map[string]any `json:"taskInput"`
	Result     any            `json:"result"`
}

type reviewInfo struct {
	taskSummary
	CreatedAt    string          `json:"createdAt"`
	FormSchema   *string         `json:"formSchema"`
	ActivityName string          `json:"activityName"`
	Trigger      string          `json:"trigger"`
	ErrorMessage string          `json:"errorMessage"`
	TaskInput    map[string]any  `json:"taskInput"`
	Decision     *reviewDecision `json:"decision"`
}

func (e *Engine) summary(it *item) taskSummary {
	workflowType := it.run.def.workflowType
	stepID := it.stepID
	s := taskSummary{
		Kind:               it.kind,
		TaskID:             it.id,
		TaskName:           it.taskName,
		Title:              it.title,
		Description:        it.description,
		Namespace:          namespace,
		TaskQueue:          e.taskQueue,
		ParentWorkflowID:   it.run.workflowID,
		ParentWorkflowType: &workflowType,
		StepID:             &stepID,
		Status:             it.status,
		StartTime:          it.start.UTC().Format(timeLayout),
		CloseTime:          formatTime(it.close),
		UserRoles:          rolesList(it.roles),
		Users:              []string{},
		ExcludedUsers:      []string{},
		ExcludedRoles:      []string{},
		AdministratorRoles: []string{},
		AdministratorUsers: []string{},
		CompletedBy:        it.completedBy,
		CompletedAs:        it.completedAs,
		// Listed or read, a task is one the caller may act on: that is what visibility means.
		CanComplete: true,
	}
	if it.completedBy != nil {
		s.CompletedAt = s.CloseTime
	}
	return s
}

func (e *Engine) listView(it *item) any {
	if it.kind == NodeReview {
		return reviewSummary{taskSummary: e.summary(it), ActivityName: it.taskName, Trigger: it.trigger}
	}
	return e.summary(it)
}

func (e *Engine) detailView(it *item) any {
	created := it.start.UTC().Format(timeLayout)
	if it.kind == NodeReview {
		return reviewInfo{
			taskSummary: e.summary(it), CreatedAt: created, FormSchema: nullable(it.formSchema),
			ActivityName: it.taskName, Trigger: it.trigger, ErrorMessage: it.errorMessage,
			TaskInput: it.input, Decision: it.decision,
		}
	}
	return humanTaskInfo{taskSummary: e.summary(it), CreatedAt: created, FormSchema: nullable(it.formSchema), TaskInput: it.input, Result: it.result}
}

// itemStatuses is what a task listing's status filter matches: PENDING and RUNNING are the
// same, FAILED takes in timed-out tasks, and a status the engine doesn't know matches nothing.
func itemStatuses(status string) []string {
	switch strings.ToUpper(status) {
	case "":
		return nil
	case "PENDING", "RUNNING":
		return []string{TaskPending}
	case "COMPLETED":
		return []string{TaskCompleted}
	case "FAILED":
		return []string{StatusFailed}
	case "CANCELED":
		return []string{TaskCanceled}
	case "TERMINATED":
		return []string{"TERMINATED"}
	}
	return []string{}
}

func (e *Engine) listItems(kind string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		query := r.URL.Query()
		statuses := itemStatuses(query.Get("status"))
		bounds, err := readTimeBounds(r)
		if err != nil {
			writeEngineError(w, r, err)
			return
		}
		caller := callerFrom(r.Context())

		e.mu.Lock()
		views := []any{}
		for _, it := range e.items {
			if it.kind != kind || (statuses != nil && !contains(statuses, it.status)) || !visible(it, caller) ||
				!matches(query.Get("parentWorkflowId"), it.run.workflowID) ||
				!matches(query.Get("parentWorkflowType"), it.run.def.workflowType) ||
				!matches(query.Get("taskName"), it.taskName) ||
				(query.Get("userRole") != "" && !contains(it.roles, query.Get("userRole"))) ||
				!matches(query.Get("taskQueue"), e.taskQueue) ||
				!bounds.admit(it.start, it.close) {
				continue
			}
			views = append(views, e.listView(it))
		}
		e.mu.Unlock()

		out, err := paginate(r, views)
		if err != nil {
			writeEngineError(w, r, err)
			return
		}
		web.WriteResponse(w, r, http.StatusOK, out)
	}
}

func matches(filter, value string) bool { return filter == "" || filter == value }

func contains(list []string, value string) bool {
	for _, v := range list {
		if v == value {
			return true
		}
	}
	return false
}

func (e *Engine) getItem(kind string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller := callerFrom(r.Context())

		e.mu.Lock()
		defer e.mu.Unlock()

		it, err := e.findItem(kind, chi.URLParam(r, "taskId"))
		if err == nil && !visible(it, caller) {
			if kind == NodeHumanTask {
				err = newError(ErrForbidden, "Unauthorized: caller is not allowed to access this task")
			} else {
				err = newError(ErrForbidden, "Unauthorized: caller is not allowed to access this review activity")
			}
		}
		if err != nil {
			writeEngineError(w, r, err)
			return
		}
		web.WriteResponse(w, r, http.StatusOK, e.detailView(it))
	}
}

func (e *Engine) completeHumanTask(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Result any `json:"result"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeEngineError(w, r, newError(ErrInvalid, "Invalid request payload"))
		return
	}
	caller := callerFrom(r.Context())
	if caller.Roles == nil && caller.UserID() == "" {
		writeEngineError(w, r, newError(ErrForbidden, "Unauthorized: caller identity is required"))
		return
	}

	e.mu.Lock()
	defer e.mu.Unlock()

	it, err := e.findItem(NodeHumanTask, chi.URLParam(r, "taskId"))
	if err == nil && !visible(it, caller) {
		err = newError(ErrForbidden, "Unauthorized: caller is not allowed to complete this task")
	}
	at := e.now()
	if err == nil {
		err = e.completeTask(it, caller.UserID(), caller.Roles, req.Result, at)
	}
	if err != nil {
		writeEngineError(w, r, err)
		return
	}
	web.WriteResponse(w, r, http.StatusOK, map[string]any{
		"success": true, "completedBy": userIDOrUnknown(caller), "completedAt": at.UTC().Format(time.RFC3339Nano),
	})
}

func (e *Engine) decide(w http.ResponseWriter, r *http.Request) {
	action := chi.URLParam(r, "decision")
	var req struct {
		Input    any     `json:"input"`
		Feedback *string `json:"feedback"`
	}
	if r.ContentLength != 0 {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeEngineError(w, r, newError(ErrInvalid, "Invalid request payload"))
			return
		}
	}
	input, isObject := req.Input.(map[string]any)
	if action == "proceed-with-input" && !isObject {
		writeEngineError(w, r, newError(ErrInvalid, "input must be a JSON object"))
		return
	}
	feedback := ""
	if action == "reject" && req.Feedback != nil {
		feedback = *req.Feedback
	}
	caller := callerFrom(r.Context())

	e.mu.Lock()
	defer e.mu.Unlock()

	it, err := e.findItem(NodeReview, chi.URLParam(r, "taskId"))
	if err == nil && !visible(it, caller) {
		err = newError(ErrForbidden, "Unauthorized: caller is not allowed to decide this review activity")
	}
	at := e.now()
	if err == nil {
		err = e.decideReview(it, caller.UserID(), caller.Roles, action, input, feedback, at)
	}
	if err != nil {
		writeEngineError(w, r, err)
		return
	}
	web.WriteResponse(w, r, http.StatusOK, map[string]any{
		"success": true, "decision": action, "completedBy": userIDOrUnknown(caller), "completedAt": at.UTC().Format(time.RFC3339Nano),
	})
}

// userIDOrUnknown is the completer an action response names: the engine's fallback is "unknown".
func userIDOrUnknown(caller Caller) string {
	if id := caller.UserID(); id != "" {
		return id
	}
	return "unknown"
}

// writeEngineError answers as the engine's REST adapter does: the code's status, and the message as is.
func writeEngineError(w http.ResponseWriter, r *http.Request, err error) {
	status := http.StatusInternalServerError
	switch {
	case errors.Is(err, ErrNotFound):
		status = http.StatusNotFound
	case errors.Is(err, ErrForbidden):
		status = http.StatusForbidden
	case errors.Is(err, ErrInvalid):
		status = http.StatusBadRequest
	case errors.Is(err, ErrConflict):
		status = http.StatusConflict
	case errors.Is(err, ErrInvalidPayload):
		status = http.StatusUnprocessableEntity
	}
	logging.S(r.Context()).Infow("workflow request refused", "status", status, "error", err.Error())
	web.WriteResponse(w, r, status, map[string]any{"error": map[string]string{"message": err.Error()}})
}
