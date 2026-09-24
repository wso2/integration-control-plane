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

import ballerina/log;
import ballerina/task;

// Start the offline runtime scheduler
function initRuntimeScheduler() returns error? {
    // Start a worker to periodically mark runtimes as OFFLINE if they haven't sent a heartbeat within the timeout
    worker offlineRuntimeSchedulerWorker {
        task:JobId|error id = task:scheduleJobRecurByFrequency(new Job(), <decimal>schedulerIntervalSeconds);
        if (id is error) {
            log:printError("Failed to schedule offline runtime job", id);
        }
    }

    // Start a worker to periodically sweep the workflow tunnel: expire mutations the
    // integration never confirmed (so each becomes a notification rather than a silent loss)
    // and delete cache rows and finished operations nobody can still be served. Runs on every
    // node; the statements are idempotent, so no leader election is needed.
    worker workflowTunnelSweepWorker {
        task:JobId|error id = task:scheduleJobRecurByFrequency(new WorkflowTunnelSweepJob(),
                <decimal>workflowSweepIntervalSeconds);
        if (id is error) {
            log:printError("Failed to schedule the workflow tunnel sweep job", id);
        } else {
            log:printInfo("Workflow tunnel sweep job scheduled successfully",
                    intervalSeconds = workflowSweepIntervalSeconds);
        }
    }

    // Start a worker to periodically clean up expired and revoked refresh tokens
    worker refreshTokenCleanupWorker {
        task:JobId|error id = task:scheduleJobRecurByFrequency(new RefreshTokenCleanupJob(), <decimal>refreshTokenCleanupIntervalSeconds);
        if (id is error) {
            log:printError("Failed to schedule refresh token cleanup job", id);
        } else {
            log:printInfo("Refresh token cleanup job scheduled successfully",
                    intervalSeconds = refreshTokenCleanupIntervalSeconds);
        }
    }
}

// Creates a job to be executed by the scheduler.
class Job {

    *task:Job;

    // Executes this function when the scheduled trigger fires.
    //
    // The whole tick runs under `trap`: a panic escaping execute() unschedules the job,
    // and this job is the only thing that ever declares a silent runtime OFFLINE — one
    // bad tick must never become a permanently dead sweep. (Observed in an incident:
    // the periodic jobs stopped for good mid-outage, leaving the control plane a
    // zombie until restart.) Errors are already values; trap covers what isn't.
    public function execute() {
        error? result = trap self.tick();
        if result is error {
            log:printError("The offline runtime sweep tick failed", result);
        }
    }

    function tick() returns error? {
        check storage:markOfflineRuntimes();
        // Runtimes that just went offline were deleted (K8S) or marked OFFLINE (VM);
        // drop the workflow proxy's cached clients for their callback URLs.
        // Same idea for the Try-It proxy's cached clients.
        pruneTryitClientCache();
    }

}

// Sweeps the workflow tunnel tables. Separate from the offline-runtime job so a slow sweep
// cannot delay marking a runtime offline, and so each can be tuned on its own interval.
class WorkflowTunnelSweepJob {

    *task:Job;

    // Trapped for the same reason as the offline sweep above: a panic escaping execute()
    // unschedules the job for the life of the process, and nothing reschedules it. This job
    // is what turns an unconfirmed mutation into a notification, so a dead sweep loses those
    // silently rather than loudly.
    public function execute() {
        error? result = trap sweepTunnelState();
        if result is error {
            log:printError("The tunnel sweep tick failed", result);
        }
    }

}
