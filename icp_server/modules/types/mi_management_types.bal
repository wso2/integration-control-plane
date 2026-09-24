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


// MI Management API Response Types
// These types reflect what the MI Management REST API returns
// for single-artifact queries (name-filtered requests).
//   - /management     → operational metadata (status, URLs, etc.)

// GET /management/proxy-services?proxyServiceName={name}
public type MgmtProxyServiceInfo record {
    string name;
    string tracing?;
    string[] eprs?;
    string stats?;
    string configuration?;
    boolean isRunning?;
    string wsdl1_1?;
    string wsdl2_0?;
};

public type APIResourcesItem record {
    string[] methods;
    string url;
};

// GET /management/apis?apiName={name}
public type MgmtRestApiInfo record {
    string name;
    string tracing?;
    string stats?;
    int port?;
    string configuration?;
    string context?;
    APIResourcesItem[] resources?;
    string[] urlList?;
    string version?;
    string url?;
};

// GET /management/endpoints?endpointName={name}
public type MgmtEndpointInfo record {
    string name;
    string tracing?;
    string address?;
    string configuration?;
    string 'type?;
    boolean isActive?;
};

// GET /management/sequences?sequenceName={name}
public type MgmtSequenceInfo record {
    string name;
    string container?;
    string tracing?;
    string[] mediators?;
    string stats?;
    string configuration?;
};

// GET /management/tasks?taskName={name}
public type MgmtTaskInfo record {
    string name;
    string triggerInterval?;
    string configuration?;
    string implementation?;
    string triggerType?;
    string triggerCount?;
    map<string> properties?;
    string taskGroup?;
};

// GET /management/local-entries?name={name}
// Open record to accept additional fields from MI Management API
public type MgmtLocalEntryInfo record {
    string name;
    string 'type;
    string value;
};

// GET /management/message-stores?name={name}
// Open record to accept additional fields from MI Management API
public type MgmtMessageStoreInfo record {
    string name;
    string 'type?;
    string container?;
    string file?;
    int size?;
    string configuration?;
    map<string> properties?;
    // Allow additional fields from the API
};

// GET /management/message-processors?name={name}
// Open record to accept additional fields from MI Management API
public type MgmtMessageProcessorInfo record {
    string name;
    string 'type?;
    string fileName?;
    string messageStore?;
    string configuration?;
    map<string> parameters?;
    string status?;
    // Allow additional fields from the API
};

// GET /management/inbound-endpoints?inboundEndpointName={name}
// Open record to accept additional fields from MI Management API
public type MgmtInboundEndpointInfo record {
    string name;
    string protocol?;
    string sequence?;
    string tracing?;
    string stats?;
    string configuration?;
    string 'error?;
    string status?;
    Parameter[] parameters?;
    // Allow additional fields from the API
};

// GET /management/connectors (no name filter — filtered client-side)
public type MgmtConnectorInfo record {
    string name;
    string 'package?;
    string description?;
    string status?;
};

// GET /management/templates?name={name}&type={type}
public type MgmtTemplateInfo record {
    string configuration;
    string name;
    string 'type;
};

// GET /management/data-services?dataServiceName={name}
public type MgmtDataServiceOperation record {
    string operationName;
    string queryName?;
};

public type MgmtDataServiceQuery record {
    string id;
    string dataSourceId?;
    string namespace?;
};

public type MgmtDataServiceResource record {
    string resourcePath;
    string resourceMethod?;
    string resourceQuery?;
};

public type MgmtDataServiceDataSource record {
    string dataSourceId;
    string dataSourceType?;
};

// GET /management/data-services?dataServiceName={name}
// Open record to accept additional fields from MI Management API
public type MgmtDataServiceInfo record {
    string serviceName;
    string serviceDescription?;
    string wsdl1_1?;
    string wsdl2_0?;
    string swagger_url?;
    MgmtDataServiceDataSource[] dataSources;
    MgmtDataServiceQuery[] queries;
    MgmtDataServiceResource[] resources;
    MgmtDataServiceOperation[] operations;
    string configuration?;
    string serviceGroupName?;
};

// GET /management/data-sources?name={name}
// Open record to accept additional fields from MI Management API
public type MgmtDataSourceInfo record {
    string name;
    string 'type?;
    string configuration?;
    string driverClass?;
    string description?;
    string userName?;
    string url?;
    map<json> configurationParameters?;
    // Allow additional fields from the API
};

// GET /management/applications?carbonAppName={name}
public type MgmtCompositeAppInfo record {
    string name;
    string version?;
    json artifacts?;
};

// GET /management/logs
// Response for listing log files
public type LogFileInfo record {
    string FileName;
    string Size;
};

public type MgmtLogFilesResponse record {
    int count;
    LogFileInfo[] list;
};

// GET /management/logging
public type MgmtLoggerInfo record {
    string level;
    string componentName;
    string loggerName;
};

public type MgmtLoggersResponse record {
    int count;
    MgmtLoggerInfo[] list;
};

// PATCH /management/logging - Request body
public type MgmtUpdateLoggerRequest record {
    string loggerName;
    string loggingLevel;
    string? loggerClass?; // Optional: only for adding new logger
};

// PATCH /management/logging - Response
public type MgmtUpdateLoggerResponse record {
    string message;
};

// DELETE /management/logging?loggerName=<name> - Response
public type MgmtDeleteLoggerResponse record {
    string message;
};

// Validated Registry Access
public type ValidatedRegistryAccess record {|
    Runtime runtime;
    string trimmedPath;
|};

// Registry Browser Types - For browsing registry contents
public type RegistryProperty record {
    string name;
    string value;
};

public type RegistryDirectoryItem record {
    string name;
    string mediaType;
    boolean isDirectory;
    RegistryProperty[] properties = [];
};

public type RegistryDirectoryResponse record {
    *Fetchable;
    int count = 0;
    RegistryDirectoryItem[] items = [];
};

public type RegistryResourceMetadata record {
    *Fetchable;
    string name = "";
    string mediaType = "";
};

public type RegistryPropertiesResponse record {
    *Fetchable;
    int count = 0;
    RegistryProperty[] properties = [];
};

// A data service's structured overview, which the runtime may not have answered yet.
public type FetchableDataService record {|
    *Fetchable;
    MgmtDataServiceInfo? dataService = ();
|};
