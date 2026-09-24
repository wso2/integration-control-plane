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
import ballerina/log;
import ballerina/url;

// ============================================================================
// MI MANAGEMENT OVER THE HEARTBEAT COMMAND TUNNEL
// ============================================================================
// The MI management API reached without any network path *into* the runtime. A request is
// queued, delivered inside the runtime's next heartbeat response as an MI_MGMT command,
// executed by the MI agent against its own loopback management API, and its result posted
// back on POST /icp/commandResult — the same round trip the BI bridge already makes for
// workflow commands, with the same wire shape.
//
// This exists because MI behind a load balancer is reachable only outbound: the LB fronts
// the runtime's service traffic, nothing routes back to a particular replica's management
// port, and `runtimes.runtime_hostname` names an address the ICP cannot dial.
//
// **The command carries a method and a path, not an operation name.** The management API is
// the vocabulary — 27 distinct calls today — and enumerating each one on both sides would
// be a second vocabulary to keep in step for no gain. Every path is built by the ICP from
// typed arguments (see the mi_management module), never relayed from a caller, and the
// agent confines it to `/management/**` again before executing.

const string CACHE_KIND_MI_READ = "mi.read";
const string CACHE_KIND_MI_OPERATION = "mi.operation";

const string MI_READ_COMMAND_PREFIX = "mir-";
const string MI_OPERATION_COMMAND_PREFIX = "mio-";

// `operation_id` is VARCHAR(100) and holds "mio-" + requestId + "." + a 36-character runtime
// id, so anything longer turns a caller's input into a SQL "value too long" and a 500.
const int MI_MAX_REQUEST_ID_LENGTH = 59;

// One TTL, because the management API answers no question whose volatility is worth
// modelling separately: an artifact list, a logger set and a log file are all cheap to
// re-ask and all wrong to hold for long. Short enough that a change made outside the
// console shows up within a view refresh; long enough that a user paging through artifacts
// is served from the cache.
const int MI_READ_TTL_SECONDS = 15;

# How long past its expiry a management answer may still be served — and so how long the
# sweep keeps it (see `tunnelRetentionByKind`).
#
# Two minutes, against the tunnel's default of thirty. A workflow list earns a long window
# because it is small and an old one still tells the operator something while the runtime is
# away. A management answer earns the opposite: a log file is megabytes and nobody reads the
# same one twice, and an artifact's detail panel is worth nothing once its runtime is gone.
# The window is what the sweep honours, so this is the setting that bounds what MI costs to
# cache — measured at 41 KB for one lab log file, and a rotation-sized file in production.
const int MI_STALE_SERVE_SECONDS = 120;

// How far out an entry may expire and still be staled by a write. Unlike the workflow
// tunnel, which uses this horizon to spare immutable rows (a closed instance's history),
// nothing here is immutable — so this only has to sit clear of MI_READ_TTL_SECONDS. An
// entry written moments ago expires at exactly now + TTL, and the sweep's comparison is
// strict, so equal is not enough.
const int MI_INVALIDATE_HORIZON_SECONDS = 3600;

// How long a management mutation stays deliverable. Far shorter than the workflow deadline:
// a workflow decision is a human's judgement worth preserving across a restart, whereas
// re-issuing "set this logger to DEBUG" costs a click.
const int MI_OPERATION_DEADLINE_SECONDS = 120;

# The owner every MI read is claimed under: the runtime itself, never its component.
#
# A workflow read may be answered by any runtime of the component. An MI read may not.
# `/management/logs` lists the files on one node, node memory describes one JVM, and a
# fault stack trace belongs to the replica that faulted — behind a load balancer there are
# several replicas and a sibling's answer would be wrong rather than merely stale.
isolated function miReadOwner(string runtimeId) returns string => "mi:" + runtimeId;

# Identity of one management question.
#
# Deliberately free of the caller's roles, unlike the workflow key. The agent authenticates
# to its own management API as one service identity, so the answer is the same whoever
# asked; access is decided by the ICP's own permission check before we get here.
isolated function miCacheKey(string runtimeId, string method, string path) returns string =>
    crypto:hashSha256((runtimeId + "|" + method + "|" + path).toBytes()).toBase16();

