// Copyright (c) 2025, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
//
// WSO2 Inc. licenses this file to you under the Apache License,
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

import icp_server.storage as storage;
import icp_server.sync;
import icp_server.types as types;

import ballerina/http;
import ballerina/jwt;
import ballerina/log;

// HTTP service configuration
listener http:Listener httpListener = new (serverPort,
    config = {
        host: serverHost,
        httpVersion: http:HTTP_1_1,
        secureSocket: sslEnabled ? {
            key: {
                path: keystorePath,
                password: resolvedKeystorePassword
            },
            ciphers: tlsCiphers
        } : ()
    }
);

// HTTP service configuration
listener http:Listener runtimeListener = new (runtimeListenerPort,
    config = {
        host: serverHost,
        secureSocket: sslEnabled ? {
            key: {
                path: keystorePath,
                password: resolvedKeystorePassword
            },
            ciphers: tlsCiphers
        } : ()
    }
);

// Runtime management service
// No @http:ServiceConfig auth block — each request is validated via kid-based
// JWT lookup (extractKidFromJwt → lookupOrgSecretByKeyId → validateRuntimeJwtWithSecret).
service /icp on runtimeListener {

    function init() {
        log:printInfo("Runtime service started at " + serverHost + ":" + runtimeListenerPort.toString());
    }

    // Process heartbeat from runtime (M2: kid-based JWT validation + lazy binding)
    isolated resource function post heartbeat(http:Request request, @http:Payload json heartbeatJson)
            returns types:HeartbeatResponse|http:Unauthorized|http:BadRequest|http:Conflict|error? {
        do {
            types:Heartbeat heartbeat = check heartbeatJson.cloneWithType(types:Heartbeat);

            // Validate heartbeat protocol and runtime fields BEFORE any DB operations
            error? validationErr = storage:validateHeartbeatProtocolAndRuntime(heartbeat);
            if validationErr is error {
                log:printWarn(string `Heartbeat rejected — validation failed: ${validationErr.message()}`);
                return <http:BadRequest>{body: {message: string `Invalid heartbeat: ${validationErr.message()}`}};
            }

            string runtimeId = heartbeat.runtimeId;

            // --- Extract kid and validate JWT ---
            string|error jwtToken = extractBearerToken(request);
            if jwtToken is error {
                log:printWarn(string `Heartbeat rejected — missing bearer token for runtime: ${runtimeId}`);
                return <http:Unauthorized>{body: {message: "Missing or malformed Authorization header"}};
            }

            string|error kidResult = extractKidFromJwt(jwtToken);
            if kidResult is error {
                log:printWarn(string `Heartbeat rejected — bad JWT kid for runtime: ${runtimeId}: ${kidResult.message()}`);
                return <http:Unauthorized>{body: {message: string `Invalid JWT: ${kidResult.message()}`}};
            }
            string kid = kidResult;
            log:printDebug(string `Heartbeat from runtime=${runtimeId}, kid=${kid}`);

            types:OrgSecret|error orgSecretResult = storage:lookupOrgSecretByKeyId(kid);
            if orgSecretResult is error {
                log:printWarn(string `Heartbeat rejected — unknown kid=${kid} for runtime: ${runtimeId}`);
                return <http:BadRequest>{body: {message: string `Unknown key ID '${kid}'`}};
            }
            types:OrgSecret orgSecret = orgSecretResult;
            http:Unauthorized? authResult = validateRuntimeJwtWithSecret(jwtToken, orgSecret.keyMaterial);
            if authResult is http:Unauthorized {
                log:printWarn(string `Heartbeat rejected — invalid JWT for runtime: ${runtimeId}, kid=${kid}`);
                return authResult;
            }

            // --- Resolve environment and verify it matches the key's environment ---
            string environmentId = check storage:getEnvironmentIdByHandler(heartbeat.environment);
            if environmentId != orgSecret.environmentId {
                log:printWarn(string `Heartbeat rejected — environment mismatch for kid=${kid}: heartbeat=${environmentId}, key=${orgSecret.environmentId}`);
                return <http:Conflict>{body: {message: string `Environment mismatch: key ID '${kid}' is bound to a different environment`}};
            }

            string projectId;
            string componentId;

            if orgSecret.componentId is () {
                string? createdBy = orgSecret.createdBy;
                if createdBy is () {
                    log:printWarn(string `kid=${kid}: original creator deleted, auto-provisioning without owner`);
                }

                string|error projectHandler = storage:toHandler(heartbeat.project);
                if projectHandler is error {
                    log:printWarn(string `Heartbeat rejected — invalid project name '${heartbeat.project}': ${projectHandler.message()}`);
                    return <http:BadRequest>{body: {message: string `Invalid project name '${heartbeat.project}': ${projectHandler.message()}`}};
                }

                string|error componentHandler = storage:toHandler(heartbeat.component);
                if componentHandler is error {
                    log:printWarn(string `Heartbeat rejected — invalid component name '${heartbeat.component}': ${componentHandler.message()}`);
                    return <http:BadRequest>{body: {message: string `Invalid component name '${heartbeat.component}': ${componentHandler.message()}`}};
                }

                projectId = check storage:resolveOrCreateProject(projectHandler, createdBy);
                componentId = check storage:resolveOrCreateComponent(projectId, componentHandler, heartbeat.runtimeType, createdBy);
                check storage:bindOrgSecret(kid, projectId, componentId, projectHandler, componentHandler, heartbeat.runtimeType);
                log:printInfo(string `Bound kid=${kid} to project=${projectId} (handler=${projectHandler}), component=${componentId} (handler=${componentHandler}), runtimeType=${heartbeat.runtimeType}`);
            } else {
                if orgSecret.runtimeType is string && orgSecret.runtimeType != heartbeat.runtimeType {
                    log:printWarn(string `Heartbeat rejected — runtime type mismatch for kid=${kid}: bound=${orgSecret.runtimeType ?: "?"}, got=${heartbeat.runtimeType}`);
                    return <http:Conflict>{body: {message: string `Runtime type mismatch: key ID '${kid}' is bound to ${orgSecret.runtimeType ?: "?"}, not ${heartbeat.runtimeType}`}};
                }

                projectId = <string>orgSecret.projectId;
                componentId = <string>orgSecret.componentId;

                string|error normalizedProject = storage:toHandler(heartbeat.project);
                string|error normalizedComponent = storage:toHandler(heartbeat.component);

                boolean projectMismatch = normalizedProject is string && orgSecret.projectHandler != normalizedProject;
                boolean componentMismatch = normalizedComponent is string && orgSecret.componentName != normalizedComponent;

                if projectMismatch || componentMismatch {
                    log:printError(string `Binding name mismatch for kid=${kid}: ` +
                            string `bound project=${orgSecret.projectHandler ?: "?"}/component=${orgSecret.componentName ?: "?"}, ` +
                            string `got project=${heartbeat.project} (normalized: ${normalizedProject is string ? normalizedProject : "invalid"})/` +
                            string `component=${heartbeat.component} (normalized: ${normalizedComponent is string ? normalizedComponent : "invalid"}). ` +
                            string `Proceeding with bound IDs project=${projectId}, component=${componentId}`);
                }
            }

            // --- Prepare heartbeat fields as UUIDs for downstream processing ---
            heartbeat.environment = environmentId;
            heartbeat.project = projectId;
            heartbeat.component = componentId;

            types:HeartbeatResponse heartbeatResponse = check storage:processHeartbeat(heartbeat, preResolved = true);

            // Record this key ID on the runtime row (after upsert ensures the row exists).
            // Failure here is non-fatal — the heartbeat was already processed successfully.
            error? keyIdErr = storage:updateRuntimeKeyId(runtimeId, kid);
            if keyIdErr is error {
                log:printError(string `Failed to record keyId=${kid} on runtime=${runtimeId}`, 'error = keyIdErr);
            }

            // Reconcile desired state against observed state written during heartbeat processing
            types:ControlCommand[] reconcileCommands = sync:reconcileFromHeartbeat(
                    runtimeId, heartbeat.component, heartbeat.environment, heartbeat.runtimeType
            );
            log:printDebug(string `Reconciled ${reconcileCommands.length()} commands for runtime ${runtimeId}`);
            // Merge reconcile commands into the response
            types:ControlCommand[]? existing = heartbeatResponse.commands;
            if existing is types:ControlCommand[] {
                foreach types:ControlCommand cmd in reconcileCommands {
                    existing.push(cmd);
                }
            } else {
                heartbeatResponse.commands = reconcileCommands;
            }

            deliverTunneledCommands(runtimeId, heartbeatResponse);

            log:printDebug(string `Heartbeat processed for runtime=${runtimeId}, kid=${kid}`);
            return heartbeatResponse;

        } on fail error e {
            log:printError("Failed to process heartbeat", e);
            return <types:HeartbeatResponse>{
                acknowledged: false,
                commands: [],
                errors: [e.message()]
            };
        }
    }

    // Process delta heartbeat from runtime (M3: kid-based JWT validation)
    isolated resource function post deltaHeartbeat(http:Request request, @http:Payload types:DeltaHeartbeat deltaHeartbeat)
            returns types:HeartbeatResponse|http:Unauthorized|http:BadRequest|http:Conflict|error? {
        do {
            string runtimeId = deltaHeartbeat.runtimeId;

            string|error jwtToken = extractBearerToken(request);
            if jwtToken is error {
                log:printWarn(string `Delta heartbeat rejected — missing bearer token for runtime: ${runtimeId}`);
                return <http:Unauthorized>{body: {acknowledged: false, 'error: true, message: "Missing or malformed Authorization header"}};
            }

            string|error kidResult = extractKidFromJwt(jwtToken);
            if kidResult is error {
                log:printWarn(string `Delta heartbeat rejected — bad JWT kid for runtime: ${runtimeId}: ${kidResult.message()}`);
                return <http:Unauthorized>{body: {acknowledged: false, 'error: true, message: string `Invalid JWT: ${kidResult.message()}`}};
            }
            string kid = kidResult;
            log:printDebug(string `Delta heartbeat from runtime=${runtimeId}, kid=${kid}`);

            types:OrgSecret|error orgSecretResult = storage:lookupOrgSecretByKeyId(kid);
            if orgSecretResult is error {
                log:printWarn(string `Delta heartbeat rejected — unknown kid=${kid} for runtime: ${runtimeId}`);
                return <http:BadRequest>{body: {acknowledged: false, 'error: true, message: string `Unknown key ID '${kid}'`}};
            }
            types:OrgSecret orgSecret = orgSecretResult;
            http:Unauthorized? authResult = validateRuntimeJwtWithSecret(jwtToken, orgSecret.keyMaterial);
            if authResult is http:Unauthorized {
                log:printWarn(string `Delta heartbeat rejected — invalid JWT for runtime: ${runtimeId}, kid=${kid}`);
                return authResult;
            }

            // Unbound key — delta has no component/environment info to bind with
            if orgSecret.componentId is () {
                log:printDebug(string `Delta heartbeat: kid=${kid} is unbound, requesting full heartbeat from runtime=${runtimeId}`);
                return <types:HeartbeatResponse>{acknowledged: false, fullHeartbeatRequired: true, commands: []};
            }

            types:HeartbeatResponse heartbeatResponse = check storage:processDeltaHeartbeat(deltaHeartbeat);

            // If not requesting full heartbeat, reconcile from desired state
            if !(heartbeatResponse.fullHeartbeatRequired ?: false) {
                types:ControlCommand[] reconcileCommands = sync:reconcileDelta(runtimeId);
                log:printDebug(string `Delta reconciliation generated ${reconcileCommands.length()} commands for runtime ${runtimeId}`);
                types:ControlCommand[]? existing = heartbeatResponse.commands;
                if existing is types:ControlCommand[] {
                    foreach types:ControlCommand cmd in reconcileCommands {
                        existing.push(cmd);
                    }
                } else {
                    heartbeatResponse.commands = reconcileCommands;
                }
            }

            deliverTunneledCommands(runtimeId, heartbeatResponse);

            log:printDebug(string `Delta heartbeat processed for runtime=${runtimeId}, kid=${kid}`);
            return heartbeatResponse;

        } on fail error e {
            log:printError("Failed to process delta heartbeat", 'error = e);
            return <types:HeartbeatResponse>{acknowledged: false, fullHeartbeatRequired: true, commands: []};
        }
    }

    // Receives the result of a tunneled workflow management command from a runtime's
    // bridge (see workflow_tunnel.bal). Same kid-based JWT validation as heartbeats.
    // Always 202 for authenticated posts — a late result (its waiter already timed
    // out) is a normal no-op, not an error the bridge should retry.
    isolated resource function post commandResult(http:Request request, @http:Payload json resultJson)
            returns http:Accepted|http:Unauthorized|http:BadRequest {
        string|error jwtToken = extractBearerToken(request);
        if jwtToken is error {
            return <http:Unauthorized>{body: {message: "Missing or malformed Authorization header"}};
        }
        string|error kid = extractKidFromJwt(jwtToken);
        if kid is error {
            return <http:Unauthorized>{body: {message: string `Invalid JWT: ${kid.message()}`}};
        }
        types:OrgSecret|error orgSecret = storage:lookupOrgSecretByKeyId(kid);
        if orgSecret is error {
            return <http:BadRequest>{body: {message: string `Unknown key ID '${kid}'`}};
        }
        http:Unauthorized? authResult = validateRuntimeJwtWithSecret(jwtToken, orgSecret.keyMaterial);
        if authResult is http:Unauthorized {
            return authResult;
        }

        types:WorkflowCommandResult|error result = resultJson.cloneWithType();
        if result is error {
            return <http:BadRequest>{body: {message: string `Invalid command result: ${result.message()}`}};
        }
        // The kid proves org membership scoped to a component+environment; nothing in the
        // JWT names one runtime instance. Tie the posted result to the key its runtime
        // authenticates heartbeats with, so a key bound elsewhere cannot answer for it
        // even knowing the commandId. Replicas sharing the key stay indistinguishable —
        // that is the shared-secret trust boundary. Fail closed: an unreadable or absent
        // binding drops the result rather than accepting an unverifiable one.
        string?|error boundKeyId = storage:getRuntimeKeyId(result.runtimeId);
        if boundKeyId is error {
            log:printError(string `Failed to load the key binding for runtime ${result.runtimeId}; dropping its command result`,
                    'error = boundKeyId);
            return <http:Accepted>{body: {accepted: true}};
        }
        if boundKeyId != kid {
            log:printWarn(string `Dropping a workflow command result posted with a key not bound to its runtime`,
                    commandId = result.commandId, runtimeId = result.runtimeId, kid = kid);
            return <http:Accepted>{body: {accepted: true}};
        }
        boolean delivered = recordTunneledCommandResult(result);
        if !delivered {
            log:printDebug(string `Dropped late/unknown workflow command result: ${result.commandId}`);
        }
        return <http:Accepted>{body: {accepted: true}};
    }

}

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------

isolated function extractBearerToken(http:Request request) returns string|error {
    string authHeader = check request.getHeader("Authorization");
    if !authHeader.startsWith("Bearer ") {
        return error("Malformed Authorization header");
    }
    return authHeader.substring(7);
}

isolated function extractKidFromJwt(string jwtToken) returns string|error {
    [jwt:Header, jwt:Payload]|jwt:Error decoded = jwt:decode(jwtToken);
    if decoded is jwt:Error {
        log:printDebug(string `JWT decode failed: ${decoded.message()}`);
        return error("Malformed JWT — cannot decode header", decoded);
    }
    jwt:Header jwtHeader = decoded[0];
    string? kid = jwtHeader.kid;
    if kid is () {
        return error("JWT header missing 'kid' claim");
    }
    log:printDebug(string `Extracted kid=${kid} from JWT header`);
    return kid;
}

isolated function validateRuntimeJwtWithSecret(string jwtToken, string hmacSecret) returns http:Unauthorized? {
    jwt:ValidatorConfig validatorConfig = {
        issuer: jwtIssuer,
        audience: jwtAudience,
        clockSkew: jwtClockSkewSeconds,
        signatureConfig: {secret: hmacSecret}
    };

    jwt:Payload|jwt:Error validatedPayload = jwt:validate(jwtToken, validatorConfig);
    if validatedPayload is jwt:Error {
        log:printDebug(string `JWT validation failed: ${validatedPayload.message()}`);
        return <http:Unauthorized>{body: {acknowledged: false, 'error: true, message: "Invalid or expired token"}};
    }

    anydata scope = validatedPayload["scope"];
    if !(scope is string && scope == "runtime_agent") {
        return <http:Unauthorized>{body: {acknowledged: false, 'error: true, message: "Insufficient scope — 'runtime_agent' required"}};
    }

    return ();
}
