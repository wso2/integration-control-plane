import icp_server.storage;
import icp_server.types;

import ballerina/log;
import ballerina/time;
import ballerina/uuid;

// MI dispatch: fire HTTP calls immediately via sendMIControlCommandAsync.
public function dispatchMI(string runtimeId, types:ReconcileArtifactKey artifact,
        types:ReconcileAction[] actions) returns error? {
    foreach types:ReconcileAction a in actions {
        if a.key == "status" {
            string miAction = a.value == "enabled" ? types:ARTIFACT_ENABLE : types:ARTIFACT_DISABLE;
            storage:sendMIControlCommandAsync(runtimeId, artifact.artifactType, artifact.artifactName, miAction);
        } else if a.key == "tracing" {
            string miAction = a.value == "enabled" ? types:ARTIFACT_ENABLE_TRACING : types:ARTIFACT_DISABLE_TRACING;
            storage:sendMIControlCommandAsync(runtimeId, artifact.artifactType, artifact.artifactName, miAction);
        } else if a.key == "statistics" {
            string miAction = a.value == "enabled" ? types:ARTIFACT_ENABLE_STATISTICS : types:ARTIFACT_DISABLE_STATISTICS;
            storage:sendMIControlCommandAsync(runtimeId, artifact.artifactType, artifact.artifactName, miAction);
        } else {
            log:printWarn("dispatchMI: unknown key", runtimeId = runtimeId, key = a.key);
        }
    }
}

// BI collector: builds a DispatchFn that converts ReconcileActions to ControlCommands
// and appends them to a shared list.
public function buildBICollector(types:ControlCommand[] commands) returns types:DispatchFn {
    return function(string runtimeId, types:ReconcileArtifactKey artifact,
            types:ReconcileAction[] actions) returns error? {
        time:Utc now = time:utcNow();
        // Extract the raw artifact name (without package prefix) for control commands
        string rawName = types:rawArtifactName(artifact.artifactName);
        foreach types:ReconcileAction a in actions {
            if a.key == "status" {
                types:ControlAction action = a.value == "enabled" ? types:START : types:STOP;
                commands.push({
                    commandId: uuid:createType1AsString(),
                    runtimeId: runtimeId,
                    targetArtifact: {name: rawName},
                    action: action,
                    issuedAt: now,
                    status: types:PENDING
                });
            } else if a.key == "logLevel" {
                json payload = {
                    "componentName": rawName,
                    "logLevel": a.value
                };
                commands.push({
                    commandId: uuid:createType1AsString(),
                    runtimeId: runtimeId,
                    targetArtifact: {name: rawName},
                    action: types:SET_LOGGER_LEVEL,
                    issuedAt: now,
                    status: types:PENDING,
                    payload: payload.toJsonString()
                });
            } else {
                log:printWarn("buildBICollector: unknown key", runtimeId = runtimeId, key = a.key);
            }
        }
    };
}

// Reconcile from a full heartbeat. Called from runtime_service after processHeartbeat.
// Returns BI control commands to send back in heartbeat response.
public function reconcileFromHeartbeat(string runtimeId, string componentId, string envId,
        string runtimeType) returns types:ControlCommand[] {
    do {
        // Determine component type
        types:Component component = check storage:getComponentById(componentId);
        string componentType = component.componentType;

        // Query all desired-state artifact keys for this component+env
        types:ReconcileArtifactKey[] artifactKeys = check storage:readReconcileArtifactKeys(componentId, envId);

        // Reconcile each artifact
        types:ControlCommand[] biCommands = [];
        log:printInfo("Starting reconciliation from heartbeat", runtimeId = runtimeId,
            componentType = componentType, artifactCount = artifactKeys.length());
        foreach types:ReconcileArtifactKey ak in artifactKeys {
            if componentType == types:MI {
                error? e = reconcileArtifact(runtimeId, componentId, envId, ak, dispatchMI);
                if e is error {
                    log:printWarn("reconcileFromHeartbeat MI failed", runtimeId = runtimeId,
                        artifactName = ak.artifactName, err = e.message());
                }
            } else if componentType == types:BI {
                types:DispatchFn collector = buildBICollector(biCommands);
                error? e = reconcileArtifact(runtimeId, componentId, envId, ak, collector);
                if e is error {
                    log:printWarn("reconcileFromHeartbeat BI failed", runtimeId = runtimeId,
                        artifactName = ak.artifactName, err = e.message());
                }
            }
        }

        return biCommands;
    } on fail error e {
        log:printWarn("reconcileFromHeartbeat failed", runtimeId = runtimeId, err = e.message());
        return [];
    }
}

// Reconcile from delta heartbeat (no artifact payload — query desired state keys).
public function reconcileDelta(string runtimeId) returns types:ControlCommand[] {
    do {
        // Look up runtime context
        types:Runtime? runtimeOpt = check storage:getRuntimeById(runtimeId);
        if runtimeOpt is () {
            log:printDebug("reconcileDelta: runtime not found", runtimeId = runtimeId);
            return [];
        }
        types:Runtime runtime = runtimeOpt;
        string componentId = runtime.component.id;
        string envId = runtime.environment.id;
        string componentType = runtime.component.componentType;

        types:ReconcileArtifactKey[] artifactKeys = check storage:readReconcileArtifactKeys(componentId, envId);

        types:ControlCommand[] biCommands = [];
        foreach types:ReconcileArtifactKey ak in artifactKeys {
            if componentType == types:MI {
                error? e = reconcileArtifact(runtimeId, componentId, envId, ak, dispatchMI);
                if e is error {
                    log:printWarn("reconcileDelta MI failed", runtimeId = runtimeId,
                        artifactName = ak.artifactName, err = e.message());
                }
            } else if componentType == types:BI {
                types:DispatchFn collector = buildBICollector(biCommands);
                error? e = reconcileArtifact(runtimeId, componentId, envId, ak, collector);
                if e is error {
                    log:printWarn("reconcileDelta BI failed", runtimeId = runtimeId,
                        artifactName = ak.artifactName, err = e.message());
                }
            }
        }

        return biCommands;
    } on fail error e {
        log:printWarn("reconcileDelta failed", runtimeId = runtimeId, err = e.message());
        return [];
    }
}
