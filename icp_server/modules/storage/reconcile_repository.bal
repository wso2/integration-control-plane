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

type HeartbeatGenRow record {|
    int gen;
|};

type LegacyDesiredStateRow record {|
    string artifact_type;
    string state_key;
    string? state_value;
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

// === Query ===

type ObservedStateRow record {|
    string artifact_name;
    string artifact_type;
    string state_key;
    string? state_value;
    boolean optimistic;
|};

// Oracle: NUMBER(1) cannot map to a boolean field — read as int and convert
type OracleObservedStateRow record {|
    string artifact_name;
    string artifact_type;
    string state_key;
    string? state_value;
    int optimistic;
|};

// Returns reconcile-derived state for all artifacts in a component+environment.
// Keyed by "artifactName|artifactType" -> stateKey -> {value, inSync}.
public isolated function queryArtifactState(string componentId, string envId)
        returns map<map<types:ArtifactStateField>>|error {
    log:printDebug("queryArtifactState", componentId = componentId, envId = envId);

    // 1. Read observed state (only RUNNING runtimes)
    sql:ParameterizedQuery obsQuery = `
        SELECT os.artifact_name, os.artifact_type, os.state_key, os.state_value, os.optimistic
        FROM reconcile_observed_state os
        JOIN runtimes r ON r.runtime_id = os.runtime_id AND r.status = 'RUNNING'
        WHERE os.component_id = ${componentId} AND os.env_id = ${envId}
    `;

    // Group: (artifactKey, stateKey) -> list of {value, optimistic}
    map<map<[string, boolean][]>> groups = {};
    if dbType == ORACLE {
        stream<OracleObservedStateRow, sql:Error?> obsRows = dbClient->query(obsQuery);
        check from OracleObservedStateRow row in obsRows
            do {
                string artKey = string `${row.artifact_name}|${row.artifact_type}`;
                string val = row.state_value ?: "";
                if !groups.hasKey(artKey) {
                    groups[artKey] = {};
                }
                map<[string, boolean][]> keyMap = <map<[string, boolean][]>>groups[artKey];
                if !keyMap.hasKey(row.state_key) {
                    keyMap[row.state_key] = [];
                }
                [string, boolean][] entries = <[string, boolean][]>keyMap[row.state_key];
                entries.push([val, row.optimistic == 1]);
            };
    } else {
        stream<ObservedStateRow, sql:Error?> obsRows = dbClient->query(obsQuery);
        check from ObservedStateRow row in obsRows
            do {
                string artKey = string `${row.artifact_name}|${row.artifact_type}`;
                string val = row.state_value ?: "";
                if !groups.hasKey(artKey) {
                    groups[artKey] = {};
                }
                map<[string, boolean][]> keyMap = <map<[string, boolean][]>>groups[artKey];
                if !keyMap.hasKey(row.state_key) {
                    keyMap[row.state_key] = [];
                }
                [string, boolean][] entries = <[string, boolean][]>keyMap[row.state_key];
                entries.push([val, row.optimistic]);
            };
    }

    // 2. Read desired state for same scope
    stream<record {|string artifact_name; string artifact_type; string state_key; string? state_value;|}, sql:Error?> desRows = dbClient->query(`
        SELECT artifact_name, artifact_type, state_key, state_value
        FROM reconcile_desired_state
        WHERE component_id = ${componentId} AND env_id = ${envId}
    `);
    map<map<string>> desired = {};
    check from var row in desRows
        do {
            string artKey = string `${row.artifact_name}|${row.artifact_type}`;
            if !desired.hasKey(artKey) {
                desired[artKey] = {};
            }
            map<string> m = <map<string>>desired[artKey];
            m[row.state_key] = row.state_value ?: "";
        };

    // 3. Compute {value, inSync} per field
    map<map<types:ArtifactStateField>> result = {};
    foreach string artKey in groups.keys() {
        map<types:ArtifactStateField> fields = {};
        map<[string, boolean][]> keyMap = <map<[string, boolean][]>>groups[artKey];
        foreach string stateKey in keyMap.keys() {
            [string, boolean][] entries = <[string, boolean][]>keyMap[stateKey];
            string[] values = from var [v, _] in entries select v;
            string[] sorted = values.sort();
            string median = sorted[sorted.length() / 2];
            boolean allAgree = sorted[0] == sorted[sorted.length() - 1];
            boolean allConfirmed = (from var [_, opt] in entries where opt select opt).length() == 0;

            // Determine inSync
            map<string>? desiredForArt = desired[artKey];
            string? desiredVal = desiredForArt is map<string> ? desiredForArt[stateKey] : ();
            boolean inSync;
            if desiredVal is string {
                inSync = allAgree && allConfirmed && median == desiredVal;
            } else {
                inSync = allAgree;
            }

            fields[stateKey] = {value: median, inSync};
            log:printDebug("queryArtifactState field", artKey = artKey, stateKey = stateKey,
                value = median, inSync = inSync, runtimeCount = entries.length(),
                allAgree = allAgree, allConfirmed = allConfirmed);
        }
        result[artKey] = fields;
    }

    log:printDebug("queryArtifactState done", artifactCount = result.length());
    return result;
}

// === Upsert ===

// Folds desired state recorded under a non-canonical spelling of an artifact type into the
// canonical key and removes the old rows.
//
// Before artifact types were normalized on write, a caller sending "Proxy-Service" created a
// desired-state row under that literal string. Writing the canonical "proxy-service" would
// otherwise leave both, and readReconcileArtifactKeys returns each distinct artifact_type, so
// heartbeat replay would keep dispatching the stale row's status to the same artifact.
//
// State fields the canonical key does not already carry are copied over, so a legacy tracing or
// statistics value is not lost. Fields it does carry are left alone, which lets the caller's own
// update win the status it is in the middle of setting.
public isolated function migrateLegacyArtifactTypeKeys(string componentId, string envId,
        string artifactName, string canonicalType) returns error? {
    // Select the whole case-insensitive group rather than filtering the canonical spelling out in
    // SQL. On MySQL this column is utf8mb4_unicode_ci, so `artifact_type <> canonical` is false for
    // a difference of case alone and an SQL-side filter would match nothing; the exact comparison
    // is therefore made in Ballerina, which is case-sensitive on every database.
    stream<LegacyDesiredStateRow, sql:Error?> rows = dbClient->query(`
        SELECT artifact_type, state_key, state_value FROM reconcile_desired_state
        WHERE component_id = ${componentId} AND env_id = ${envId}
            AND artifact_name = ${artifactName}
            AND LOWER(TRIM(artifact_type)) = ${canonicalType}
    `);
    LegacyDesiredStateRow[] groupRows = check from LegacyDesiredStateRow row in rows
        select row;

    boolean hasLegacySpelling = groupRows.some(row => row.artifact_type != canonicalType);
    if !hasLegacySpelling {
        return;
    }

    // Merge the group into one state map. The canonical spelling wins a shared key; anything only a
    // legacy row carries is kept, so a tracing or statistics value set earlier is not lost.
    map<string> merged = {};
    foreach LegacyDesiredStateRow row in groupRows {
        string? value = row.state_value;
        if value is () {
            continue;
        }
        if row.artifact_type == canonicalType || !merged.hasKey(row.state_key) {
            merged[row.state_key] = value;
        }
    }
    log:printInfo("Migrating legacy artifact type keys", componentId = componentId, envId = envId,
            artifactName = artifactName, canonicalType = canonicalType,
            rowCount = groupRows.length(), mergedKeyCount = merged.length());

    // Delete the whole group before rewriting it. Deleting only the legacy spellings would remove
    // the canonical row too under a case-insensitive collation, where the two are not
    // distinguishable by equality.
    _ = check dbClient->execute(`
        DELETE FROM reconcile_desired_state
        WHERE component_id = ${componentId} AND env_id = ${envId}
            AND artifact_name = ${artifactName}
            AND LOWER(TRIM(artifact_type)) = ${canonicalType}
    `);

    types:ReconcileArtifactKey canonicalKey = {artifactName: artifactName, artifactType: canonicalType};
    if merged.length() > 0 {
        check upsertReconcileDesiredState(componentId, envId, canonicalKey, merged);
    }
}

public isolated function upsertReconcileDesiredState(string componentId, string envId,
        types:ReconcileArtifactKey artifact, map<string> state) returns error? {
    foreach [string, string] [stateKey, stateValue] in state.clone().entries() {
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
        } else if dbType == ORACLE {
            _ = check dbClient->execute(`
                MERGE INTO reconcile_desired_state target
                USING (SELECT ${componentId} AS component_id, ${envId} AS env_id, ${artifact.artifactName} AS artifact_name,
                              ${artifact.artifactType} AS artifact_type, ${stateKey} AS state_key, ${stateValue} AS state_value
                       FROM dual) source
                ON (target.component_id = source.component_id AND target.env_id = source.env_id
                    AND target.artifact_name = source.artifact_name AND target.artifact_type = source.artifact_type
                    AND target.state_key = source.state_key)
                WHEN MATCHED THEN UPDATE SET state_value = source.state_value, updated_at = CURRENT_TIMESTAMP
                WHEN NOT MATCHED THEN INSERT (component_id, env_id, artifact_name, artifact_type, state_key, state_value)
                    VALUES (source.component_id, source.env_id, source.artifact_name, source.artifact_type, source.state_key, source.state_value)
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

public isolated function optimisticUpsertObservedState(string runtimeId, string componentId, string envId,
        types:ReconcileArtifactKey artifact, map<string> state) returns error? {
    foreach [string, string] [stateKey, stateValue] in state.clone().entries() {
        log:printDebug("optimisticUpsertObservedState", runtimeId = runtimeId,
            artifactName = artifact.artifactName, stateKey = stateKey, stateValue = stateValue);
        if dbType == MSSQL || dbType == H2 {
            _ = check dbClient->execute(`
                MERGE INTO reconcile_observed_state AS target
                USING (VALUES (${runtimeId}, ${componentId}, ${envId}, ${artifact.artifactName}, ${artifact.artifactType}, ${stateKey}, ${stateValue}, ${true}))
                    AS source (runtime_id, component_id, env_id, artifact_name, artifact_type, state_key, state_value, optimistic)
                ON (target.runtime_id = source.runtime_id AND target.artifact_name = source.artifact_name
                    AND target.artifact_type = source.artifact_type AND target.state_key = source.state_key)
                WHEN MATCHED THEN UPDATE SET state_value = source.state_value, component_id = source.component_id,
                    env_id = source.env_id, optimistic = source.optimistic, updated_at = CURRENT_TIMESTAMP
                WHEN NOT MATCHED THEN INSERT (runtime_id, component_id, env_id, artifact_name, artifact_type, state_key, state_value, optimistic)
                    VALUES (source.runtime_id, source.component_id, source.env_id, source.artifact_name, source.artifact_type, source.state_key, source.state_value, source.optimistic);
            `);
        } else if dbType == ORACLE {
            _ = check dbClient->execute(`
                MERGE INTO reconcile_observed_state target
                USING (SELECT ${runtimeId} AS runtime_id, ${componentId} AS component_id, ${envId} AS env_id,
                              ${artifact.artifactName} AS artifact_name, ${artifact.artifactType} AS artifact_type,
                              ${stateKey} AS state_key, ${stateValue} AS state_value, 1 AS optimistic
                       FROM dual) source
                ON (target.runtime_id = source.runtime_id AND target.artifact_name = source.artifact_name
                    AND target.artifact_type = source.artifact_type AND target.state_key = source.state_key)
                WHEN MATCHED THEN UPDATE SET state_value = source.state_value, component_id = source.component_id,
                    env_id = source.env_id, optimistic = source.optimistic, updated_at = CURRENT_TIMESTAMP
                WHEN NOT MATCHED THEN INSERT (runtime_id, component_id, env_id, artifact_name, artifact_type, state_key, state_value, optimistic)
                    VALUES (source.runtime_id, source.component_id, source.env_id, source.artifact_name, source.artifact_type, source.state_key, source.state_value, source.optimistic)
            `);
        } else if dbType == POSTGRESQL {
            _ = check dbClient->execute(`
                INSERT INTO reconcile_observed_state (runtime_id, component_id, env_id, artifact_name, artifact_type, state_key, state_value, optimistic)
                VALUES (${runtimeId}, ${componentId}, ${envId}, ${artifact.artifactName}, ${artifact.artifactType}, ${stateKey}, ${stateValue}, ${true})
                ON CONFLICT (runtime_id, artifact_name, artifact_type, state_key) DO UPDATE SET
                    state_value = EXCLUDED.state_value, component_id = EXCLUDED.component_id,
                    env_id = EXCLUDED.env_id, optimistic = EXCLUDED.optimistic, updated_at = CURRENT_TIMESTAMP
            `);
        } else {
            _ = check dbClient->execute(`
                INSERT INTO reconcile_observed_state (runtime_id, component_id, env_id, artifact_name, artifact_type, state_key, state_value, optimistic)
                VALUES (${runtimeId}, ${componentId}, ${envId}, ${artifact.artifactName}, ${artifact.artifactType}, ${stateKey}, ${stateValue}, ${true})
                ON DUPLICATE KEY UPDATE state_value = VALUES(state_value), component_id = VALUES(component_id),
                    env_id = VALUES(env_id), optimistic = VALUES(optimistic), updated_at = CURRENT_TIMESTAMP
            `);
        }
    }
}

public isolated function batchUpsertReconcileObservedState(string runtimeId, string componentId, string envId,
        [types:ReconcileArtifactKey, map<string>][] artifacts) returns error? {
    HeartbeatGenRow genRow = check dbClient->queryRow(`
        SELECT COALESCE(MAX(heartbeat_gen), 0) + 1 AS gen
        FROM reconcile_observed_state WHERE runtime_id = ${runtimeId}
    `);
    int nextGen = genRow.gen;
    log:printDebug("batchUpsertReconcileObservedState", runtimeId = runtimeId, nextGen = nextGen,
        artifactCount = artifacts.length());

    if artifacts.length() > 0 && dbType == ORACLE {
        // Oracle has no multi-row VALUES; batch the per-entry MERGE statements
        sql:ParameterizedQuery[] mergeQueries = [];
        foreach var [artifact, state] in artifacts {
            foreach var [stateKey, stateValue] in state.clone().entries() {
                mergeQueries.push(`
                    MERGE INTO reconcile_observed_state target
                    USING (SELECT ${runtimeId} AS runtime_id, ${componentId} AS component_id, ${envId} AS env_id,
                                  ${artifact.artifactName} AS artifact_name, ${artifact.artifactType} AS artifact_type,
                                  ${stateKey} AS state_key, ${stateValue} AS state_value, 0 AS optimistic,
                                  ${nextGen} AS heartbeat_gen
                           FROM dual) source
                    ON (target.runtime_id = source.runtime_id AND target.artifact_name = source.artifact_name
                        AND target.artifact_type = source.artifact_type AND target.state_key = source.state_key)
                    WHEN MATCHED THEN UPDATE SET state_value = source.state_value, component_id = source.component_id,
                        env_id = source.env_id, optimistic = source.optimistic, heartbeat_gen = source.heartbeat_gen,
                        updated_at = CURRENT_TIMESTAMP
                    WHEN NOT MATCHED THEN INSERT (runtime_id, component_id, env_id, artifact_name, artifact_type,
                        state_key, state_value, optimistic, heartbeat_gen)
                        VALUES (source.runtime_id, source.component_id, source.env_id, source.artifact_name,
                                source.artifact_type, source.state_key, source.state_value, source.optimistic,
                                source.heartbeat_gen)
                `);
            }
        }
        if mergeQueries.length() > 0 {
            _ = check dbClient->batchExecute(mergeQueries);
        }
    } else if artifacts.length() > 0 {
        sql:ParameterizedQuery values = ``;
        boolean first = true;
        foreach var [artifact, state] in artifacts {
            foreach var [stateKey, stateValue] in state.clone().entries() {
                if !first {
                    values = sql:queryConcat(values, `, `);
                }
                values = sql:queryConcat(values,
                    `(${runtimeId}, ${componentId}, ${envId}, ${artifact.artifactName}, ${artifact.artifactType},
                      ${stateKey}, ${stateValue}, ${false}, ${nextGen})`);
                first = false;
            }
        }

        if !first {
            if dbType == MSSQL || dbType == H2 {
                _ = check dbClient->execute(sql:queryConcat(
                    `MERGE INTO reconcile_observed_state AS target
                     USING (VALUES `, values,
                    `) AS source (runtime_id, component_id, env_id, artifact_name, artifact_type, state_key, state_value, optimistic, heartbeat_gen)
                     ON (target.runtime_id = source.runtime_id AND target.artifact_name = source.artifact_name
                         AND target.artifact_type = source.artifact_type AND target.state_key = source.state_key)
                     WHEN MATCHED THEN UPDATE SET state_value = source.state_value, component_id = source.component_id,
                         env_id = source.env_id, optimistic = source.optimistic, heartbeat_gen = source.heartbeat_gen,
                         updated_at = CURRENT_TIMESTAMP
                     WHEN NOT MATCHED THEN INSERT (runtime_id, component_id, env_id, artifact_name, artifact_type,
                         state_key, state_value, optimistic, heartbeat_gen)
                         VALUES (source.runtime_id, source.component_id, source.env_id, source.artifact_name,
                                 source.artifact_type, source.state_key, source.state_value, source.optimistic,
                                 source.heartbeat_gen);`
                ));
            } else if dbType == POSTGRESQL {
                _ = check dbClient->execute(sql:queryConcat(
                    `INSERT INTO reconcile_observed_state (runtime_id, component_id, env_id, artifact_name,
                         artifact_type, state_key, state_value, optimistic, heartbeat_gen)
                     VALUES `, values,
                    ` ON CONFLICT (runtime_id, artifact_name, artifact_type, state_key) DO UPDATE SET
                         state_value = EXCLUDED.state_value, component_id = EXCLUDED.component_id,
                         env_id = EXCLUDED.env_id, optimistic = EXCLUDED.optimistic,
                         heartbeat_gen = EXCLUDED.heartbeat_gen, updated_at = CURRENT_TIMESTAMP`
                ));
            } else {
                _ = check dbClient->execute(sql:queryConcat(
                    `INSERT INTO reconcile_observed_state (runtime_id, component_id, env_id, artifact_name,
                         artifact_type, state_key, state_value, optimistic, heartbeat_gen)
                     VALUES `, values,
                    ` ON DUPLICATE KEY UPDATE state_value = VALUES(state_value), component_id = VALUES(component_id),
                         env_id = VALUES(env_id), optimistic = VALUES(optimistic),
                         heartbeat_gen = VALUES(heartbeat_gen), updated_at = CURRENT_TIMESTAMP`
                ));
            }
        }
    }

    sql:ExecutionResult pruneResult = check dbClient->execute(`
        DELETE FROM reconcile_observed_state
        WHERE runtime_id = ${runtimeId} AND heartbeat_gen < ${nextGen}
    `);
    log:printDebug("batchUpsertReconcileObservedState done", runtimeId = runtimeId,
        prunedRows = pruneResult.affectedRowCount);
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
    } else if dbType == ORACLE {
        _ = check dbClient->execute(`
            MERGE INTO reconcile_backoff target
            USING (SELECT ${runtimeId} AS runtime_id, ${artifact.artifactName} AS artifact_name,
                          ${artifact.artifactType} AS artifact_type, ${stateKey} AS state_key,
                          ${attemptCount} AS attempt_count, ${hasError} AS has_error, ${nextAttempt} AS next_attempt
                   FROM dual) source
            ON (target.runtime_id = source.runtime_id AND target.artifact_name = source.artifact_name
                AND target.artifact_type = source.artifact_type AND target.state_key = source.state_key)
            WHEN MATCHED THEN UPDATE SET attempt_count = source.attempt_count, has_error = source.has_error, next_attempt = source.next_attempt
            WHEN NOT MATCHED THEN INSERT (runtime_id, artifact_name, artifact_type, state_key, attempt_count, has_error, next_attempt)
                VALUES (source.runtime_id, source.artifact_name, source.artifact_type, source.state_key, source.attempt_count, source.has_error, source.next_attempt)
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

public isolated function deleteReconcileEnvironment(string envId) returns error? {
    log:printDebug("deleteReconcileEnvironment", envId = envId);
    _ = check dbClient->execute(`
        DELETE FROM reconcile_desired_state WHERE env_id = ${envId}
    `);
    stream<RuntimeIdRow, sql:Error?> rtRows = dbClient->query(`
        SELECT DISTINCT runtime_id FROM reconcile_observed_state
        WHERE env_id = ${envId}
    `);
    string[] affectedRuntimes = check from RuntimeIdRow row in rtRows select row.runtime_id;
    log:printDebug("deleteReconcileEnvironment affected runtimes", count = affectedRuntimes.length());
    _ = check dbClient->execute(`
        DELETE FROM reconcile_observed_state WHERE env_id = ${envId}
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

public isolated function getReconcileEnvIdsForComponent(string componentId) returns string[]|error {
    log:printDebug("getReconcileEnvIdsForComponent", componentId = componentId);
    stream<record {|string env_id;|}, sql:Error?> rows = dbClient->query(`
        SELECT DISTINCT env_id FROM reconcile_desired_state WHERE component_id = ${componentId}
        UNION
        SELECT DISTINCT env_id FROM reconcile_observed_state WHERE component_id = ${componentId}
    `);
    string[] result = check from var row in rows select row.env_id;
    log:printDebug("getReconcileEnvIdsForComponent done", count = result.length());
    return result;
}
