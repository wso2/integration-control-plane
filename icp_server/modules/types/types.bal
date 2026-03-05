// Copyright (c) 2025, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
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

import ballerina/log;
import ballerina/sql;
import ballerina/time;

// === Enums ===

public enum RuntimeType {
    MI,
    BI
}

public enum LogIndexRuntimeType {
    MI,
    BI,
    ALL
}

public enum DeploymentType {
    VM,
    K8S
}

public enum RuntimeStatus {
    RUNNING,
    OFFLINE
}

public enum DeploymentState {
    Active,
    Faulty
}

public enum ArtifactState {
    ENABLED = "enabled",
    DISABLED = "disabled"
}

public enum ArtifactType {
    SERVICE = "Service",
    LISTENER = "Listener",
    RESTAPI = "RestApi",
    PROXYSERVICE = "ProxyService",
    ENDPOINT = "Endpoint",
    INBOUNDENDPOINT = "InboundEndpoint",
    SEQUENCE = "Sequence",
    TASK = "Task",
    TEMPLATE = "Template",
    MESSAGESTORE = "MessageStore",
    MESSAGEPROCESSOR = "MessageProcessor",
    LOCALENTRY = "LocalEntry",
    DATASERVICE = "DataService",
    CARBONAPP = "CarbonApp",
    DATASOURCE = "DataSource",
    CONNECTOR = "Connector",
    REGISTRYRESOURCE = "RegistryResource"
}

// === Core Domain Types ===

public type Artifact record {
    string name;
};

public type Resource record {
    @sql:Column {
        name: "resource_path"
    }
    string path = ""; // "/unittest", "/", "/send", etc.
    @sql:Column {
        name: "resource_method"
    }
    string method = ""; // "GET", "POST", "PUT", "DELETE"
    // Legacy fields for backward compatibility
    @sql:Column {
        name: "resource_url"
    }
    string url = "";
    string[] methods = [];
};

public enum LogLevel {
    DEBUG,
    INFO,
    WARN,
    ERROR
}

public type Logger record {
    string componentName;
    LogLevel logLevel;
    string runtimeId;
};

public type LoggerGroup record {
    string componentName;
    LogLevel logLevel;
    string[] runtimeIds;
};

public type Main record {
    string packageOrg;
    string packageName;
    string packageVersion;
};

public type Artifacts record {
    Listener[] listeners = [];
    Service[] services = [];
    Main? main = ();
    // MI-specific artifact types that may be present in heartbeat payloads
    RestApi[] apis = [];
    ProxyService[] proxyServices = [];
    Endpoint[] endpoints = [];
    InboundEndpoint[] inboundEndpoints = [];
    Sequence[] sequences = [];
    Task[] tasks = [];
    Template[] templates = [];
    MessageStore[] messageStores = [];
    MessageProcessor[] messageProcessors = [];
    LocalEntry[] localEntries = [];
    DataService[] dataServices = [];
    CarbonApp[] carbonApps = [];
    DataSource[] dataSources = [];
    Connector[] connectors = [];
    RegistryResource[] registryResources = [];
};

public type Node record {
    string platformName = "wso2-mi";
    string platformVersion?;
    string platformHome?;
    string ballerinaHome?;
    string osName?;
    string osVersion?;
    string osArch?;
    string javaVersion?;
    string javaVendor?;
    string carbonHome?;
    int totalMemory?;
    int freeMemory?;
    int maxMemory?;
    int usedMemory?;
};

// Heartbeat that includes all runtime information for registration/updates
public type Heartbeat record {|
    string runtime;
    string runtimeType; // "wso2-mi" from payloads
    string status; // "RUNNING", "STOPPED", etc.
    string environment;
    string project;
    string component;
    string version?;
    string runtimeHostname?; // MI management API hostname
    string runtimePort?; // MI management API port
    Node nodeInfo;
    Artifacts artifacts;
    string runtimeHash;
    time:Utc timestamp;
    map<log:Level> logLevels?; // BI log levels from heartbeat payload
|};

// Delta heartbeat with hash value
public type DeltaHeartbeat record {|
    string runtime;
    string runtimeHash;
    time:Utc timestamp;
|};

// === ICP Control Types ===
public enum ControlCommandStatus {
    PENDING,
    SENT,
    ACKNOWLEDGED,
    FAILED,
    COMPLETED
};

public enum ControlAction {
    START,
    STOP,
    SET_LOGGER_LEVEL
}

# Represents a control command issued to a runtime
#
# + commandId - Unique identifier for the command
# + runtimeId - ID of the runtime to receive the command
# + targetArtifact - The artifact to be controlled
# + action - The control action to perform
# + issuedAt - Timestamp when the command was issued
# + status - Current status of the command
# + payload - Optional JSON payload for actions that need additional data (e.g., log level settings)
public type ControlCommand record {
    string commandId;
    string runtimeId;
    Artifact targetArtifact;
    ControlAction action;
    time:Utc issuedAt;
    ControlCommandStatus status; // pending, sent, acknowledged, failed
    string payload?; // JSON payload for actions that need additional data
};

public type HeartbeatResponse record {
    boolean acknowledged;
    boolean fullHeartbeatRequired?;
    ControlCommand[] commands?;
    string[] errors?;
};

public enum MIControlAction {
    ARTIFACT_ENABLE,
    ARTIFACT_DISABLE,
    ARTIFACT_ENABLE_TRACING,
    ARTIFACT_DISABLE_TRACING,
    ARTIFACT_ENABLE_STATISTICS,
    ARTIFACT_DISABLE_STATISTICS,
    ARTIFACT_TRIGGER
}

public enum ComponentType {
    BI,
    MI
};


public type ReconcileAction record {|
    string key;
    string value;
|};

