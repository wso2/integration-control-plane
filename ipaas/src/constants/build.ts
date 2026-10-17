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

export const BuildDrawerType = {
  BuildLogs: 'buildLogs',
  CommitSelector: 'commitSelector',
  BuildConfig: 'buildConfig',
} as const;
export type BuildDrawerType = (typeof BuildDrawerType)[keyof typeof BuildDrawerType];

export const GitRefType = {
  Commit: 'commit',
  Tag: 'tag',
} as const;
export type GitRefType = (typeof GitRefType)[keyof typeof GitRefType];

export const BUILD_STAGES = [
  { key: 'init' as const, label: 'Initialization' },
  { key: 'build' as const, label: 'Build Source & Test' },
  { key: 'deploy' as const, label: 'Finalization' },
];

export const BUILD_DRAWER_TITLES: Record<BuildDrawerType, string> = {
  [BuildDrawerType.BuildLogs]: 'Build Details',
  [BuildDrawerType.CommitSelector]: 'All Commits',
  [BuildDrawerType.BuildConfig]: 'Build Configuration',
};

export const STEPPER_ICON_COL = 36;
export const STEPPER_ICON_SIZE = 18;
/** Top/bottom padding on the icon box (matches py: 1 = 8px MUI spacing) */
export const STEPPER_ICON_PY = 8;
/** Where the connector line starts below a stage icon */
export const STEPPER_LINE_TOP = STEPPER_ICON_PY + STEPPER_ICON_SIZE + 2;
/** How far the connector line extends past its container to reach the next icon */
export const STEPPER_LINE_BOTTOM_EXT = STEPPER_ICON_PY + STEPPER_ICON_SIZE / 2;

/**
 * Regex for valid build environment variable names. Uppercase only: the Ballerina
 * buildpack loads every build env var into its own build script's shell variables,
 * which are lowercase. The build enforces the same rules as the BFF and this editor.
 */
export const ENV_KEY_RE = /^[A-Z_][A-Z0-9_]*$/;

export const MAX_BUILD_ENV_KEY_LENGTH = 256;
export const MAX_BUILD_ENV_VALUE_BYTES = 4096;

/** Build env names the platform sets, or that steer the build's shell, loader, engine or network. */
export const RESERVED_BUILD_ENV_KEYS = [
  'IFS', 'BASH_ENV', 'ENV', 'SHELLOPTS', 'BASHOPTS', 'PS4',
  'LD_PRELOAD', 'LD_AUDIT', 'LD_LIBRARY_PATH', 'PATH', 'HOME',
  'DOCKER_HOST', 'DOCKER_API_VERSION',
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'ALL_PROXY',
  'PRIVATE_APP_TOKEN', 'BAL_CENTRAL_TOKEN', 'BUILD_PATH',
  'BALLERINA_PROD_CENTRAL', 'DISABLE_BAL_OBSERVABILITY',
  'BALLERINA_DISTRIBUTION_HOST', 'JAVA_HOME', 'BALLERINA_HOME',
];

/** Prefixes reserved for the buildpack lifecycle. */
export const RESERVED_BUILD_ENV_PREFIXES = ['CNB_'];

/** The only bal build flags OTHER_BAL_BUILD_ARGS may add; the build supplies its own. */
export const BAL_BUILD_ARG_FLAGS = [
  '--offline',
  '--show-dependency-diagnostics',
  '--optimize-dependency-compilation',
  '--list-conflicted-classes',
  '--experimental',
];
