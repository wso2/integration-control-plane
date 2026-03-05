import icp_server.types;

import ballerina/log;
import ballerina/sql;

type StateRow record {|
    string state_key;
    string? state_value;
|};

type RuntimeIdRow record {|
    string runtime_id;
|};

type ArtifactKeyRow record {|
    string artifact_name;
    string artifact_type;
|};

// === Read ===

public isolated function readReconcileArtifactKeys(string componentId, string envId) returns types:ReconcileArtifactKey[]|error {
    log:printDebug("readReconcileArtifactKeys", componentId = componentId, envId = envId);
    stream<ArtifactKeyRow, sql:Error?> rows = dbClient->query(`
        SELECT DISTINCT artifact_name, artifact_type FROM reconcile_desired_state
        WHERE component_id = ${componentId} AND env_id = ${envId}
    `);
    types:ReconcileArtifactKey[] result = check from ArtifactKeyRow row in rows
        select {artifactName: row.artifact_name, artifactType: row.artifact_type};
    log:printDebug("readReconcileArtifactKeys done", count = result.length());
    return result;
}

public isolated function readReconcileDesiredState(string componentId, string envId,
        types:ReconcileArtifactKey artifact) returns map<string>|error {
    log:printDebug("readReconcileDesiredState", componentId = componentId, envId = envId,
        artifactName = artifact.artifactName, artifactType = artifact.artifactType);
    stream<StateRow, sql:Error?> rows = dbClient->query(`
        SELECT state_key, state_value FROM reconcile_desired_state
        WHERE component_id = ${componentId} AND env_id = ${envId}
        AND artifact_name = ${artifact.artifactName} AND artifact_type = ${artifact.artifactType}
    `);
    map<string> result = {};
    check from StateRow row in rows
        do {
            if row.state_value is string {
                result[row.state_key] = <string>row.state_value;
            }
        };
    log:printDebug("readReconcileDesiredState done", count = result.length());
    return result;
}

public isolated function readReconcileObservedState(string runtimeId,
        types:ReconcileArtifactKey artifact) returns map<string>|error {
    log:printDebug("readReconcileObservedState", runtimeId = runtimeId,
        artifactName = artifact.artifactName, artifactType = artifact.artifactType);
    stream<StateRow, sql:Error?> rows = dbClient->query(`
        SELECT state_key, state_value FROM reconcile_observed_state
        WHERE runtime_id = ${runtimeId}
        AND artifact_name = ${artifact.artifactName} AND artifact_type = ${artifact.artifactType}
    `);
    map<string> result = {};
    check from StateRow row in rows
        do {
            if row.state_value is string {
                result[row.state_key] = <string>row.state_value;
            }
        };
    log:printDebug("readReconcileObservedState done", count = result.length());
    return result;
}

public isolated function readReconcileBackoff(string runtimeId,
        types:ReconcileArtifactKey artifact) returns types:ReconcileBackoffRecord[]|error {
    log:printDebug("readReconcileBackoff", runtimeId = runtimeId,
        artifactName = artifact.artifactName, artifactType = artifact.artifactType);
    stream<types:ReconcileBackoffRecord, sql:Error?> rows = dbClient->query(`
        SELECT state_key, attempt_count, has_error, next_attempt FROM reconcile_backoff
        WHERE runtime_id = ${runtimeId}
        AND artifact_name = ${artifact.artifactName} AND artifact_type = ${artifact.artifactType}
    `);
    types:ReconcileBackoffRecord[] result = check from types:ReconcileBackoffRecord row in rows select row;
    log:printDebug("readReconcileBackoff done", count = result.length());
    return result;
}

// === Upsert ===

public isolated function upsertReconcileDesiredState(string componentId, string envId,
        types:ReconcileArtifactKey artifact, map<string> state) returns error? {
    foreach [string, string] [stateKey, stateValue] in state.entries() {
        log:printDebug("upsertReconcileDesired", componentId = componentId, envId = envId,
            artifactName = artifact.artifactName, stateKey = stateKey, stateValue = stateValue);
        if dbType == MSSQL || dbType == H2 {
            _ = check dbClient->execute(`
                MERGE INTO reconcile_desired_state AS target
                USING (VALUES (${componentId}, ${envId}, ${artifact.artifactName}, ${artifact.artifactType}, ${stateKey}, ${stateValue}))
                    AS source (component_id, env_id, artifact_name, artifact_type, state_key, state_value)
                ON (target.component_id = source.component_id AND target.env_id = source.env_id
                    AND target.artifact_name = source.artifact_name AND target.artifact_type = source.artifact_type
                    AND target.state_key = source.state_key)
                WHEN MATCHED THEN UPDATE SET state_value = source.state_value, updated_at = CURRENT_TIMESTAMP
                WHEN NOT MATCHED THEN INSERT (component_id, env_id, artifact_name, artifact_type, state_key, state_value)
                    VALUES (source.component_id, source.env_id, source.artifact_name, source.artifact_type, source.state_key, source.state_value);
            `);
        } else if dbType == POSTGRESQL {
            _ = check dbClient->execute(`
                INSERT INTO reconcile_desired_state (component_id, env_id, artifact_name, artifact_type, state_key, state_value)
                VALUES (${componentId}, ${envId}, ${artifact.artifactName}, ${artifact.artifactType}, ${stateKey}, ${stateValue})
                ON CONFLICT (component_id, env_id, artifact_name, artifact_type, state_key) DO UPDATE SET
                    state_value = EXCLUDED.state_value, updated_at = CURRENT_TIMESTAMP
            `);
        } else {
            _ = check dbClient->execute(`
                INSERT INTO reconcile_desired_state (component_id, env_id, artifact_name, artifact_type, state_key, state_value)
                VALUES (${componentId}, ${envId}, ${artifact.artifactName}, ${artifact.artifactType}, ${stateKey}, ${stateValue})
                ON DUPLICATE KEY UPDATE state_value = VALUES(state_value), updated_at = CURRENT_TIMESTAMP
            `);
        }
    }
}