public type ReconcileArtifactKey record {|
    string artifactName;
    string artifactType;
|};

public type DispatchFn function (string runtimeId, ReconcileArtifactKey artifact, ReconcileAction[] actions) returns error?;

public type PartialDispatchDetail record {|
    ReconcileAction[] applied;
    ReconcileAction[] failed;
|};

public type PartialDispatchError distinct error<PartialDispatchDetail>;

public type ReconcileBackoffRecord record {|
    string state_key;
    int attempt_count;
    int has_error;
    int next_attempt;
|};
// === Configuration ===

public type IcpServer record {|
    string serverUrl;
    string authToken;
    decimal heartbeatInterval;
|};

public type Observability record {|
    string opensearchUrl;
    string logIndex;
    boolean metricsEnabled;
|};

public type IcpConfig record {|
    IcpServer icp;
    Observability observability;
|};

public type RequestLimit record {
    int maxUriLength;
    int maxHeaderSize;
    int maxEntityBodySize;
};

public type ChangeNotification record {
    anydata[] deployedArtifacts;
    anydata[] undeployedArtifacts;
    anydata[] stateChangedArtifacts;
};

// === API Wrappers / Auth ===

public type UserClaims record {
    string sub;
    string[] roles;
    int exp;
};

public type ApiResponse record {
    boolean success;
    string message?;
    json data?;
    string[] errors?;
};

public type AccessTokenResponse record {|
    string AccessToken;
|};

// Database record types for mapping query results
public type RuntimeDBRecord record {
    string runtime_id;
    string runtime_type;
    string status;
    string environment_id;
    string project_id;
    string component_id;
    string version?;
    string runtime_hostname?;
    string runtime_port?;
    string platform_name?;
    string platform_version?;
    string platform_home?;
    string os_name?;
    string os_version?;
    string carbon_home?;
    string java_vendor?;
    string java_version?;
    int total_memory?;
    int free_memory?;
    int max_memory?;
    int used_memory?;
    string os_arch?;
    string server_name?;
    time:Utc registration_time?;
    time:Utc last_heartbeat?;
};

public type RuntimeTypeRecord record {
    @sql:Column {
        name: "runtime_id"
    }
    string runtimeId;
    @sql:Column {
        name: "runtime_type"
    }
    string runtimeType;
    @sql:Column {
        name: "environment_id"
    }
    string environmentId;
    @sql:Column {
        name: "component_id"
    }
    string componentId;
};

// GraphQL response types
public type Runtime record {
    @sql:Column {
        name: "runtime_id"
    }
    string runtimeId;

    @sql:Column {
        name: "runtime_type"
    }
    string runtimeType;

    string status;
    string version?;

    @sql:Column {
        name: "runtime_hostname"
    }
    string managementHostname?;

    @sql:Column {
        name: "runtime_port"
    }
    string managementPort?;

    Component component;
    Environment environment;

    @sql:Column {
        name: "platform_name"
    }
    string platformName?;

    @sql:Column {
        name: "platform_version"
    }
    string platformVersion?;

    @sql:Column {
        name: "platform_home"
    }
    string platformHome?;

    @sql:Column {
        name: "os_name"
    }
    string osName?;

    @sql:Column {
        name: "os_version"
    }
    string osVersion?;

    @sql:Column {
        name: "registration_time"
    }
    string registrationTime?;

    @sql:Column {
        name: "last_heartbeat"
    }
    string lastHeartbeat?;
    Artifacts artifacts?;
    RuntimeLogLevelRecord[] logLevels?;
};

public type ServiceRecordInDB record {
    string service_name;
    string service_package;
    string base_path;
    ArtifactState state;
    string service_type;
};

public type ListenerRecordInDB record {
    string listener_name;
    string listener_package;
    string protocol;
    ArtifactState state;
    string port?;
    string destination?;
    string queue?;
    string path?;
};

// Database record types for MI artifacts
public type ProxyServiceRecordInDB record {
    string proxy_name;
    ArtifactState state;
    string tracing;
    string statistics = "disabled";
    string? carbon_app;
};

public type EndpointRecordInDB record {
    string endpoint_name;
    string endpoint_type;
    ArtifactState state;
    string tracing;
    string statistics = "disabled";
    string? carbon_app;
};

public type RestApiRecordInDB record {
    string api_name;
    string url;
    string urls?; // JSON string of array
    string context;
    string version?;
    ArtifactState state;
    string tracing;
    string statistics = "disabled";
    string? carbon_app;
};

public type SequenceRecordInDB record {
    string sequence_name;
    string sequence_type?;
    string container?;
    ArtifactState state;
    string tracing;
    string statistics = "disabled";
    string? carbon_app;
};

public type TaskRecordInDB record {
    string task_name;
    string task_class?;
    string task_group?;
    ArtifactState state;
    string? carbon_app;
};

public type MessageStoreRecordInDB record {
    string store_name;
    string store_type;
    int size;
    string? carbon_app;
};

public type MessageProcessorRecordInDB record {
    string processor_name;
    string processor_type;
    string processor_class?;
    ArtifactState state;
    string? carbon_app;
};

public type LocalEntryRecordInDB record {
    string entry_name;
    string entry_type;
    string entry_value?;
    ArtifactState state;
    string? carbon_app;
};

public type CarbonAppRecordInDB record {
    string app_name;
    string version = "";
    ArtifactState state;
};

public type RegistryResourceRecordInDB record {
    string resource_name;
    string resource_type = "";
};

public type RuntimeLogLevelRecord record {
    @sql:Column {
        name: "runtime_id"
    }
    string runtimeId;
    @sql:Column {
        name: "component_name"
    }
    string componentName;
    @sql:Column {
        name: "log_level"
    }
    string logLevel;
};

