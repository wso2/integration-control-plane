// Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com)
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

import ballerina/http;
import ballerina/log;
import ballerina/uuid;

// ── The one way the ICP asks an MI runtime anything ──────────────────────────
// Every MI management field ends here. Above this line nothing knows whether the answer
// came back through the runtime's management port or rode up on a heartbeat; below it,
// `miTunnelEnabled` is the only thing that decides.
//
// The caller's side of the difference is timing, and only that: the port answers inside the
// request, while the tunnel must wait for a heartbeat and so reports `preparing` first. That
// is what `types:Fetchable` carries to the console.

// How long a caller should wait before asking again for an answer that is not ready. One
// heartbeat of a boosted runtime, plus room for the result to be posted back.
const int MI_RETRY_AFTER_MS = 750;

// The same, for an answer that is on screen but being replaced. Slower, because the caller
// has something true to look at meanwhile — and because a runtime that has gone away leaves
// its last answer stale until it is swept, so this is a cadence we may pay for a while.
const int MI_STALE_RETRY_MS = 3000;

const string MI_OFFLINE_MESSAGE = "The runtime is not online";

# Says which way this deployment reaches MI, once, at startup.
#
# The QA procedure's first check, and it earns its place: the flag is a TOML key that is
# easy to put in the wrong table, and without this line the symptom of getting it wrong is a
# console that behaves plausibly while exercising the other path entirely.
isolated function logMIAccessMode() {
    log:printInfo(miTunnelEnabled
        ? "MI management reaches runtimes over the heartbeat tunnel (miTunnelEnabled = true)"
        : "MI management dials runtime management ports directly " +
            "(tunnel disabled — set miTunnelEnabled to use it)");
}

# A management answer, or the news that the runtime has not given one yet.
#
# `body` is the management API's own JSON, except where it answered in plain text — a log
# file, a stack trace, an artifact's XML — which travels as a JSON string on both paths and
# is unwrapped by `miText`. That rule lives here once so it cannot be re-decided per caller.
#
# + stale - The answer is real but already superseded, and its replacement is being fetched.
#           A write stales every read of its runtime, so this is what carries "the level you
#           just set is not in this list yet" to the console. Dropping it left the table
#           showing the old value until the page was reloaded.
# + submitted - This call is what queued the write, rather than one of the polls that follow
#               it. Only the first should do a write's preparatory work.
type MIAnswer record {|
    json body = ();
    boolean preparing = false;
    boolean stale = false;
    boolean submitted = false;
|};

# What a field reports while the runtime has not answered it.
isolated function stillFetching() returns types:Fetchable =>
    {preparing: true, retryAfterMs: MI_RETRY_AFTER_MS};

# What a field reports about an answer it is about to return: settled, or still being
# replaced. Spread into every ready response, so no screen presents a superseded answer as
# current.
isolated function fetchableOf(MIAnswer answer) returns types:Fetchable =>
    answer.stale ? {stale: true, retryAfterMs: MI_STALE_RETRY_MS} : {};

# Reads a runtime's management API.
isolated function miRead(types:Runtime runtime, string path) returns MIAnswer|error {
    if !miTunnelEnabled {
        [int, json] [status, body] = check callMIManagement(runtime, http:GET, path, ());
        return {body: check accepted(status, body)};
    }
    TunneledReadOutcome outcome = check ensureMIRead(runtime, path);
    match outcome.state {
        "READY" => {
            return {body: check accepted(outcome.httpStatus, outcome.body), stale: outcome.stale};
        }
        "NO_RUNTIME" => {
            return error(MI_OFFLINE_MESSAGE);
        }
        "FAILED" => {
            return error(miRefusal(outcome.httpStatus, outcome.body));
        }
    }
    return {preparing: true};
}

# Writes to a runtime's management API, and reports the outcome once the runtime confirms it.
#
# With the tunnel off the runtime confirms it in this call. With it on the write is queued
# under `requestId` and the caller is told to ask again — asking again *is* the poll, so the
# console re-sends the same mutation rather than learning a second vocabulary. A caller that
# supplies no `requestId` still gets its write executed; it just cannot learn the outcome,
# because there is no name under which to ask for it.
isolated function miWrite(types:Runtime runtime, string method, string path, json body,
        types:UserContextV2 caller, string? requestId) returns MIAnswer|error {
    if !miTunnelEnabled {
        [int, json] [status, answer] = check callMIManagement(runtime, method, path, body);
        json confirmed = check accepted(status, answer);
        // Audited here, where the runtime has confirmed it, so the record reads the same as
        // the one a tunneled write leaves when its outcome comes back.
        auditMIWrite(runtime.runtimeId, method, path, body, caller.userId, caller.clientIp);
        return {body: confirmed, submitted: true};
    }
    if !miTargetAvailable(runtime) {
        return error(MI_OFFLINE_MESSAGE);
    }
    if requestId is () {
        log:printWarn("An MI management write was queued without a requestId; its outcome " +
                "cannot be reported back", runtimeId = runtime.runtimeId, path = path);
    } else if requestId.length() > MI_MAX_REQUEST_ID_LENGTH {
        return error(string `requestId must be at most ${MI_MAX_REQUEST_ID_LENGTH} characters`);
    }
    string operationId = miOperationId(runtime.runtimeId, requestId ?: uuid:createType4AsString());
    types:CacheOperation? queued = check storage:getCacheOperation(operationId);
    if queued is () {
        boolean created = check enqueueMIMutation(runtime, method, path, body, caller, operationId);
        return {preparing: true, submitted: created};
    }
    if operationGaveUp(queued, nowUnixSeconds()) {
        return error("The runtime did not confirm this operation. Check its state before " +
                "retrying — the change may or may not have been applied.");
    }
    if queued.status == types:CACHE_OP_PENDING || queued.status == types:CACHE_OP_DELIVERED {
        return {preparing: true};
    }
    [int, json] [status, answered] = check confirmedOutcome(queued);
    return {body: check accepted(status, answered)};
}

