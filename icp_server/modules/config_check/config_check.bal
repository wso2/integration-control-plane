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

import ballerina/file;
import ballerina/jballerina.java;
import ballerina/os;

// The Ballerina runtime only warns when a config file it was given cannot be found, read or
// parsed, then drops the whole file and resolves every configurable to its default. A typo or a
// UTF-8 byte-order mark in conf/deployment.toml would bring ICP up on embedded H2 and default
// ports with nothing but a warning at the top of the log. This module re-checks the same config
// sources with the runtime's own TOML parser and fails startup instead. It must initialise before
// any module that acts on configuration, so it is imported by `utils`, which everything with
// startup side effects depends on.

const CONFIG_FILES_ENV = "BAL_CONFIG_FILES";
const CONFIG_DATA_ENV = "BAL_CONFIG_DATA";
const DEFAULT_CONFIG_FILE = "Config.toml";

function init() returns error? {
    check validateConfigSources();
}

// Mirrors the runtime's choice of config sources (LaunchUtils.populateConfigDetails):
// BAL_CONFIG_FILES if set, else BAL_CONFIG_DATA if set, else ./Config.toml if it exists.
function validateConfigSources() returns error? {
    string configFiles = os:getEnv(CONFIG_FILES_ENV);
    if configFiles != "" {
        foreach string path in splitPathList(configFiles) {
            check validateConfigFile(path);
        }
        return;
    }
    string configData = os:getEnv(CONFIG_DATA_ENV);
    if configData != "" {
        return validateConfigData(configData);
    }
    if check file:test(DEFAULT_CONFIG_FILE, file:EXISTS) {
        return validateConfigFile(DEFAULT_CONFIG_FILE);
    }
}

# Fails if the file at `path` is missing, unreadable or not valid TOML.
#
# + path - path to a TOML config file
# + return - an error describing the problem, or `()` if the file parses cleanly
function validateConfigFile(string path) returns error? {
    if !check file:test(path, file:EXISTS) {
        return error(string `Configuration file not found: ${path}`);
    }
    handle|error toml = readTomlFile(newFile(java:fromString(path)));
    if toml is error {
        return error(string `Cannot read configuration file ${path}: ${toml.message()}`);
    }
    return checkDiagnostics(toml, path);
}

# Fails if `content`, as given in BAL_CONFIG_DATA, is not valid TOML.
#
# + content - TOML text
# + return - an error describing the problem, or `()` if the content parses cleanly
function validateConfigData(string content) returns error? {
    return checkDiagnostics(readTomlString(java:fromString(content), java:fromString(CONFIG_DATA_ENV)),
            CONFIG_DATA_ENV);
}

function checkDiagnostics(handle toml, string origin) returns error? {
    handle diagnostics = tomlDiagnostics(toml);
    int count = listSize(diagnostics);
    if count == 0 {
        return;
    }
    string details = "";
    foreach int i in 0 ..< count {
        handle diagnostic = listGet(diagnostics, i);
        handle startLine = lineRangeStartLine(locationLineRange(diagnosticLocation(diagnostic)));
        // LinePosition is zero-based; report it one-based, as editors and the runtime do.
        details += string `${"\n"}  line ${linePositionLine(startLine) + 1}, column ${linePositionOffset(startLine) + 1}: `
            + (java:toString(diagnosticMessage(diagnostic)) ?: "");
    }
    return error(string `Configuration in ${origin} is not valid TOML, so ICP will not start on default `
        + string `settings in its place. Fix the following and restart (a UTF-8 byte-order mark at the start `
        + string `of the file also causes this; save it as UTF-8 without BOM):${details}`);
}

function splitPathList(string paths) returns string[] {
    string separator = java:toString(pathSeparator()) ?: ":";
    string[] result = [];
    string remaining = paths;
    while true {
        int? index = remaining.indexOf(separator);
        string entry = index is int ? remaining.substring(0, index) : remaining;
        if entry.trim() != "" {
            result.push(entry);
        }
        if index is () {
            return result;
        }
        remaining = remaining.substring(index + separator.length());
    }
}

function pathSeparator() returns handle = @java:FieldGet {
    name: "pathSeparator",
    'class: "java.io.File"
} external;

function newFile(handle path) returns handle = @java:Constructor {
    'class: "java.io.File",
    paramTypes: ["java.lang.String"]
} external;

function readTomlFile(handle file) returns handle|error {
    return readTomlPath(fileToPath(file));
}

function fileToPath(handle file) returns handle = @java:Method {
    name: "toPath",
    'class: "java.io.File"
} external;

function readTomlPath(handle path) returns handle|error = @java:Method {
    name: "read",
    'class: "io.ballerina.toml.api.Toml",
    paramTypes: ["java.nio.file.Path"]
} external;

function readTomlString(handle content, handle fileName) returns handle = @java:Method {
    name: "read",
    'class: "io.ballerina.toml.api.Toml",
    paramTypes: ["java.lang.String", "java.lang.String"]
} external;

function tomlDiagnostics(handle toml) returns handle = @java:Method {
    name: "diagnostics",
    'class: "io.ballerina.toml.api.Toml"
} external;

function listSize(handle list) returns int = @java:Method {
    name: "size",
    'class: "java.util.List"
} external;

function listGet(handle list, int index) returns handle = @java:Method {
    name: "get",
    'class: "java.util.List"
} external;

function diagnosticMessage(handle diagnostic) returns handle = @java:Method {
    name: "message",
    'class: "io.ballerina.tools.diagnostics.Diagnostic"
} external;

function diagnosticLocation(handle diagnostic) returns handle = @java:Method {
    name: "location",
    'class: "io.ballerina.tools.diagnostics.Diagnostic"
} external;

function locationLineRange(handle location) returns handle = @java:Method {
    name: "lineRange",
    'class: "io.ballerina.tools.diagnostics.Location"
} external;

function lineRangeStartLine(handle lineRange) returns handle = @java:Method {
    name: "startLine",
    'class: "io.ballerina.tools.text.LineRange"
} external;

function linePositionLine(handle linePosition) returns int = @java:Method {
    name: "line",
    'class: "io.ballerina.tools.text.LinePosition"
} external;

function linePositionOffset(handle linePosition) returns int = @java:Method {
    name: "offset",
    'class: "io.ballerina.tools.text.LinePosition"
} external;
