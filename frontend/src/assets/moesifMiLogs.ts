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

// MI already writes server logs to <MI_HOME>/repository/logs/wso2carbon.log.
// A Fluent Bit sidecar tails that file, joins multi-line entries (stack
// traces), parses each "[time] LEVEL {module} - message" line into the OTLP
// severity and a `module` log attribute (the Log Severity / Module columns of
// the shared logs canvas), and sends records to Moesif over OTLP, following the
// BI logs setup. No MI runtime configuration change is needed.
// Each sidecar adds its ICP runtime id as the OTLP resource attribute
// icp.runtimeId, which Moesif stores as resource.icp.runtimeId for the logs
// canvas filter (the same attribute the BI logs sidecar sets).

const MI_LOGS_FLUENT_BIT_YAML = `service:
  flush: 5
  log_level: info

pipeline:
  inputs:
    - name: tail
      path: /var/log/wso2mi/wso2carbon.log
      tag: mi.logs
      read_from_head: false
      refresh_interval: 5
      buffer_max_size: 64KB
      skip_long_lines: on
      skip_empty_lines: on
      mem_buf_limit: 10MB
      inotify_watcher: false
      db: /var/lib/fluent-bit/mi-logs.db
      # Join stack traces and other continuation lines onto the entry that
      # starts with a "[yyyy-MM-dd HH:mm:ss,SSS]" timestamp.
      multiline.parser: mi_carbon_multiline

      processors:
        logs:
          # Parse "[time] LEVEL {module} - message" so the level and module are
          # available as record keys for severity mapping and log attributes.
          - name: parser
            key_name: log
            parser: mi_carbon
            # Keep the raw line: it is the OTLP log body (logs_body_key).
            preserve_key: true
            reserve_data: true

          # Derive the OTLP severity_number from the parsed level. Defaults to
          # INFO (9) when the level is missing/unknown.
          - name: lua
            call: set_severity
            code: |
              function set_severity(tag, timestamp, record)
                  local level = record["level"]
                  local map = {
                      TRACE = 1,
                      DEBUG = 5,
                      INFO  = 9,
                      WARN  = 13,
                      ERROR = 17,
                      FATAL = 21
                  }
                  local num = map[level]
                  if num == nil then
                      num = 9
                      record["level"] = "INFO"
                  end
                  record["severity_number"] = num
                  return 2, timestamp, record
              end

          # Wrap records in an OTLP envelope so resource attributes can be set.
          - name: opentelemetry_envelope

          - name: content_modifier
            action: upsert
            context: otel_resource_attributes
            key: service.name
            value: WSO2-MI

          # This sidecar tails exactly one runtime, so its id is set once as a
          # resource attribute, matching the BI logs sidecar and the Runtime
          # filter on the shared ICP logs canvas.
          - name: content_modifier
            action: upsert
            context: otel_resource_attributes
            key: icp.runtimeId
            value: \${ICP_RUNTIME_ID}

  outputs:
    - name: opentelemetry
      match: mi.logs
      host: \${MOESIF_HOST}
      port: 443
      tls: true
      tls.verify: on
      logs_uri: /v1/logs
      logs_body_key: log
      # Map the parsed level -> SeverityText and computed severity_number
      # -> SeverityNumber.
      logs_severity_text_message_key: level
      logs_severity_number_message_key: severity_number
      logs_body_key_attributes: on
      header:
        - X-Moesif-Application-Id \${MOESIF_APPLICATION_ID}
      workers: 2
      retry_limit: 3

parsers:
  # MI carbon log line: "[2026-09-24 11:52:12,226]  INFO {org.apache...} - message".
  # The timestamp is not parsed (it carries no zone), so the record keeps its
  # read time.
  - name: mi_carbon
    format: regex
    regex: '^\\[[^\\]]+\\]\\s+(?<level>[A-Z]+)\\s+\\{(?<module>[^}]*)\\}'

multiline_parsers:
  - name: mi_carbon_multiline
    type: regex
    flush_timeout: 1000
    rules:
      - state: start_state
        regex: '/^\\[\\d{4}-\\d{2}-\\d{2} /'
        next_state: cont
      - state: cont
        regex: '/^(?!\\[\\d{4}-\\d{2}-\\d{2} )/'
        next_state: cont
`;

