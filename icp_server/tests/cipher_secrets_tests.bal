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
import icp_server.utils;

// Test: only string entries of the top-level [secrets] table are read, in the layout the cipher tool writes
@test:Config {
    groups: ["utils"]
}
function testParseTopLevelSecretsReadsOnlySecretsTable() returns error? {
    string content = string `
frontendJwtHMACSecret = "$secret{secretJWTsecret}"

[icp_server.storage]
dbPassword = "$secret{secDbPassword}"
secDbPassword = "not-in-secrets-table"

[icp_server.storage.secrets]
other = "also-not-in-secrets-table"

[ secrets ]  # encrypted by ciphertool
# secretJWTsecret = "commented-out"
secretJWTsecret = "I1Jub+jHG/hy0=="
'secDbPassword' = 'bGl0ZXJhbA==' # trailing comment
notAString = 42

[[ballerina.log.modules]]
name = "wso2/icp_server"
`;
    map<string> secrets = check utils:parseTopLevelSecrets(content);
    test:assertEquals(secrets, {secretJWTsecret: "I1Jub+jHG/hy0==", secDbPassword: "bGl0ZXJhbA=="});
}

// Test: every TOML string form is decoded to its value
@test:Config {
    groups: ["utils"]
}
function testParseTopLevelSecretsDecodesTomlStrings() returns error? {
    string content = string `
[secrets]
multiLineBasic = """QUJD"""
multiLineLiteral = '''REVG'''
escaped = "QU\u004AD\"x\\y"
`;
    map<string> secrets = check utils:parseTopLevelSecrets(content);
    test:assertEquals(secrets, {multiLineBasic: "QUJD", multiLineLiteral: "REVG", escaped: "QUJD\"x\\y"});
}

// Test: no [secrets] table yields an empty map
@test:Config {
    groups: ["utils"]
}
function testParseTopLevelSecretsWithoutTable() returns error? {
    test:assertEquals(check utils:parseTopLevelSecrets("[icp_server.secrets]\na = \"b\"\n"), {});
}

// Test: only "$secret{alias}" values are treated as aliases
@test:Config {
    groups: ["utils"]
}
function testIsSecretAlias() {
    test:assertTrue(utils:isSecretAlias("$secret{secDbPassword}"));
    test:assertFalse(utils:isSecretAlias("plain-password"));
    test:assertFalse(utils:isSecretAlias("$secret{unterminated"));
}