public type ResourceRecord record {
    string resource_path = "";
    string method = ""; // Single method like "GET", "POST", etc.
    string resource_url = "";
    string methods = ""; // JSON string of array
};

public type Service record {
    @sql:Column {
        name: "service_name"
    }
    string name;
    @sql:Column {
        name: "service_package"
    }
    string package = "";
    @sql:Column {
        name: "base_path"
    }
    string basePath = "";
    @sql:Column {
        name: "service_state"
    }
    ArtifactState state = "enabled"; // "ENABLED", "DISABLED"
    @sql:Column {
        name: "service_type"
    }
    string 'type = ""; // "API", "ProxyService", "DataService", "InboundEndpoint", "ScheduledTask"
    Resource[] resources;
    Listener[] listeners;
    string[] runtimeIds?;
    ArtifactRuntimeInfo[]? runtimes?;
};

public type Listener record {
    @sql:Column {
        name: "listener_name"
    }
    string name = "";
    @sql:Column {
        name: "listener_package"
    }
    string package = "";

    @sql:Column {
        name: "protocol"
    }
    string protocol = ""; // "http", "https", "jms", "rabbitmq", "file"

    @sql:Column {
        name: "listener_host"
    }
    string host?; // "0.0.0.0", "localhost" for network protocols
    @sql:Column {
        name: "listener_port"
    }
    int port?; // "8290", "8253" for network protocols

    @sql:Column {
        name: "listener_destination"
    }
    string destination?; // JMS destination name

    @sql:Column {
        name: "listener_queue"
    }
    string queue?; // RabbitMQ queue name

    @sql:Column {
        name: "listener_path"
    }
    string path?; // File system path

    @sql:Column {
        name: "state"
    }
    ArtifactState state = "enabled"; // "ENABLED", "DISABLED"
    string[] runtimeIds?;
    ArtifactRuntimeInfo[]? runtimes?;
};

public type Automation record {
    @sql:Column {
        name: "package_org"
    }
    string packageOrg;
    @sql:Column {
        name: "package_name"
    }
    string packageName;
    @sql:Column {
        name: "package_version"
    }
    string packageVersion;
    @sql:Column {
        name: "execution_timestamp"
    }
    string executionTimestamp;
    string[] runtimeIds?;
    AutomationRuntimeInfo[]? runtimes?;
};

// MI Runtime specific artifact types
public type RestApi record {
    @sql:Column {
        name: "api_name"
    }
    string name;
    string url = "";
    string[] urls = []; // Multiple URLs for the API (HTTP and HTTPS URLs)
    string context;
    string version?;
    @sql:Column {
        name: "api_state"
    }
    ArtifactState state = "enabled"; // "ENABLED", "DISABLED"
    string tracing = "disabled"; // "enabled", "disabled"
    string statistics = "disabled"; // "enabled", "disabled"
    @sql:Column {
        name: "carbon_app"
    }
    string carbonApp?;
    ApiResource[] resources = []; // API resources (path + methods)
    string[] runtimeIds?;
    ArtifactRuntimeInfo[]? runtimes?;
};

// API Resource type for MI API resources
public type ApiResource record {
    @sql:Column {
        name: "resource_path"
    }
    string path = ""; // "/unittest", "/*", etc.
    string methods = ""; // Single method as string from MI heartbeat (e.g., "POST", "GET")
};

public type ProxyService record {
    @sql:Column {
        name: "proxy_name"
    }
    string name;
    @sql:Column {
        name: "proxy_state"
    }
    ArtifactState state = "enabled"; // "ENABLED", "DISABLED"
    string tracing = "disabled"; // "enabled", "disabled"
    string statistics = "disabled"; // "enabled", "disabled"
    @sql:Column {
        name: "carbon_app"
    }
    string carbonApp?;
    string[] endpoints?;
    string[] runtimeIds?;
    ArtifactRuntimeInfo[]? runtimes?;
};

public type Endpoint record {
    @sql:Column {
        name: "endpoint_name"
    }
    string name;
    string 'type;
    @sql:Column {
        name: "endpoint_state"
    }
    ArtifactState state; // "enabled", "disabled"
    string tracing = "disabled"; // "enabled", "disabled"
    string statistics = "disabled"; // "enabled", "disabled"
    @sql:Column {
        name: "carbon_app"
    }
    string carbonApp?;
    EndpointAttribute[]? attributes?;
    string[] runtimeIds?;
    ArtifactRuntimeInfo[]? runtimes?;
};

// Attribute for endpoints (heartbeat uses name/value)
public type EndpointAttribute record {
    @sql:Column {
        name: "attribute_name"
    }
    string name;
    @sql:Column {
        name: "attribute_value"
    }
    string value?;
};

public type InboundEndpoint record {
    @sql:Column {
        name: "inbound_name"
    }
    string name;
    string protocol;
    string sequence?;
    @sql:Column {
        name: "statistics"
    }
    string statistics?;
    @sql:Column {
        name: "on_error"
    }
    string onError?;
    @sql:Column {
        name: "inbound_state"
    }
    ArtifactState state = "enabled"; // "ENABLED", "DISABLED"
    string tracing = "disabled"; // "enabled", "disabled"
    @sql:Column {
        name: "carbon_app"
    }
    string carbonApp?;
    string[] runtimeIds?;
    ArtifactRuntimeInfo[]? runtimes?;
};

public type Sequence record {
    @sql:Column {
        name: "sequence_name"
    }
    string name;
    string 'type?;
    string container?;
    @sql:Column {
        name: "sequence_state"
    }
    ArtifactState state = "enabled"; // "ENABLED", "DISABLED"
    string tracing = "disabled"; // "enabled", "disabled"
    string statistics = "disabled"; // "enabled", "disabled"
    @sql:Column {
        name: "carbon_app"
    }
    string carbonApp?;
    string[] runtimeIds?;
    ArtifactRuntimeInfo[]? runtimes?;
};

