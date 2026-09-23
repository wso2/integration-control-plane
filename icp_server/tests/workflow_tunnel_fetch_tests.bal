// Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
//
// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

import ballerina/test;
import wso2/icp_server.storage;
import wso2/icp_server.types;

// =============================================================================
// Abandoning a workflow read nobody answered
// =============================================================================
// A read is handed to a runtime with a deadline (`WF_READ_FETCH_DEADLINE_SECONDS`).
// Past it the fetch is dead, but the sweep that used to be the only thing to notice
// runs every few minutes — and until it did, every caller of that key was told
// "still fetching" about a question nobody would ever answer. These cover giving up
// on one such fetch on the spot, and the guards that keep two nodes from both doing it.
// =============================================================================

const string FETCH_OWNER = "test-component:test-environment";

isolated function startTestFetch(string cacheKey, int expiresAt) returns error? {
    boolean started = check storage:startCacheFetch(cacheKey, "workflow.read", FETCH_OWNER,
            "{\"operation\":\"instances.get\"}", "token-" + cacheKey, expiresAt);
    test:assertTrue(started, "the fixture's fetch must be the one that started");
}

isolated function entryOf(string cacheKey) returns types:CacheEntry|error {
    types:CacheEntry? row = check storage:getCacheEntry(cacheKey);
    if row is () {
        return error(string `no cache entry for ${cacheKey}`);
    }
    return row;
}

// The case the console saw: a fetch past its deadline, given up on without waiting for the
// sweep, leaving the row retryable immediately.
@test:Config {
    groups: ["workflow-tunnel"]
}
isolated function testFetchPastItsDeadlineIsAbandoned() returns error? {
    string cacheKey = "test-fetch-dead-" + storage:cacheNowEpoch().toString();
    check startTestFetch(cacheKey, storage:cacheNowEpoch() - 5);

    boolean abandoned = check storage:abandonCacheFetch(cacheKey);
    test:assertTrue(abandoned, "a fetch past its deadline is this caller's to abandon");

    types:CacheEntry row = check entryOf(cacheKey);
    test:assertTrue(row.token is (), "the dead fetch must no longer look in flight");
    test:assertEquals(row.status, types:CACHE_FAILED);
    test:assertTrue(row.expiresAt <= storage:cacheNowEpoch(), "and the entry must be retryable now");
    // The request stays: a retry builds its command from it.
    test:assertTrue(row.data is string && (<string>row.data).includes("instances.get"));
}

// A fetch still within its deadline is somebody's live question, not a dead one.
@test:Config {
    groups: ["workflow-tunnel"]
}
isolated function testLiveFetchIsLeftAlone() returns error? {
    string cacheKey = "test-fetch-live-" + storage:cacheNowEpoch().toString();
    check startTestFetch(cacheKey, storage:cacheNowEpoch() + 60);

    boolean abandoned = check storage:abandonCacheFetch(cacheKey);
    test:assertFalse(abandoned, "a fetch inside its deadline must be left to answer");

    types:CacheEntry row = check entryOf(cacheKey);
    test:assertTrue(row.token is string, "and must still read as in flight");
    test:assertEquals(row.status, types:CACHE_FETCHING);
}

// Two nodes can notice the same dead fetch. Only one may abandon it, or the other would
// issue a second command for a question that already has one.
@test:Config {
    groups: ["workflow-tunnel"]
}
isolated function testOnlyOneCallerAbandonsAFetch() returns error? {
    string cacheKey = "test-fetch-race-" + storage:cacheNowEpoch().toString();
    check startTestFetch(cacheKey, storage:cacheNowEpoch() - 5);

    test:assertTrue(check storage:abandonCacheFetch(cacheKey), "the first caller wins");
    test:assertFalse(check storage:abandonCacheFetch(cacheKey), "the second is told it lost");
}

// Nothing to abandon is not an error: the key may never have been read.
@test:Config {
    groups: ["workflow-tunnel"]
}
isolated function testAbandoningAnUnknownKeyIsHarmless() returns error? {
    test:assertFalse(check storage:abandonCacheFetch("test-fetch-absent-key"));
}
