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

/** What a plan allows the configs of one component in one environment. 0 is no limit. */
export interface ConfigLimits {
  maxEnvGroups: number;
  maxEnvVarsPerGroup: number;
  /** Bytes of one env var's value. */
  maxEnvValueBytes: number;
  /** Files whose content is stored inline. Secret files don't count. */
  maxPlainFiles: number;
  /** Bytes of one file's content, plain or secret. */
  maxFileBytes: number;
}

/** ipaas-service holds the same limits (services/config_limits.go) and enforces them. */
export const CONFIG_LIMITS: Record<'free' | 'paid', ConfigLimits> = {
  free: { maxEnvGroups: 5, maxEnvVarsPerGroup: 20, maxEnvValueBytes: 4 * 1024, maxPlainFiles: 2, maxFileBytes: 150 * 1024 },
  paid: { maxEnvGroups: 0, maxEnvVarsPerGroup: 0, maxEnvValueBytes: 4 * 1024, maxPlainFiles: 0, maxFileBytes: 150 * 1024 },
};
