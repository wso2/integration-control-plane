// Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com) All Rights Reserved.
//
// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
//  http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

import icp_server.storage;
import icp_server.types;

import ballerina/crypto;
import ballerina/http;
import ballerina/log;
import ballerina/time;
import ballerina/uuid;

// ============================================================================
// WORKFLOW COMMAND TUNNEL
// ============================================================================
// Executes workflow management operations WITHOUT any network path into the integration or
// its Temporal server: work is queued in the database, delivered to a runtime inside its
// next heartbeat response (a WORKFLOW_MGMT control command), executed in-process by the
// runtime's ICP bridge, and its result posted back on POST /icp/commandResult. Latency is
// managed with a boost hint: while a user is actively working with workflow views,
// heartbeat responses carry a nextHeartbeatInSeconds cadence so the bridge polls faster
// than its regular interval, decaying back as the boost window runs out.
//
// Nothing about a request lives in this process. Every ICP node shares the queue through the
// tunneled_operation table, because heartbeats arrive round-robin: the node that accepts a
// user's request is usually NOT the node that receives the runtime's next check-in, so it
// persists the request and walks away. A single module-level map here
// would reintroduce node affinity, and the symptom — works on one node, intermittently
// stuck on two — is expensive to diagnose.
//
// Two database properties replace what locking would otherwise be needed for: a primary
// key makes concurrent identical reads coalesce onto one fetch, and a per-attempt fetch id
// fences a late result so an answer from a superseded attempt cannot resurrect state a
// mutation removed.

// How many reads and how many mutations one heartbeat response may carry. This is the
// only bound on a post-outage drain: with a 30-minute mutation deadline, an integration
// that was unreachable for minutes comes back to a backlog that is still deliverable, and
// nothing downstream can refuse a batch that was already handed over.
const int WF_MAX_READS_PER_HEARTBEAT = 10;
const int WF_MAX_OPERATIONS_PER_HEARTBEAT = 10;

// A read is abandoned if no runtime answers it within this long. The caller is told the
// read failed rather than left polling a row nobody will ever fill.
const int WF_READ_FETCH_DEADLINE_SECONDS = 60;

// How long a mutation stays deliverable. Generous on purpose: with no request held open
// there is no browser timeout to respect, and a user's action surviving a restart of the
// integration is worth more than failing it quickly. Past this it becomes EXPIRED, which
// is a notification rather than a silent loss.
const int WF_OPERATION_DEADLINE_SECONDS = 1800;

// The cadence asked of a boosted runtime, decaying back to its own interval as the boost
// window runs out. Each step is [seconds of boost remaining, cadence to ask for]: one
// heartbeat per second while a user is likely still clicking, then 2s, 5s, 10s. A flat
// window at 1s was the first design and cost too much - a runtime serving non-workflow
// traffic kept heartbeating every second long after the last workflow view was closed.
//
// The bridge ignores a hint that is not shorter than its own interval, so the last step is
// a no-op for a runtime already on a 10s interval.
final readonly & [int, int][] WORKFLOW_BOOST_RAMP = [[25, 1], [20, 2], [10, 5], [0, 10]];

// How long a workflow request keeps its scope boosted. Every request extends it, so an
// active session stays at the fastest cadence.
const int WORKFLOW_BOOST_WINDOW_SECONDS = 30;

// The capability a runtime must have advertised to receive WORKFLOW_MGMT commands.
const string WORKFLOW_COMMANDS_CAPABILITY = "workflowCommands";

// Ids are prefixed by kind so a result can be routed back to the table that is waiting for
// it without querying both.
// What a cache row is about. The tables are generic; these two strings are the whole of the
// workflow-ness in them, so another feature adds a kind rather than a table.
const string CACHE_KIND_WORKFLOW_READ = "workflow.read";
const string CACHE_KIND_WORKFLOW_OPERATION = "workflow.operation";

const string WF_READ_COMMAND_PREFIX = "wfr-";
const string WF_OPERATION_COMMAND_PREFIX = "wfo-";

isolated function nowUnixSeconds() returns int => time:utcNow()[0];

// The invalidation unit, and the key prefix of every cached read: a component in an
// environment. Deliberately free of roles - a completed task changes what every role sees,
// so invalidation must reach all of them.
isolated function workflowScopeKey(string componentId, string environmentId) returns string =>
    componentId + ":" + environmentId;

// The cadence to ask a boosted runtime for, or () when its boost has run out and it should
// return to its own interval.
isolated function boostCadence(int boostRemainingSeconds) returns int? {
    if boostRemainingSeconds <= 0 {
        return ();
    }
    foreach [int, int] [remainingAbove, cadence] in WORKFLOW_BOOST_RAMP {
        if boostRemainingSeconds > remainingAbove {
            return cadence;
        }
    }
    return ();
}

// Picks the runtime that should execute tunneled workflow commands for a
// component+environment: the freshest-heartbeat RUNNING runtime that advertised the
// workflowCommands capability, or () when there is none — the caller then answers 503
// rather than serving anything stale.
# The runtime a command will be delivered to, and the Temporal task queue that runtime works.
#
# The task queue travels with the target because Temporal's visibility API is scoped to a
# NAMESPACE, not to a task queue: a listing asked of this component's runtime returns every
# instance in the namespace, including those of every other integration deployed beside it.
# The queue is what narrows a listing back to the component the caller actually asked about.
type WorkflowCommandTarget record {|
    string runtimeId;
    // Absent when the runtime published no queue — an older bridge or module. A listing then
    // stays namespace-wide, which is the previous behaviour rather than a new failure.
    string? taskQueue;
|};

