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
    COMPOSITEAPP = "CompositeApp",
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
    OFF,
    TRACE,
    DEBUG,
    INFO,
    WARN,
    ERROR,
    FATAL
}

public type Logger record {
    string? loggerName; // Optional: Only present for MI components
    string componentName;
    LogLevel logLevel;
    boolean? logLevelInSync?;
    string runtimeId;
};

public type LoggerGroup record {
    string? loggerName;
    string componentName;
    LogLevel logLevel;
    boolean? logLevelInSync?;
    string[] runtimeIds;
};

public type LogFile record {
    string fileName;
    string size;
};

public type LogFilesResponse record {
    int count;
    LogFile[] files;
    PageInfo pageInfo;
};

public type PageInfo record {
    int total;
    int 'limit;
    int offset;
};

public type ComponentsPage record {
    Component[] items;
    PageInfo pageInfo;
};

public type RuntimesPage record {
    Runtime[] items;
    PageInfo pageInfo;
};

public type ProjectsPage record {
    Project[] items;
    PageInfo pageInfo;
};

public type OrgSecretsPage record {
    OrgSecretListEntry[] items;
    PageInfo pageInfo;
};

public type ServicesPage record {
    Service[] items;
    PageInfo pageInfo;
};

public type ListenersPage record {
    Listener[] items;
    PageInfo pageInfo;
};

public type RestApisPage record {
    RestApi[] items;
    PageInfo pageInfo;
};

public type ProxyServicesPage record {
    ProxyService[] items;
    PageInfo pageInfo;
};

public type EndpointsPage record {
    Endpoint[] items;
    PageInfo pageInfo;
};

public type InboundEndpointsPage record {
    InboundEndpoint[] items;
    PageInfo pageInfo;
};

public type SequencesPage record {
    Sequence[] items;
    PageInfo pageInfo;
};

public type TasksPage record {
    Task[] items;
    PageInfo pageInfo;
};

public type TemplatesPage record {
    Template[] items;
    PageInfo pageInfo;
};

public type MessageStoresPage record {
    MessageStore[] items;
    PageInfo pageInfo;
};

public type MessageProcessorsPage record {
    MessageProcessor[] items;
    PageInfo pageInfo;
};

public type LocalEntriesPage record {
    LocalEntry[] items;
    PageInfo pageInfo;
};

public type DataServicesPage record {
    DataService[] items;
    PageInfo pageInfo;
};

public type DataSourcesPage record {
    DataSource[] items;
    PageInfo pageInfo;
};

public type CompositeAppsPage record {
    CompositeApp[] items;
    PageInfo pageInfo;
};

public type ConnectorsPage record {
    Connector[] items;
    PageInfo pageInfo;
};

public type RegistryResourcesPage record {
    RegistryResource[] items;
    PageInfo pageInfo;
};

public type LoggerGroupsPage record {
    LoggerGroup[] items;
    PageInfo pageInfo;
};

public type AutomationsPage record {
    Automation[] items;
    PageInfo pageInfo;
};

public type WorkflowsPage record {
    Workflow[] items;
    PageInfo pageInfo;
};

public type LoggersPage record {
    Logger[] items;
    PageInfo pageInfo;
};

public type BoundSecretsPage record {
    BoundSecretEntry[] items;
    PageInfo pageInfo;
};

