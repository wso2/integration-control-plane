// Copyright (c) 2026, WSO2 Inc. (http://www.wso2.org)
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

// Package: mi_management
//
// The WSO2 MI Management API's vocabulary: which path answers which question, and how its
// answer becomes an ICP type. Nothing here dials anything — the ICP reaches a runtime one
// way only, through `mi_access.bal`, which may dial the management port or ride the
// heartbeat depending on the deployment. Keeping the vocabulary apart from the transport is
// what lets both be served by the same resolvers.

import ballerina/http;
import ballerina/log;
import ballerina/url;

import wso2/icp_server.types;

const string MGMT_API_PATH = "/management";

const string CONTENT_TYPE_XML = "application/xml";

// Artifact type constants
public const string ARTIFACT_TYPE_API = "api";
public const string ARTIFACT_TYPE_PROXY_SERVICE = "proxy-service";
public const string ARTIFACT_TYPE_ENDPOINT = "endpoint";
public const string ARTIFACT_TYPE_SEQUENCE = "sequence";
public const string ARTIFACT_TYPE_TASK = "task";
public const string ARTIFACT_TYPE_LOCAL_ENTRY = "local-entry";
public const string ARTIFACT_TYPE_MESSAGE_STORE = "message-store";
public const string ARTIFACT_TYPE_MESSAGE_PROCESSOR = "message-processor";
public const string ARTIFACT_TYPE_INBOUND_ENDPOINT = "inbound-endpoint";
public const string ARTIFACT_TYPE_TEMPLATE = "template";
public const string ARTIFACT_TYPE_DATA_SERVICE = "data-service";
public const string ARTIFACT_TYPE_DATA_SOURCE = "data-source";

// ============================================================
// Paths
// ============================================================

isolated function apiPath(string apiName) returns string|error =>
    string `${MGMT_API_PATH}/apis?apiName=${check encode(apiName)}`;

isolated function proxyServicePath(string proxyServiceName) returns string|error =>
    string `${MGMT_API_PATH}/proxy-services?proxyServiceName=${check encode(proxyServiceName)}`;

isolated function endpointPath(string endpointName) returns string|error =>
    string `${MGMT_API_PATH}/endpoints?endpointName=${check encode(endpointName)}`;

isolated function sequencePath(string sequenceName) returns string|error =>
    string `${MGMT_API_PATH}/sequences?sequenceName=${check encode(sequenceName)}`;

isolated function taskPath(string taskName) returns string|error =>
    string `${MGMT_API_PATH}/tasks?taskName=${check encode(taskName)}`;

isolated function localEntryPath(string entryName) returns string|error =>
    string `${MGMT_API_PATH}/local-entries?name=${check encode(entryName)}`;

isolated function messageStorePath(string storeName) returns string|error =>
    string `${MGMT_API_PATH}/message-stores?name=${check encode(storeName)}`;

isolated function messageProcessorPath(string processorName) returns string|error =>
    string `${MGMT_API_PATH}/message-processors?name=${check encode(processorName)}`;

isolated function inboundEndpointPath(string inboundName) returns string|error =>
    string `${MGMT_API_PATH}/inbound-endpoints?inboundEndpointName=${check encode(inboundName)}`;

isolated function templatePath(string templateName, string templateType) returns string|error =>
    string `${MGMT_API_PATH}/templates?name=${check encode(templateName)}&type=${check encode(templateType)}`;

isolated function dataServicePath(string dataServiceName) returns string|error =>
    string `${MGMT_API_PATH}/data-services?dataServiceName=${check encode(dataServiceName)}`;

isolated function dataSourcePath(string dataSourceName) returns string|error =>
    string `${MGMT_API_PATH}/data-sources?name=${check encode(dataSourceName)}`;