public type Task record {
    @sql:Column {
        name: "task_name"
    }
    string name;
    string 'class?;
    string group?;
    @sql:Column {
        name: "task_state"
    }
    ArtifactState state = "enabled"; // "ENABLED", "DISABLED"
    @sql:Column {
        name: "carbon_app"
    }
    string carbonApp?;
    string[] runtimeIds?;
    ArtifactRuntimeInfo[]? runtimes?;
};

public type Template record {
    @sql:Column {
        name: "template_name"
    }
    string name;
    @sql:Column {
        name: "template_type"
    }
    string 'type;
    string tracing = "disabled"; // "enabled", "disabled"
    string statistics = "disabled"; // "enabled", "disabled"
    @sql:Column {
        name: "carbon_app"
    }
    string carbonApp?;
    string[] runtimeIds?;
    ArtifactRuntimeInfo[]? runtimes?;
};

public type MessageStore record {
    @sql:Column {
        name: "store_name"
    }
    string name;
    string 'type;
    int size = 0;
    @sql:Column {
        name: "store_state"
    }
    ArtifactState state = "enabled"; // "ENABLED", "DISABLED"
    @sql:Column {
        name: "carbon_app"
    }
    string carbonApp?;
    string[] runtimeIds?;
    ArtifactRuntimeInfo[]? runtimes?;
};

public type MessageProcessor record {
    @sql:Column {
        name: "processor_name"
    }
    string name;
    string 'type;
    string 'class?;
    @sql:Column {
        name: "processor_state"
    }
    ArtifactState state = "enabled"; // "ENABLED", "DISABLED"
    @sql:Column {
        name: "carbon_app"
    }
    string carbonApp?;
    string[] runtimeIds?;
    ArtifactRuntimeInfo[]? runtimes?;
};

public type LocalEntry record {
    @sql:Column {
        name: "entry_name"
    }
    string name;
    string 'type;
    string value?;
    @sql:Column {
        name: "entry_state"
    }
    ArtifactState state = "enabled"; // "ENABLED", "DISABLED"
    @sql:Column {
        name: "carbon_app"
    }
    string carbonApp?;
    string[] runtimeIds?;
    ArtifactRuntimeInfo[]? runtimes?;
};

public type DataService record {
    @sql:Column {
        name: "service_name"
    }
    string name;
    string description?;
    string wsdl?;
    @sql:Column {
        name: "dataservice_state"
    }
    ArtifactState state = "enabled"; // "ENABLED", "DISABLED"
    @sql:Column {
        name: "carbon_app"
    }
    string carbonApp?;
    string[] runtimeIds?;
    ArtifactRuntimeInfo[]? runtimes?;
};

public type CarbonApp record {
    @sql:Column {
        name: "app_name"
    }
    string name;
    string componentId?;
    string version?;
    @sql:Column {
        name: "app_state"
    }
    string state = "Active"; // "Active", "Faulty"
    // Artifacts packaged within the Carbon App (from heartbeat payload)
    CarbonAppArtifact[] artifacts?;
    string[] runtimeIds?;
    ArtifactRuntimeInfo[]? runtimes?;
};

// Artifact shape used inside CarbonApp
public type CarbonAppArtifact record {
    string name;
    string 'type; // e.g., "api", "endpoint"
};

public type DataSource record {
    @sql:Column {
        name: "datasource_name"
    }
    string name;
    @sql:Column {
        name: "datasource_type"
    }
    string 'type?;
    string driver?;
    string url?;
    string username?;
    ArtifactState state = "enabled"; // "ENABLED", "DISABLED"
    string[] runtimeIds?;
    ArtifactRuntimeInfo[]? runtimes?;
};

public type Connector record {
    @sql:Column {
        name: "connector_name"
    }
    string name;
    string 'package;
    string version?;
    @sql:Column {
        name: "connector_state"
    }
    ArtifactState state = "enabled"; // "ENABLED", "DISABLED"
    string[] runtimeIds?;
    ArtifactRuntimeInfo[]? runtimes?;
};

public type RegistryResource record {
    @sql:Column {
        name: "resource_name"
    }
    string name;
    @sql:Column {
        name: "resource_type"
    }
    string 'type = "";
    // Populated at query time to indicate runtimes containing this resource
    string[] runtimeIds = [];
    ArtifactRuntimeInfo[]? runtimes?;
};

// === Project & Component Types ===

public type Project record {
    @sql:Column {
        name: "project_id"
    }
    string id; // Alias for projectId to support queries requesting 'id'

    @sql:Column {
        name: "org_id"
    }
    int orgId;

    string name;
    string? version;

    @sql:Column {
        name: "created_date"
    }
    string createdDate?;

    string handler;

    @sql:Column {
        name: "extended_handler"
    }
    string extendedHandler?;

    string region?;
    string description?;

    @sql:Column {
        name: "owner_id"
    }
    string owner?;

    string[] labels?;

    @sql:Column {
        name: "default_deployment_pipeline_id"
    }
    string defaultDeploymentPipelineId = "";

    string[] deploymentPipelineIds = [];

    string 'type?;

    @sql:Column {
        name: "git_provider"
    }
    string? gitProvider?;

    @sql:Column {
        name: "git_organization"
    }
    string gitOrganization?;

    string repository?;
    string branch?;

    @sql:Column {
        name: "secret_ref"
    }
    string secretRef?;

    @sql:Column {
        name: "owner_id"
    }
    string ownerId?;

    @sql:Column {
        name: "created_by"
    }
    string createdBy?;

    @sql:Column {
        name: "updated_at"
    }
    string updatedAt?;

    @sql:Column {
        name: "updated_by"
    }
    string updatedBy?;
};