isolated function selectWorkflowCommandTarget(string componentId, string environmentId)
        returns WorkflowCommandTarget?|error {
    types:WorkflowMetadataRecord[] metadataRecords =
        check storage:getWorkflowMetadataForComponentEnv(componentId, environmentId);
    foreach types:WorkflowMetadataRecord metadataRecord in metadataRecords {
        string? capabilities = metadataRecord.capabilities;
        if capabilities is string {
            foreach string capability in re `,`.split(capabilities) {
                if capability.trim() == WORKFLOW_COMMANDS_CAPABILITY {
                    return {runtimeId: metadataRecord.runtimeId, taskQueue: metadataRecord.taskQueue};
                }
            }
        }
    }
    return ();
}

# The operations whose results are namespace-wide unless a task queue narrows them. Every
# other operation addresses one instance or task by id, where the id is already the scope.
final string[] & readonly WF_TASK_QUEUE_SCOPED_OPERATIONS = [
    "instances.list",
    "humanTasks.list",
    "humanTasks.pendingCount",
    "reviewActivities.list"
];

# Narrows a listing to the target runtime's task queue, unless the caller named one.
#
# A caller-supplied value always wins: the console filters by queue itself when it offers a
# queue selector, and silently replacing that would ignore what the user picked.
isolated function withTaskQueueScope(string operation, map<json> params, string? taskQueue)
        returns map<json> {
    if taskQueue is () || WF_TASK_QUEUE_SCOPED_OPERATIONS.indexOf(operation) is () {
        return params;
    }
    if params["taskQueue"] is string {
        return params;
    }
    map<json> scoped = params.clone();
    scoped["taskQueue"] = taskQueue;
    return scoped;
}

// ── Serving reads ────────────────────────────────────────────────────────────

# What a caller should do with a read right now.
#
# `READY` covers a stale entry as well as a fresh one: a stale answer is served while its
# refresh runs, because deleting it instead would empty the cache faster than it could be
# rebuilt whenever several people work in the same environment, and everyone would be left
# watching a spinner. `stale` and `fetchedAt` travel with it so the console can say what it
# is showing and how old it is, rather than presenting cached data as live.
type WorkflowReadOutcome record {|
    "READY"|"PENDING"|"FAILED"|"NO_RUNTIME" state;
    json body = ();
    int httpStatus = 200;
    int fetchedAt = 0;
    boolean stale = false;
|};

// How long past expiry an entry is still served while it refreshes. Generous on purpose:
// after a user's first visit they should not see a spinner again, and a slightly old answer
// with its age shown beats a blank table.
const int WF_STALE_SERVE_SECONDS = 1800;

# Serves a read from the cache, starting a fetch when there is nothing usable.
#
# Every call also extends the scope's boost window, so an active session keeps its runtimes
# heartbeating fast enough for the next request to be answered in about a second.
#
# + componentId - The component being viewed
# + environmentId - Its environment
# + operation - The management operation to run
# + params - Its parameters
# + roles - The caller's roles, which are part of the cache key: a role-filtered listing
#           must never be shared across role sets
# + return - What to serve, or an error only when the database itself failed
isolated function ensureWorkflowRead(string componentId, string environmentId, string operation,
        map<json> params, string[] roles, boolean forceRefresh = false)
        returns WorkflowReadOutcome|error {
    string scopeKey = workflowScopeKey(componentId, environmentId);
    string cacheKey = workflowCacheKey(scopeKey, operation, params, roles);
    int now = nowUnixSeconds();
    if forceRefresh {
        // The user demanded certainty. Expiring the entry (never deleting it) drops this call
        // into the stale-serve path below: the current answer still comes back immediately,
        // marked stale, while the forced refresh runs. Coalescing makes this safe to expose —
        // twenty people pressing Refresh together still produce one fetch.
        check storage:expireCacheEntry(cacheKey);
    }

    types:TunneledOperation? row = check storage:getTunneledOperation(cacheKey);
    if row is types:TunneledOperation {
        string? payload = row.data;
        // A failure that has outlived its expiry is a retry, not an answer.
        //
        // Stale-while-revalidate is right for data: an old list still tells the user
        // something true. It is wrong for a failure. Serving one keeps reporting an error the
        // system has already moved past — a single wedged pool, whose sweeper wrote "no
        // runtime answered in time", left that view answering 504 for every later request
        // while the integration was healthy the whole while. Reporting PENDING instead puts
        // the console back on "Fetching…" and lets the refresh below answer it. A failure
        // that has NOT yet expired is still served, so a caller learns promptly that a read
        // failed rather than watching a spinner.
        if row.status == types:CACHE_FAILED && row.expiresAt <= now {
            if row.token is () {
                error? started = startWorkflowReadRefresh(cacheKey, operation, params, roles,
                        componentId, environmentId, now);
                if started is error {
                    log:printWarn("Failed to retry a failed workflow read", started,
                            cacheKey = cacheKey);
                }
            }
            return {state: "PENDING"};
        }
        if payload is string {
            WorkflowReadOutcome outcome = check readOutcomeFromPayload(payload, row, now);
            if row.expiresAt <= now && row.token is () {
                // Stale and nothing refreshing it: start one behind the answer we are about
                // to serve. A failure here is not the caller's problem — they still get data.
                error? started = startWorkflowReadRefresh(cacheKey, operation, params, roles,
                        componentId, environmentId, now);
                if started is error {
                    log:printWarn("Failed to start a workflow cache refresh", started,
                            cacheKey = cacheKey);
                }
            }
            return outcome;
        }
        if row.token is string {
            return {state: "PENDING"};
        }
        // A row with neither payload nor fetch in flight was abandoned: retry it.
    }

    WorkflowCommandTarget? target = check selectWorkflowCommandTarget(componentId, environmentId);
    if target is () {
        return {state: "NO_RUNTIME"};
    }
    check storage:boostCacheOwner(componentId, environmentId, now + WORKFLOW_BOOST_WINDOW_SECONDS,
            now + WORKFLOW_BOOST_WINDOW_SECONDS / 2);

    string request = workflowRequestDocument(operation, params, roles);
    boolean owns = check storage:startCacheFetch(cacheKey, CACHE_KIND_WORKFLOW_READ, scopeKey,
            request, newFetchId(), now + WF_READ_FETCH_DEADLINE_SECONDS);
    if !owns {
        // Another request — on this node or another — is already fetching this exact answer.
        // Both callers poll the one row instead of issuing two commands.
        types:TunneledOperation? existing = check storage:getTunneledOperation(cacheKey);
        if existing is types:TunneledOperation {
            string? cached = existing.data;
            if cached is string {
                return check readOutcomeFromPayload(cached, existing, now);
            }
        }
    }
    return {state: "PENDING"};
}

