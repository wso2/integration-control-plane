// Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).

import ballerina/http;
import ballerina/log;

import wso2/icp_server.storage;
import wso2/icp_server.types;

// GET .../task-queues — the task queue of every workflow integration in the project/environment, by component id.
isolated function handleTaskQueuesRequest(string componentId, string environmentId) returns http:Response {
    types:WorkflowMetadataRecord[]|error metadataRecords =
        storage:getWorkflowMetadataForProjectEnv(componentId, environmentId);
    if metadataRecords is error {
        log:printError("Failed to read stored workflow metadata for task queues",
                'error = metadataRecords, componentId = componentId);
        return workflowErrorResponse(500, "Failed to read the stored workflow metadata");
    }

    // Freshest heartbeat first (the query's order), so the first queue seen per component wins.
    map<string> queues = {};
    foreach types:WorkflowMetadataRecord metadataRecord in metadataRecords {
        if queues.hasKey(metadataRecord.componentId) {
            continue;
        }
        string? taskQueue = metadataRecord.taskQueue;
        if taskQueue is string && taskQueue.length() > 0 {
            queues[metadataRecord.componentId] = taskQueue;
        }
    }

    http:Response response = new;
    response.statusCode = 200;
    response.setJsonPayload({taskQueues: queues.toJson()});
    return response;
}
