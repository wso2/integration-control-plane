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
import ballerina/io;
import ballerina/jballerina.java;
import ballerina/test;

const VALID_TOML = string `serverPort = 9446
logLevel = "INFO"

[icp_server.storage]
dbType = "mysql"
`;

// Validates `content` written to a temp file, removing the file before the caller asserts.
function validateTempToml(byte[] content) returns [error?]|error {
    string path = check file:createTemp(".toml");
    check io:fileWriteBytes(path, content);
    error? result = validateConfigFile(path);
    check file:remove(path);
    return [result];
}

@test:Config {}
function testValidFilePasses() returns error? {
    [error?] [result] = check validateTempToml(VALID_TOML.toBytes());
    test:assertEquals(result, ());
}

@test:Config {}
function testMissingClosingQuoteFails() returns error? {
    [error?] [result] = check validateTempToml(re `"INFO"`.replace(VALID_TOML, "\"INFO").toBytes());
    if result !is error {
        test:assertFail("a missing closing quote must fail validation");
    }
    // The parser reports an unterminated string where it gives up: the start of the next line.
    test:assertTrue(result.message().includes("line 3, column 1"), result.message());
    test:assertTrue(result.message().includes("missing double quote"), result.message());
    test:assertFalse(result.message().includes("byte-order mark"), result.message());
}

@test:Config {}
function testByteOrderMarkFails() returns error? {
    byte[] content = [0xEF, 0xBB, 0xBF];
    content.push(...VALID_TOML.toBytes());
    [error?] [result] = check validateTempToml(content);
    if result !is error {
        test:assertFail("a UTF-8 byte-order mark must fail validation");
    }
    test:assertTrue(result.message().includes("line 1, column 1"), result.message());
    test:assertTrue(result.message().includes("byte-order mark"), result.message());
}

@test:Config {}
function testMissingFileFails() returns error? {
    error? result = validateConfigFile("no-such-dir/deployment.toml");
    if result !is error {
        test:assertFail("a missing config file must fail validation");
    }
    test:assertTrue(result.message().includes("not found"), result.message());
}

@test:Config {}
function testDirectoryFails() returns error? {
    string dir = check file:createTempDir();
    error? result = validateConfigFile(dir);
    check file:remove(dir);
    test:assertTrue(result is error, "a directory must fail validation");
}

@test:Config {}
function testConfigData() {
    test:assertEquals(validateConfigData(VALID_TOML), ());
    error? result = validateConfigData("logLevel = \"INFO");
    if result !is error {
        test:assertFail("an unterminated string must fail validation");
    }
    // BAL_CONFIG_DATA is not a file, so the byte-order-mark hint does not apply.
    test:assertFalse(result.message().includes("byte-order mark"), result.message());
    test:assertEquals(validateConfigData(""), ());
}

@test:Config {}
function testConfigDataWithLiteralEscapes() {
    // One-line content as a container env var would carry it: literal backslash-n between
    // entries, and a stray literal backslash-t, both of which the runtime rewrites before parsing.
    string oneLine = string `serverPort = 9446\nlogLevel = "INFO"\t\n[icp_server.storage]\ndbType = "mysql"`;
    test:assertEquals(validateConfigData(oneLine), ());
    // Inside a quoted value the escape is left alone, as in the runtime.
    test:assertEquals(cleanConfigData(string `a = "x\ny"`), string `a = "x\ny"`);
}

@test:Config {}
function testSplitPathList() {
    string sep = java:toString(pathSeparator()) ?: ":";
    test:assertEquals(splitPathList(string `a.toml${sep}b.toml`), ["a.toml", "b.toml"]);
    test:assertEquals(splitPathList(string `a.toml${sep}${sep}`), ["a.toml"]);
    test:assertEquals(splitPathList(string `${sep}a.toml`), ["", "a.toml"]);
    test:assertEquals(splitPathList(string `a.toml${sep}${sep}b.toml`), ["a.toml", "", "b.toml"]);
    test:assertEquals(splitPathList(""), [""]);
}

@test:Config {}
function testEmptyConfigFilesEntryFails() returns error? {
    string sep = java:toString(pathSeparator()) ?: ":";
    string path = check file:createTemp(".toml");
    check io:fileWriteBytes(path, VALID_TOML.toBytes());
    error? valid = validateConfigFiles(path);
    error? empty = validateConfigFiles("");
    error? leadingEmpty = validateConfigFiles(string `${sep}${path}`);
    error? interiorEmpty = validateConfigFiles(string `${path}${sep}${sep}${path}`);
    check file:remove(path);
    test:assertEquals(valid, ());
    test:assertTrue(empty is error, "a set but empty BAL_CONFIG_FILES must fail validation");
    test:assertTrue(leadingEmpty is error, "a leading empty entry must fail validation");
    test:assertTrue(interiorEmpty is error, "an interior empty entry must fail validation");
}

@test:Config {}
function testCheckSkippedUnderTests() {
    // init() relies on this to skip the check during `bal test`.
    test:assertFalse(loadClass(java:fromString(TEST_RUNNER_CLASS)) is error);
}
