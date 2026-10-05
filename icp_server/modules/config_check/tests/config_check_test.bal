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

function writeTempToml(byte[] content) returns string|error {
    string path = check file:createTemp(".toml");
    check io:fileWriteBytes(path, content);
    return path;
}

@test:Config {}
function testValidFilePasses() returns error? {
    string path = check writeTempToml(VALID_TOML.toBytes());
    test:assertEquals(validateConfigFile(path), ());
    check file:remove(path);
}

@test:Config {}
function testMissingClosingQuoteFails() returns error? {
    string path = check writeTempToml(re `"INFO"`.replace(VALID_TOML, "\"INFO").toBytes());
    error? result = validateConfigFile(path);
    if result !is error {
        test:assertFail("a missing closing quote must fail validation");
    }
    // The parser reports an unterminated string where it gives up: the start of the next line.
    test:assertTrue(result.message().includes("line 3, column 1"), result.message());
    test:assertTrue(result.message().includes("missing double quote"), result.message());
    check file:remove(path);
}

@test:Config {}
function testByteOrderMarkFails() returns error? {
    byte[] content = [0xEF, 0xBB, 0xBF];
    content.push(...VALID_TOML.toBytes());
    string path = check writeTempToml(content);
    error? result = validateConfigFile(path);
    if result !is error {
        test:assertFail("a UTF-8 byte-order mark must fail validation");
    }
    test:assertTrue(result.message().includes("line 1, column 1"), result.message());
    check file:remove(path);
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
    test:assertTrue(validateConfigFile(dir) is error, "a directory must fail validation");
    check file:remove(dir);
}

@test:Config {}
function testConfigData() {
    test:assertEquals(validateConfigData(VALID_TOML), ());
    test:assertTrue(validateConfigData("logLevel = \"INFO") is error);
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
}