// Starts a refresh of a stale entry, if this caller wins the claim.
isolated function startWorkflowReadRefresh(string cacheKey, string operation, map<json> params,
        string[] roles, string componentId, string environmentId, int now) returns error? {
    WorkflowCommandTarget? target = check selectWorkflowCommandTarget(componentId, environmentId);
    if target is () {
        // Nothing can answer it; keep serving what we have rather than marking it in flight.
        return ();
    }
    check storage:boostCacheOwner(componentId, environmentId, now + WORKFLOW_BOOST_WINDOW_SECONDS,
            now + WORKFLOW_BOOST_WINDOW_SECONDS / 2);
    _ = check storage:claimCacheRefresh(cacheKey, newFetchId(),
            now + WF_READ_FETCH_DEADLINE_SECONDS);
    return ();
}

isolated function readOutcomeFromPayload(string payload, types:TunneledOperation row, int now)
        returns WorkflowReadOutcome|error {
    map<json> document = check payload.fromJsonString().ensureType();
    // An entry that has only ever been fetched holds `{request}`; one that has been answered
    // holds `{request, response}`. Without a response there is nothing to serve yet.
    json responseJson = document["response"] ?: ();
    if responseJson !is map<json> {
        return {state: "PENDING"};
    }
    map<json> envelope = responseJson;
    int fetchedAt = envelope["fetchedAt"] is int ? <int>envelope["fetchedAt"] : 0;
    int httpStatus = envelope["httpStatus"] is int ? <int>envelope["httpStatus"] : 200;
    boolean serveable = row.expiresAt > now || row.expiresAt > now - WF_STALE_SERVE_SECONDS;
    if !serveable {
        return {state: "PENDING"};
    }
    return {
        state: row.status == types:CACHE_FAILED ? "FAILED" : "READY",
        body: envelope["body"],
        httpStatus: httpStatus,
        fetchedAt: fetchedAt,
        // Stale while expired — and also while a refresh is IN FLIGHT. Claiming a refresh
        // pushes expires_at out to the fetch deadline, so on expiry alone the old answer
        // reported itself fresh for exactly the seconds its replacement was being fetched;
        // a client polling on staleness stopped right then, and the fresh copy landed to
        // nobody. An answer being replaced is stale by definition, whatever its clock says.
        stale: row.expiresAt <= now || row.token !is ()
    };
}

// ── Queueing mutations ───────────────────────────────────────────────────────

# Queues a mutation and returns its tracking id.
#
# Nothing is held open: the console polls the id. `idempotencyKey` becomes the operation id,
# so a double-clicked button or a browser retry collides on the primary key instead of
# completing a task twice — the one duplicate the ICP can prevent. Two different users
# acting on the same task remain two operations, and the integration tells the loser it lost.
#
# + componentId - The component being acted on
# + environmentId - Its environment
# + operation - The management operation to run
# + params - Its parameters
# + userId - The caller, carried to the integration for its own role check and for the audit
# + roles - The caller's roles, taken from this request rather than from any cache
# + idempotencyKey - The caller's key for this action
# + return - The operation id and whether this call created it, `()` when no runtime can
#            execute it, or an error
# The operations that decide a task, and can therefore only happen once.
#
# WS-HumanTask models this as an *actual owner*: a task is claimed, and only its owner
# completes it. There is no claim step here, so the equivalent is enforced at submission —
# the first decision to reach the outbox is the one that goes, and the rest are refused.
final string[] & readonly WF_DECISION_OPERATIONS = [
    "humanTasks.complete",
    "humanTasks.fail",
    "reviewActivities.decide"
];

# What happened to a submitted mutation.
#
# `TAKEN` is the case worth having a name for: someone else decided this task first. Without
# it two users both got `202` and then both got `200`, because the runtime accepts a second
# signal whenever it arrives before the task workflow closes — so the user whose decision was
# discarded was told it succeeded.
type WorkflowMutationOutcome record {|
    string operationId;
    "QUEUED"|"RESUBMITTED"|"TAKEN" state;
    // Who owns the decision that got there first, when this one is TAKEN.
    string? owner = ();
|};

# The id a decision on one task must always produce, so two of them collide.
#
# Deliberately NOT the caller's idempotency key: that key makes one user's retry idempotent,
# which is a different question from two users racing. Keyed on the task and the scope, and
# hashed to stay inside `operation_id`'s column width.
isolated function decisionOperationId(string scopeKey, string taskId) returns string {
    byte[] digest = crypto:hashSha256((scopeKey + "|decision|" + taskId).toBytes());
    return WF_OPERATION_COMMAND_PREFIX + digest.toBase16();
}

# The user who submitted a stored operation, from its request document.
isolated function operationActor(types:TunneledOperation row) returns string? {
    json|error document = (row.data ?: "").fromJsonString();
    if document is map<json> {
        json identity = document["identity"] ?: ();
        if identity is map<json> {
            json userId = identity["userId"] ?: ();
            return userId is string ? userId : ();
        }
    }
    return ();
}

