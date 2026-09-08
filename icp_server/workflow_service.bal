// Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
//
// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

import icp_server.auth;
import icp_server.storage;
import icp_server.types;

import ballerina/http;
import ballerina/log;
import ballerina/uuid;

// ── Workflow management service ──────────────────────────────────────────────
// Serves the frontend's workflow management requests over the heartbeat command
// tunnel (workflow_tunnel.bal): each request is mapped to a management operation,
// queued for the component+environment's leader runtime — a RUNNING runtime that
// advertised the workflowCommands capability — executed in-process by the
// runtime's ICP bridge, and answered with the result posted back on
// POST /icp/commandResult. No network path into the integration or its Temporal
// server exists: the runtime exposes no management port and needs no API key.
//
// Frontend → GET/POST https://<icp>/icp/workflow/{componentId}/{environmentId}/<wf-path>
//          → tunneled as {operation, params, identity} to the leader runtime
//
// The caller's identity travels in the command: the user id plus the ICP role
// names (each escaped, see escapeRoleName, plus a synthetic `admin` role for
// super-admins) so the workflow runtime can do its own human-task authorization.

// Resolves workflow definitions for the given component+environment from the workflow
// metadata stored off heartbeats (bi_workflow_metadata) and maps them to the Workflow
// artifact shape used by the frontend — no call into the integration, and definitions
// stay available as long as any RUNNING runtime of the component reported metadata.
// Returns [] when none has. Used by the GraphQL `workflowsByEnvironmentAndComponent`
// resolver.
isolated function fetchWorkflowDefinitions(string componentId, string environmentId) returns types:Workflow[]|error {
    types:Workflow[]? stored = check workflowDefinitionsFromStoredMetadata(componentId, environmentId);
    return stored ?: [];
}

