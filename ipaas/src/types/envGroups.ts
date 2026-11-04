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
  /** Every stored secret key, sorted. */
  secrets: string[];
  /**
   * The keys of `secrets` still in a group of their own (`mi-secret-<KEY>`), as saved
   * before all MI secrets moved to one `mi-secrets` group. Each moves there once it
   * is given a new value; until then it stays where it is.
   */
  legacySecrets: string[];
  /**
   * Keys in `mi-secrets` whose old `mi-secret-<KEY>` group also still exists. It is
   * left alone while the key stays a secret, and deleted once the key leaves `mi-secrets`.
   */
  shadowedLegacySecrets: string[];
  /**
   * The `mi-env-vars` group exists but is stored as a secret (e.g. made on Configs &
   * Secrets). Its values can't be read back, so the editor can't show or change them.
   */
  envVarsGroupIsSecret: boolean;
  /** The `mi-secrets` group exists but is not stored as a secret, so the editor leaves it alone. */
  secretsGroupIsPlain: boolean;
  /**
   * Keys set by the environment's other env-var groups (e.g. made on Configs & Secrets),
   * each mapped to its group's name. A key can belong to one group only, so MI can't
   * add these to a group. A key the group already has is let through (as the BFF
   * does), so a clash saved before the BFF checked for one still saves.
   */
  otherGroupKeys: Record<string, string>;
  /**
   * `otherGroupKeys` split by the kind of group that sets them. The BFF rejects a write of
   * a group listing a key that a group of the other kind also lists, even one it already has.
   */
  otherPlainGroupKeys: Record<string, string>;
  otherSecretGroupKeys: Record<string, string>;
}

/** The editor's result: secrets with a blank `value` keep their stored value. */
export interface MiConfigDraft {
  envVars: MiConfigEntry[];
  secrets: MiConfigEntry[];
}

/** One env-group write: replace a group (keeping the named stored secrets), or delete it. */
export type MiConfigWrite = { kind: 'put'; group: string; sensitive: boolean; data: Record<string, string>; keep?: string[] } | { kind: 'delete'; group: string };

/** The env-group writes, in order, that turn the stored MI configuration into a draft. */
export interface MiConfigSavePlan {
  writes: MiConfigWrite[];
}