public type EnvironmentsPage record {
    Environment[] items;
    PageInfo pageInfo;
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
    CompositeApp[] carbonApps = [];
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

// Optional Heartbeat fields this server release understands. Advertised in every
// HeartbeatResponse as `supportedHeartbeatFields` so a bridge can self-limit to what the
// connected server actually supports instead of relying on a shared version number —
// older bridges/servers that predate this negotiation simply never see the field and stay
// on the baseline heartbeat shape. Update this list whenever an optional field is added to
// Heartbeat below.
final string[] & readonly SUPPORTED_HEARTBEAT_FIELDS =
        ["tryItHost", "openApiDefinitions", "workflowMetadata"];

// Heartbeat that includes all runtime information for registration/updates.
// Open record so parsing tolerates fields from a newer agent that this server
// version doesn't yet know about (e.g. a future addition sent before a rolling
// upgrade completes) instead of rejecting the entire heartbeat.
public type Heartbeat record {
    string heartbeatVersion = "v1.0"; // Version of the heartbeat format
    string runtimeId; // Unique identifier for the runtime
    string? runtime = (); // Alias for runtimeId (for backward compatibility)
    string runtimeType; // "wso2-mi" from payloads
    string status; // "RUNNING", "STOPPED", etc.
    string environment;
    string project;
    string component;
    string version?;
    string runtimeHostname?; // MI management API hostname
    string runtimePort?; // MI management API port
    string tryItHost?; // Bare, reachable host/IP for this runtime process (BI), used by the Try-It proxy
    Node nodeInfo;
    Artifacts artifacts;
    string runtimeHash;
    time:Utc timestamp;
    map<log:Level> logLevels?; // BI log levels from heartbeat payload
    map<json> openApiDefinitions?; // OpenAPI (Swagger) definitions packed into the runtime's JAR, keyed by file name
    // The workflow metadata document published by the ICP runtime bridge when the
    // integration uses ballerina/workflow: definitions, human tasks, activities, and
    // durable agents, with their JSON schemas. Startup-constant per runtime process;
    // sent on full heartbeats once this server advertises "workflowMetadata".
    map<json> workflowMetadata?;
    // Capabilities the runtime advertises — e.g. "workflowCommands" when it accepts
    // tunneled workflow management commands. A capability-gated command must never be
    // sent to a runtime that did not advertise it (older bridges fail record binding
    // on unknown control actions).
    string[] capabilities?;
    // The Temporal task queue the integration's workflow worker serves. Runtime state
    // like capabilities — chosen at program startup, so it may differ between two
    // runtimes of one program — not part of the workflow metadata document. It is what
    // scopes a shared Temporal namespace to one integration.
    string workflowTaskQueue?;
};

// One runtime's stored workflow metadata row (bi_workflow_metadata).
public type WorkflowMetadataRecord record {
    @sql:Column {name: "runtime_id"}
    string runtimeId;
    @sql:Column {name: "component_id"}
    string componentId;
    string metadata; // the workflow metadata document as a JSON string
    string? capabilities; // comma-joined capability names, or () when none were advertised
    @sql:Column {name: "task_queue"}
    string? taskQueue; // the worker's Temporal task queue, or () from older bridges/modules
};

// Shape of a single entry in the runtime's GET /workflow/definitions response.
// Open record with optional fields so parsing tolerates missing/extra fields.
public type WorkflowDefinition record {
    string workflowType;
    string? inputSchema?;
    boolean isActive?;
    int workerCount?;
};
// Delta heartbeat with hash value.
// Open record for the same reason as Heartbeat above (tolerate unknown fields from newer agents).
public type DeltaHeartbeat record {
    string heartbeatVersion = "v1.0"; // Version of the heartbeat format
    string runtimeId; // Unique identifier for the runtime
    string runtimeHash;
    time:Utc timestamp;
};

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
    SET_LOGGER_LEVEL,
    // A tunneled workflow management operation, executed in-process by the runtime's ICP
    // bridge (no inbound network access to the integration or its Temporal server). Only
    // ever sent to runtimes that advertised the "workflowCommands" capability — older
    // bridges fail record binding on unknown actions. The command's payload carries
    // {commandId, operation, params, identity, deadline}; the runtime posts the outcome
    // to POST /icp/commandResult.
    WORKFLOW_MGMT
}

// The outcome of a tunneled workflow command, posted by the runtime's bridge to
// POST /icp/commandResult. Open record so newer bridges can add fields.
public type WorkflowCommandResult record {
    string runtimeId;
    string commandId;
    string status; // COMPLETED (operation executed) | FAILED (could not execute)
    int httpStatus; // the status code the runtime's management REST API would have returned
    json body; // byte-identical to the management REST API's response body
};

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
    string[] & readonly supportedHeartbeatFields = SUPPORTED_HEARTBEAT_FIELDS;
    // Boost hint: ask the bridge to send its next heartbeat this many seconds from now
    // (typically 1) instead of waiting for its regular interval — set while a user is
    // actively working with workflow views so tunneled commands round-trip quickly.
    int nextHeartbeatInSeconds?;
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