# What the agent is asked to execute. `tunneledCommand` delivers `operation`, `params` and
# `identity`; `clientIp` sits beside them so the audit record written when the outcome
# returns — possibly on another node — has it, without the runtime being told. The workflow
# tunnel keeps `actorId` the same way.
isolated function miRequestDocument(string method, string path, json body, string userId,
        string? clientIp = ()) returns string =>
    {
        operation: "management",
        params: {method: method, path: path, body: body},
        identity: {userId: userId, roles: []},
        clientIp: clientIp
    }.toJsonString();

# Whether a runtime can be asked at all: RUNNING, and MI.
#
# There is no capability check. An MI that predates the agent's command loop ignores the
# `commands` array in its heartbeat response — it reads only `acknowledged` and
# `fullHeartbeatRequired` — so an old runtime does not fail, it simply never answers, and
# the read reports a failure after its deadline. `miTunnelEnabled` is the operator's switch
# for that, off by default.
isolated function miTargetAvailable(types:Runtime runtime) returns boolean =>
    miTunnelEnabled && runtime.status == types:RUNNING && runtime.runtimeType == types:MI;

# Serves a management read: the generic tunnel with this feature's owner, kind and key.
isolated function ensureMIRead(types:Runtime runtime, string path, boolean forceRefresh = false)
        returns TunneledReadOutcome|error =>
    ensureTunneledRead({
        cacheKey: miCacheKey(runtime.runtimeId, "GET", path),
        kind: CACHE_KIND_MI_READ,
        owner: miReadOwner(runtime.runtimeId),
        componentId: runtime.component.id,
        environmentId: runtime.environment.id,
        request: miRequestDocument("GET", path, (), ""),
        staleServeSeconds: MI_STALE_SERVE_SECONDS
    }, miTargetAvailable(runtime), forceRefresh);

# The name one submission is queued under, per runtime it is addressed to.
#
# The caller's `requestId` is half of it, so re-sending a mutation the runtime has not
# confirmed polls the queued write instead of issuing a second one. The runtime id is the
# other half because one submission may address several replicas, and each executes its own.
isolated function miOperationId(string runtimeId, string requestId) returns string =>
    MI_OPERATION_COMMAND_PREFIX + requestId + "." + runtimeId;

# Queues a management mutation for the next heartbeat to carry.
#
# There is no cross-user collision rule as there is for workflow decisions: two operators
# both setting a log level is two legitimate writes, and the last one wins at the runtime
# exactly as it would over a direct call.
#
# + return - `false` when this exact submission was already queued
isolated function enqueueMIMutation(types:Runtime runtime, string method, string path,
        json body, types:UserContextV2 caller, string operationId) returns boolean|error {
    int now = nowUnixSeconds();
    check boostTunnelScope(runtime.component.id, runtime.environment.id, now);
    return storage:enqueueCacheOperation({
        operationId: operationId,
        target: runtime.runtimeId,
        kind: CACHE_KIND_MI_OPERATION,
        owner: miReadOwner(runtime.runtimeId),
        status: types:CACHE_OP_PENDING,
        issuedAt: now,
        deadline: now + MI_OPERATION_DEADLINE_SECONDS,
        data: miRequestDocument(method, path, body, caller.userId, caller.clientIp)
    });
}

# Routes a result whose command id is not a workflow one. Called from
# `recordTunneledCommandResult`, which owns the prefix table.
isolated function recordMICommandResult(types:WorkflowCommandResult result, int now)
        returns boolean {
    string commandId = result.commandId;
    if commandId.startsWith(MI_READ_COMMAND_PREFIX) {
        [string, string]? parts = splitReadCommandId(MI_READ_COMMAND_PREFIX, commandId);
        if parts is () {
            log:printWarn("Ignoring an MI read result with a malformed command id",
                    commandId = commandId);
            return false;
        }
        return recordTunneledReadResult(parts[0], parts[1], result, now, miReadTtl,
                TUNNEL_FAILED_READ_TTL_SECONDS);
    }
    if commandId.startsWith(MI_OPERATION_COMMAND_PREFIX) {
        return recordMIOperationResult(commandId, result);
    }
    log:printWarn("Ignoring a result with an unrecognised command id",
            commandId = commandId, runtimeId = result.runtimeId);
    return false;
}

// One TTL for every management answer; nothing about what was asked changes it.
isolated function miReadTtl(json request, json body, string runtimeId) returns int =>
    MI_READ_TTL_SECONDS;