isolated function enqueueWorkflowMutation(string componentId, string environmentId,
        string operation, map<json> params, string userId, string[] roles,
        string idempotencyKey) returns WorkflowMutationOutcome?|error {
    WorkflowCommandTarget? target = check selectWorkflowCommandTarget(componentId, environmentId);
    if target is () {
        return ();
    }
    int now = nowUnixSeconds();
    string scopeKey = workflowScopeKey(componentId, environmentId);
    check storage:boostCacheOwner(componentId, environmentId, now + WORKFLOW_BOOST_WINDOW_SECONDS,
            now + WORKFLOW_BOOST_WINDOW_SECONDS / 2);

    // A decision is identified by the task it decides, so two users deciding at once collide on
    // the primary key and the loser never reaches the runtime. Everything else keeps the
    // caller's own key, where a repeat submission is the caller's own retry.
    json taskId = params["taskId"] ?: ();
    boolean decides = WF_DECISION_OPERATIONS.indexOf(operation) is int && taskId is string;
    string operationId = decides
        ? decisionOperationId(scopeKey, <string>taskId)
        : WF_OPERATION_COMMAND_PREFIX + idempotencyKey;

    string request = workflowRequestDocument(operation, params, roles, userId);
    types:TunneledOperation row = {
        opId: operationId,
        cacheable: false,
        target: target.runtimeId,
        kind: CACHE_KIND_WORKFLOW_OPERATION,
        owner: scopeKey,
        status: types:CACHE_OP_PENDING,
        issuedAt: now,
        // A mutation's expiry is its delivery deadline: past it the row is undeliverable and
        // the sweep turns it into an EXPIRED notification rather than a silent loss.
        expiresAt: now + WF_OPERATION_DEADLINE_SECONDS,
        data: request
    };
    boolean created = check storage:enqueueCacheOperation(row);
    if created {
        return {operationId: operationId, state: "QUEUED"};
    }

    // The id was taken. Who took it decides what this caller is told.
    types:TunneledOperation? existing = check storage:getTunneledOperation(operationId);
    if existing is () {
        // Swept between the insert and this read. Treat it as queued: the caller polls an id
        // that no longer exists and is told so, rather than being refused something nobody holds.
        return {operationId: operationId, state: "QUEUED"};
    }
    string? actor = operationActor(existing);
    if !decides || actor == userId {
        // The caller's own resubmission — the idempotency key doing its job.
        return {operationId: operationId, state: "RESUBMITTED"};
    }
    if existing.status == types:CACHE_OP_FAILED || existing.status == types:CACHE_OP_EXPIRED {
        // The first decision did not take effect, so the task is still open and this caller is
        // entitled to decide it. A fresh row, because the deterministic id is already spent.
        types:TunneledOperation reopened = row.clone();
        reopened.opId = operationId + ".r" + newFetchId().substring(0, 8);
        boolean retried = check storage:enqueueCacheOperation(reopened);
        if retried {
            return {operationId: reopened.opId, state: "QUEUED"};
        }
    }
    return {operationId: operationId, state: "TAKEN", owner: actor};
}

// ── Keys ─────────────────────────────────────────────────────────────────────

isolated function newFetchId() returns string => uuid:createType4AsString();

// What the runtime is asked to execute. The caller's identity travels with it so the
// integration can apply its own role check — the ICP's filtering is a convenience, not the
// authorization boundary.
isolated function workflowRequestDocument(string operation, map<json> params, string[] roles,
        string? userId = ()) returns string =>
    {
        operation: operation,
        params: params,
        identity: {userId: userId, roles: roles}
    }.toJsonString();

# The identity of one cached answer: its scope, the operation, its parameters, and the
# caller's role set.
#
# Roles are in the key and not in the scope, and the difference matters both ways. In the
# key, because human-task and review listings are filtered by role inside the integration,
# so sharing one entry across role sets would show one user another's work. Not in the
# scope, because a completed task changes what *every* role sees, and invalidation works by
# scope — a role-scoped scope would leave every other role reading a stale list.
#
# + scopeKey - `componentId:environmentId`
# + operation - The management operation
# + params - Its parameters
# + roles - The caller's roles
# + return - A hex digest
isolated function workflowCacheKey(string scopeKey, string operation, map<json> params,
        string[] roles) returns string {
    string[] sortedRoles = roles.clone().sort();
    string canonical = scopeKey + "|" + operation + "|" + canonicalJson(params) + "|"
        + string:'join(",", ...sortedRoles);
    byte[] digest = crypto:hashSha256(canonical.toBytes());
    return digest.toBase16();
}

// A stable string for a JSON value: object keys in sorted order, so two requests that differ
// only in the order their parameters were parsed produce the same key and share one fetch.
isolated function canonicalJson(json value) returns string {
    if value is map<json> {
        string[] keys = value.keys().sort();
        string[] parts = [];
        foreach string key in keys {
            parts.push(key + ":" + canonicalJson(value[key]));
        }
        return "{" + string:'join(",", ...parts) + "}";
    }
    if value is json[] {
        string[] parts = [];
        foreach json item in value {
            parts.push(canonicalJson(item));
        }
        return "[" + string:'join(",", ...parts) + "]";
    }
    return value.toJsonString();
}

// ── Ids and TTLs ─────────────────────────────────────────────────────────────

// A read's command id carries both the entry it fills and the attempt that asked for it,
// so a result needs no extra lookup and the wire type stays as the bridge already knows
// it. The attempt half is what fences a late result: an answer whose attempt the row no
// longer holds belongs to a superseded or invalidated fetch.
isolated function readCommandId(string cacheKey, string fetchId) returns string =>
    WF_READ_COMMAND_PREFIX + cacheKey + "." + fetchId;

isolated function splitReadCommandId(string commandId) returns [string, string]? {
    string body = commandId.substring(WF_READ_COMMAND_PREFIX.length());
    int? separator = body.indexOf(".");
    if separator is () {
        return ();
    }
    return [body.substring(0, separator), body.substring(separator + 1)];
}

// How long each family of read stays fresh. Two things drive these numbers: how fast the
// answer can change, and whether a change the ICP causes is caught by invalidation
// anyway. A task created by the integration itself is only ever noticed by expiry, which
// is what keeps the worklist number small.
// How long an answer stands when it was produced right after a mutation, when it may still
// predate that mutation's effects. Short enough that a racing snapshot corrects itself on the
// next couple of reads; long enough that the correction is a handful of fetches, not a stream.
const int WF_TTL_SETTLING_SECONDS = 4;

