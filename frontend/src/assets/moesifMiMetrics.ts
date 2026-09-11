/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { downloadConfigBundle } from './moesifConfigBundle';

// Runtime-side configuration for publishing WSO2 Integrator: MI (Micro
// Integrator) metrics to Moesif. Unlike BI, MI has no built-in Moesif reporter,
// so metrics are written to a log by MI's analytics publisher and a Fluent Bit
// sidecar tails that log and ships the events to Moesif's actions endpoint.
//
// The setup therefore has three parts, surfaced in the metrics view:
//   1. Enable statistics + analytics (log publisher) in <MI_HOME>/conf/deployment.toml
//   2. Add the analytics appender + logger to <MI_HOME>/conf/log4j2.properties
//   3. Run the Fluent Bit sidecar (the files bundled below) which tails
//      synapse-analytics.log and posts to Moesif using the Collector
//      Application ID.
// Based on the WSO2 MI Moesif metrics setup guide:
// https://mi.docs.wso2.com/en/latest/observe-and-manage/classic-observability-metrics/moesif-metrics/setup/

// deployment.toml: enable Synapse statistics collection and the analytics log
// publisher. Added under <MI_HOME>/conf/deployment.toml. The `id` is a
// placeholder that the user must replace with a unique identifier per MI server;
// servers publishing to the same Moesif application must each use a distinct id
// so their metrics can be told apart.
export const MI_DEPLOYMENT_TOML_SNIPPET = `[mediation]
flow.statistics.enable=true
flow.statistics.capture_all=true

[analytics]
enabled=true
publisher="log"
id="<UNIQUE_MI_SERVER_ID>"
prefix="SYNAPSE_ANALYTICS_DATA"
api_analytics.enabled=true
proxy_service_analytics.enabled=true
sequence_analytics.enabled=true
endpoint_analytics.enabled=true
inbound_endpoint_analytics.enabled=true`;

// log4j2.properties: the appender + logger definitions that route analytics data
// to a dedicated synapse-analytics.log. In addition to pasting these blocks, the
// appender name must be added to the `appenders` list and the logger name to the
// `loggers` list in <MI_HOME>/conf/log4j2.properties.
export const MI_LOG4J2_SNIPPET = `# 1. Append SYNAPSE_ANALYTICS_APPENDER to the existing "appenders" list and
#    SynapseAnalytics to the existing "loggers" list.
# 2. Add the appender definition:
appender.SYNAPSE_ANALYTICS_APPENDER.type = RollingFile
appender.SYNAPSE_ANALYTICS_APPENDER.name = SYNAPSE_ANALYTICS_APPENDER
appender.SYNAPSE_ANALYTICS_APPENDER.fileName = \${sys:carbon.home}/repository/logs/synapse-analytics.log
appender.SYNAPSE_ANALYTICS_APPENDER.filePattern = \${sys:carbon.home}/repository/logs/synapse-analytics-%d{MM-dd-yyyy}-%i.log
appender.SYNAPSE_ANALYTICS_APPENDER.layout.type = PatternLayout
appender.SYNAPSE_ANALYTICS_APPENDER.layout.pattern = %d{HH:mm:ss,SSS} [%X{ip}-%X{host}] [%t] %5p %c{1} %m%n
appender.SYNAPSE_ANALYTICS_APPENDER.policies.type = Policies
appender.SYNAPSE_ANALYTICS_APPENDER.policies.time.type = TimeBasedTriggeringPolicy
appender.SYNAPSE_ANALYTICS_APPENDER.policies.time.interval = 1
appender.SYNAPSE_ANALYTICS_APPENDER.policies.time.modulate = true
appender.SYNAPSE_ANALYTICS_APPENDER.policies.size.type = SizeBasedTriggeringPolicy
appender.SYNAPSE_ANALYTICS_APPENDER.policies.size.size=1000MB
appender.SYNAPSE_ANALYTICS_APPENDER.strategy.type = DefaultRolloverStrategy
appender.SYNAPSE_ANALYTICS_APPENDER.strategy.max = 10

# 3. Add the logger definition:
logger.SynapseAnalytics.name = org.wso2.micro.integrator.analytics.messageflow.data.publisher.publish.elasticsearch.ElasticStatisticsPublisher
logger.SynapseAnalytics.level = INFO
logger.SynapseAnalytics.additivity = false
logger.SynapseAnalytics.appenderRef.SYNAPSE_ANALYTICS_APPENDER.ref = SYNAPSE_ANALYTICS_APPENDER`;

