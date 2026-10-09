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

import ballerina/crypto;
import ballerina/file;
import ballerina/os;
import ballerina/lang.array;
import ballerina/log;

const string CIPHER_SECRET_PREFIX = "$secret{";
const string CIPHER_SECRET_SUFFIX = "}";

// Cipher tool keystore configuration.
// This keystore is separate from the Ballerina TLS keystore (ballerinaKeystore.p12)
// and is used exclusively for encrypting/decrypting secrets via the WSO2 cipher tool.
configurable string cipherKeystorePath = check file:joinPath("..", "conf", "security", "keystore.p12");

// Password for the cipher keystore.
// Resolved at runtime: ICP_CIPHER_KEYSTORE_PASSWORD env var takes precedence over this configurable.
// One of the two must be set when encrypted secrets are present.
configurable string cipherKeystorePassword = "changeit";

// Password for the private key used for decrypting.
// Resolved at runtime: ICP_PRIVATE_KEY_PASSWORD env var takes precedence over this configurable.
// One of the two must be set when encrypted secrets are present.
configurable string cipherPrivateKeyPassword = "changeit";

// Alias of the private key entry in the cipher keystore.
// Defaults to "localhost" (the alias used by WSO2 default keystores).
// Override this when using a keystore with a different alias.
configurable string cipherKeystoreAlias = "localhost";

final string resolvedKeystorePassword = check resolvePassword(
        "ICP_CIPHER_KEYSTORE_PASSWORD", cipherKeystorePassword,
        "Cipher keystore password is not configured.");

final string resolvedPrivateKeyPassword = check resolvePassword(
        "ICP_PRIVATE_KEY_PASSWORD", cipherPrivateKeyPassword,
        "Cipher private key password is not configured.");

function resolvePassword(string envVar, string fallback, string errorMsg) returns string|error {
    string val = os:getEnv(envVar);
    if val == "" {
        val = fallback;
    }
    if val == "" {
        return error(errorMsg);
    }
    return val;
}

// Resolves a configurable value that may reference an encrypted secret.
// If configValue matches "$secret{alias}", looks up alias in secrets, decrypts, and returns the plaintext.
public isolated function resolveConfig(string configValue, map<string> secrets) returns string|error {
    if configValue.startsWith(CIPHER_SECRET_PREFIX) && configValue.endsWith(CIPHER_SECRET_SUFFIX) {
        string alias = configValue.substring(CIPHER_SECRET_PREFIX.length(), configValue.length() - CIPHER_SECRET_SUFFIX.length());
        string? encrypted = secrets[alias];
        if encrypted is () {
            log:printError("Secret alias '${alias}' not found in secrets table.");
            return error(string `Secret alias '${alias}' not found in secrets table.`);
        }
        string decryptedValue = check decrypt(encrypted);
        log:printDebug(string `Successfully decrypted the value for alias '${alias}'.`);
        return decryptedValue;
    }
    return configValue;
}

// Decrypts a value encrypted by the WSO2 cipher tool using asymmetric RSA/ECB/OAEPwithSHA1andMGF1Padding.
// Returns an error if decryption fails (including if the value is not a valid encrypted secret).
public isolated function decrypt(string encryptedValue) returns string|error {
    crypto:KeyStore keyStore = {
        path: cipherKeystorePath,
        password: resolvedKeystorePassword
    };
    crypto:PrivateKey privateKey = check crypto:decodeRsaPrivateKeyFromKeyStore(keyStore, cipherKeystoreAlias, resolvedPrivateKeyPassword);
    byte[] encryptedBytes = check array:fromBase64(encryptedValue);
    byte[] decryptedBytes = check crypto:decryptRsaEcb(encryptedBytes, privateKey, crypto:OAEPWithSHA1AndMGF1);
    return check string:fromBytes(decryptedBytes);
}
