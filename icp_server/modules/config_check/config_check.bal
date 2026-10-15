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

// Fails startup when a config source the runtime would only warn about and drop is not valid TOML.

const CONFIG_FILES_ENV = "BAL_CONFIG_FILES";
const CONFIG_DATA_ENV = "BAL_CONFIG_DATA";
const DEFAULT_CONFIG_FILE = "Config.toml";
// Only on the classpath under `bal test`, which reads tests/Config.toml instead of these sources.
const TEST_RUNNER_CLASS = "org.ballerinalang.test.runtime.BTestMain";

function init() returns error? {
    if loadClass(java:fromString(TEST_RUNNER_CLASS)) is error {
        check validateConfigSources();
    }
}

// Same source selection as LaunchUtils.populateConfigDetails; a set but empty variable still counts.
function validateConfigSources() returns error? {
    string? configFiles = getEnv(CONFIG_FILES_ENV);
    if configFiles is string {
        return validateConfigFiles(configFiles);
    }
    string? configData = getEnv(CONFIG_DATA_ENV);
    if configData is string {
        return validateConfigData(configData);
    }
    if check file:test(DEFAULT_CONFIG_FILE, file:EXISTS) {
        return validateConfigFile(DEFAULT_CONFIG_FILE);
    }
}

# Fails if any entry in `configFiles`, as given in BAL_CONFIG_FILES, is empty or not a valid TOML file.
#
# + configFiles - path list, split the way the runtime splits it
# + return - an error describing the first problem, or `()` if every file parses cleanly
function validateConfigFiles(string configFiles) returns error? {
    string[] paths = splitPathList(configFiles);
    // A separator-only value splits to nothing, which would leave the runtime on defaults.
    if paths.length() == 0 {
        return error(string `${CONFIG_FILES_ENV} names no configuration file: "${configFiles}"`);
    }
    foreach string path in paths {
        if path.trim() == "" {
            return error(string `${CONFIG_FILES_ENV} contains an empty entry: "${configFiles}"`);
        }
        check validateConfigFile(path);
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
    return checkDiagnostics(toml, path, true);
}

# Fails if `content`, as given in BAL_CONFIG_DATA, is not valid TOML.
#
# + content - TOML text
# + return - an error describing the problem, or `()` if the content parses cleanly
function validateConfigData(string content) returns error? {
    string cleaned = cleanConfigData(content);
    if cleaned == "" {
        return;
    }
    return checkDiagnostics(readTomlString(java:fromString(cleaned), java:fromString(CONFIG_DATA_ENV)),
            CONFIG_DATA_ENV, false);
}

// Same rewrite as TomlContentProvider.cleanContent: literal \n, \r and \t outside quoted values.
function cleanConfigData(string content) returns string {
    handle withLineBreaks = stringReplaceAll(java:fromString(content),
            java:fromString(string `\\n(?=(?:[^"]*"[^"]*")*[^"]*$)`), lineSeparator());
    handle cleaned = stringReplaceAll(withLineBreaks,
            java:fromString(string `(\\r|\\t)(?=(?:[^"]*"[^"]*")*[^"]*$)`), java:fromString(""));
    return java:toString(cleaned) ?: "";
}

function checkDiagnostics(handle toml, string origin, boolean isFile) returns error? {
    handle diagnostics = tomlDiagnostics(toml);
    int count = listSize(diagnostics);
    if count == 0 {
        return;
    }
    string details = "";
    boolean startsAtFirstChar = false;
    foreach int i in 0 ..< count {
        handle diagnostic = listGet(diagnostics, i);
        handle startLine = lineRangeStartLine(locationLineRange(diagnosticLocation(diagnostic)));
        // LinePosition is zero-based; report it one-based, as editors and the runtime do.
        int line = linePositionLine(startLine) + 1;
        int column = linePositionOffset(startLine) + 1;
        if i == 0 {
            startsAtFirstChar = line == 1 && column == 1;
        }
        details += string `${"\n"}  line ${line}, column ${column}: `
            + (java:toString(diagnosticMessage(diagnostic)) ?: "");
    }
    string bomHint = isFile && startsAtFirstChar
        ? " (a UTF-8 byte-order mark at the start of the file also causes this; save it as UTF-8 without BOM)"
        : "";
    return error(string `Configuration in ${origin} is not valid TOML, so ICP will not start on default `
        + string `settings in its place. Fix the following and restart${bomHint}:${details}`);
}

// String.split, as the runtime uses: keeps leading and interior empty entries, drops trailing ones.
function splitPathList(string paths) returns string[] {
    handle entries = arrayAsList(stringSplit(java:fromString(paths), patternQuote(pathSeparator())));
    string[] result = [];
    foreach int i in 0 ..< listSize(entries) {
        result.push(java:toString(listGet(entries, i)) ?: "");
    }
    return result;
}

// System.getenv, unlike os:getEnv, tells an unset variable (null) apart from an empty one.
function getEnv(string name) returns string? => java:toString(systemGetenv(java:fromString(name)));

function systemGetenv(handle name) returns handle = @java:Method {
    name: "getenv",
    'class: "java.lang.System",
    paramTypes: ["java.lang.String"]
} external;

function lineSeparator() returns handle = @java:Method {
    name: "lineSeparator",
    'class: "java.lang.System"
} external;

function stringReplaceAll(handle value, handle regex, handle replacement) returns handle = @java:Method {
    name: "replaceAll",
    'class: "java.lang.String"
} external;

function stringSplit(handle value, handle regex) returns handle = @java:Method {
    name: "split",
    'class: "java.lang.String",
    paramTypes: ["java.lang.String"]
} external;

function patternQuote(handle value) returns handle = @java:Method {
    name: "quote",
    'class: "java.util.regex.Pattern"
} external;

function arrayAsList(handle array) returns handle = @java:Method {
    name: "asList",
    'class: "java.util.Arrays",
    paramTypes: [{'class: "java.lang.Object", dimensions: 1}]
} external;

function loadClass(handle name) returns handle|error = @java:Method {
    name: "forName",
    'class: "java.lang.Class",
    paramTypes: ["java.lang.String"]
} external;

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