// Mount logs read-only and persist tail offsets across sidecar restarts.
// Use the same Fluent Bit version as the BI logs bundle.
const MI_LOGS_DOCKER_COMPOSE_YAML = `services:
  fluent-bit:
    image: fluent/fluent-bit:4.2.2
    volumes:
      - \${MI_HOME}/repository/logs:/var/log/wso2mi:ro
      - ./fluent-bit.yaml:/fluent-bit/etc/fluent-bit.yaml:ro
      - fluent-bit-mi-logs-db:/var/lib/fluent-bit
    command: ["/fluent-bit/bin/fluent-bit", "-c", "/fluent-bit/etc/fluent-bit.yaml"]
    environment:
      - MOESIF_APPLICATION_ID=\${MOESIF_APPLICATION_ID}
      - MOESIF_HOST=\${MOESIF_HOST:-api.moesif.net}
      - ICP_RUNTIME_ID=\${ICP_RUNTIME_ID:?Set ICP_RUNTIME_ID in .env}
    restart: unless-stopped

volumes:
  fluent-bit-mi-logs-db:
`;

// Builds the .env file, injecting the selected Moesif Collector Application ID.
// MI_HOME must be set by the user to their MI installation path (its
// repository/logs directory is mounted into Fluent Bit), and ICP_RUNTIME_ID
// to the runtime whose logs this sidecar ships.
export function miLogsFluentBitEnv(applicationId: string): string {
  return `# Moesif Collector Application Id (Account -> API Keys -> Collector Application Id)
# Sent as the X-Moesif-Application-Id header on the OTLP /v1/logs requests.
MOESIF_APPLICATION_ID=${applicationId}

# Absolute path to the MI installation (its repository/logs is mounted into Fluent Bit)
MI_HOME=<MI_HOME>

# The ICP runtime id whose logs this sidecar ships, copied from the runtime's
# details in ICP. Sent on every record as the icp.runtimeId resource attribute and
# matched by the Runtime filter on the ICP logs dashboard, so logs stay
# attributed to the right runtime. Run one sidecar per runtime.
ICP_RUNTIME_ID=<RUNTIME_ID>

# Moesif collector host (api.moesif.net for production)
MOESIF_HOST=api.moesif.net
`;
}

// The static Fluent Bit files that make up the sidecar, keyed by filename. The
// .env is generated separately since it embeds the Collector Application ID.
export const MI_LOGS_FLUENT_BIT_FILES: Record<string, string> = {
  'fluent-bit.yaml': MI_LOGS_FLUENT_BIT_YAML,
  'docker-compose.yaml': MI_LOGS_DOCKER_COMPOSE_YAML,
};

// The folder the zip entries live under, so unzipping produces a single tidy
// directory the user can `cd` into and run `docker compose up -d`.
const MI_LOGS_FLUENT_BIT_ZIP_FOLDER = 'moesif-fluent-bit-mi-logs';

// Suggested filename when the user downloads the Fluent Bit config bundle.
export const MI_LOGS_FLUENT_BIT_ZIP_FILENAME = 'moesif-fluent-bit-mi-logs.zip';

// Downloads all Fluent Bit sidecar files (including a .env with the
// supplied Collector Application ID) as a single zip. The user unzips it, sets
// MI_HOME, the ICP runtime id + the Collector Application ID in the .env, then
// runs `docker compose up -d`.
export function downloadMoesifMiLogsFluentBitFiles(applicationId: string): void {
  const entries: Record<string, string> = { ...MI_LOGS_FLUENT_BIT_FILES, '.env': miLogsFluentBitEnv(applicationId) };
  downloadConfigBundle(entries, MI_LOGS_FLUENT_BIT_ZIP_FOLDER, MI_LOGS_FLUENT_BIT_ZIP_FILENAME);
}