const int WF_TTL_WORKLIST_SECONDS = 15;
const int WF_TTL_INSTANCE_LIST_SECONDS = 15;
// Short deliberately: a running instance's detail, history and graph are exactly the views
// people poll for progress, and a long TTL would freeze them mid-run. Terminal views below
// are where the cache earns its keep.
const int WF_TTL_RUNNING_INSTANCE_SECONDS = 15;
// A closed instance cannot change again, so its detail, history, tree and graph are held
// long enough to stay readable while the runtime is down - offline visibility for finished
// work, as a side effect of the cache rather than a feature built for it.
const int WF_TTL_TERMINAL_INSTANCE_SECONDS = 86400;
// A failed read is retried soon, but not so soon that a broken runtime is hammered.
const int WF_FAILED_READ_TTL_SECONDS = 15;

// Instance statuses that can never change again.
final string[] & readonly WF_TERMINAL_STATUSES =
    ["COMPLETED", "FAILED", "CANCELED", "CANCELLED", "TERMINATED", "TIMED_OUT"];

// The TTL for a fetched read, from the operation it answered and - for a single instance -
// whether that instance has finished.
//
// The request comes from the caller, which read the entry to preserve it anyway — so this
// needs no lookup of its own.
isolated function workflowReadTtlSeconds(json request, json body) returns int {
    string operation = "";
    if request is map<json> {
        json? operationValue = request["operation"];
        if operationValue is string {
            operation = operationValue;
        }
    }
    if operation.startsWith("humanTasks.") || operation.startsWith("reviewActivities.")
            || operation.startsWith("workItems.") {
        return WF_TTL_WORKLIST_SECONDS;
    }
    if operation == "instances.list" || operation == "definitions.list" {
        return WF_TTL_INSTANCE_LIST_SECONDS;
    }
    if operation.startsWith("instances.") {
        return isTerminalInstanceBody(body)
            ? WF_TTL_TERMINAL_INSTANCE_SECONDS
            : WF_TTL_RUNNING_INSTANCE_SECONDS;
    }
    return WF_TTL_INSTANCE_LIST_SECONDS;
}

// True when the body describes an instance that has finished. Only `instances.get` states
// its own status; for history, tree and graph the conservative answer is "still running",
// which costs a refetch rather than showing a frozen view of a live instance.
isolated function isTerminalInstanceBody(json body) returns boolean {
    if body !is map<json> {
        return false;
    }
    json? status = body["status"];
    return status is string && WF_TERMINAL_STATUSES.indexOf(status) is int;
}

// ── Delivery ─────────────────────────────────────────────────────────────────

// Builds the WORKFLOW_MGMT command that carries one queued item to a runtime. The wire
// contract is unchanged from the in-memory tunnel, so no bridge change is needed: an id,
// an operation, its params, the caller's identity, and a deadline.
isolated function workflowCommand(string runtimeId, string commandId, json request,
        int deadlineEpoch) returns types:ControlCommand|error {
    map<json> requestDoc = check request.ensureType();
    map<json> payload = {
        commandId: commandId,
        operation: requestDoc["operation"],
        params: requestDoc["params"],
        identity: requestDoc["identity"],
        deadline: time:utcToString([deadlineEpoch, 0.0])
    };
    return {
        commandId: commandId,
        runtimeId: runtimeId,
        targetArtifact: {name: "workflow"},
        action: types:WORKFLOW_MGMT,
        issuedAt: time:utcNow(),
        status: types:PENDING,
        payload: payload.toJsonString()
    };
}

# Adds the workflow work queued for this runtime to the heartbeat response it is already
# writing, and stamps the boost cadence.
#
# Any ICP node may answer any heartbeat, so this reads the queue from the database rather
# than from memory: the node that accepted a user's request is usually not this one.
#
# Reads are addressed by scope, because any runtime of the component can answer a
# namespace-scoped query. Mutations are addressed to one runtime and claimed by id alone,
# because the bridge's replay cache is per process - the same mutation reaching two
# runtimes of one integration would execute twice.
#
# + runtimeId - The runtime whose heartbeat is being answered
# + heartbeatResponse - The response being built; commands and cadence are added in place
isolated function deliverWorkflowCommands(string runtimeId,
        types:HeartbeatResponse heartbeatResponse) {
    // Delivery drains the queue, so only an acknowledged response may carry anything: the
    // bridge discards an unacknowledged response without processing commands, and the work
    // taken for it would be lost while its callers are still polling.
    if !heartbeatResponse.acknowledged {
        return;
    }
    [string, string, int]?|error scope = storage:getRuntimeCacheOwner(runtimeId);
    if scope is error {
        log:printError("Failed to resolve a runtime's workflow scope", scope,
                runtimeId = runtimeId);
        return;
    }
    if scope is () {
        return;
    }
    string scopeKey = workflowScopeKey(scope[0], scope[1]);
    types:ControlCommand[] commands = [];
    int now = nowUnixSeconds();

    // One claim returns this heartbeat's work, mutations before reads. The two kinds build
    // their command differently: a mutation carries its own id and its stored deadline and its
    // whole `data` is the request; a read's command id fences the fetch attempt (opId.token),
    // its deadline is a fresh fetch window, and its `data` is `{request, response?}` so only
    // the request half travels.
    types:TunneledOperation[]|error claimed = storage:claimTunneledOperations(runtimeId,
            scopeKey, WF_MAX_OPERATIONS_PER_HEARTBEAT, WF_MAX_READS_PER_HEARTBEAT);
    if claimed is types:TunneledOperation[] {
        foreach types:TunneledOperation op in claimed {
            string commandId;
            json request;
            int deadline;
            if op.cacheable {
                json|error document = (op.data ?: "").fromJsonString();
                request = document is map<json> ? (document["request"] ?: document) : ();
                if document is error || request is () {
                    log:printError("Skipping a cached read with an unreadable request",
                            document is error ? document : error("no request in the entry"),
                            opId = op.opId);
                    continue;
                }
                commandId = readCommandId(op.opId, op.token ?: "");
                deadline = now + WF_READ_FETCH_DEADLINE_SECONDS;
            } else {
                json|error document = (op.data ?: "").fromJsonString();
                if document is error {
                    log:printError("Skipping a workflow operation with an unreadable payload",
                            document, opId = op.opId);
                    continue;
                }
                request = document;
                commandId = op.opId;
                deadline = op.expiresAt;
            }
            types:ControlCommand|error command =
                    workflowCommand(runtimeId, commandId, request, deadline);
            if command is error {
                log:printError("Skipping a malformed workflow command", command, opId = op.opId);
                continue;
            }
            commands.push(command);
        }
    } else {
        log:printError("Failed to claim workflow work for delivery", claimed,
                runtimeId = runtimeId);
    }

    if commands.length() > 0 {
        types:ControlCommand[]? existing = heartbeatResponse.commands;
        if existing is types:ControlCommand[] {
            foreach types:ControlCommand command in commands {
                existing.push(command);
            }
        } else {
            heartbeatResponse.commands = commands;
        }
        log:printDebug(string `Delivering ${commands.length()} workflow command(s) to runtime ${runtimeId}`);
    }

    // The boost window came back with the scope, so no second query is needed here.
    int? cadence = boostCadence(scope[2]);
    if cadence is int {
        heartbeatResponse.nextHeartbeatInSeconds = cadence;
    }
}