public isolated function upsertReconcileObservedState(string runtimeId, string componentId, string envId,
        types:ReconcileArtifactKey artifact, map<string> state) returns error? {
    foreach [string, string] [stateKey, stateValue] in state.entries() {
        log:printDebug("upsertReconcileObserved", runtimeId = runtimeId,
            artifactName = artifact.artifactName, stateKey = stateKey, stateValue = stateValue);
        if dbType == MSSQL || dbType == H2 {
            _ = check dbClient->execute(`
                MERGE INTO reconcile_observed_state AS target
                USING (VALUES (${runtimeId}, ${componentId}, ${envId}, ${artifact.artifactName}, ${artifact.artifactType}, ${stateKey}, ${stateValue}))
                    AS source (runtime_id, component_id, env_id, artifact_name, artifact_type, state_key, state_value)
                ON (target.runtime_id = source.runtime_id AND target.artifact_name = source.artifact_name
                    AND target.artifact_type = source.artifact_type AND target.state_key = source.state_key)
                WHEN MATCHED THEN UPDATE SET state_value = source.state_value, component_id = source.component_id,
                    env_id = source.env_id, updated_at = CURRENT_TIMESTAMP
                WHEN NOT MATCHED THEN INSERT (runtime_id, component_id, env_id, artifact_name, artifact_type, state_key, state_value)
                    VALUES (source.runtime_id, source.component_id, source.env_id, source.artifact_name, source.artifact_type, source.state_key, source.state_value);
            `);
        } else if dbType == POSTGRESQL {
            _ = check dbClient->execute(`
                INSERT INTO reconcile_observed_state (runtime_id, component_id, env_id, artifact_name, artifact_type, state_key, state_value)
                VALUES (${runtimeId}, ${componentId}, ${envId}, ${artifact.artifactName}, ${artifact.artifactType}, ${stateKey}, ${stateValue})
                ON CONFLICT (runtime_id, artifact_name, artifact_type, state_key) DO UPDATE SET
                    state_value = EXCLUDED.state_value, component_id = EXCLUDED.component_id,
                    env_id = EXCLUDED.env_id, updated_at = CURRENT_TIMESTAMP
            `);
        } else {
            _ = check dbClient->execute(`
                INSERT INTO reconcile_observed_state (runtime_id, component_id, env_id, artifact_name, artifact_type, state_key, state_value)
                VALUES (${runtimeId}, ${componentId}, ${envId}, ${artifact.artifactName}, ${artifact.artifactType}, ${stateKey}, ${stateValue})
                ON DUPLICATE KEY UPDATE state_value = VALUES(state_value), component_id = VALUES(component_id),
                    env_id = VALUES(env_id), updated_at = CURRENT_TIMESTAMP
            `);
        }
    }
}