# The management path that describes one artifact.
#
# + templateType - Templates are named by type as well, and MI answers 404 without it
public isolated function artifactPath(string artifactType, string artifactName,
        string? templateType = ()) returns string|error {
    if artifactType == ARTIFACT_TYPE_API {
        return apiPath(artifactName);
    } else if artifactType == ARTIFACT_TYPE_PROXY_SERVICE {
        return proxyServicePath(artifactName);
    } else if artifactType == ARTIFACT_TYPE_ENDPOINT {
        return endpointPath(artifactName);
    } else if artifactType == ARTIFACT_TYPE_SEQUENCE {
        return sequencePath(artifactName);
    } else if artifactType == ARTIFACT_TYPE_TASK {
        return taskPath(artifactName);
    } else if artifactType == ARTIFACT_TYPE_LOCAL_ENTRY {
        return localEntryPath(artifactName);
    } else if artifactType == ARTIFACT_TYPE_MESSAGE_STORE {
        return messageStorePath(artifactName);
    } else if artifactType == ARTIFACT_TYPE_MESSAGE_PROCESSOR {
        return messageProcessorPath(artifactName);
    } else if artifactType == ARTIFACT_TYPE_INBOUND_ENDPOINT {
        return inboundEndpointPath(artifactName);
    } else if artifactType == ARTIFACT_TYPE_TEMPLATE {
        if templateType is () {
            return error("Template artifact type requires 'templateType' parameter to be specified");
        }
        return templatePath(artifactName, templateType);
    } else if artifactType == ARTIFACT_TYPE_DATA_SERVICE {
        return dataServicePath(artifactName);
    } else if artifactType == ARTIFACT_TYPE_DATA_SOURCE {
        return dataSourcePath(artifactName);
    }
    return error(string `Unsupported artifact type for MI management API: ${artifactType}`);
}

public isolated function loggersPath() returns string => MGMT_API_PATH + "/logging";

public isolated function loggerPath(string loggerName) returns string|error =>
    string `${MGMT_API_PATH}/logging?loggerName=${check encode(loggerName)}`;

public isolated function usersPath() returns string => MGMT_API_PATH + "/users";

public isolated function userPath(string username, string domain = "primary") returns string|error {
    string path = string `${MGMT_API_PATH}/users/${check encode(username)}`;
    return domain == "primary" ? path : string `${path}?domain=${check encode(domain)}`;
}

public isolated function logFilesPath(string? searchKey = ()) returns string|error {
    if searchKey is () || searchKey.trim() == "" {
        return MGMT_API_PATH + "/logs";
    }
    return string `${MGMT_API_PATH}/logs?searchKey=${check encode(searchKey)}`;
}

public isolated function logFilePath(string fileName) returns string|error =>
    string `${MGMT_API_PATH}/logs?file=${check encode(fileName)}`;

public isolated function registryPath(string path) returns string|error =>
    string `${MGMT_API_PATH}/registry-resources?path=${check encode(path)}`;

# + kind - `content`, `metadata` or `properties`
public isolated function registrySubPath(string kind, string path) returns string|error =>
    string `${MGMT_API_PATH}/registry-resources/${kind}?path=${check encode(path)}`;

public isolated function compositeAppFaultPath(string appName) returns string|error =>
    string `${MGMT_API_PATH}/applications/${check encode(appName)}/fault`;

public isolated function dataServiceFaultPath(string serviceName) returns string|error =>
    string `${MGMT_API_PATH}/data-services/${check encode(serviceName)}/fault`;

isolated function encode(string value) returns string|error => url:encode(value, "UTF-8");

// ============================================================
// Projections
// ============================================================

// Artifact types that carry their synapse configuration i.e. their source
type ArtifactWithConfig record {
    string configuration?;
};

# The named artifact's synapse configuration, or its full metadata when it has none.
public isolated function artifactSource(json artifact) returns string|error {
    ArtifactWithConfig described = check artifact.cloneWithType();
    string? configuration = described.configuration;
    return configuration is string && configuration.length() > 0
        ? configuration : artifact.toJsonString();
}

public isolated function registryDirectory(json answer) returns types:RegistryDirectoryResponse|error {
    MgmtRegistryDirectoryResponse listing = check answer.cloneWithType();
    types:RegistryDirectoryItem[] items = from MgmtRegistryFileItem item in listing.list
        select {
            name: item.name,
            mediaType: item.mediaType,
            isDirectory: item.mediaType == "directory",
            properties: from MgmtRegistryProperty property in item.properties
                select {name: property.name, value: property.value}
        };
    return {count: listing.count, items};
}

public isolated function registryMetadata(json answer) returns types:RegistryResourceMetadata|error {
    MgmtRegistryMetadataResponse metadata = check answer.cloneWithType();
    return {name: metadata.name, mediaType: metadata.mediaType};
}

# A registry resource's properties.
#
# MI reports "no such resource" by putting its complaint in `list` where the array belongs,
# which reads as a resource without properties rather than as a failure — the registry
# browser shows an empty Properties tab and stays usable.
public isolated function registryProperties(json answer) returns types:RegistryPropertiesResponse|error {
    json list = check answer.list;
    if list is string {
        log:printDebug("MI returned an error for registry properties", errorMessage = list);
        return {count: 0, properties: []};
    }
    MgmtRegistryPropertiesResponse described = check answer.cloneWithType();
    return {
        count: described.count,
        properties: from MgmtRegistryProperty property in described.list
            select {name: property.name, value: property.value}
    };
}