// Builds the Workflow artifact list from the stored workflow metadata, or () when no
// RUNNING runtime of the component+environment has published metadata. Definitions are
// deduped across runtimes by workflow type; a definition's worker count is the number
// of RUNNING runtimes whose metadata declares it.
isolated function workflowDefinitionsFromStoredMetadata(string componentId, string environmentId)
        returns types:Workflow[]?|error {
    types:WorkflowMetadataRecord[] metadataRecords =
        check storage:getWorkflowMetadataForComponentEnv(componentId, environmentId);
    if metadataRecords.length() == 0 {
        return ();
    }

    // workflowType → [inputSchema, workerCount]
    map<[string?, int]> definitionsByType = {};
    foreach types:WorkflowMetadataRecord metadataRecord in metadataRecords {
        json|error document = metadataRecord.metadata.fromJsonString();
        if document is error {
            log:printWarn(string `Ignoring unparseable workflow metadata of runtime ${metadataRecord.runtimeId}`,
                    'error = document);
            continue;
        }
        json|error definitionsJson = document.definitions;
        if definitionsJson !is json[] {
            continue;
        }
        foreach json definitionJson in definitionsJson {
            types:WorkflowDefinition|error def = definitionJson.cloneWithType();
            if def is error {
                continue;
            }
            [string?, int]? existing = definitionsByType[def.workflowType];
            if existing is [string?, int] {
                definitionsByType[def.workflowType] = [existing[0], existing[1] + 1];
            } else {
                definitionsByType[def.workflowType] = [def?.inputSchema, 1];
            }
        }
    }
    if definitionsByType.length() == 0 {
        return ();
    }

    // Definitions are shared across the component+environment's runtimes; attach them for the UI.
    types:Runtime[] runtimes = check storage:getRuntimes((), (), environmentId, (), componentId);
    types:ArtifactRuntimeInfo[] runtimeInfos = from var r in runtimes
        select {runtimeId: r.runtimeId, runtimeName: r?.runtimeName, status: r.status};

    types:Workflow[] result = [];
    foreach [string, [string?, int]] [workflowType, [inputSchema, workerCount]] in definitionsByType.entries() {
        // A stored definition comes from a RUNNING runtime's registry, so it is active.
        result.push({
            name: workflowType,
            isActive: true,
            workerCount: workerCount,
            inputSchema: inputSchema,
            state: types:ENABLED,
            runtimes: runtimeInfos
        });
    }
    return result;
}

// Escapes a role name for the comma-joined role list in the tunneled command identity
// (`,` → `%2C`). Role names are user-created, so a literal comma would otherwise let a
// role like `Foo,admin` inject the synthetic `admin` role when the runtime splits the
// joined list. Names without commas pass through unchanged, so runtime-side role
// matching is unaffected. The frontend reverses this for display (unescapeRoleName in
// workflow/helpers.ts).
isolated function escapeRoleName(string roleName) returns string {
    return re `,`.replaceAll(roleName, "%2C");
}

// Whether the request announced a body. `getJsonPayload` fails the same way for a missing
// body and for malformed content, so the headers are what separate "nothing sent" from
// "sent something unusable".
isolated function hasRequestBody(http:Request req) returns boolean {
    string|error contentLength = req.getHeader("content-length");
    if contentLength is string {
        int|error length = int:fromString(contentLength);
        return length is int && length > 0;
    }
    return req.getHeader("transfer-encoding") is string;
}

isolated function workflowErrorResponse(int statusCode, string message) returns http:Response {
    http:Response res = new;
    res.statusCode = statusCode;
    res.setJsonPayload({"error": {"message": message}});
    return res;
}

// ── Serving the async contract ───────────────────────────────────────────────
// Reads are answered from the shared cache; mutations are queued and tracked. Neither
// holds a request open, which is what lets any ICP node answer any poll.

// Header a client may send to make a mutation retry-safe. Without one the ICP generates a
// key, which still de-duplicates a browser-level retry of the same request object but not a
// second click.
const string WF_IDEMPOTENCY_HEADER = "x-idempotency-key";

// Headers that tell the console what it is looking at. Cached data must never be presented
// as live: an operator deciding whether to terminate an instance needs the view's age.
const string WF_FETCHED_AT_HEADER = "x-workflow-fetched-at";
const string WF_STALE_HEADER = "x-workflow-stale";

# Answers a read from the cache, or accepts it for materialization.
#
# `202` with `{status: "FETCHING"}` is the normal first answer for a view nobody has opened
# recently; the console polls the same URL. A stale entry is served with its age instead,
# while a refresh runs behind it.
isolated function serveWorkflowRead(string componentId, string environmentId, string operation,
        map<json> params, string[] roles, boolean forceRefresh = false) returns http:Response {
    WorkflowReadOutcome|error outcome = ensureWorkflowRead(componentId, environmentId, operation,
            params, roles, forceRefresh);
    if outcome is error {
        log:printError("Failed to serve a workflow read", outcome, operation = operation);
        return workflowErrorResponse(500, "Failed to read workflow data: " + outcome.message());
    }
    match outcome.state {
        "NO_RUNTIME" => {
            // The console already renders 503 as "this integration has nothing to contribute",
            // so an environment with no workflow runtime reads as offline rather than broken.
            return workflowErrorResponse(503,
                    "No running workflow runtime can serve this environment's workflow requests");
        }
        "PENDING" => {
            http:Response accepted = new;
            accepted.statusCode = 202;
            accepted.setJsonPayload({status: "FETCHING", retryAfterMs: 750});
            return accepted;
        }
    }
    http:Response response = new;
    response.statusCode = outcome.httpStatus;
    response.setJsonPayload(outcome.body);
    response.setHeader(WF_FETCHED_AT_HEADER, outcome.fetchedAt.toString());
    if outcome.stale {
        response.setHeader(WF_STALE_HEADER, "true");
    }
    return response;
}

# The longest client-supplied idempotency key accepted. `tunneled_operation.op_id` is
# VARCHAR(100) and the key is stored behind a 4-character prefix, so this leaves room to
# spare while keeping the failure a 400 rather than a truncated or rejected INSERT.
const int WF_MAX_IDEMPOTENCY_KEY_LENGTH = 64;

# Queues a mutation and answers with the id to poll.
#
# The id is the caller's idempotency key, so re-submitting the same action returns the same
# operation rather than performing it twice. Two different users acting on one task still
# produce two operations — the integration is what tells the second one it lost.
isolated function acceptWorkflowMutation(http:Request req, string componentId,
        string environmentId, string operation, map<json> params, string userId,
        string[] roles) returns http:Response {
    string|http:HeaderNotFoundError key = req.getHeader(WF_IDEMPOTENCY_HEADER);
    string idempotencyKey;
    if key is string && key.trim().length() > 0 {
        // Bounded and checked before it becomes a primary key. `op_id` is VARCHAR(100)
        // and carries a 4-character prefix, so an unbounded client header turned into a SQL
        // "value too long" error and a 500 — a client's malformed input reported as a server
        // fault, and trivial for any caller to trigger. The charset is restricted for the same
        // reason: this value ends up in an id that is routed by prefix and read back in logs.
        string candidate = key.trim();
        if candidate.length() > WF_MAX_IDEMPOTENCY_KEY_LENGTH {
            return workflowErrorResponse(400, string `The ${WF_IDEMPOTENCY_HEADER} header must be ` +
                    string `at most ${WF_MAX_IDEMPOTENCY_KEY_LENGTH} characters`);
        }
        if !re `^[A-Za-z0-9._:-]+$`.isFullMatch(candidate) {
            return workflowErrorResponse(400, string `The ${WF_IDEMPOTENCY_HEADER} header may ` +
                    "only contain letters, digits, and the characters . _ : -");
        }
        idempotencyKey = candidate;
    } else {
        idempotencyKey = uuid:createType4AsString();
    }
    WorkflowMutationOutcome?|error queued = enqueueWorkflowMutation(componentId, environmentId,
            operation, params, userId, roles, idempotencyKey);
    if queued is error {
        log:printError("Failed to queue a workflow mutation", queued, operation = operation);
        return workflowErrorResponse(500, "Failed to submit the operation: " + queued.message());
    }
    if queued is () {
        return workflowErrorResponse(503,
                "No running workflow runtime can serve this environment's workflow requests");
    }
    if queued.state == "TAKEN" {
        // Someone else decided this task first, and only their decision was sent. Saying so is
        // the whole point: before this, both callers were told 202 and then both were told 200,
        // because the runtime accepts a second signal whenever it arrives before the task
        // workflow closes — so the user whose decision was discarded believed it had taken
        // effect. There is no claim step to consult (WS-HumanTask's actual owner), so first
        // submission is the owner.
        log:printWarn("A workflow decision was refused because another user decided first",
                operation = operation, operationId = queued.operationId,
                refusedFor = userId, decidedBy = queued.owner ?: "unknown",
                componentId = componentId, environmentId = environmentId);
        // And recorded where an operator can find it afterwards. The console log is the minimum;
        // an unresolved event is the durable half, and it is the same place an unconfirmed
        // operation lands. A per-user record of refused decisions belongs in a system built for
        // it, which this is not.
        storage:raiseSystemEvent("workflow_decision_conflict", "WARN",
                string `A workflow decision was refused: ${operation} on this task was already ` +
                    "submitted by another user, and only the first was sent to the integration.",
                eventSource = componentId,
                metadata = {
                    operationId: queued.operationId,
                    operation: operation,
                    refusedFor: userId,
                    decidedBy: queued.owner ?: (),
                    environmentId: environmentId
                }.toJsonString());
        http:Response refused = new;
        refused.statusCode = 409;
        refused.setJsonPayload({
            status: "CONFLICT",
            // The id of the decision that did go, so the caller can read what it did.
            operationId: queued.operationId,
            "error": {
                message: "Someone else decided this task first. Only their decision was applied — " +
                    "refresh to see it."
            }
        });
        return refused;
    }
    http:Response accepted = new;
    accepted.statusCode = 202;
    accepted.setJsonPayload({
        status: "PENDING",
        operationId: queued.operationId,
        // false means this exact action was already submitted by this caller; they poll the same
        // id rather than being told it failed.
        created: queued.state == "QUEUED",
        retryAfterMs: 750
    });
    return accepted;
}

# Answers a poll for a queued mutation.
#
# A finished operation reports what the integration said, including a conflict when someone
# else acted first. `EXPIRED` is deliberately distinct from `FAILED`: the ICP never learned
# the outcome, so the caller is told to check the target's state rather than to retry.
isolated function serveWorkflowOperationStatus(string operationId) returns http:Response {
    types:TunneledOperation?|error row = storage:getTunneledOperation(operationId);
    if row is error {
        return workflowErrorResponse(500, "Failed to read the operation: " + row.message());
    }
    if row is () {
        return workflowErrorResponse(404, "Unknown operation: " + operationId);
    }
    if row.status == types:CACHE_OP_PENDING || row.status == types:CACHE_OP_DELIVERED {
        http:Response pending = new;
        pending.statusCode = 202;
        pending.setJsonPayload({status: row.status, operationId: operationId, retryAfterMs: 750});
        return pending;
    }
    if row.status == types:CACHE_OP_EXPIRED {
        http:Response expired = new;
        expired.statusCode = 504;
        expired.setJsonPayload({
            status: types:CACHE_OP_EXPIRED,
            operationId: operationId,
            "error": {
                "message": "The integration did not confirm this operation. Check the target's " +
                    "state before retrying — it may or may not have been applied."
            }
        });
        return expired;
    }
    json outcome = ();
    string? result = row.result;
    if result is string {
        json|error parsed = result.fromJsonString();
        if parsed is json {
            outcome = parsed;
        }
    }
    int status = 200;
    json body = ();
    if outcome is map<json> {
        json? httpStatus = outcome["httpStatus"];
        if httpStatus is int {
            status = httpStatus;
        }
        body = outcome["body"];
    }
    http:Response response = new;
    response.statusCode = status;
    response.setJsonPayload(body);
    return response;
}

// Performs auth, leader resolution, and tunneled execution for one workflow management
// request; returns the response to relay to the caller.
function handleWorkflowRequest(string componentId, string environmentId, string[] wfPath, http:Request req) returns http:Response {
    // 1. Identify the caller from the (already JWT-validated) Authorization header.
    string|http:HeaderNotFoundError authHeader = req.getHeader("Authorization");
    if authHeader is http:HeaderNotFoundError {
        return workflowErrorResponse(401, "Authorization header missing");
    }
    types:UserContextV2|error userContext = auth:extractUserContextV2(authHeader);
    if userContext is error {
        return workflowErrorResponse(401, "Invalid token: " + userContext.message());
    }

    // 2. Authorize with the dedicated workflow permissions (scoped to the integration).
    //    - human-tasks: browsing needs view_human_tasks; acting needs manage_human_tasks.
    //    - everything else (workflows lifecycle, definitions, review-activities):
    //      browsing needs view_workflows; any mutation needs manage_workflows.
    string|error projectId = storage:getProjectIdByComponentId(componentId);
    if projectId is error {
        return workflowErrorResponse(404, "Component not found: " + componentId);
    }
    types:AccessScope scope = {
        orgUuid: 1,
        projectUuid: projectId,
        integrationUuid: componentId,
        envUuid: environmentId
    };
    string method = req.method;
    string firstSeg = wfPath.length() > 0 ? wfPath[0] : "";
    string[] allowedPermissions;
    if firstSeg == "human-tasks" {
        allowedPermissions = method == http:GET
            ? [auth:PERMISSION_WORKFLOW_VIEW_HUMAN_TASKS, auth:PERMISSION_WORKFLOW_MANAGE_HUMAN_TASKS]
            : [auth:PERMISSION_WORKFLOW_MANAGE_HUMAN_TASKS];
    } else {
        allowedPermissions = method == http:GET
            ? [auth:PERMISSION_WORKFLOW_VIEW_WORKFLOWS, auth:PERMISSION_WORKFLOW_MANAGE_WORKFLOWS]
            : [auth:PERMISSION_WORKFLOW_MANAGE_WORKFLOWS];
    }
    boolean|error permitted = auth:hasAnyPermission(userContext.userId, allowedPermissions, scope);
    if permitted is error {
        return workflowErrorResponse(500, "Authorization check failed: " + permitted.message());
    }
    if !permitted {
        log:printWarn("Workflow request access denied", userId = userContext.userId, componentId = componentId, method = method);
        return workflowErrorResponse(403, "Access denied");
    }

    // 3. Resolve the caller's role names — tunneled in the command identity (each
    //    escaped, see escapeRoleName) with the synthetic admin role for super admins.
    string[]|error roleNames = storage:getAllUserRoleNames(userContext.userId);
    if roleNames is error {
        return workflowErrorResponse(500, "Failed to resolve user roles: " + roleNames.message());
    }
    string[] escapedRoles = roleNames.map(escapeRoleName);
    boolean|error superAdmin = auth:isSuperAdmin(userContext.userId);
    if superAdmin is boolean && superAdmin {
        escapedRoles.push("admin");
    }

    // Polling a queued mutation needs neither a runtime nor a scope lookup: the outcome is a
    // row, and the point of recording it is that it survives the runtime that produced it.
    // Answered before target selection so a user still learns what happened to their action
    // when the integration has since gone offline.
    if method == http:GET && wfPath.length() == 2 && wfPath[0] == "operations" {
        return serveWorkflowOperationStatus(wfPath[1]);
    }

    // 4. Map the request to a management operation and tunnel it to the leader
    //    runtime — a RUNNING runtime of this component+environment that advertised
    //    the workflowCommands capability.
    WorkflowCommandTarget?|error tunnelTarget = selectWorkflowCommandTarget(componentId, environmentId);
    if tunnelTarget is error {
        return workflowErrorResponse(500, "Failed to resolve workflow runtime: " + tunnelTarget.message());
    }
    if tunnelTarget is () {
        return workflowErrorResponse(503, "No running workflow runtime can serve this environment's workflow requests");
    }
    map<json> queryParams = workflowQueryParams(req.getQueryParams());
    // `refresh` is an instruction to this layer, never a parameter of the operation: it must
    // not reach the cache key, or a forced refresh would create a parallel entry instead of
    // refreshing the one everyone reads.
    boolean forceRefresh = queryParams.removeIfHasKey("refresh") == "true";

    // The instance graph composes the stored model with the runtime's history, so it is handled
    // here rather than mapped to a single tunneled operation like every other path.
    if method == http:GET && wfPath.length() == 3 && wfPath[0] == "workflows"
            && wfPath[2] == "instance-graph" {
        return handleInstanceGraphRequest(componentId, environmentId, wfPath[1], escapedRoles,
                forceRefresh);
    }

    map<json> body = {};
    if method == http:POST {
        json|error rawBody = req.getJsonPayload();
        if rawBody is map<json> {
            body = rawBody;
        } else if rawBody is json || hasRequestBody(req) {
            // A body was sent and it is not a JSON object — valid JSON of the wrong shape, or
            // not JSON at all. Substituting `{}` would forward the operation with its
            // parameters missing (`humanTasks.complete` with no result, `humanTasks.fail`
            // with no reason) and report the runtime's complaint about a missing parameter
            // instead of the client's malformed request. A POST with no body at all is
            // normal — several operations take none — and still goes through.
            return workflowErrorResponse(400, "Request body must be a JSON object");
        }
    }
    [string, map<json>]? operation = mapWorkflowRequestToOperation(
            method, wfPath, workflowQueryParams(req.getQueryParams()), body);
    if operation is () {
        return workflowErrorResponse(404, "Unknown workflow operation: " + string:'join("/", ...wfPath));
    }

    // Narrow listings to this component's task queue. Temporal's visibility API is scoped to
    // a namespace, so a listing asked of this component's runtime otherwise answers with
    // every instance in the namespace — every other integration deployed beside it included,
    // which is both wrong and a disclosure. Applied here rather than at delivery so the
    // filter is part of the question: the cache key covers it, and the request stored for the
    // heartbeat to deliver is exactly what was asked.
    map<json> operationParams = withTaskQueueScope(operation[0], operation[1], tunnelTarget.taskQueue);

    // Nothing is held open from here on. A read is answered from the cache, or accepted with
    // 202 while a runtime materializes it; a mutation is queued and answered with the id the
    // console polls. Whichever ICP node receives the runtime's next heartbeat delivers the
    // work — usually not this one.
    if method == http:GET {
        return serveWorkflowRead(componentId, environmentId, operation[0], operationParams,
                escapedRoles, forceRefresh);
    }
    return acceptWorkflowMutation(req, componentId, environmentId, operation[0], operationParams,
            userContext.userId, escapedRoles);
}

@http:ServiceConfig {
    auth: [
        {
            jwtValidatorConfig: {
                issuer: frontendJwtIssuer,
                audience: frontendJwtAudience,
                signatureConfig: {
                    secret: resolvedFrontendJwtHMACSecret
                }
            }
        }
    ],
    cors: {
        allowOrigins: normalizedCorsAllowedOrigins,
        allowHeaders: ["Content-Type", "Authorization"]
    }
}
service /icp/workflow on httpListener {

    function init() {
        log:printInfo("Workflow management service started at " + serverHost + ":" + serverPort.toString());
    }

    // {componentId}/{environmentId} pin the target scope; the remaining segments and
    // query map to the tunneled management operation. Explicit get/post accessors
    // (not 'default) so CORS preflight OPTIONS is auto-handled by the listener and not
    // subjected to service auth. The workflow management API only uses GET and POST.
    resource function get [string componentId]/[string environmentId]/[string... wfPath](http:Caller caller, http:Request req) returns error? {
        check caller->respond(handleWorkflowRequest(componentId, environmentId, wfPath, req));
    }

    resource function post [string componentId]/[string environmentId]/[string... wfPath](http:Caller caller, http:Request req) returns error? {
        check caller->respond(handleWorkflowRequest(componentId, environmentId, wfPath, req));
    }
}
