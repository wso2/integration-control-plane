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

/**
 * A named bundle of environment variables on one (component, environment).
 * `sensitive` groups are stored as secrets; their values are write-only.
 */
export interface EnvGroup {
  name: string;
  sensitive: boolean;
  keys: string[];
  /** KEY→value; only filled by a single-group read, and blank for sensitive groups. */
  data: Record<string, string>;
}

/** One environment variable or secret row in the MI configuration editor. */
export interface MiConfigEntry {
  key: string;
  value: string;
}

/**
 * The MI configuration of one environment, as the editor shows it. Secret values
 * are write-only, so `secrets` carries keys only.
 */
export interface MiConfig {
  envVars: MiConfigEntry[];
  secrets: string[];
}

/** The editor's result: secrets with a blank `value` keep their stored value. */
export interface MiConfigDraft {
  envVars: MiConfigEntry[];
  secrets: MiConfigEntry[];
}

/** The env-group writes that turn the stored MI configuration into a draft. */
export interface MiConfigSavePlan {
  /** New env-var group data; `null` deletes the group; `undefined` leaves it as is. */
  envVars?: Record<string, string> | null;
  secretsToPut: MiConfigEntry[];
  secretsToDelete: string[];
}