public type ProjectInput record {
    int orgId;
    string orgHandler;
    string name;
    string? version?;
    string projectHandler;
    string? handler?;
    string? region?;
    string? description?;
    string? defaultDeploymentPipelineId?;
    string[]? deploymentPipelineIds?;
    string? 'type?;
    string? gitProvider?;
    string? gitOrganization?;
    string? repository?;
    string? branch?;
    string? secretRef?;
};

public type ProjectUpdateInput record {
    string id;
    int orgId?;
    string name?;
    string version?;
    string description?;
};

public type Component record {
    // Basic Identity Fields
    string id; // Alias for componentId
    @sql:Column {
        name: "project_id"
    }
    string projectId;
    @sql:Column {
        name: "org_handler"
    }
    string orgHandler;
    @sql:Column {
        name: "org_id"
    }
    int orgId?;

    // Component Metadata
    string name;
    string handler;
    @sql:Column {
        name: "display_name"
    }
    string displayName;
    @sql:Column {
        name: "display_type"
    }
    string displayType;
    string description?;
    @sql:Column {
        name: "owner_name"
    }
    string ownerName?;

    // Status Fields
    string status;
    @sql:Column {
        name: "init_status"
    }
    string initStatus?;

    // Version & Timestamps
    string version;
    @sql:Column {
        name: "created_at"
    }
    string createdAt;
    @sql:Column {
        name: "last_build_date"
    }
    string lastBuildDate?;
    @sql:Column {
        name: "updated_at"
    }
    string updatedAt?;

    // Classification
    @sql:Column {
        name: "component_sub_type"
    }
    string componentSubType?;
    @sql:Column {
        name: "component_type"
    }
    RuntimeType componentType; // NOT NULL in DB with DEFAULT 'BI'
    string labels?;

    // System Component Flag
    @sql:Column {
        name: "is_system_component"
    }
    boolean isSystemComponent?;

    // Component Configuration Flags
    @sql:Column {
        name: "api_id"
    }
    string apiId?;
    @sql:Column {
        name: "http_based"
    }
    boolean httpBased?;
    @sql:Column {
        name: "is_migration_completed"
    }
    boolean isMigrationCompleted?;
    @sql:Column {
        name: "skip_deploy"
    }
    boolean skipDeploy?;
    @sql:Column {
        name: "endpoint_short_url_enabled"
    }
    boolean endpointShortUrlEnabled?;
    @sql:Column {
        name: "is_unified_config_mapping"
    }
    boolean isUnifiedConfigMapping?;
    @sql:Column {
        name: "service_access_mode"
    }
    string serviceAccessMode?;

    // Nested Objects
    Repository repository?;
    ApiVersion[] apiVersions?;
    DeploymentTrack[] deploymentTracks?;

    // Git Integration
    @sql:Column {
        name: "git_provider"
    }
    string gitProvider?;
    @sql:Column {
        name: "git_organization"
    }
    string gitOrganization?;
    @sql:Column {
        name: "git_repository"
    }
    string gitRepository?;
    string branch?;

    // Advanced Fields
    ComponentEndpoint[] endpoints?;
    ComponentEnvironmentVariable[] environmentVariables?;
    ComponentSecret[] secrets?;

    // Legacy fields for backward compatibility
    @sql:Column {
        name: "component_id"
    }
    string componentId?;
    Project project?;
    @sql:Column {
        name: "created_by"
    }
    string createdBy?;
    @sql:Column {
        name: "updated_by"
    }
    string updatedBy?;
};

public type ComponentInput record {
    // Required Fields
    string projectId;
    string name;

    // Recommended Fields
    string displayName?; // User-friendly display name
    string description?; // Component description

    // Organization Context (optional - can derive from projectId)
    int orgId?; // Organization ID
    string orgHandler?; // Organization handle

    // Component Classification (optional - can have defaults)
    RuntimeType componentType?; // Runtime type: "BI" or "MI"
    string technology?; // Technology: "WSO2MI", "Ballerina", etc.

    // Repository Integration (optional - for future use)
    string repository?; // Git repository URL
    string branch?; // Git branch
    string directoryPath?; // Path within repository
    string secretRef?; // Reference to credentials
    boolean isPublicRepo?; // Public/private repository flag

    // Internal field (set by backend)
    string createdBy?;
};

public type ComponentUpdateInput record {
    // Required field - component ID to update
    string id;

    // Basic fields that can be updated
    string name?;
    string displayName?;
    string description?;
    RuntimeType componentType?;
    string version?;
    string labels?;
    string serviceAccessMode?;

    // Extended fields (accepted for compatibility but may not be persisted)
    string apiId?;
    boolean httpBased?;
    boolean isMigrationCompleted?;
    boolean skipDeploy?;
    boolean endpointShortUrlEnabled?;
    boolean isUnifiedConfigMapping?;
    string componentSubType?;
};

// === Component Related Nested Types ===

public type Repository record {
    // Build Configurations
    BuildpackConfig buildpackConfig?;
    ByocWebAppBuildConfig byocWebAppBuildConfig?;
    ByocBuildConfig byocBuildConfig?;
    DockerBuildConfig dockerBuildConfig?;
    TestRunnerConfig testRunnerConfig?;

    // Repository Source Information
    string repositoryType?;
    string repositoryBranch?;
    string repositorySubPath?;
    string repositoryUrl?;

    // Git Provider Information (not in DB, will be null)
    string bitbucketServerUrl?;
    string serverUrl?;
    string gitProvider?;
    string nameApp?;
    string nameConfig?;
    string branch?;
    string branchApp?;
    string organizationApp?;
    string organizationConfig?;
    string appSubPath?;

    // Repository Flags (not in DB, will be null)
    boolean isUserManage?;
    boolean isAuthorizedRepo?;
    boolean isBuildConfigurationMigrated?;
};