// ── Results ──────────────────────────────────────────────────────────────────

# Records a result a runtime posted, routing it to whichever table is waiting for it.
#
# The command id says which: a read carries the fetch id of the attempt that asked for it,
# a mutation carries its operation id. Both writes are conditional, so a result belonging
# to a superseded attempt - or a duplicate of one already recorded - changes nothing.
#
# + result - The result the runtime posted
# + return - `true` when this call recorded the outcome, `false` when it was discarded
isolated function recordWorkflowCommandResult(types:WorkflowCommandResult result)
        returns boolean {
    string commandId = result.commandId;
    int now = nowUnixSeconds();
    if commandId.startsWith(WF_READ_COMMAND_PREFIX) {
        [string, string]? parts = splitReadCommandId(commandId);
        if parts is () {
            log:printWarn("Ignoring a workflow read result with a malformed command id",
                    commandId = commandId);
            return false;
        }
        return recordWorkflowReadResult(parts[0], parts[1], result, now);
    }
    if commandId.startsWith(WF_OPERATION_COMMAND_PREFIX) {
        return recordWorkflowOperationResult(commandId, result);
    }
    log:printWarn("Ignoring a workflow result with an unrecognised command id",
            commandId = commandId, runtimeId = result.runtimeId);
    return false;
}

// A read's answer, cached under the key whose attempt asked for it. The response body is
// stored whole - it is what the console will be served, unchanged.
//
// The entry's `data` carries the request as well as the answer, because one column holds
// both: the request has to survive so a later refresh knows what to ask again. The row is
// read here anyway - the TTL depends on which operation answered - so keeping it costs
// nothing beyond remembering to.
isolated function recordWorkflowReadResult(string cacheKey, string fetchId,
        types:WorkflowCommandResult result, int now) returns boolean {
    types:TunneledOperation?|error row = storage:getTunneledOperation(cacheKey);
    json request = ();
    if row is types:TunneledOperation {
        string? stored = row.data;
        if stored is string {
            json|error document = stored.fromJsonString();
            if document is map<json> {
                // Written by this same shape on the previous pass, or by the fetch that
                // created the row.
                request = document["request"] ?: document;
            }
        }
    }
    map<json> envelope = {
        request: request,
        response: {
            httpStatus: result.httpStatus,
            body: result.body,
            fetchedAt: now,
            runtimeId: result.runtimeId
        }
    };
    if result.httpStatus >= 200 && result.httpStatus < 300 {
        int ttl = workflowReadTtlSeconds(request, result.body);
        // An answer produced while the scope is still hot from a mutation may predate that
        // mutation's own effects: the refresh raced the workflow — it listed the tasks
        // before the completed one's child closed — and then stood as fresh for a full TTL,
        // which is how a just-completed task kept reading as pending. While the runtime is
        // boosted (exactly the window after a mutation) a settled answer expires fast, so
        // the next read re-refreshes — still one coalesced fetch at a time — until the world
        // it describes has caught up.
        int|error boostLeft = storage:cacheBoostRemaining(result.runtimeId);
        if boostLeft is int && boostLeft > 0 && ttl > WF_TTL_SETTLING_SECONDS {
            ttl = WF_TTL_SETTLING_SECONDS;
        }
        boolean|error stored = storage:recordCacheFetchResult(cacheKey, fetchId, true,
                envelope.toJsonString(), now + ttl);
        if stored is error {
            log:printError("Failed to store a workflow read result", stored, cacheKey = cacheKey);
            return false;
        }
        return stored;
    }
    // A failed read keeps any payload the row already holds: the last good answer is worth
    // more than a fresh error, and the caller is told the refresh failed either way.
    boolean|error recorded = storage:recordCacheFetchResult(cacheKey, fetchId, false,
            envelope.toJsonString(), now + WF_FAILED_READ_TTL_SECONDS);
    if recorded is error {
        log:printError("Failed to record a workflow read failure", recorded, cacheKey = cacheKey);
        return false;
    }
    return recorded;
}