public isolated function upsertReconcileBackoff(string runtimeId, types:ReconcileArtifactKey artifact,
        string stateKey, int attemptCount, int hasError, int nextAttempt) returns error? {
    log:printDebug("upsertReconcileBackoff", runtimeId = runtimeId, artifactName = artifact.artifactName,
        stateKey = stateKey, attemptCount = attemptCount, hasError = hasError, nextAttempt = nextAttempt);
    if dbType == MSSQL || dbType == H2 {
        _ = check dbClient->execute(`
            MERGE INTO reconcile_backoff AS target
            USING (VALUES (${runtimeId}, ${artifact.artifactName}, ${artifact.artifactType}, ${stateKey}, ${attemptCount}, ${hasError}, ${nextAttempt}))
                AS source (runtime_id, artifact_name, artifact_type, state_key, attempt_count, has_error, next_attempt)
            ON (target.runtime_id = source.runtime_id AND target.artifact_name = source.artifact_name
                AND target.artifact_type = source.artifact_type AND target.state_key = source.state_key)
            WHEN MATCHED THEN UPDATE SET attempt_count = source.attempt_count, has_error = source.has_error, next_attempt = source.next_attempt
            WHEN NOT MATCHED THEN INSERT (runtime_id, artifact_name, artifact_type, state_key, attempt_count, has_error, next_attempt)
                VALUES (source.runtime_id, source.artifact_name, source.artifact_type, source.state_key, source.attempt_count, source.has_error, source.next_attempt);
        `);
    } else if dbType == POSTGRESQL {
        _ = check dbClient->execute(`
            INSERT INTO reconcile_backoff (runtime_id, artifact_name, artifact_type, state_key, attempt_count, has_error, next_attempt)
            VALUES (${runtimeId}, ${artifact.artifactName}, ${artifact.artifactType}, ${stateKey}, ${attemptCount}, ${hasError}, ${nextAttempt})
            ON CONFLICT (runtime_id, artifact_name, artifact_type, state_key) DO UPDATE SET
                attempt_count = EXCLUDED.attempt_count, has_error = EXCLUDED.has_error, next_attempt = EXCLUDED.next_attempt
        `);
    } else {
        _ = check dbClient->execute(`
            INSERT INTO reconcile_backoff (runtime_id, artifact_name, artifact_type, state_key, attempt_count, has_error, next_attempt)
            VALUES (${runtimeId}, ${artifact.artifactName}, ${artifact.artifactType}, ${stateKey}, ${attemptCount}, ${hasError}, ${nextAttempt})
            ON DUPLICATE KEY UPDATE attempt_count = VALUES(attempt_count), has_error = VALUES(has_error), next_attempt = VALUES(next_attempt)
        `);
    }
}

// === Delete ===

public isolated function deleteReconcileBackoffConverged(string runtimeId, types:ReconcileArtifactKey artifact,
        string[] activeKeys) returns error? {
    log:printDebug("deleteReconcileBackoffConverged", runtimeId = runtimeId,
        artifactName = artifact.artifactName, activeKeysCount = activeKeys.length());
    if activeKeys.length() == 0 {
        _ = check dbClient->execute(`
            DELETE FROM reconcile_backoff
            WHERE runtime_id = ${runtimeId} AND artifact_name = ${artifact.artifactName}
            AND artifact_type = ${artifact.artifactType}
        `);
    } else {
        sql:ParameterizedQuery query = `
            DELETE FROM reconcile_backoff
            WHERE runtime_id = ${runtimeId} AND artifact_name = ${artifact.artifactName}
            AND artifact_type = ${artifact.artifactType} AND state_key NOT IN (`;
        foreach int i in 0 ..< activeKeys.length() {
            if i > 0 {
                query = sql:queryConcat(query, `, `);
            }
            query = sql:queryConcat(query, `${activeKeys[i]}`);
        }
        query = sql:queryConcat(query, `)`);
        _ = check dbClient->execute(query);
    }
}

public isolated function deleteReconcileRuntime(string runtimeId) returns error? {
    log:printDebug("deleteReconcileRuntime", runtimeId = runtimeId);
    _ = check dbClient->execute(`DELETE FROM reconcile_observed_state WHERE runtime_id = ${runtimeId}`);
    _ = check dbClient->execute(`DELETE FROM reconcile_backoff WHERE runtime_id = ${runtimeId}`);
}

public isolated function deleteReconcileComponent(string componentId, string envId) returns error? {
    log:printDebug("deleteReconcileComponent", componentId = componentId, envId = envId);
    _ = check dbClient->execute(`
        DELETE FROM reconcile_desired_state WHERE component_id = ${componentId} AND env_id = ${envId}
    `);
    stream<RuntimeIdRow, sql:Error?> rtRows = dbClient->query(`
        SELECT DISTINCT runtime_id FROM reconcile_observed_state
        WHERE component_id = ${componentId} AND env_id = ${envId}
    `);
    string[] affectedRuntimes = check from RuntimeIdRow row in rtRows select row.runtime_id;
    log:printDebug("deleteReconcileComponent affected runtimes", count = affectedRuntimes.length());
    _ = check dbClient->execute(`
        DELETE FROM reconcile_observed_state WHERE component_id = ${componentId} AND env_id = ${envId}
    `);
    foreach string rtId in affectedRuntimes {
        _ = check dbClient->execute(`
            DELETE FROM reconcile_backoff WHERE runtime_id = ${rtId}
            AND NOT EXISTS (
                SELECT 1 FROM reconcile_observed_state os
                WHERE os.runtime_id = reconcile_backoff.runtime_id
                AND os.artifact_name = reconcile_backoff.artifact_name
                AND os.artifact_type = reconcile_backoff.artifact_type
                AND os.state_key = reconcile_backoff.state_key
            )
        `);
    }
}