# The stack trace a faulty deployment left behind.
#
# + subject - What faulted, for the message when nothing was recorded
public isolated function faultStackTrace(json answer, string subject) returns string|error {
    MgmtFaultResponse fault = check answer.cloneWithType();
    string? stackTrace = fault?.faultStackTrace;
    if stackTrace is () || stackTrace.trim().length() == 0 {
        return error(string `No fault stack trace available for: ${subject}`);
    }
    return stackTrace;
}

// ============================================================
// WSDL
// ============================================================

# Fetches a proxy service's WSDL from the URL the management API reported for it.
#
# That URL is on MI's service port (e.g. `:8290`), not its management port, so this is a
# separate dial and not a management call at all.
#
# Security: the URL's host is replaced with the trusted management hostname before use. MI
# reports its own configured hostname, which may differ from the one the ICP reaches it by,
# and honouring it would let a runtime's configuration point the ICP at any host it liked.
public isolated function fetchWsdlContent(string wsdlUrl, string trustedHost, boolean allowInsecureTLS) returns string|error {
    log:printInfo("Fetching WSDL content", wsdlUrl = wsdlUrl, trustedHost = trustedHost);
    int? schemeEndPos = wsdlUrl.indexOf("://");
    if schemeEndPos is () {
        return error(string `Invalid WSDL URL (missing scheme): ${wsdlUrl}`);
    }

    // Validate scheme is http or https only
    string scheme = wsdlUrl.substring(0, schemeEndPos);
    if scheme != "http" && scheme != "https" {
        return error(string `Invalid WSDL URL scheme '${scheme}' (only http/https allowed): ${wsdlUrl}`);
    }

    int? pathStartPos = wsdlUrl.indexOf("/", schemeEndPos + 3);
    if pathStartPos is () {
        return error(string `Invalid WSDL URL (no path component): ${wsdlUrl}`);
    }

    // Extract host:port from URL, then pull out only the port.
    // We discard the host from the URL and substitute trustedHost (SSRF protection).
    string hostAndPort = wsdlUrl.substring(schemeEndPos + 3, pathStartPos);

    // Reject userinfo (e.g. user:pass@host) in the authority to prevent it being
    // misinterpreted as part of the port or host.
    if hostAndPort.indexOf("@") is int {
        return error(string `Invalid WSDL URL (userinfo not allowed in authority): ${wsdlUrl}`);
    }

    string urlPort;
    if hostAndPort.startsWith("[") {
        // IPv6 literal: check for port after closing bracket, e.g. "[::1]:8290"
        int? ipv6EndPos = hostAndPort.indexOf("]");
        if ipv6EndPos is () {
            return error(string `Invalid WSDL URL (unterminated IPv6 host): ${wsdlUrl}`);
        }
        string afterBracket = hostAndPort.substring(ipv6EndPos + 1);
        urlPort = afterBracket.startsWith(":") ? afterBracket.substring(1) : "";
    } else {
        // IPv4 or hostname: extract port if present
        int? portSeparatorPos = hostAndPort.indexOf(":");
        urlPort = portSeparatorPos is () ? "" : hostAndPort.substring(portSeparatorPos + 1);
    }

    // Validate the extracted port is either absent or a numeric value in range 1–65535.
    if urlPort != "" {
        int|error portNum = int:fromString(urlPort);
        if portNum is error || portNum < 1 || portNum > 65535 {
            return error(string `Invalid WSDL URL (invalid port '${urlPort}'): ${wsdlUrl}`);
        }
    }

    // Build the fetch URL using the trusted management hostname but keeping the original port and path.
    string trustedHostAndPort = urlPort == "" ? trustedHost : string `${trustedHost}:${urlPort}`;
    string wsdlBaseUrl = string `${scheme}://${trustedHostAndPort}`;
    string wsdlPath = wsdlUrl.substring(pathStartPos);

    log:printInfo("WSDL URL host replaced for security", originalUrl = wsdlUrl, trustedBaseUrl = wsdlBaseUrl);

    http:Client wsdlClient = check (allowInsecureTLS
        ? new (wsdlBaseUrl, {secureSocket: {enable: false}})
        : new (wsdlBaseUrl));

    http:Response wsdlResp = check wsdlClient->get(wsdlPath, {"Accept": CONTENT_TYPE_XML});
    if wsdlResp.statusCode != http:STATUS_OK {
        string|error errPayload = wsdlResp.getTextPayload();
        string errMsg = errPayload is string ? errPayload : "Unknown error";
        return error(string `WSDL content fetch returned status ${wsdlResp.statusCode}: ${errMsg}`);
    }
    return wsdlResp.getTextPayload();
}