public type BuildpackConfig record {
    string versionId?;
    string buildContext?;
    string languageVersion?;
    string buildCommand?;
    string runCommand?;
    boolean isUnitTestEnabled?;
    boolean pullLatestSubmodules?;
    boolean enableTrivyScan?;
    Buildpack buildpack?;
    KeyValue[] keyValues?;
};

public type Buildpack record {
    string id;
    string name?;
    string language;
    string version?;
    string description?;
};

public type ByocWebAppBuildConfig record {
    string id?;
    string containerId?;
    string componentId?;
    string repositoryId?;
    string dockerContext?;
    string webAppType?;
    int port?;
    string imageUrl?;
    string registryId?;
    string dockerfile?;
    string buildCommand?;
    string packageManagerVersion?;
    string outputDirectory?;
    boolean enableTrivyScan?;
};

public type DockerBuildConfig record {
    string id?;
    string dockerContext?;
    string dockerfile?;
    int port?;
    string imageUrl?;
    string registryId?;
};

public type ByocBuildConfig record {
    string id?;
    boolean isMainContainer?;
    string containerId?;
    string componentId?;
    string repositoryId?;
    string dockerContext?;
    string dockerfilePath?;
    string oasFilePath?;
};

public type TestRunnerConfig record {
    string dockerContext?;
    string postmanDirectory?;
    string testRunnerType?;
};

public type KeyValue record {
    string id?;
    string key;
    string value?;
};

public type ApiVersion record {
    string id;
    string apiVersion;
    string versionId?;
    string proxyName?;
    string proxyUrl?;
    string proxyId?;
    ArtifactState state;
    boolean latest;
    string branch?;
    string accessibility?;
    boolean autoDeployEnabled?;
    AppEnvVersion[] appEnvVersions?;
    CellDiagram cellDiagram?;
    string openApiSpec?;
    string graphqlSchema?;
    string createdAt?;
    string updatedAt?;
    string description?;
};

public type AppEnvVersion record {
    string environmentId;
    string releaseId;
    Release? release;
};

public type Release record {
    string id;
    ReleaseMetadata? metadata;
    string environmentId?;
    string environment?;
    string gitHash?;
    string gitOpsHash?;
};

public type ReleaseMetadata record {
    string choreoEnv?;
};

public type CellDiagram record {
    string data?;
    string message?;
    string errorName?;
    boolean success;
};

public type DeploymentTrack record {
    string id;
    string componentId;
    string createdAt;
    string updatedAt;
    string apiVersion;
    string branch?;
    boolean latest;
    string versionStrategy?;
    string description?;
    boolean autoDeployEnabled?;
    boolean autoBuildEnabled?;
    string environmentName?;
    string environmentId?;
    string deploymentStatus?;
    string lastDeployedAt?;
};

public type ComponentEndpoint record {
    string id;
    string componentId;
    string name;
    string url;
    string 'type;
    string protocol?;
    int port?;
    string visibility?;
};

public type ComponentEnvironmentVariable record {
    string key;
    string value?;
    boolean isSecret;
    string description?;
};

public type ComponentSecret record {
    string key;
    string description?;
    string createdAt?;
    string updatedAt?;
};

public type ComponentFilterInput record {|
    boolean withSystemComponents?;
    string displayType?;
    string status?;
    string componentSubType?;
|};

public type ComponentSortInput record {|
    string 'field;
    string 'order;
|};

public type PaginationInput record {|
    int 'limit?;
    int offset?;
    string cursor?;
|};

public type ComponentOptionsInput record {|
    ComponentFilterInput filter?;
    ComponentSortInput sort?;
    PaginationInput pagination?;
|};

public type Environment record {
    // Core Identity (from DB)
    @sql:Column {
        name: "environment_id"
    }
    string id; // Alias for environmentId (set in resolver)
    string name;
    string description?;

    // New required fields (from DB)
    string region?;

    @sql:Column {
        name: "cluster_id"
    }
    string clusterId?;

    @sql:Column {
        name: "choreo_env"
    }
    string choreoEnv?;

    @sql:Column {
        name: "external_apim_env_name"
    }
    string externalApimEnvName?;

    @sql:Column {
        name: "internal_apim_env_name"
    }
    string internalApimEnvName?;

    @sql:Column {
        name: "sandbox_apim_env_name"
    }
    string sandboxApimEnvName?;

    boolean critical;

    @sql:Column {
        name: "dns_prefix"
    }
    string dnsPrefix?;

    // Extended fields (legacy, not in DB)
    string vhost?;
    string sandboxVhost?;
    string apiEnvName?;
    string apimEnvId?;
    boolean isMigrating?;
    string promoteFrom?;
    string namespace?;
    string dpId?;
    string templateId?;
    boolean isPdp?;
    boolean scaleToZeroEnabled?;

    // Audit Fields (from DB)
    @sql:Column {
        name: "created_at"
    }
    string createdAt?;

    @sql:Column {
        name: "updated_at"
    }
    string updatedAt?;

    @sql:Column {
        name: "updated_by"
    }
    string updatedBy?;

    @sql:Column {
        name: "created_by"
    }
    string createdBy?;
};

public type EnvironmentInput record {
    string name;
    string description?;
    boolean critical;
    string createdBy?;
};

