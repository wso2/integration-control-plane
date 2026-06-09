// Copyright (c) 2026, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
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

// Reproduction test for GitHub issue #152:
// "ICP log viewer is not showing error messages" when the error field is a complex object.

import ballerina/test;

// Simulates an OpenSearch _source document that contains a complex 'error' field
// (a JSON object, not a plain string), as emitted by Ballerina runtimes.
@test:Config {}
function testConstructLogEntryIncludesComplexErrorField() {
    // This is the raw JSON that OpenSearch would return in hit._source for a BI log line like:
    // time=2026-03-13T09:23:35.946+05:30 level=ERROR module=ballerinax/wso2.icp
    //   message="Heartbeat response error"
    //   error={"causes":[{"message":"Connection refused: localhost/127.0.0.1:9445","detail":{},"stackTrace":[]}],
    //          "message":"Something wrong with the connection","detail":{},"stackTrace":[]}
    //   icp.runtimeId="musicforweather"
    json sourceJson = {
        "time": "2026-03-13T09:23:35.946+05:30",
        "level": "ERROR",
        "module": "ballerinax/wso2.icp",
        "message": "Heartbeat response error",
        "error": "{\"causes\":[{\"message\":\"Connection refused: localhost/127.0.0.1:9445\",\"detail\":{},\"stackTrace\":[]}],\"message\":\"Something wrong with the connection\",\"detail\":{},\"stackTrace\":[]}",
        "service_type": "ballerina",
        "icp_runtimeId": "musicforweather"
    };

    // In Ballerina, LogSource is an open record so the 'error' field is preserved during cloneWithType.
    LogSource|error sourceData = sourceJson.cloneWithType(LogSource);
    test:assertTrue(sourceData is LogSource, "LogSource cloneWithType should succeed");

    if sourceData is LogSource {
        // Verify the 'error' field IS present in the open record via dynamic field access
        anydata errorField = sourceData["error"];
        test:assertNotEquals(errorField, (), msg = "The 'error' field should be preserved in the open LogSource record");

        // Now construct the log entry (this is what the ICP backend sends to the frontend)
        string logEntry = constructLogEntry(sourceData);

        // REGRESSION CHECK: the log entry must contain the error information.
        // This assertion FAILS before the fix, demonstrating the bug.
        test:assertTrue(
            logEntry.includes("error=") || logEntry.includes("Connection refused"),
            msg = string `Bug #152: constructLogEntry drops the 'error' field. Actual output: '${logEntry}'`
        );
    }
}

// Verify that a simple non-error log entry still works correctly (regression guard).
@test:Config {}
function testConstructLogEntrySimpleMessage() {
    json sourceJson = {
        "time": "2026-03-13T09:00:00.000+05:30",
        "level": "INFO",
        "module": "ballerinax/wso2.icp",
        "message": "Service started successfully",
        "service_type": "ballerina",
        "icp_runtimeId": "myruntime"
    };

    LogSource|error sourceData = sourceJson.cloneWithType(LogSource);
    test:assertTrue(sourceData is LogSource, "LogSource cloneWithType should succeed");

    if sourceData is LogSource {
        string logEntry = constructLogEntry(sourceData);
        test:assertTrue(logEntry.includes("Service started successfully"), "Log entry should contain message");
        test:assertTrue(logEntry.includes("level=INFO"), "Log entry should contain level");
        test:assertTrue(logEntry.includes("myruntime"), "Log entry should contain runtimeId");
        // Known fields must NOT appear as duplicates in extraFields
        test:assertFalse(logEntry.includes("service_type="), "Known field service_type must not appear as extra field");
    }
}

// Verify that multiple unknown fields (e.g. error, errorCode, httpStatus) all appear in output.
@test:Config {}
function testConstructLogEntryMultipleExtraFields() {
    json sourceJson = {
        "time": "2026-03-13T10:00:00.000+05:30",
        "level": "ERROR",
        "module": "ballerinax/wso2.icp",
        "message": "Request failed",
        "service_type": "ballerina",
        "icp_runtimeId": "testruntime",
        "error": "Connection refused",
        "errorCode": "ERR_CONN_REFUSED",
        "httpStatus": "503"
    };

    LogSource|error sourceData = sourceJson.cloneWithType(LogSource);
    test:assertTrue(sourceData is LogSource, "LogSource cloneWithType should succeed");

    if sourceData is LogSource {
        string logEntry = constructLogEntry(sourceData);
        test:assertTrue(logEntry.includes("error=Connection refused"), "Log entry must include 'error' extra field");
        test:assertTrue(logEntry.includes("errorCode=ERR_CONN_REFUSED"), "Log entry must include 'errorCode' extra field");
        test:assertTrue(logEntry.includes("httpStatus=503"), "Log entry must include 'httpStatus' extra field");
        // Known fields must not be duplicated
        test:assertFalse(logEntry.includes("service_type="), "Known field service_type must not appear as extra field");
    }
}

// Verify that null/empty extra fields are not appended to the log entry.
@test:Config {}
function testConstructLogEntrySkipsEmptyExtraFields() {
    json sourceJson = {
        "time": "2026-03-13T11:00:00.000+05:30",
        "level": "WARN",
        "module": "ballerinax/wso2.icp",
        "message": "Something happened",
        "service_type": "ballerina",
        "icp_runtimeId": "testruntime",
        "emptyField": ""
    };

    LogSource|error sourceData = sourceJson.cloneWithType(LogSource);
    test:assertTrue(sourceData is LogSource, "LogSource cloneWithType should succeed");

    if sourceData is LogSource {
        string logEntry = constructLogEntry(sourceData);
        test:assertFalse(logEntry.includes("emptyField="), "Empty extra fields must not appear in log entry");
    }
}
