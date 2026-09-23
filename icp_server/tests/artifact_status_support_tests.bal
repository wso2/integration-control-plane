// Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
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

import ballerina/test;
import icp_server.storage;

// The five MI artifact types whose management API accepts a status change.
@test:Config {
    groups: ["artifact-status-support"]
}
function testStatusChangeSupportedTypes() {
    string[] supported = [
        "proxy-service",
        "endpoint",
        "message-processor",
        "task",
        "inbound-endpoint"
    ];
    foreach string artifactType in supported {
        test:assertTrue(storage:supportsStatusChange(artifactType),
                string `'${artifactType}' supports a status change and must be accepted`);
    }
}

// api and sequence expose only trace/statistics, and template exposes neither. Dispatching a
// status change for these reports SUCCESS while MI rejects it, so they must be refused up front.
@test:Config {
    groups: ["artifact-status-support"]
}
function testStatusChangeUnsupportedTypes() {
    string[] unsupported = ["api", "sequence", "template"];
    foreach string artifactType in unsupported {
        test:assertFalse(storage:supportsStatusChange(artifactType),
                string `'${artifactType}' does not support a status change and must be rejected`);
    }
}

// An artifact type that is not a management-API type at all must also be refused, rather than
// falling through to a dispatch that silently does nothing.
@test:Config {
    groups: ["artifact-status-support"]
}
function testStatusChangeRejectsUnknownType() {
    test:assertFalse(storage:supportsStatusChange("not-an-artifact-type"),
            "An unknown artifact type must be rejected");
    test:assertFalse(storage:supportsStatusChange(""),
            "An empty artifact type must be rejected");
}

// getManagementPath lowercases and trims before matching, so the predicate must agree.
@test:Config {
    groups: ["artifact-status-support"]
}
function testStatusChangeSupportIsCaseAndSpaceInsensitive() {
    test:assertTrue(storage:supportsStatusChange("  Proxy-Service  "),
            "Surrounding space and mixed case must not change the verdict for a supported type");
    test:assertFalse(storage:supportsStatusChange("  API  "),
            "Surrounding space and mixed case must not change the verdict for an unsupported type");
}

// Normalization is what the resolver persists and echoes back, so it must reduce a type to the
// exact spelling getManagementPath matches on.
@test:Config {
    groups: ["artifact-status-support"]
}
function testNormalizeArtifactType() {
    test:assertEquals(storage:normalizeArtifactType("  Proxy-Service  "), "proxy-service",
            "Normalization should trim and lowercase");
    test:assertEquals(storage:normalizeArtifactType("API"), "api",
            "Normalization should lowercase");
    test:assertEquals(storage:normalizeArtifactType("proxy-service"), "proxy-service",
            "An already-canonical type should be unchanged");
}

// The rejection message names the types a caller can actually use.
@test:Config {
    groups: ["artifact-status-support"]
}
function testStatusChangeSupportedTypesText() {
    string listed = storage:statusChangeSupportedTypes();
    foreach string artifactType in ["proxy-service", "endpoint", "message-processor", "task",
            "inbound-endpoint"] {
        test:assertTrue(listed.includes(artifactType),
                string `The supported-type list should name '${artifactType}', got: ${listed}`);
    }
    test:assertFalse(listed.includes("template"),
            string `The supported-type list must not name 'template', got: ${listed}`);
}

// The message and the accept/reject decision must not be able to disagree: every type the
// message names must be accepted, and no type it omits may be. This is what stops the listed
// set going stale if the management-path match arms change.
@test:Config {
    groups: ["artifact-status-support"]
}
function testSupportedTypesTextAgreesWithDecision() {
    string listed = storage:statusChangeSupportedTypes();
    string[] namedTypes = re `,\s*`.split(listed);
    foreach string artifactType in namedTypes {
        test:assertTrue(storage:supportsStatusChange(artifactType),
                string `The message names '${artifactType}' but it is not accepted`);
    }
    string[] allKnownTypes = [
        "proxy-service",
        "endpoint",
        "message-processor",
        "task",
        "inbound-endpoint",
        "api",
        "template",
        "sequence"
    ];
    foreach string artifactType in allKnownTypes {
        if storage:supportsStatusChange(artifactType) {
            test:assertTrue(namedTypes.indexOf(artifactType) is int,
                    string `'${artifactType}' is accepted but the message does not name it`);
        }
    }
}