public type ComponentInDB record {
    string component_id;
    string project_id;
    string component_name;
    string component_display_name?;
    string component_description?;
    string component_type; // NOT NULL in DB, should always have a value
    string component_created_by?;
    string component_created_at?;
    string component_updated_at?;
    string component_updated_by?;
    int project_org_id;
    string project_name;
    string project_version?;
    string project_created_date?;
    string project_handler;
    string project_region?;
    string project_description?;
    string project_default_deployment_pipeline_id?;
    string project_deployment_pipeline_ids?;
    string project_type?;
    string project_git_provider?;
    string project_git_organization?;
    string project_repository?;
    string project_branch?;
    string project_secret_ref?;
    string project_created_by?;
    string project_updated_at?;
    string project_updated_by?;
};

// Lightweight runtime reference for artifact availability
public type ArtifactRuntimeInfo record {
    string runtimeId;
    string status;
};

// Runtime info for automation artifacts with execution timestamps
public type AutomationRuntimeInfo record {
    string runtimeId;
    string status;
    string[] executionTimestamps;
};

// === Observability Related Types ===

public type IntegrationDetails record {|
    string componentId?;
    string[] componentIdList?;
    string environmentId?;
    string[] environmentList?;
|};

public enum LogEntryRequestSort {
    asc,
    desc
}

public type ICPLogEntryRequest record {
    *IntegrationDetails;
    string[] logLevels?;
    string region?;
    string searchPhrase?;
    string regexPhrase?;
    string startTime?;
    string endTime?;
    int 'limit = 100;
    LogEntryRequestSort sort = "asc";
};

public type LogEntryRequest record {
    string[] runtimeIdList = [];
    string[] logLevels?;
    string region?;
    string searchPhrase?;
    string regexPhrase?;
    string startTime?;
    string endTime?;
    int 'limit = 100;
    LogEntryRequestSort sort = "asc";
};

public type LogEntry record {
    string time;
    string level;
    string runtime;
    string component;
    string project;
    string environment;
    string message;
    map<anydata> additionalTags;
};

public type LogCount record {
    int total;
    int debug;
    int info;
    int warn;
    int 'error;
};

public type LogColumn record {
    string name;
    string 'type;
};

public type LogEntriesResponse record {
    LogColumn[] columns;
    json[][] rows;
};

public type ICPMetricEntryRequest record {
    *IntegrationDetails;
    string region?;
    string startTime;
    string endTime;
    string resolutionInterval;
};

public type MetricEntryRequest record {
    string[] runtimeIdList = [];
    string region?;
    string startTime;
    string endTime;
    string resolutionInterval;
};

public type MetricEntry record {
    map<string> tags;
    Metric requests_total;
    Metric response_time_seconds_avg;
    Metric response_time_seconds_min;
    Metric response_time_seconds_max;
    Metric response_time_seconds_percentile_33;
    Metric response_time_seconds_percentile_50;
    Metric response_time_seconds_percentile_66;
    Metric response_time_seconds_percentile_95;
    Metric response_time_seconds_percentile_99;
};

public type Metric record {
    string name;
    map<decimal|int> timeSeriesData;
};

public type MetricEntriesResponse record {
    MetricEntry[] inboundMetrics;
    MetricEntry[] outboundMetrics;
};

// === Auth Related Types ===

public type Credentials record {
    string username;
    string password;
};

// Request type for refresh token endpoint
public type RefreshTokenRequest record {
    string refreshToken;
};

// Request type for revoke token endpoint
public type RevokeTokenRequest record {
    string? refreshToken?; // If provided, revokes specific token. If omitted, revokes all user's tokens
};

// Types for the /authenticate endpoint
public type AuthenticateResponse record {
    boolean authenticated;
    string? userId;
    string? displayName;
    string? timestamp;
};

// === OIDC/SSO Related Types ===

// SSO Configuration
public type SSOConfig record {|
    boolean enabled;
    string issuer;
    string authorizationEndpoint;
    string tokenEndpoint;
    string logoutEndpoint;
    string clientId;
    string clientSecret;
    string redirectUri;
    string usernameClaim; // "email" or "preferred_username"
    string[] scopes;
|};

// OIDC Authorization URL response
public type OIDCAuthorizationUrlResponse record {|
    string authorizationUrl;
|};

// OIDC callback request
public type OIDCCallbackRequest record {|
    string code;
    string state?; // CSRF protection token
|};

// OIDC token response from provider
public type OIDCTokenResponse record {|
    string access_token;
    string refresh_token?;
    string id_token;
    string token_type;
    int expires_in;
    string scope?;
|};

// OIDC ID Token claims (standard claims)
public type OIDCIdTokenClaims record {|
    string sub; // Subject (user ID)
    string iss; // Issuer
    string|string[] aud; // Audience
    int exp; // Expiration time
    int iat; // Issued at
    string? email?; // Email address
    string? name?; // Full name
    string? preferred_username?; // Preferred username
|};

// Type to hold extracted user information
public type ExtractedUserInfo record {|
    string userId;
    string username;
    string displayName;
|};

// Database user record type
public type User record {
    @sql:Column {
        name: "user_id"
    }
    string userId;
    string username;
    @sql:Column {
        name: "display_name"
    }
    string displayName;
    @sql:Column {
        name: "is_super_admin"
    }
    boolean isSuperAdmin = false;
    @sql:Column {
        name: "is_project_author"
    }
    boolean isProjectAuthor = false;
    @sql:Column {
        name: "is_oidc_user"
    }
    boolean isOidcUser = false;
    @sql:Column {
        name: "require_password_change"
    }
    boolean requirePasswordChange = false;
    @sql:Column {
        name: "created_at"
    }
    string? createdAt?;
    @sql:Column {
        name: "updated_at"
    }
    string? updatedAt?;
};

// Database user_credentials record type
public type UserCredentials record {
    string userId;
    string username;
    string displayName;
    string passwordHash;
    string passwordSalt?;
    string createdAt?;
    string updatedAt?;
};