# Whether a queued write is past hope: the sweep has said so, or it is still unanswered with
# its deadline gone.
#
# The deadline on the row is read directly rather than waiting for the sweep to mark it.
# The sweep runs every few minutes, so a caller polling a write that died at two minutes
# would otherwise be told "still waiting" until the sweep caught up — and the console,
# which cannot wait that long, would give up on its own clock and report something the
# server never said.
#
# Only an unanswered write dies, which is the same rule the sweep applies (it expires rows
# `WHERE deadline < now AND status IN (PENDING, DELIVERED)`). Once the runtime has answered,
# the answer is the truth for as long as the row survives: a write confirmed at two seconds
# and polled at two minutes must report what happened, not that nothing did. A refusal
# counts as an answer — `FAILED` carries MI's own words, and the caller is owed them.
isolated function operationGaveUp(types:CacheOperation row, int now) returns boolean {
    if row.status == types:CACHE_OP_EXPIRED {
        return true;
    }
    boolean unanswered =
        row.status == types:CACHE_OP_PENDING || row.status == types:CACHE_OP_DELIVERED;
    return unanswered && row.deadline <= now;
}

# What the runtime said about a write it has finished, as `[status, body]`.
isolated function confirmedOutcome(types:CacheOperation row) returns [int, json]|error {
    json outcome = check (row.result ?: "{}").fromJsonString();
    if outcome !is map<json> {
        return error("The runtime's answer to this operation could not be read");
    }
    json status = outcome["httpStatus"];
    return [status is int ? status : 500, outcome["body"]];
}

# The body of a 2xx answer; anything else is the runtime's refusal, in its own words.
isolated function accepted(int status, json body) returns json|error {
    if status >= 200 && status < 300 {
        return body;
    }
    return error(miRefusal(status, body));
}

# The management API's own wording for a refusal, so the console renders MI's message and
# not ours. `Error` is what MI names it; `message` is what its newer endpoints do.
isolated function miRefusal(int status, json body) returns string {
    if body is map<json> {
        foreach string wording in ["Error", "message"] {
            json? said = body[wording];
            if said is string && said.trim().length() > 0 {
                return said;
            }
        }
    }
    if body is string && body.trim().length() > 0 {
        return body;
    }
    return string `The runtime's management API returned status ${status}`;
}

# A management answer that is plain text.
#
# Both paths deliver such a body as a JSON string — the agent wraps it, `relayedBody` leaves
# it — so unwrapping it is one rule, applied here. Writing the quoted form to a viewer is
# what made a registry file open as an escaped blob.
isolated function miText(json body) returns string => body is string ? body : body.toJsonString();

# One management call, from this process to the runtime's management port.
#
# The HMAC token is issued per call and per runtime: it is the same credential the artifact
# fetcher has always used, so a runtime that trusted the ICP before trusts it still.
isolated function callMIManagement(types:Runtime runtime, string method, string path, json body)
        returns [int, json]|error {
    if runtime.status != types:RUNNING {
        return error(MI_OFFLINE_MESSAGE);
    }
    string baseUrl = check storage:buildManagementBaseUrl(runtime.managementHostname,
            runtime.managementPort);
    http:Client mgmtClient = check (artifactsApiAllowInsecureTLS
        ? new (baseUrl, {secureSocket: {enable: false}})
        : new (baseUrl));
    map<string> headers = {
        "Authorization": "Bearer " + check storage:issueRuntimeHmacToken(runtime.runtimeId),
        "Accept": "application/json"
    };

    http:Response response;
    if method == http:GET {
        response = check mgmtClient->get(path, headers);
    } else if method == http:POST {
        response = check mgmtClient->post(path, body, headers);
    } else if method == http:PATCH {
        response = check mgmtClient->patch(path, body, headers);
    } else if method == http:DELETE {
        response = check mgmtClient->delete(path, body, headers);
    } else {
        return error("Unsupported management method: " + method);
    }
    return [response.statusCode, check relayedBody(response)];
}

# The runtime's answer as the rest of the ICP must receive it.
#
# The runtime's own content type decides, which is the rule the agent follows, so a log file
# or a registry resource reaches the console as its bytes either way. Guessing by parse
# attempt instead would reformat any text that happens to be JSON.
isolated function relayedBody(http:Response response) returns json|error {
    string text = check response.getTextPayload();
    if !response.getContentType().toLowerAscii().includes("json") {
        return text;
    }
    if text.trim().length() == 0 {
        return ();
    }
    json|error parsed = text.fromJsonString();
    return parsed is json ? parsed : text;
}