# What a management write was, for the audit trail.
#
# The tunnel carries a method and a path and no notion of what they mean, so the meaning is
# recovered here rather than taken from the caller — an audit record the console could shape
# is not an audit record. The four kinds below are the writes the console can issue; anything
# else is still recorded, under a name that says only what was asked.
#
# + body - The request body, because what a write names is not always in its path: a logger
#          is created by `PATCH /management/logging` with the name in the payload, and an
#          audit record that says only "a log level changed" is not worth keeping
# + return - `[action, resourceType, resourceId]` for `logAuditEvent`
isolated function miAuditSubject(string method, string path, json body = ())
        returns [string, string, string] {
    string route = method + " " + (path.includes("?") ? path.substring(0, <int>path.indexOf("?")) : path);
    if route.startsWith("POST /management/users") {
        return [storage:AUDIT_MI_USER_CREATE, storage:AUDIT_RESOURCE_USER, bodyField(body, "userId")];
    }
    if route.startsWith("DELETE /management/users") {
        return [storage:AUDIT_MI_USER_DELETE, storage:AUDIT_RESOURCE_USER, lastPathSegment(path)];
    }
    if route.startsWith("PATCH /management/logging") {
        return [storage:AUDIT_LOG_LEVEL_CHANGE, storage:AUDIT_RESOURCE_LOGGER,
            bodyField(body, "loggerName")];
    }
    if route.startsWith("DELETE /management/logging") {
        return [storage:AUDIT_LOGGER_DELETE, storage:AUDIT_RESOURCE_LOGGER,
            queryParamOf(path, "loggerName")];
    }
    return [storage:AUDIT_MI_MANAGEMENT_WRITE, storage:AUDIT_RESOURCE_RUNTIME, ""];
}

# Records one MI management write, whichever way it reached the runtime.
#
# Both transports end here, and only here, so a write is audited exactly once and reads the
# same either way. The alternative had each resolver audit its own write as well: the
# direct path recorded one event, the tunneled path recorded the resolver's and this one,
# and deleting a logger directly was recorded nowhere at all.
#
# + actor - The user who asked for it; `()` only when the queue lost their identity
# + clientIp - Where they asked from; `()` likewise
isolated function auditMIWrite(string runtimeId, string method, string path, json body,
        string? actor, string? clientIp) {
    [string, string, string] [action, resourceType, resourceId] =
        miAuditSubject(method, path, body);
    storage:logAuditEvent(action, userId = actor, resourceType = resourceType,
            resourceId = resourceId == "" ? runtimeId : resourceId,
            details = miWriteDescription(action, resourceId, runtimeId, method, path, body),
            clientIp = clientIp);
}

# What the audit trail says a write did, in the words an operator reads.
isolated function miWriteDescription(string action, string subject, string runtimeId,
        string method, string path, json body) returns string {
    if action == storage:AUDIT_LOG_LEVEL_CHANGE {
        return string `Log level for '${subject}' set to ` +
            string `'${bodyField(body, "loggingLevel")}' on MI runtime ${runtimeId}`;
    }
    if action == storage:AUDIT_LOGGER_DELETE {
        return string `Logger '${subject}' deleted from MI runtime ${runtimeId}`;
    }
    if action == storage:AUDIT_MI_USER_CREATE {
        return string `MI user '${subject}' created on runtime ${runtimeId}`;
    }
    if action == storage:AUDIT_MI_USER_DELETE {
        return string `MI user '${subject}' deleted from runtime ${runtimeId}`;
    }
    return string `MI management write on runtime ${runtimeId}: ${method} ${path}`;
}

isolated function bodyField(json body, string name) returns string {
    if body is map<json> {
        json? value = body[name];
        return value is string ? value : "";
    }
    return "";
}

isolated function queryParamOf(string path, string name) returns string {
    int? queryStart = path.indexOf("?");
    if queryStart is () {
        return "";
    }
    foreach string pair in re `&`.split(path.substring(queryStart + 1)) {
        int? eq = pair.indexOf("=");
        if eq is int && pair.substring(0, eq) == name {
            return urlDecoded(pair.substring(eq + 1));
        }
    }
    return "";
}

isolated function lastPathSegment(string path) returns string {
    string withoutQuery = path.includes("?") ? path.substring(0, <int>path.indexOf("?")) : path;
    int? lastSlash = withoutQuery.lastIndexOf("/");
    return urlDecoded(lastSlash is int ? withoutQuery.substring(lastSlash + 1) : withoutQuery);
}