// UserContext V2 - RBAC V2 permission-based authorization
// Used with new permission-based JWT tokens
public type UserContextV2 record {
    string userId;
    string username;
    string displayName;
    string[] permissions; // Flat list of permission names from JWT
};

// Database role record type
public type Role record {
    @sql:Column {
        name: "role_id"
    }
    string roleId;
    @sql:Column {
        name: "project_id"
    }
    string projectId;
    @sql:Column {
        name: "environment_type"
    }
    string environmentType;
    @sql:Column {
        name: "privilege_level"
    }
    string privilegeLevel;
    @sql:Column {
        name: "role_name"
    }
    string roleName; // Format: <project_name>:<env_type>:<privilege_level>
    @sql:Column {
        name: "created_at"
    }
    string? createdAt?;
    @sql:Column {
        name: "updated_at"
    }
    string? updatedAt?;
};

// Input type for creating a new user
public type CreateUserInput record {
    string username;
    string displayName;
    string password;
};

// Input type for updating user profile (display name)
public type UpdateProfileRequest record {
    string displayName;
};

// Input type for changing password
public type ChangePasswordRequest record {
    string userId?;
    string currentPassword;
    string newPassword;
};

// Input type for admin password reset
public type ResetPasswordRequest record {
    string userId;
};

// Response type for admin password reset
public type ResetPasswordResponse record {
    string password;
    string message;
};

// Input type for force password change (no current password required)
public type ForceChangePasswordRequest record {
    string newPassword;
};

// === Project Creation Eligibility ===

public type ProjectCreationEligibility record {
    boolean isProjectCreationAllowed;
};

// === Project Handler Availability ===

public type ProjectHandlerAvailability record {
    boolean handlerUnique;
    string? alternateHandlerCandidate;
};

// === Missing Types for API Functionality ===

public type ComponentDeployment record {
    string environmentId;
    int configCount;
    string? apiId?;
    string releaseId;
    ApiRevision? apiRevision?;
    BuildInfo build;
    string imageUrl;
    string invokeUrl;
    string versionId;
    string deploymentStatus;
    string deploymentStatusV2;
    string? version?;
    string? cron?;
    string? cronTimezone?;
};

public type ApiRevision record {
    string id;
    string displayName;
};

public type BuildInfo record {
    string buildId;
    string? deployedAt?;
    CommitInfo? 'commit?;
    SourceConfigMigrationStatus? sourceConfigMigrationStatus?;
    string runId;
};

public type CommitInfo record {
    AuthorInfo author;
    string sha;
    string message;
    boolean isLatest;
};

public type AuthorInfo record {
    string name;
    string date;
    string email;
    string avatarUrl;
};

public type SourceConfigMigrationStatus record {
    boolean canMigrate;
    string existingFileName;
    string existingFileSchemaVersion;
};

public type DeleteResponse record {
    string status;
    string details;
};

public type DeleteComponentV2Response record {
    string status;
    boolean canDelete;
    string message;
    string encodedData;
};

// Available artifact types for a component
public type ArtifactTypeCount record {
    ArtifactType artifactType;
    int artifactCount;
};

public type ArtifactResponse record {|
    string name;
    string 'type;
    string configuration;
|};

public type Parameter record {|
    string name;
    string value;
|};

public type LocalEntryValue record {|
    string name;
    string value;
|};

// Input type for changing artifact status
public type ArtifactStatusChangeInput record {|
    string componentId;
    string artifactType; // e.g., "proxy-service", "endpoint", "inbound-endpoint", "message-processor"
    string artifactName;
    string status; // "active" or "inactive"
|};

// Response for artifact status change
public type ArtifactStatusChangeResponse record {|
    string status; // "success" or "failed"
    string message;
    int successCount; // Number of runtimes successfully updated
    int failedCount; // Number of runtimes that failed
    string[] details; // Detailed status per runtime
|};

// Input type for changing artifact tracing
public type ArtifactTracingChangeInput record {|
    string componentId;
    string artifactType; // e.g., "proxy-service"
    string artifactName;
    string trace; // "enable" or "disable"
|};

// Response for artifact tracing change
public type ArtifactTracingChangeResponse record {|
    string status; // "success" or "failed"
    string message;
    int successCount; // Number of runtimes successfully updated
    int failedCount; // Number of runtimes that failed
    string[] details; // Detailed status per runtime
|};

// Input type for changing artifact statistics
public type ArtifactStatisticsChangeInput record {|
    string componentId;
    string artifactType; // e.g., "proxy-service"
    string artifactName;
    string statistics; // "enable" or "disable"
|};

// Response for artifact statistics change
public type ArtifactStatisticsChangeResponse record {|
    string status; // "success" or "failed"
    string message;
    int successCount; // Number of runtimes successfully updated
    int failedCount; // Number of runtimes that failed
    string[] details; // Detailed status per runtime
|};

// Input type for triggering task
public type ArtifactTriggerInput record {|
    string componentId;
    string taskName; // Name of the task to trigger
|};

// Response for artifact trigger
public type ArtifactTriggerResponse record {|
    string status; // "success" or "failed"
    string message;
    int successCount; // Number of runtimes successfully triggered
    int failedCount; // Number of runtimes that failed
    string[] details; // Detailed status per runtime
|};

// === Listener Control Types ===
public type ListenerControlInput record {|
    string[] runtimeIds;
    string listenerName;
    ControlAction action;
|};

public type ListenerControlResponse record {|
    boolean success;
    string message;
    string[] commandIds;
|};

public type UpdateLogLevelInput record {|
    string[] runtimeIds;
    string componentName;
    LogLevel logLevel;
|};

public type UpdateLogLevelResponse record {|
    boolean success;
    string message;
    string[] commandIds;
|};