// A mutation's outcome. Recorded exactly once: whichever node wins the conditional update
// is the one that writes the audit record or raises the notification, so two nodes seeing
// the same result cannot double-report it.
isolated function recordWorkflowOperationResult(string operationId,
        types:WorkflowCommandResult result) returns boolean {
    boolean succeeded = result.httpStatus >= 200 && result.httpStatus < 300;
    map<json> outcome = {
        httpStatus: result.httpStatus,
        body: result.body,
        runtimeId: result.runtimeId
    };
    boolean|error recorded = storage:completeCacheOperation(operationId,
            succeeded ? types:CACHE_OP_COMPLETED : types:CACHE_OP_FAILED, outcome.toJsonString());
    if recorded is error {
        log:printError("Failed to record a workflow operation outcome", recorded,
                operationId = operationId);
        return false;
    }
    if !recorded {
        // Already recorded — a redelivery the runtime replayed, or the same result reaching a
        // second node. Reporting it again would double-count an action in the audit trail.
        return false;
    }
    if succeeded {
        // The read that follows the write must not show the state the user just changed: a
        // completed task still listed as pending is the one staleness a TTL cannot excuse. So a
        // successful mutation expires every *live* cached read of its scope — all role sets,
        // because a task leaving the pending set changes what every role sees. Terminal-instance
        // entries survive: nothing a mutation does can falsify a closed run's history.
        invalidateWorkflowScopeCache(operationId);
    }
    reportWorkflowOutcome(operationId, succeeded, result);
    return true;
}

// Rows expiring within this horizon are the live ones; anything further out carries the
// terminal-instance TTL and is immutable. Sits far above every live TTL and far below
// WF_TTL_TERMINAL_INSTANCE_SECONDS, so drift in either direction has slack.
const int WF_INVALIDATE_HORIZON_SECONDS = 3600;

// Expires the live cached reads of the scope a completed mutation touched. Failures are
// logged and swallowed: the mutation's outcome is already recorded, and the worst case of a
// failed invalidation is bounded staleness — exactly what the TTL already promises.
isolated function invalidateWorkflowScopeCache(string operationId) {
    types:TunneledOperation?|error row = storage:getTunneledOperation(operationId);
    if row !is types:TunneledOperation {
        if row is error {
            log:printError("Failed to load a completed operation for cache invalidation", row,
                    operationId = operationId);
        }
        return;
    }
    int|error marked = storage:staleCacheOwner(row.owner, WF_INVALIDATE_HORIZON_SECONDS);
    if marked is error {
        log:printError("Failed to invalidate the workflow cache after a mutation", marked,
                scopeKey = row.owner, operationId = operationId);
    }
}

// Where a finished mutation goes once its row is written: the audit trail for a success, an
// operator notification for a failure. Only the node that won the conditional update gets
// here, so an outcome is reported exactly once however many nodes saw the result.
isolated function reportWorkflowOutcome(string operationId, boolean succeeded,
        types:WorkflowCommandResult result) {
    types:TunneledOperation?|error row = storage:getTunneledOperation(operationId);
    string operation = "";
    string target = "";
    string? actor = ();
    if row is types:TunneledOperation {
        json|error request = (row.data ?: "").fromJsonString();
        if request is map<json> {
            json? operationValue = request["operation"];
            if operationValue is string {
                operation = operationValue;
            }
            json? params = request["params"];
            if params is map<json> {
                json? taskId = params["taskId"];
                json? workflowId = params["workflowId"];
                target = taskId is string ? taskId : (workflowId is string ? workflowId : "");
            }
            json? identity = request["identity"];
            if identity is map<json> && identity["userId"] is string {
                actor = <string>identity["userId"];
            }
        }
    }
    if succeeded {
        storage:logAuditEvent("workflow." + operation, userId = actor,
                resourceType = "workflow", resourceId = target,
                details = {operationId: operationId, runtimeId: result.runtimeId}.toJsonString());
        return;
    }
    // A confirmed failure is honest — the integration refused it, and the console shows the
    // reason on the poll. It is still worth an operator record when it is not simply the
    // caller's fault (a conflict or a denial), which a 4xx already tells the user.
    if result.httpStatus >= 500 {
        storage:raiseSystemEvent("workflow_operation_failed", "WARN",
                string `A workflow operation failed on the integration: ${operation}`,
                eventSource = result.runtimeId,
                metadata = {
                    operationId: operationId,
                    operation: operation,
                    target: target,
                    userId: actor,
                    httpStatus: result.httpStatus
                }.toJsonString());
    }
}

# Surfaces the mutations a sweep gave up on.
#
# An `EXPIRED` operation is the one outcome nobody established: it may have run on the
# integration and lost its answer, or never have run at all. That is why it becomes an
# unresolved notification rather than a log line — a person has to look, and the record has
# to wait for them.
isolated function reportExpiredWorkflowOperations(types:TunneledOperation[] expired) {
    foreach types:TunneledOperation row in expired {
        string operation = "";
        string? actor = ();
        json|error request = (row.data ?: "").fromJsonString();
        if request is map<json> {
            json? operationValue = request["operation"];
            if operationValue is string {
                operation = operationValue;
            }
            json? identity = request["identity"];
            if identity is map<json> && identity["userId"] is string {
                actor = <string>identity["userId"];
            }
        }
        storage:raiseSystemEvent("workflow_operation_unconfirmed", "ERROR",
                string `A workflow operation was never confirmed by the integration: ` +
                string `${operation}. It may or may not have been applied - check the ` +
                string `target's state before retrying.`,
                eventSource = row.target ?: row.owner,
                metadata = {
                    operationId: row.opId,
                    operation: operation,
                    userId: actor,
                    scopeKey: row.owner,
                    issuedAt: row.issuedAt
                }.toJsonString());
    }
}

# Runs one sweep and surfaces whatever it expired. Called on a timer by every node; every
# statement is idempotent, so two nodes sweeping is harmless and needs no leader election.
public isolated function sweepWorkflowTunnelState() {
    // One pass gives up on unanswered reads, expires unconfirmed mutations, and deletes what
    // is past serving. It reports back only the mutations it expired — the outcomes nobody
    // established, which have to reach a person rather than be dropped.
    types:TunneledOperation[]|error expired = storage:sweepTunneledOperations(
            WF_STALE_SERVE_SECONDS, WF_COMPLETED_RETENTION_SECONDS, WF_FAILED_READ_TTL_SECONDS);
    if expired is error {
        log:printError("The workflow tunnel sweep failed", expired);
        return;
    }
    reportExpiredWorkflowOperations(expired);
}