isolated function urlDecoded(string encoded) returns string {
    string|error decoded = url:decode(encoded, "UTF-8");
    return decoded is string ? decoded : encoded;
}

# Records a management write in the audit trail, on completion rather than on submission.
#
# Submission is not the event worth recording: a queued write may expire without ever
# reaching the runtime, and an audit log that says a user was created when none was is worse
# than one that says nothing. `mi_management_operation_unconfirmed` covers the gap where the
# ICP never learned the outcome.
isolated function auditMIOperation(types:CacheOperation row, types:WorkflowCommandResult result) {
    string method = "";
    string path = "";
    json body = ();
    string? actor = ();
    string? clientIp = ();
    json|error document = row.data.fromJsonString();
    if document is map<json> {
        json? params = document["params"];
        if params is map<json> {
            method = (params["method"] ?: "").toString();
            path = (params["path"] ?: "").toString();
            body = params["body"] ?: ();
        }
        json? identity = document["identity"];
        if identity is map<json> && identity["userId"] is string {
            actor = <string>identity["userId"];
        }
        if document["clientIp"] is string {
            clientIp = <string>document["clientIp"];
        }
    }
    auditMIWrite(row.target, method, path, body, actor, clientIp);
}

// A mutation's outcome, and the reason the view that shows what it changed must not keep
// serving the answer it had. Staling rather than deleting keeps the old answer on screen,
// marked stale, until the refresh lands.
isolated function recordMIOperationResult(string operationId, types:WorkflowCommandResult result)
        returns boolean {
    boolean succeeded = result.httpStatus >= 200 && result.httpStatus < 300;
    // Read before completing: the row carries who asked and what for, and completing it is
    // what makes this call the single one that gets to report the outcome.
    types:CacheOperation?|error row = storage:getCacheOperation(operationId);
    // Only the runtime the write was addressed to may report it. A poster's key proves which
    // runtime it is, never which command it was given, and an operation id is derivable from a
    // requestId and a runtime id the console already shows. Without this, any runtime holding a
    // valid key could answer for another's write: its outcome would be recorded, the target's
    // own answer dropped as late, and the wrong runtime's reads staled. Fail closed: a row that
    // cannot be read cannot be matched.
    if row !is types:CacheOperation || row.target != result.runtimeId {
        log:printWarn("Dropping an MI management outcome from a runtime it was not addressed to",
                operationId = operationId, reportedBy = result.runtimeId);
        return false;
    }
    boolean|error recorded = storage:completeCacheOperation(operationId,
            succeeded ? types:CACHE_OP_COMPLETED : types:CACHE_OP_FAILED,
            {httpStatus: result.httpStatus, body: result.body, runtimeId: result.runtimeId}
                .toJsonString());
    if recorded is error {
        log:printError("Failed to record an MI operation outcome", recorded,
                operationId = operationId);
        return false;
    }
    if recorded && succeeded {
        auditMIOperation(row, result);
        int|error staled = storage:staleCacheOwner(miReadOwner(row.target),
                MI_INVALIDATE_HORIZON_SECONDS);
        if staled is error {
            log:printWarn("Failed to stale an MI runtime's cached reads", staled,
                    runtimeId = row.target);
        }
    }
    return recorded;
}

# An MI management write the runtime never confirmed.
#
# Reported, not swallowed: the ICP genuinely does not know whether it was applied, and a log
# level or a user that may or may not have changed is something an operator should be told
# about rather than left to discover.
isolated function reportExpiredMIOperation(types:CacheOperation row) {
    string request = "";
    json|error document = row.data.fromJsonString();
    if document is map<json> {
        json? params = document["params"];
        if params is map<json> {
            request = (params["method"] ?: "").toString() + " " + (params["path"] ?: "").toString();
        }
    }
    storage:raiseSystemEvent("mi_management_operation_unconfirmed", "ERROR",
            string `An MI management request was never confirmed by the runtime: ${request}. ` +
            string `It may or may not have been applied - check the runtime's state before retrying.`,
            eventSource = row.target,
            metadata = {
                operationId: row.operationId,
                request: request,
                runtimeId: row.target,
                issuedAt: row.issuedAt
            }.toJsonString());
}