# Returns a qualified artifact name in the format `package:name` when the
# package is non-empty, or just `name` otherwise.  Used to build unique
# reconcile keys for BI artifacts that may share a name across packages.
# + name - Raw artifact name.
# + package - Optional package qualifier.
# + return - Qualified artifact name.
public isolated function qualifiedArtifactName(string name, string? package) returns string {
    if package is string && package.length() > 0 {
        return package + ":" + name;
    }
    return name;
}

# Extracts the raw artifact name from a potentially qualified name.
# If the name contains a `:`, everything after the last `:` is the raw name.
# + qualifiedName - Artifact name with or without a package qualifier.
# + return - Raw artifact name without the package qualifier.
public isolated function rawArtifactName(string qualifiedName) returns string {
    int? idx = qualifiedName.lastIndexOf(":");
    if idx is int {
        return qualifiedName.substring(idx + 1);
    }
    return qualifiedName;
}

public type DispatchFn isolated function (string runtimeId, ReconcileArtifactKey artifact, ReconcileAction[] actions) returns ControlCommand[]|error?;

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

public type ArtifactStateField record {|
    string value;
    boolean inSync;
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
# + runtime_id - field description
# + component_id - field description
# + artifact_name - field description
# + artifact_type - field description
# + action - field description
# + status - field description
# + issued_at - field description
# + sent_at - field description
# + acknowledged_at - field description
# + completed_at - field description
# + error_message - field description
# + issued_by - field description
public type MIRuntimeControlCommandDBRecord record {
    string runtime_id;
    string component_id;
    string artifact_name;
    string artifact_type;
    string action;
    string status;
    time:Utc issued_at;
    time:Utc? sent_at?;
    time:Utc? acknowledged_at?;
    time:Utc? completed_at?;
    string? error_message?;
    string? issued_by?;
};

# Database record for MI Artifact Intended State
#
# + component_id - Component ID that the artifact belongs to
# + artifact_name - Name of the artifact
# + artifact_type - Type of the artifact (e.g., API, Proxy Service, Endpoint)
# + action - Intended action/state for the artifact
public type MIArtifactIntendedStateDBRecord record {
    string component_id;
    string artifact_name;
    string artifact_type;
    string action;
};

# Database record for BI Artifact Intended State
#
# + target_artifact - Name of the target artifact
# + action - Intended action/state for the artifact
public type BIArtifactIntendedStateDBRecord record {
    string target_artifact;
    string action;
};

public type RuntimeDBRecord record {
    string runtime_id;
    string? name?; // Runtime name (optional)
    string runtime_type;
    string status;
    string environment_id;
    string project_id;
    string component_id;
    string version?;
    string runtime_hostname?;
    string runtime_port?;
    string callback_url?;
    string try_it_host?;
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
    // These columns are naive (no zone) and hold UTC wall-clock, as written by
    // convertUtcToDbDateTime. Binding them as time:Civil keeps the driver from
    // reinterpreting them in the JVM's local zone; convertDbDateTimeToUtc
    // attaches the zero offset on the way out.
    time:Civil registration_time?;
    time:Civil last_heartbeat?;
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

public type ControlCommandDBRecord record {
    string command_id;
    string runtime_id;
    string target_artifact;
    string action;
    time:Utc issued_at;
    string status;
    string? payload?;
};

// GraphQL response types
public type Runtime record {
    @sql:Column {
        name: "runtime_id"
    }
    string runtimeId;

    string? runtimeName?; // Optional runtime name

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
    OpenApiDefinitionRecord[] openApiDefinitions?;
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
    string? composite_app;
};

public type EndpointRecordInDB record {
    string endpoint_name;
    string endpoint_type;
    ArtifactState state;
    string tracing;
    string statistics = "disabled";
    string? composite_app;
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
    string? composite_app;
};

public type SequenceRecordInDB record {
    string sequence_name;
    string sequence_type?;
    string container?;
    ArtifactState state;
    string tracing;
    string statistics = "disabled";
    string? composite_app;
};

public type TaskRecordInDB record {
    string task_name;
    string task_class?;
    string task_group?;
    ArtifactState state;
    string? composite_app;
};

public type MessageStoreRecordInDB record {
    string store_name;
    string store_type;
    int size;
    string? composite_app;
};

public type MessageProcessorRecordInDB record {
    string processor_name;
    string processor_type;
    string processor_class?;
    ArtifactState state;
    string? composite_app;
};

public type LocalEntryRecordInDB record {
    string entry_name;
    string entry_type;
    string entry_value?;
    ArtifactState state;
    string? composite_app;
};

public type CompositeAppRecordInDB record {
    string app_name;
    string version = "";
    ArtifactState state;
    string? error_message?;
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

// OpenAPI (Swagger) definition packed into a BI runtime's JAR by the swagger-pack compiler
// plugin, as persisted in bi_service_openapi_definitions. `definition` is the raw JSON text -
// GraphQL has no JSON scalar in this schema, so it travels as a string for the frontend to parse.
public type OpenApiDefinitionRecord record {
    @sql:Column {
        name: "file_name"
    }
    string fileName;
    @sql:Column {
        name: "definition"
    }
    string definition;
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
    ArtifactState state = "enabled";
    boolean? stateInSync = ();
    @sql:Column {
        name: "service_type"
    }
    string 'type = "";
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
    ArtifactState state = "enabled";
    boolean? stateInSync = ();
    string[] runtimeIds?;
    ArtifactRuntimeInfo[]? runtimes?;
};

// Workflow definition deployed on a BI workflow runtime, fetched live from the
// runtime's GET /workflow/definitions API (via its workflowCallbackUrl). Exposed
// to the frontend as a service/listener-style artifact, keyed by `workflowType`
// (mapped to `name`).
public type Workflow record {
    string name; // workflowType — used as the entry-point identity
    boolean isActive = false;
    int workerCount = 0;
    string? inputSchema = ();
    ArtifactState state = "enabled"; // derived from isActive for the UI status chip
    ArtifactRuntimeInfo[]? runtimes?;
};

// Resolved target for a Try-It proxy request: the runtime's self-reported reachable host
// (try_it_host from the heartbeat) plus the requested listener's protocol, used together to
// pick http vs https when building the outbound base URL (see tryitScheme in tryit_proxy_service.bal).
public type TryItTarget record {|
    string host;
    string protocol;
|};

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
    ArtifactState state = "enabled";
    boolean? stateInSync = ();
    string tracing = "disabled";
    boolean? tracingInSync = ();
    string statistics = "disabled";
    boolean? statisticsInSync = ();
    @sql:Column {
        name: "composite_app"
    }
    string compositeApp?;
    ApiResource[] resources = [];
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
    ArtifactState state = "enabled";
    boolean? stateInSync = ();
    string tracing = "disabled";
    boolean? tracingInSync = ();
    string statistics = "disabled";
    boolean? statisticsInSync = ();
    @sql:Column {
        name: "composite_app"
    }
    string compositeApp?;
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
    ArtifactState state = "enabled";
    boolean? stateInSync = ();
    string tracing = "disabled";
    boolean? tracingInSync = ();
    string statistics = "disabled";
    boolean? statisticsInSync = ();
    @sql:Column {
        name: "composite_app"
    }
    string compositeApp?;
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
    string? protocol;
    string sequence?;
    @sql:Column {
        name: "statistics"
    }
    string statistics?;
    boolean? statisticsInSync = ();
    @sql:Column {
        name: "on_error"
    }
    string onError?;
    @sql:Column {
        name: "inbound_state"
    }
    ArtifactState state = "enabled";
    boolean? stateInSync = ();
    string tracing = "disabled";
    boolean? tracingInSync = ();
    @sql:Column {
        name: "composite_app"
    }
    string compositeApp?;
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
    ArtifactState state = "enabled";
    boolean? stateInSync = ();
    string tracing = "disabled";
    boolean? tracingInSync = ();
    string statistics = "disabled";
    boolean? statisticsInSync = ();
    @sql:Column {
        name: "composite_app"
    }
    string compositeApp?;
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
    ArtifactState state = "enabled";
    boolean? stateInSync = ();
    @sql:Column {
        name: "composite_app"
    }
    string compositeApp?;
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
        name: "composite_app"
    }
    string compositeApp?;
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
    ArtifactState state = "enabled";
    boolean? stateInSync = ();
    @sql:Column {
        name: "composite_app"
    }
    string compositeApp?;
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
    ArtifactState state = "enabled";
    boolean? stateInSync = ();
    @sql:Column {
        name: "composite_app"
    }
    string compositeApp?;
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
    ArtifactState state = "enabled";
    boolean? stateInSync = ();
    @sql:Column {
        name: "composite_app"
    }
    string compositeApp?;
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
    // Canonical deployment state exposed by the control plane: "Active" or "Faulty".
    @sql:Column {
        name: "dataservice_state"
    }
    string state = "Active";
    // Raw state reported by the runtime bridge in the heartbeat payload (e.g. "active", "faulty").
    string status?;
    boolean? stateInSync = ();
    @sql:Column {
        name: "composite_app"
    }
    string compositeApp?;
    // Error message when state is "Faulty" (data service failed to deploy)
    @sql:Column {
        name: "error_message"
    }
    string? errorMessage?;
    string[] runtimeIds?;
    ArtifactRuntimeInfo[]? runtimes?;
};

public type CompositeApp record {
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
    string status?;
    @sql:Column {
        name: "error_message"
    }
    string? errorMessage?;
    // Artifacts packaged within the Composite App (from heartbeat payload)
    CompositeAppArtifact[] artifacts?;
    string[] runtimeIds?;
    ArtifactRuntimeInfo[]? runtimes?;
};

// Artifact shape used inside CompositeApp
public type CompositeAppArtifact record {
    string name;
    string 'type; // e.g., "api", "endpoint"
};

// Response type for Composite App fault stack trace query
public type CompositeAppFaultStackTrace record {
    string runtimeId;
    string appName;
    string faultStackTrace;
};

// Response type for Data Service fault stack trace query
public type DataServiceFaultStackTrace record {
    string runtimeId;
    string serviceName;
    string faultStackTrace;
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
    string description?;
    @sql:Column {
        name: "connector_state"
    }
    ArtifactState state = "enabled";
    boolean? stateInSync = ();
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
    RuntimeType? componentType?; // Runtime type: "BI" or "MI"
    string technology?; // Technology: "WSO2MI", "Ballerina", etc.
    // Integration type, encoded the same way as devant: `displayType` carries the
    // type on its own (e.g. "ballerinaService", "scheduledTask"), and
    // `componentSubType` discriminates the types that share a generic service
    // displayType (e.g. AI Agent, MCP Server). Defaults to "service" when absent.
    string displayType?;
    string componentSubType?;

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
    RuntimeType? componentType?;
    string version?;
    string labels?;
    string serviceAccessMode?;
    // Integration type. Written as a pair with componentSubType — see
    // storage:updateComponent. Omit to leave the recorded type unchanged.
    string displayType?;

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
    string handler;
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
    string environmentHandler;
    string description?;
    boolean critical;
    string createdBy?;
};

public type OrgSecret record {
    @sql:Column {name: "key_id"}
    string keyId;
    @sql:Column {name: "environment_id"}
    string environmentId;
    @sql:Column {name: "key_material"}
    string keyMaterial;
    @sql:Column {name: "project_id"}
    string? projectId;
    @sql:Column {name: "component_id"}
    string? componentId;
    @sql:Column {name: "project_handler"}
    string? projectHandler;
    @sql:Column {name: "component_name"}
    string? componentName;
    @sql:Column {name: "runtime_type"}
    string? runtimeType;
    @sql:Column {name: "bound_at"}
    string? boundAt;
    @sql:Column {name: "created_at"}
    string createdAt?;
    @sql:Column {name: "created_by"}
    string? createdBy;
};

public type OrgSecretListEntry record {|
    string keyId;
    string environmentId;
    string environmentName;
    boolean bound;
    string createdAt;
    string? createdBy;
|};

public type BoundSecretRuntime record {|
    string runtimeId;
    string status;
|};

public type BoundSecretEntry record {|
    string keyId;
    string createdAt;
    string? createdBy;
    BoundSecretRuntime[] runtimes;
|};

public type DeleteRuntimeResult record {|
    boolean deleted;
    string? orphanedKeyId;
    boolean secretRevoked;
|};

public type ComponentInDB record {
    string component_id;
    string project_id;
    string component_name;
    string component_display_name?;
    string component_description?;
    string component_type; // NOT NULL in DB, should always have a value
    string component_display_type?; // NOT NULL in DB with DEFAULT 'service'
    string component_sub_type?;
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

// Lightweight runtime info for internal lookups
public type RuntimeInfo record {
    string status;
    string? name;
};

// Lightweight runtime reference for artifact availability
public type ArtifactRuntimeInfo record {
    string runtimeId;
    string? runtimeName?;
    string status;
};

// Runtime info for automation artifacts with execution timestamps
public type AutomationRuntimeInfo record {
    string runtimeId;
    string? runtimeName?;
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

# One series of workflow samples sharing a tag combination; `sample` says which event it counts.
# + tags - `workflow_type`, `activity_type`, `outcome`, `error_type`, `task_kind`, `task_name`, `tool_name`, `action`,
#          `data_name` + runtime tags
# + count - Events per interval; the duration fields apply where the sample carries `duration_seconds`
public type WorkflowMetricEntry record {
    string sample;
    map<string> tags;
    Metric count;
    Metric duration_seconds_avg;
    Metric duration_seconds_max;
    Metric duration_seconds_percentile_50;
    Metric duration_seconds_percentile_95;
    Metric duration_seconds_percentile_99;
};

# Workflow metrics for a set of runtimes, grouped by what each series counts.
# + agentSteps - `agent.*` series: model calls, tool calls, event waits, sleeps, task waits, tool reviews
# + controls - `workflow.suspended|resumed|terminated|cancelled` series
public type WorkflowMetricEntriesResponse record {
    WorkflowMetricEntry[] runs;
    WorkflowMetricEntry[] activities;
    WorkflowMetricEntry[] decisions;
    WorkflowMetricEntry[] dataEvents;
    WorkflowMetricEntry[] agentSteps = [];
    WorkflowMetricEntry[] controls = [];
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
    // Optional: auth backends that manage role-to-superadmin mapping (e.g. LDAP)
    // may include this to signal the ICP server to grant superadmin on login.
    boolean? isSuperAdmin;
};

// === OIDC/SSO Related Types ===

// SSO Configuration
public type SSOConfig record {|
    boolean enabled;
    string issuer;
    string authorizationEndpoint;
    string tokenEndpoint;
    string logoutEndpoint;
    string jwksUrl; // OIDC provider's JWKS endpoint for ID token signature validation
    string clientId;
    string clientSecret;
    string redirectUri;
    string usernameClaim; // "email" or "preferred_username"
    string[] scopes;
    boolean allowInsecureTLS;
    boolean passwordLoginDisabled;
    string adminClaim;
    string[] adminValues;
    boolean federatedAccessControlEnabled;
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

// Request for the RP-initiated logout URL. The ID token travels in the body rather
// than a query parameter so it is not retained in access logs or browser history.
public type OIDCLogoutRequest record {|
    string idTokenHint?; // Omitted when the client has no stored ID token
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
    map<json> rawClaims; // Full validated ID token payload for provider-specific claim extraction
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
    string? clientIp = ();
    string? userAgent = ();
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

public type EnvironmentHandlerAvailability record {
    boolean handlerUnique;
    string? alternateHandlerCandidate;
};

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

public type DataServiceDataSourceEntry record {|
    string name;
    string 'type?;
    Parameter[] properties = [];
|};

public type DataServiceQueryEntry record {|
    string name;
    string 'type?;
|};

public type DataServiceResourceEntry record {|
    string name;
    string 'type?;
|};

public type DataServiceOperationEntry record {|
    string name;
    string 'type?;
|};

public type DataServiceOverview record {|
    string serviceName;
    string serviceDescription?;
    string wsdl1_1?;
    string wsdl2_0?;
    string swagger_url?;
    DataServiceDataSourceEntry[] dataSources = [];
    DataServiceQueryEntry[] queries = [];
    DataServiceResourceEntry[] resources = [];
    DataServiceOperationEntry[] operations = [];
|};

// Input type for changing artifact status
public type ArtifactStatusChangeInput record {|
    string componentId;
    string artifactType; // e.g., "proxy-service", "endpoint", "inbound-endpoint", "message-processor"
    string artifactName;
    string status; // "active" or "inactive"
|};

public enum Status {
    SUCCESS,
    FAILED

}

// Response for artifact status change
public type ArtifactStatusChangeResponse record {|
    Status status; // "SUCCESS" or "FAILED"
    string message;
    int successCount; // Number of runtimes successfully updated
    int failedCount; // Number of runtimes that failed
    string[] details; // Detailed status per runtime
|};

// Input type for changing artifact tracing
public type ArtifactTracingChangeInput record {|
    string componentId;
    string environmentId;
    string artifactType; // e.g., "proxy-service"
    string artifactName;
    string trace; // "enable" or "disable"
|};

// Response for artifact tracing change
public type ArtifactTracingChangeResponse record {|
    Status status; // "SUCCESS" or "FAILED"
    string message;
    int successCount; // Number of runtimes successfully updated
    int failedCount; // Number of runtimes that failed
    string[] details; // Detailed status per runtime
|};

// Input type for changing artifact statistics
public type ArtifactStatisticsChangeInput record {|
    string componentId;
    string environmentId;
    string artifactType; // e.g., "proxy-service"
    string artifactName;
    string statistics; // "enable" or "disable"
|};

// Response for artifact statistics change
public type ArtifactStatisticsChangeResponse record {|
    Status status; // "SUCCESS" or "FAILED"
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
    Status status; // "SUCCESS" or "FAILED"
    string message;
    int successCount; // Number of runtimes successfully triggered
    int failedCount; // Number of runtimes that failed
    string[] details; // Detailed status per runtime
|};

// === Listener Control Types ===
public type ListenerControlInput record {|
    string[] runtimeIds;
    string listenerName;
    string listenerPackage?;
    int port?;
    ControlAction action;
|};

public type ListenerControlResponse record {|
    boolean success;
    string message;
    string[] commandIds;
|};

public type UpdateLogLevelInput record {|
    string[] runtimeIds;
    RuntimeType? componentType?; // Optional: if provided, skips runtime lookup
    // BI fields
    string? componentName?; // Required for BI, optional for MI
    string? componentPackage?; // Optional: package qualifier for BI
    // MI fields
    string? loggerName?; // Required for MI, optional for BI
    string? loggerClass?; // Optional: only for adding new logger in MI
    // Common fields
    LogLevel logLevel;
|};

public type UpdateLogLevelResponse record {|
    boolean success;
    string message;
    string[] commandIds; // For BI: command IDs, For MI: empty array (immediate update)
|};

public type DeleteLoggerInput record {|
    string[] runtimeIds;
    string loggerName;
|};

public type DeleteLoggerResponse record {|
    boolean success;
    string message;
|};

// ============================================================
// MI Runtime User Management Types
// ============================================================

public type MIUser record {|
    string username;
    string domain;
    boolean isAdmin;
|};

public type MIUsersResponse record {|
    MIUser[] users;
|};

public type MIUsersPage record {
    MIUser[] items;
    PageInfo pageInfo;
};

public type MIUserOperationResponse record {
    string username;
    string status;
};

public type ValidatedRuntime record {|
    string runtimeId;
    string componentId;
    Runtime runtime;
|};

public type SystemInfo record {|
    string version;
|};

// Reports whether the OpenSearch-backed observability metrics backend is
// configured and reachable. The UI uses this to decide the default metrics
// provider (falling back to Moesif when OpenSearch is not configured).
public type ObservabilityMetricsConfigStatus record {|
    boolean configured;
|};

// Reports whether an integration (project + component combo) has had its Moesif
// metrics dashboard created/linked. `dashboardsCreated` is true once the Moesif
// workspace/dashboard has been successfully discovered and recorded for the
// integration; this single flag drives the UI (setup vs. embedded dashboard).
public type MoesifMetricsConfigStatus record {|
    boolean dashboardsCreated;
|};

// Reports whether an integration (project + component combo) has had its Moesif
// application logs dashboard/canvas linked. `logsConfigured` is true once the
// logs canvas has been configured for the integration; this single flag drives
// the UI (setup vs. embedded logs canvas). Logs reuse the shared metrics canvas
// org/app/token credentials.
public type MoesifLogsConfigStatus record {|
    boolean logsConfigured;
|};

// A descriptor the UI uses to embed a Moesif metrics canvas in an iframe.
// `embedUrl` is the canvas iframe src (`.../wrap/app/{orgId}-{appId}/canvas#auth=post`)
// and `token` is the auth token the UI delivers to the canvas over postMessage
// (SET_TOKEN). The token is supplied by the user during setup and stored against
// the integration. The canvas layout itself is posted separately as the
// CANVAS_INIT template by the frontend.
public type MoesifDashboardEmbed record {|
    string embedUrl;
    string token;
|};

// A Moesif application the supplied Management API key can access.
public type MoesifApplication record {|
    string id;
    string name;
|};

// ============================================================================
// REQUEST CACHE
// ============================================================================
// Rows of cache_entry and cache_operation_outbox, shared by every ICP node: the node that
// accepts a user's request is usually not the node that delivers it to a runtime, so nothing
// about a request may live in memory.
//
// Both types are deliberately free of any workflow vocabulary. `kind` says what a row is
// about and `data` carries the rest, so a second feature wanting the same shape - answers
// that take a round trip to fetch, operations that need confirming - adds a kind rather than
// a table.
//
// Every time field is epoch SECONDS rather than a timestamp. They are compared on every
// read, claim and sweep, and integers compare identically on all five supported engines
// while timestamp arithmetic needs four implementations (see storage/database_dialect.bal).

// Lifecycle of a cached answer. A stale READY row is still served while its refresh runs, so
// "expired" is not the same as "unusable".
public const string CACHE_FETCHING = "FETCHING";
public const string CACHE_READY = "READY";
public const string CACHE_FAILED = "FAILED";

// Lifecycle of a queued operation. EXPIRED is the state that matters: it means nobody
// established the outcome, which is what has to reach a person rather than be dropped.
public const string CACHE_OP_PENDING = "PENDING";
public const string CACHE_OP_DELIVERED = "DELIVERED";
public const string CACHE_OP_COMPLETED = "COMPLETED";
public const string CACHE_OP_FAILED = "FAILED";
public const string CACHE_OP_EXPIRED = "EXPIRED";

// One row of cache_entry.
//
// `cacheKey` is computed from everything that makes the request unique - its kind, its owner,
// the request itself and the caller's identity - so none of those parts needs a column of its
// own. Two callers whose identity differs in a way the answer depends on compute different
// keys and cannot read each other's rows.
//
// `data` holds one document: the request, and the response once it arrives. One blob, because
// nothing queries inside it; the claim reads the request out, the result write adds the
// response beside it.
//
// `token` is non-nil exactly while a fetch is in flight, and is that fetch's id. It fences a
// late answer: a result carrying a token the row no longer holds belongs to a superseded or
// invalidated attempt and is discarded.
public type CacheEntry record {
    @sql:Column {name: "cache_key"}
    string cacheKey;
    string kind;
    // The scope this row belongs to, and what a delivery claim filters on.
    string owner;
    string? token = ();
    string status;
    @sql:Column {name: "expires_at"}
    int expiresAt;
    @sql:Column {name: "claimed_at"}
    int? claimedAt = ();
    string? data = ();
};

// An entry a heartbeat should ask a runtime to fill. `token` is the command id.
public type CachePendingFetch record {
    @sql:Column {name: "cache_key"}
    string cacheKey;
    string token;
    string data;
};

// One row of cache_operation_outbox.
//
// `operationId` is the caller's idempotency key as well as the command id, so a repeated
// submission collides on the primary key instead of becoming a second operation. `target`
// names who executes it - a runtime today, and nothing here assumes that.
public type CacheOperation record {
    @sql:Column {name: "operation_id"}
    string operationId;
    string target;
    // The scope this operation affects. Completing it invalidates that scope's cached
    // answers, so the value has to be here rather than derived from the target.
    string owner;
    string kind;
    string status;
    @sql:Column {name: "issued_at"}
    int issuedAt;
    int deadline;
    @sql:Column {name: "delivered_at"}
    int? deliveredAt = ();
    @sql:Column {name: "completed_at"}
    int? completedAt = ();
    string data;
    string? result = ();
};
