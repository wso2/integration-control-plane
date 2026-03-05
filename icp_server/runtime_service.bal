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
        secureSocket: {
            key: {
                path: keystorePath,
                password: resolvedKeystorePassword
            }
        }
    }
);

// Runtime management service
// No @http:ServiceConfig auth block — each request is validated via kid-based
// JWT lookup (extractKidFromJwt → lookupOrgSecretByKeyId → validateRuntimeJwtWithSecret).
service /icp on httpListener {

    function init() {
        log:printInfo("Runtime service started at " + serverHost + ":" + serverPort.toString());
    }

    // Process heartbeat from runtime (M2: kid-based JWT validation + lazy binding)
    resource function post heartbeat(http:Request request, @http:Payload json heartbeatJson)
            returns types:HeartbeatResponse|http:Unauthorized|http:BadRequest|http:Conflict|error? {
        do {
            types:Heartbeat heartbeat = check heartbeatJson.cloneWithType(types:Heartbeat);

            // --- Extract kid and validate JWT ---
            string|error jwtToken = extractBearerToken(request);
            if jwtToken is error {
                log:printWarn(string `Heartbeat rejected — missing bearer token for runtime: ${heartbeat.runtime}`);
                return <http:Unauthorized>{body: "Missing or malformed Authorization header"};
            }

            string|error kidResult = extractKidFromJwt(jwtToken);
            if kidResult is error {
                log:printWarn(string `Heartbeat rejected — bad JWT kid for runtime: ${heartbeat.runtime}: ${kidResult.message()}`);
                return <http:Unauthorized>{body: string `Invalid JWT: ${kidResult.message()}`};
            }
            string kid = kidResult;
            log:printDebug(string `Heartbeat from runtime=${heartbeat.runtime}, kid=${kid}`);

            types:OrgSecret|error orgSecretResult = storage:lookupOrgSecretByKeyId(kid);
            if orgSecretResult is error {
                log:printWarn(string `Heartbeat rejected — unknown kid=${kid} for runtime: ${heartbeat.runtime}`);
                return <http:BadRequest>{body: string `Unknown key ID '${kid}'`};
            }
            types:OrgSecret orgSecret = orgSecretResult;
            http:Unauthorized? authResult = validateRuntimeJwtWithSecret(jwtToken, orgSecret.keyMaterial);
            if authResult is http:Unauthorized {
                log:printWarn(string `Heartbeat rejected — invalid JWT for runtime: ${heartbeat.runtime}, kid=${kid}`);
                return authResult;
            }

            // --- Resolve environment and verify it matches the key's environment ---
            string environmentId = check storage:getEnvironmentIdByName(heartbeat.environment);
            if environmentId != orgSecret.environmentId {
                log:printWarn(string `Heartbeat rejected — environment mismatch for kid=${kid}: heartbeat=${environmentId}, key=${orgSecret.environmentId}`);
                return <http:Conflict>{body: string `Environment mismatch: key ID '${kid}' is bound to a different environment`};
            }

            // --- Bind or verify project+component ---
            string projectId;
            string componentId;

            if orgSecret.componentId is () {
                // Unbound key — resolve/auto-create project and component, then bind
                string? createdBy = orgSecret.createdBy;
                if createdBy is () {
                    log:printWarn(string `kid=${kid}: original creator deleted, auto-provisioning without owner`);
                }
                projectId = check storage:resolveOrCreateProject(heartbeat.project, createdBy);
                componentId = check storage:resolveOrCreateComponent(projectId, heartbeat.component, heartbeat.runtimeType, createdBy);
                check storage:bindOrgSecret(kid, projectId, componentId, heartbeat.project, heartbeat.component, heartbeat.runtimeType);
                log:printInfo(string `Bound kid=${kid} to project=${projectId}, component=${componentId}, runtimeType=${heartbeat.runtimeType}`);
            } else {
                // Bound key — use stored IDs, enforce runtime type, log-only name mismatch
                if orgSecret.runtimeType is string && orgSecret.runtimeType != heartbeat.runtimeType {
                    log:printWarn(string `Heartbeat rejected — runtime type mismatch for kid=${kid}: bound=${orgSecret.runtimeType ?: "?"}, got=${heartbeat.runtimeType}`);
                    return <http:Conflict>{body: string `Runtime type mismatch: key ID '${kid}' is bound to ${orgSecret.runtimeType ?: "?"}, not ${heartbeat.runtimeType}`};
                }

                projectId = <string>orgSecret.projectId;
                componentId = <string>orgSecret.componentId;

                if orgSecret.projectHandler != heartbeat.project || orgSecret.componentName != heartbeat.component {
                    log:printError(string `Binding name mismatch for kid=${kid}: ` +
                        string `bound project=${orgSecret.projectHandler ?: "?"}/component=${orgSecret.componentName ?: "?"}, ` +
                        string `got project=${heartbeat.project}/component=${heartbeat.component}. ` +
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
            error? keyIdErr = storage:updateRuntimeKeyId(heartbeat.runtime, kid);
            if keyIdErr is error {
                log:printError(string `Failed to record keyId=${kid} on runtime=${heartbeat.runtime}`, 'error = keyIdErr);
            }

            // Reconcile desired state against observed state written during heartbeat processing
            types:ControlCommand[] reconcileCommands = sync:reconcileFromHeartbeat(
                heartbeat.runtime, heartbeat.component, heartbeat.environment, heartbeat.runtimeType
            );
            log:printDebug(string `Reconciled ${reconcileCommands.length()} commands for runtime ${heartbeat.runtime}`);
            // Merge reconcile commands into the response
            types:ControlCommand[]? existing = heartbeatResponse.commands;
            if existing is types:ControlCommand[] {
                foreach types:ControlCommand cmd in reconcileCommands {
                    existing.push(cmd);
                }
            } else {
                heartbeatResponse.commands = reconcileCommands;
            }

            log:printInfo(string `Heartbeat processed for runtime=${heartbeat.runtime}, kid=${kid}`);
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
    resource function post deltaHeartbeat(http:Request request, @http:Payload types:DeltaHeartbeat deltaHeartbeat)
            returns types:HeartbeatResponse|http:Unauthorized|http:BadRequest|http:Conflict|error? {
        do {
            string|error jwtToken = extractBearerToken(request);
            if jwtToken is error {
                log:printWarn(string `Delta heartbeat rejected — missing bearer token for runtime: ${deltaHeartbeat.runtime}`);
                return <http:Unauthorized>{body: "Missing or malformed Authorization header"};
            }

            string|error kidResult = extractKidFromJwt(jwtToken);
            if kidResult is error {
                log:printWarn(string `Delta heartbeat rejected — bad JWT kid for runtime: ${deltaHeartbeat.runtime}: ${kidResult.message()}`);
                return <http:Unauthorized>{body: string `Invalid JWT: ${kidResult.message()}`};
            }
            string kid = kidResult;
            log:printDebug(string `Delta heartbeat from runtime=${deltaHeartbeat.runtime}, kid=${kid}`);

            types:OrgSecret|error orgSecretResult = storage:lookupOrgSecretByKeyId(kid);
            if orgSecretResult is error {
                log:printWarn(string `Delta heartbeat rejected — unknown kid=${kid} for runtime: ${deltaHeartbeat.runtime}`);
                return <http:BadRequest>{body: string `Unknown key ID '${kid}'`};
            }
            types:OrgSecret orgSecret = orgSecretResult;
            http:Unauthorized? authResult = validateRuntimeJwtWithSecret(jwtToken, orgSecret.keyMaterial);
            if authResult is http:Unauthorized {
                log:printWarn(string `Delta heartbeat rejected — invalid JWT for runtime: ${deltaHeartbeat.runtime}, kid=${kid}`);
                return authResult;
            }

            // Unbound key — delta has no component/environment info to bind with
            if orgSecret.componentId is () {
                log:printInfo(string `Delta heartbeat: kid=${kid} is unbound, requesting full heartbeat from runtime=${deltaHeartbeat.runtime}`);
                return <types:HeartbeatResponse>{acknowledged: false, fullHeartbeatRequired: true, commands: []};
            }

            // Bound key — verify runtime's component+environment matches the key's binding
            types:RuntimeTypeRecord? runtimeInfo = check storage:getRuntimeTypeById(deltaHeartbeat.runtime);
            if runtimeInfo is () {
                log:printWarn(string `Delta heartbeat rejected — runtime=${deltaHeartbeat.runtime} not found`);
                return <types:HeartbeatResponse>{acknowledged: false, fullHeartbeatRequired: true, commands: []};
            }
            if runtimeInfo.componentId != orgSecret.componentId || runtimeInfo.environmentId != orgSecret.environmentId {
                log:printWarn(string `Delta heartbeat rejected — binding mismatch for kid=${kid}: ` +
                    string `runtime component=${runtimeInfo.componentId}/env=${runtimeInfo.environmentId}, ` +
                    string `key component=${orgSecret.componentId ?: "?"}/env=${orgSecret.environmentId}`);
                return <http:Conflict>{body: string `Binding mismatch: key ID '${kid}' does not match this runtime's component/environment`};
            }

            types:HeartbeatResponse heartbeatResponse = check storage:processDeltaHeartbeat(deltaHeartbeat);

            // If not requesting full heartbeat, reconcile from desired state
            if !(heartbeatResponse.fullHeartbeatRequired ?: false) {
                types:ControlCommand[] reconcileCommands = sync:reconcileDelta(deltaHeartbeat.runtime);
                log:printDebug(string `Delta reconciliation generated ${reconcileCommands.length()} commands for runtime ${deltaHeartbeat.runtime}`);
                types:ControlCommand[]? existing = heartbeatResponse.commands;
                if existing is types:ControlCommand[] {
                    foreach types:ControlCommand cmd in reconcileCommands {
                        existing.push(cmd);
                    }
                } else {
                    heartbeatResponse.commands = reconcileCommands;
                }
            }

            log:printInfo(string `Delta heartbeat processed for runtime=${deltaHeartbeat.runtime}, kid=${kid}`);
            return heartbeatResponse;

        } on fail error e {
            log:printError("Failed to process delta heartbeat", 'error = e);
            return <types:HeartbeatResponse>{acknowledged: false, fullHeartbeatRequired: true, commands: []};
        }
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
        return <http:Unauthorized>{body: "Invalid or expired token"};
    }

    anydata scope = validatedPayload["scope"];
    if !(scope is string && scope == "runtime_agent") {
        return <http:Unauthorized>{body: "Insufficient scope — 'runtime_agent' required"};
    }

    return ();
}
