// Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com).
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
// Nothing about a request lives in this process. Every ICP node shares the queue through
// wf_read_cache and wf_operation_outbox, because heartbeats arrive round-robin: the node
// that accepts a user's request is usually NOT the node that receives the runtime's next
// check-in, so it persists the request and walks away. A single module-level map here
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

// How long a mutation stays deliverable. Generous on purpose: with no request held open
// there is no browser timeout to respect, and a user's action surviving a restart of the
// integration is worth more than failing it quickly. Past this it becomes EXPIRED, which
// is a notification rather than a silent loss.
const int WF_OPERATION_DEADLINE_SECONDS = 1800;

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

// The invalidation unit, and the key prefix of every cached read: a component in an
// environment. Deliberately free of roles - a completed task changes what every role sees,
// so invalidation must reach all of them.
isolated function workflowScopeKey(string componentId, string environmentId) returns string =>
    componentId + ":" + environmentId;

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
    "reviewActivities.list",
    // The unified queue is two of the listings above read as one, so it needs the same narrowing.
    "workItems.list"
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

# Serves a workflow read: the generic tunnel (tunnel.bal) with this feature's owner, kind
# and cache key filled in.
#
# The owner is the SCOPE, not a runtime: any runtime of the component can answer a
# namespace-scoped query, so whichever one heartbeats first collects the fetch.
#
# + roles - The caller's roles, which are part of the cache key: a role-filtered listing
#           must never be shared across role sets
# + userId - The caller's user id, part of the key for the same reason: a task assigned to
#            users, or excluding some, answers differently per user
# + return - What to serve, or an error only when the database itself failed
isolated function ensureWorkflowRead(string componentId, string environmentId, string operation,
        map<json> params, string[] roles, string? userId = (), boolean forceRefresh = false)
        returns TunneledReadOutcome|error {
    string scopeKey = workflowScopeKey(componentId, environmentId);
    WorkflowCommandTarget? target = check selectWorkflowCommandTarget(componentId, environmentId);
    return ensureTunneledRead({
        cacheKey: workflowCacheKey(scopeKey, operation, params, roles, userId),
        kind: CACHE_KIND_WORKFLOW_READ,
        owner: scopeKey,
        componentId: componentId,
        environmentId: environmentId,
        request: workflowRequestDocument(operation, params, roles, userId)
    }, target !is (), forceRefresh);
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
isolated function operationActor(types:CacheOperation row) returns string? {
    json|error document = row.data.fromJsonString();
    if document is map<json> {
        json actorId = document["actorId"] ?: ();
        if actorId is string {
            return actorId;
        }
        json identity = document["identity"] ?: ();
        if identity is map<json> {
            json userId = identity["userId"] ?: ();
            return userId is string ? userId : ();
        }
    }
    return ();
}

isolated function enqueueWorkflowMutation(string componentId, string environmentId,
        string operation, map<json> params, string userId, string actorId, string[] roles,
        string idempotencyKey) returns WorkflowMutationOutcome?|error {
    WorkflowCommandTarget? target = check selectWorkflowCommandTarget(componentId, environmentId);
    if target is () {
        return ();
    }
    int now = nowUnixSeconds();
    string scopeKey = workflowScopeKey(componentId, environmentId);
    check storage:boostCacheOwner(componentId, environmentId, now + TUNNEL_BOOST_WINDOW_SECONDS,
            now + TUNNEL_BOOST_WINDOW_SECONDS / 2);

    // A decision is identified by the task it decides, so two users deciding at once collide on
    // the primary key and the loser never reaches the runtime. Everything else keeps the
    // caller's own key, where a repeat submission is the caller's own retry.
    json taskId = params["taskId"] ?: ();
    boolean decides = WF_DECISION_OPERATIONS.indexOf(operation) is int && taskId is string;
    string operationId = decides
        ? decisionOperationId(scopeKey, <string>taskId)
        : WF_OPERATION_COMMAND_PREFIX + idempotencyKey;

    string request = workflowRequestDocument(operation, params, roles, userId, actorId);
    types:CacheOperation row = {
        operationId: operationId,
        target: target.runtimeId,
        kind: CACHE_KIND_WORKFLOW_OPERATION,
        owner: scopeKey,
        status: types:CACHE_OP_PENDING,
        issuedAt: now,
        deadline: now + WF_OPERATION_DEADLINE_SECONDS,
        data: request
    };
    boolean created = check storage:enqueueCacheOperation(row);
    if created {
        return {operationId: operationId, state: "QUEUED"};
    }

    // The id was taken. Who took it decides what this caller is told.
    types:CacheOperation? existing = check storage:getCacheOperation(operationId);
    if existing is () {
        // Swept between the insert and this read. Treat it as queued: the caller polls an id
        // that no longer exists and is told so, rather than being refused something nobody holds.
        return {operationId: operationId, state: "QUEUED"};
    }
    string? actor = operationActor(existing);
    if decides && (existing.status == types:CACHE_OP_FAILED || existing.status == types:CACHE_OP_EXPIRED) {
        // The first decision never took effect; a fresh row, since the deterministic id is spent.
        types:CacheOperation reopened = row.clone();
        reopened.operationId = operationId + ".r" + newFetchId().substring(0, 8);
        boolean retried = check storage:enqueueCacheOperation(reopened);
        if retried {
            return {operationId: reopened.operationId, state: "QUEUED"};
        }
    }
    if !decides || actor == actorId {
        return {operationId: operationId, state: "RESUBMITTED"};
    }
    return {operationId: operationId, state: "TAKEN", owner: actor};
}

// ── Keys ─────────────────────────────────────────────────────────────────────

// What the runtime is asked to execute. The caller's identity travels with it so the
// integration can apply its own role check — the ICP's filtering is a convenience, not the
// authorization boundary.
isolated function workflowRequestDocument(string operation, map<json> params, string[] roles,
        string? userId = (), string? actorId = ()) returns string =>
    {
        operation: operation,
        params: params,
        identity: {userId: userId, roles: roles},
        // ICP-only: the stable user id for the audit trail and the same-caller test. Not tunneled.
        actorId: actorId ?: userId
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
        string[] roles, string? userId = ()) returns string {
    string[] sortedRoles = roles.clone().sort();
    string canonical = scopeKey + "|" + operation + "|" + canonicalJson(params) + "|"
        + string:'join(",", ...sortedRoles) + "|" + (userId ?: "");
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

// ── TTLs ─────────────────────────────────────────────────────────────────────

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

# Adds the tunneled work queued for this runtime to the heartbeat response it is already
# writing, and stamps the boost cadence.
#
# Any ICP node may answer any heartbeat, so this reads the queue from the database rather
# than from memory: the node that accepted a user's request is usually not this one.
#
# Mutations are addressed to one runtime and claimed by id alone, because a runtime's replay
# cache is per process - the same mutation reaching two runtimes of one integration would
# execute twice. Reads are claimed by owner, and what an owner is differs by runtime type:
# a BI workflow read belongs to the component scope (any of its runtimes may answer), an MI
# management read belongs to the one runtime it names (see mi_tunnel.bal).
#
# + runtimeId - The runtime whose heartbeat is being answered
# + heartbeatResponse - The response being built; commands and cadence are added in place
isolated function deliverTunneledCommands(string runtimeId,
        types:HeartbeatResponse heartbeatResponse) {
    // Delivery drains the queue, so only an acknowledged response may carry anything: the
    // runtime discards an unacknowledged response without processing commands, and the work
    // taken for it would be lost while its callers are still polling.
    if !heartbeatResponse.acknowledged {
        return;
    }
    [string, string, int, string]?|error scope = storage:getRuntimeCacheOwner(runtimeId);
    if scope is error {
        log:printError("Failed to resolve a runtime's tunnel scope", scope,
                runtimeId = runtimeId);
        return;
    }
    if scope is () {
        return;
    }
    boolean isMI = scope[3] == types:MI;
    string owner = isMI ? miReadOwner(runtimeId) : workflowScopeKey(scope[0], scope[1]);
    types:ControlAction action = isMI ? types:MI_MGMT : types:WORKFLOW_MGMT;
    string readPrefix = isMI ? MI_READ_COMMAND_PREFIX : WF_READ_COMMAND_PREFIX;
    types:ControlCommand[] commands = [];
    int now = nowUnixSeconds();

    // Mutations first: a user waiting on an action outranks a list refresh.
    types:CacheOperation[]|error operations =
        storage:claimCacheOperations(runtimeId, WF_MAX_OPERATIONS_PER_HEARTBEAT);
    if operations is types:CacheOperation[] {
        foreach types:CacheOperation operation in operations {
            json|error request = operation.data.fromJsonString();
            if request is error {
                log:printError("Skipping a tunneled operation with an unreadable payload",
                        request, operationId = operation.operationId);
                continue;
            }
            types:ControlCommand|error command = tunneledCommand(action, runtimeId,
                    operation.operationId, request, operation.deadline);
            if command is error {
                log:printError("Skipping a malformed workflow operation", command,
                        operationId = operation.operationId);
                continue;
            }
            commands.push(command);
        }
    } else {
        log:printError("Failed to claim workflow operations for delivery", operations,
                runtimeId = runtimeId);
    }

    types:CachePendingFetch[]|error fetches =
        storage:claimCacheFetches(owner, WF_MAX_READS_PER_HEARTBEAT);
    if fetches is types:CachePendingFetch[] {
        foreach types:CachePendingFetch fetch in fetches {
            // `data` is `{request, response?}`; delivery needs the request half.
            json|error document = fetch.data.fromJsonString();
            json request = document is map<json> ? (document["request"] ?: document) : ();
            if document is error || request is () {
                log:printError("Skipping a cached read with an unreadable request",
                        document is error ? document : error("no request in the entry"),
                        cacheKey = fetch.cacheKey);
                continue;
            }
            types:ControlCommand|error command = tunneledCommand(action, runtimeId,
                    readCommandId(readPrefix, fetch.cacheKey, fetch.token), request,
                    now + TUNNEL_READ_FETCH_DEADLINE_SECONDS);
            if command is error {
                log:printError("Skipping a malformed workflow read", command,
                        cacheKey = fetch.cacheKey);
                continue;
            }
            commands.push(command);
        }
    } else {
        log:printError("Failed to claim cache fetches for delivery", fetches, owner = owner);
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
        log:printDebug(string `Delivering ${commands.length()} tunneled command(s) to runtime ${runtimeId}`);
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
isolated function recordTunneledCommandResult(types:WorkflowCommandResult result)
        returns boolean {
    string commandId = result.commandId;
    int now = nowUnixSeconds();
    if commandId.startsWith(WF_READ_COMMAND_PREFIX) {
        [string, string]? parts = splitReadCommandId(WF_READ_COMMAND_PREFIX, commandId);
        if parts is () {
            log:printWarn("Ignoring a workflow read result with a malformed command id",
                    commandId = commandId);
            return false;
        }
        return recordTunneledReadResult(parts[0], parts[1], result, now, settledWorkflowReadTtl,
                TUNNEL_FAILED_READ_TTL_SECONDS);
    }
    if commandId.startsWith(WF_OPERATION_COMMAND_PREFIX) {
        return recordWorkflowOperationResult(commandId, result);
    }
    return recordMICommandResult(result, now);
}

// The workflow TTL, clamped while the scope is still hot from a mutation.
//
// An answer produced then may predate that mutation's own effects: the refresh raced the
// workflow — it listed the tasks before the completed one's child closed — and then stood as
// fresh for a full TTL, which is how a just-completed task kept reading as pending. While
// the runtime is boosted (exactly the window after a mutation) a settled answer expires
// fast, so the next read re-refreshes — still one coalesced fetch at a time — until the
// world it describes has caught up.
isolated function settledWorkflowReadTtl(json request, json body, string runtimeId) returns int {
    int ttl = workflowReadTtlSeconds(request, body);
    int|error boostLeft = storage:cacheBoostRemaining(runtimeId);
    if boostLeft is int && boostLeft > 0 && ttl > WF_TTL_SETTLING_SECONDS {
        return WF_TTL_SETTLING_SECONDS;
    }
    return ttl;
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
    types:CacheOperation?|error row = storage:getCacheOperation(operationId);
    if row !is types:CacheOperation {
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
    types:CacheOperation?|error row = storage:getCacheOperation(operationId);
    string operation = "";
    string target = "";
    string? actor = ();
    if row is types:CacheOperation {
        json|error request = row.data.fromJsonString();
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
            json? actorId = request["actorId"];
            json? identity = request["identity"];
            if actorId is string {
                actor = actorId;
            } else if identity is map<json> && identity["userId"] is string {
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
isolated function reportExpiredWorkflowOperation(types:CacheOperation row) {
    string operation = "";
    string? actor = ();
    json|error request = row.data.fromJsonString();
    if request is map<json> {
        json? operationValue = request["operation"];
        if operationValue is string {
            operation = operationValue;
        }
        json? actorId = request["actorId"];
        json? identity = request["identity"];
        if actorId is string {
            actor = actorId;
        } else if identity is map<json> && identity["userId"] is string {
            actor = <string>identity["userId"];
        }
    }
    storage:raiseSystemEvent("workflow_operation_unconfirmed", "ERROR",
            string `A workflow operation was never confirmed by the integration: ` +
            string `${operation}. It may or may not have been applied - check the ` +
            string `target's state before retrying.`,
            eventSource = row.target,
            metadata = {
                operationId: row.operationId,
                operation: operation,
                userId: actor,
                scopeKey: row.owner,
                issuedAt: row.issuedAt
            }.toJsonString());
}



// ── Request → operation mapping ──────────────────────────────────────────────
// Maps a /icp/workflow/{componentId}/{environmentId}/{...wfPath} request to the
// dot-qualified operation vocabulary the runtime's dispatcher executes. Returns () for
// paths outside the vocabulary — including the deprecated /retry-tasks aliases, which
// used to reach the runtime through the callback-URL proxy. That proxy is gone, so those
// paths now answer 404 instead.

final string[] & readonly WF_INSTANCE_SUBRESOURCES = ["history", "activity-tree", "execution-graph", "reset-points"];
// "wake" ends a durable agent's in-progress `sleep` tool call early; harmless on other workflows.
final string[] & readonly WF_INSTANCE_ACTIONS = ["suspend", "resume", "terminate", "cancel", "wake"];

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
            "work-items" => {
                if segments == 1 {
                    return ["workItems.list", queryParams];
                }
            }
            "human-tasks" => {
                if segments == 1 {
                    return ["humanTasks.list", queryParams];
                }
                if segments == 2 {
                    return wfPath[1] == "pending-count"
                        // The query params carry the taskQueue filter, so the badge matches the filtered listing.
                        ? ["humanTasks.pendingCount", queryParams]
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
                    params["workflowId"] = uuid:createType4AsString();
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
            if segments == 3 && wfPath[2] == "reset" {
                map<json> params = {workflowId: wfPath[1]};
                foreach string key in ["resetType", "eventId", "reason", "reapply", "runId"] {
                    if body[key] !is () {
                        params[key] = body[key];
                    }
                }
                return ["instances.reset", params];
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
            return taskAdministrationOperation(taskId, wfPath[2], body);
        }
        "review-activities" if segments == 2 && wfPath[1] == "bulk-retry" => {
            map<json> params = {};
            foreach string key in ["action", "taskIds", "parentWorkflowId", "activityName", "feedback"] {
                if body[key] !is () {
                    params[key] = body[key];
                }
            }
            return ["reviewActivities.bulkRetry", params];
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
            return taskAdministrationOperation(wfPath[1], action, body);
        }
    }
    return ();
}

// The administrator verbs a task of either kind accepts (workflow 0.10 `tasks.*`): a new audience,
// or a new deadline where a missing or null `timeoutMillis` clears it.
isolated function taskAdministrationOperation(string taskId, string action, map<json> body)
        returns [string, map<json>]? {
    if action == "reassign" {
        map<json> params = {taskId: taskId};
        foreach string key in ["userRoles", "users", "excludedUsers", "excludedRoles"] {
            if body[key] is json[] {
                params[key] = body[key];
            }
        }
        return ["tasks.reassign", params];
    }
    if action == "deadline" {
        json millis = body["timeoutMillis"];
        return ["tasks.extendDeadline", {taskId: taskId, timeoutMillis: millis is int ? millis : ()}];
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
        "reset-points" => {
            return "instances.resetPoints";
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