// ── Fluent Bit sidecar files ──

const FLUENT_BIT_CONF = `[SERVICE]
    Flush        5
    Log_Level    info
    Parsers_File metrics-parsers.conf
    HTTP_Server  On
    Health_Check On

[INPUT]
    Name              tail
    Path              \${LOG_FILE_PATH}
    Tag               moesif.metrics
    Read_from_Head    false
    Refresh_Interval  5
    Buffer_Max_Size   64KB
    Skip_Long_Lines   On
    DB                /var/log/fluent-bit-moesif.db
    Mem_Buf_Limit     10MB
    Inotify_Watcher   false

[FILTER]
    Name    grep
    Match   moesif.metrics
    Regex   log SYNAPSE_ANALYTICS_DATA

[FILTER]
    Name         parser
    Match        moesif.metrics
    Key_Name     log
    Parser       json_str_extract
    Reserve_Data Off

[FILTER]
    Name         parser
    Match        moesif.metrics
    Key_Name     json_str
    Parser       parse_json
    Reserve_Data Off

[FILTER]
    Name   lua
    Match  moesif.metrics
    script metrics-transform.lua
    call   transform_moesif_metrics

[OUTPUT]
    Name                 http
    Match                moesif.metrics
    Host                 \${MOESIF_HOST}
    Port                 443
    uri                  /v1/actions/batch
    header               Content-Type application/json
    header               X-Moesif-Application-Id \${MOESIF_APPLICATION_ID}
    format               json
    compress             gzip
    json_date_key        false
    workers              2
    tls                  true
    tls.verify           On
    Retry_Limit          3
    Log_response_payload On
`;

const METRICS_PARSERS_CONF = `[PARSER]
    Name        json_str_extract
    Format      regex
    Regex       SYNAPSE_ANALYTICS_DATA\\s+(?<json_str>.+)$

[PARSER]
    Name        parse_json
    Format      json
    Time_Keep   Off
`;

const METRICS_TRANSFORM_LUA = `function generate_transaction_id()
    local template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
    local uuid = string.gsub(template, '[xy]', function(c)
        local v = (c == 'x') and math.random(0, 0xf) or math.random(8, 0xb)
        return string.format('%x', v)
    end)
    return uuid
end

function get_action_name(entity_type)
    local action_mapping = {
        API = "api_metrics_action",
        SequenceMediator = "sequence_metrics_action",
        ProxyService = "proxy_service_metrics_action",
        Endpoint = "endpoint_metrics_action",
        InboundEndpoint = "inbound_endpoint_metrics_action"
    }
    return action_mapping[entity_type] or "unknown_metrics_action"
end

function transform_moesif_metrics(tag, timestamp, record)
    if not _G.random_initialized then
        math.randomseed(os.time() + os.clock() * 1000000)
        math.random(); math.random(); math.random()
        _G.random_initialized = true
    end

    local output = {}

    local entity_type = record["payload"] and record["payload"]["entityType"]
    if entity_type then
        output["action_name"] = get_action_name(entity_type)
    else
        output["action_name"] = "unknown_metrics_action"
    end

    output["transaction_id"] = generate_transaction_id()

    output["request"] = {
        time = record["timestamp"]
    }

    output["metadata"] = {}

    if record["serverInfo"] then
        output["metadata"]["serverInfo"] = record["serverInfo"]
    end

    if record["schemaVersion"] then
        output["metadata"]["schemaVersion"] = record["schemaVersion"]
    end

    if record["payload"] then
        local payload = record["payload"]

        for key, value in pairs(payload) do
            output["metadata"][key] = value
        end
    end

    -- Set this after copying the payload so it always identifies the runtime
    -- whose analytics log this sidecar ships.
    output["metadata"]["icp_runtimeId"] = os.getenv("ICP_RUNTIME_ID")

    return 2, timestamp, output
end
`;