// How long a recorded outcome stays readable by the console after it finished. Short: the
// audit trail lives in audit_logs, so the row itself only has to outlast the poll that
// reads it.
const int WF_COMPLETED_RETENTION_SECONDS = 300;

// ── Request → operation mapping ──────────────────────────────────────────────
// Maps a /icp/workflow/{componentId}/{environmentId}/{...wfPath} request to the
// dot-qualified operation vocabulary the runtime's dispatcher executes. Returns () for
// paths outside the vocabulary — including the deprecated /retry-tasks aliases, which
// used to reach the runtime through the callback-URL proxy. That proxy is gone, so those
// paths now answer 404 instead.

final string[] & readonly WF_INSTANCE_SUBRESOURCES = ["history", "activity-tree", "execution-graph"];
final string[] & readonly WF_INSTANCE_ACTIONS = ["suspend", "resume", "terminate", "cancel"];

isolated function mapWorkflowRequestToOperation(string method, string[] wfPath,
        map<json> queryParams, map<json> body) returns [string, map<json>]? {
    int segments = wfPath.length();
    if segments == 0 {
        return ();
    }
    string first = wfPath[0];

    if method == http:GET {
        match first {
            "definitions" if segments == 1 => {
                return ["definitions.list", {}];
            }
            "workflows" => {
                if segments == 1 {
                    return ["instances.list", queryParams];
                }
                string workflowId = wfPath[1];
                if segments == 2 {
                    return ["instances.get", {workflowId: workflowId}];
                }
                if segments == 3 {
                    string sub = wfPath[2];
                    if WF_INSTANCE_SUBRESOURCES.indexOf(sub) is int {
                        return [instanceSubresourceOperation(sub), {workflowId: workflowId}];
                    }
                    // Not a known subresource → an exact run: GET workflows/{id}/{runId}
                    return ["instances.get", {workflowId: workflowId, runId: sub}];
                }
                if segments == 4 && WF_INSTANCE_SUBRESOURCES.indexOf(wfPath[3]) is int {
                    return [instanceSubresourceOperation(wfPath[3]),
                        {workflowId: workflowId, runId: wfPath[2]}];
                }
            }
            "human-tasks" => {
                if segments == 1 {
                    return ["humanTasks.list", queryParams];
                }
                if segments == 2 {
                    return wfPath[1] == "pending-count"
                        ? ["humanTasks.pendingCount", {}]
                        : ["humanTasks.get", {taskId: wfPath[1]}];
                }
            }
            "review-activities" => {
                if segments == 1 {
                    return ["reviewActivities.list", queryParams];
                }
                if segments == 2 {
                    return ["reviewActivities.get", {taskId: wfPath[1]}];
                }
            }
        }
        return ();
    }

    if method != http:POST {
        return ();
    }
    match first {
        "workflows" => {
            if segments == 1 {
                // Fill workflowId so a retried start is idempotent on the runtime side.
                map<json> params = body.clone();
                if params["workflowId"] !is string {
                    params["workflowId"] = "workflow-" + uuid:createType4AsString();
                }
                return ["instances.start", params];
            }
            if segments == 3 && WF_INSTANCE_ACTIONS.indexOf(wfPath[2]) is int {
                map<json> params = {workflowId: wfPath[1]};
                if wfPath[2] == "terminate" && body["reason"] is string {
                    params["reason"] = body["reason"];
                }
                return ["instances." + wfPath[2], params];
            }
            if segments == 4 && WF_INSTANCE_ACTIONS.indexOf(wfPath[3]) is int {
                map<json> params = {workflowId: wfPath[1], runId: wfPath[2]};
                if wfPath[3] == "terminate" && body["reason"] is string {
                    params["reason"] = body["reason"];
                }
                return ["instances." + wfPath[3], params];
            }
        }
        "human-tasks" if segments == 3 => {
            string taskId = wfPath[1];
            if wfPath[2] == "complete" {
                return ["humanTasks.complete", {taskId: taskId, result: body["result"]}];
            }
            if wfPath[2] == "fail" {
                map<json> params = {taskId: taskId, reason: body["reason"]};
                if body["details"] is map<json> {
                    params["details"] = body["details"];
                }
                return ["humanTasks.fail", params];
            }
        }
        "review-activities" if segments == 3 => {
            string action = wfPath[2];
            if action == "proceed" || action == "proceed-with-input" || action == "reject" {
                map<json> params = {taskId: wfPath[1], action: action};
                if body["input"] is map<json> {
                    params["input"] = body["input"];
                }
                if body["feedback"] is string {
                    params["feedback"] = body["feedback"];
                }
                return ["reviewActivities.decide", params];
            }
        }
    }
    return ();
}

isolated function instanceSubresourceOperation(string sub) returns string {
    match sub {
        "history" => {
            return "instances.history";
        }
        "activity-tree" => {
            return "instances.activityTree";
        }
        _ => {
            return "instances.executionGraph";
        }
    }
}

// Converts a request's query params into the command's params map, preserving the
// types the runtime-side dispatcher expects: `limit` becomes an int, `onlyMyTasks` a
// boolean, everything else the first string value.
isolated function workflowQueryParams(map<string[]> rawQueryParams) returns map<json> {
    map<json> params = {};
    foreach [string, string[]] [key, values] in rawQueryParams.entries() {
        if values.length() == 0 {
            continue;
        }
        string value = values[0];
        if key == "limit" {
            int|error limitValue = int:fromString(value);
            if limitValue is int {
                params[key] = limitValue;
            }
        } else if key == "onlyMyTasks" {
            params[key] = value == "true";
        } else {
            params[key] = value;
        }
    }
    return params;
}
