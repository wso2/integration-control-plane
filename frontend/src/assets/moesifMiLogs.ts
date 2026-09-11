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
// A Fluent Bit sidecar tails that file and sends records to Moesif over OTLP,
// following the BI logs setup. No MI runtime configuration change is needed.
// Each sidecar adds its ICP runtime id as a log attribute (icp_runtimeId),
// which Moesif stores as metadata.icp_runtimeId for the logs canvas filter.

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

      processors:
        logs:
          # Keep the original line as the body and the runtime id as a
          # queryable log attribute for the ICP logs dashboard.
          - name: content_modifier
            action: upsert
            context: body
            key: icp_runtimeId
            value: \${ICP_RUNTIME_ID}

          - name: opentelemetry_envelope

          - name: content_modifier
            action: upsert
            context: otel_resource_attributes
            key: service.name
            value: WSO2-MI

  outputs:
    - name: opentelemetry
      match: mi.logs
      host: \${MOESIF_HOST}
      port: 443
      tls: true
      tls.verify: on
      logs_uri: /v1/logs
      logs_body_key: log
      logs_body_key_attributes: on
      header:
        - X-Moesif-Application-Id \${MOESIF_APPLICATION_ID}
      workers: 2
      retry_limit: 3
`;

// Mount logs read-only and persist tail offsets across sidecar restarts.
// Use the same Fluent Bit version as the BI logs bundle.
const MI_LOGS_DOCKER_COMPOSE_YAML = `services:
  fluent-bit:
    image: fluent/fluent-bit:4.2.2
    container_name: fluent-bit-moesif-mi-logs
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
# details in ICP. Sent on every record as the icp_runtimeId log attribute and
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