const DOCKER_COMPOSE_YAML = `services:
  fluent-bit:
    image: fluent/fluent-bit:3.0
    container_name: fluent-bit-moesif
    volumes:
      - \${MI_HOME}/repository/logs:/logs:ro
      - ./fluent-bit.conf:/fluent-bit/etc/fluent-bit.conf:ro
      - ./metrics-parsers.conf:/fluent-bit/etc/metrics-parsers.conf:ro
      - ./metrics-transform.lua:/fluent-bit/etc/metrics-transform.lua:ro
      - fluent-bit-db:/var/log
    environment:
      - MOESIF_APPLICATION_ID=\${MOESIF_APPLICATION_ID}
      - ICP_RUNTIME_ID=\${ICP_RUNTIME_ID:?Set ICP_RUNTIME_ID in .env}
      - LOG_FILE_PATH=\${LOG_FILE_PATH:-/logs/synapse-analytics.log}
      - MOESIF_HOST=\${MOESIF_HOST:-api.moesif.net}
    ports:
      - "2020:2020"
    restart: unless-stopped
    # The fluent/fluent-bit image ships no shell/curl, so container health is
    # monitored externally via Fluent Bit's built-in health endpoint
    # (Health_Check On), e.g. GET http://<host>:2020/api/v1/health.

volumes:
  fluent-bit-db:
`;

// Builds the Fluent Bit .env file, injecting the selected Moesif Collector
// Application ID. Set MI_HOME to the MI installation path and ICP_RUNTIME_ID
// to the registered runtime whose analytics log this sidecar ships.
export function miFluentBitEnv(applicationId: string): string {
  return `# Moesif Collector Application Id (Account -> API Keys -> Collector Application Id)
MOESIF_APPLICATION_ID=${applicationId}

# Absolute path to the MI installation (its repository/logs is mounted into Fluent Bit)
MI_HOME=<MI_HOME>

# Copy the runtime ID from its details in ICP. Run one sidecar per runtime.
# Sent as metadata.icp_runtimeId for the metrics dashboard's Runtime filter.
ICP_RUNTIME_ID=<RUNTIME_ID>

# Path (inside the container) of the analytics log to tail
LOG_FILE_PATH=/logs/synapse-analytics.log

# Moesif collector host
MOESIF_HOST=api.moesif.net
`;
}

// The static Fluent Bit files that make up the sidecar, keyed by filename. The
// .env is generated separately since it embeds the Collector Application ID.
export const MI_FLUENT_BIT_FILES: Record<string, string> = {
  'fluent-bit.conf': FLUENT_BIT_CONF,
  'metrics-parsers.conf': METRICS_PARSERS_CONF,
  'metrics-transform.lua': METRICS_TRANSFORM_LUA,
  'docker-compose.yaml': DOCKER_COMPOSE_YAML,
};

// The folder the zip entries live under, so unzipping produces a single tidy
// directory the user can `cd` into and run `docker compose up -d`.
const MI_FLUENT_BIT_ZIP_FOLDER = 'moesif-fluent-bit';

// Suggested filename when the user downloads the Fluent Bit config bundle.
export const MI_FLUENT_BIT_ZIP_FILENAME = 'moesif-fluent-bit.zip';

// Downloads all Fluent Bit sidecar files (including a .env with the supplied
// Collector Application ID) as a single zip. The user unzips it, sets MI_HOME,
// ICP_RUNTIME_ID and the Collector Application ID in .env, then runs
// `docker compose up -d`.
export function downloadMoesifMiFluentBitFiles(applicationId: string): void {
  const entries: Record<string, string> = { ...MI_FLUENT_BIT_FILES, '.env': miFluentBitEnv(applicationId) };
  downloadConfigBundle(entries, MI_FLUENT_BIT_ZIP_FOLDER, MI_FLUENT_BIT_ZIP_FILENAME);
}
