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

/**
 * Whether the Deploy page offers "Auto deploy on build" for Ballerina and MI integrations.
 * Off while ipaas-service deploys their builds itself (it refuses turning auto-deploy
 * on for them); turn it back on together with ipaas-service's openChoreoAutoDeploy.
 * isAutoDeployOffered decides the switch for every integration.
 */
export const AUTO_DEPLOY_AVAILABLE = false;

export const BUILD_STAGES = [
  { key: 'init' as const, label: 'Initialization' },
  { key: 'build' as const, label: 'Build source & test' },
  { key: 'deploy' as const, label: 'Finalization' },
];

export const BUILD_DRAWER_TITLES: Record<BuildDrawerType, string> = {
  [BuildDrawerType.BuildLogs]: 'Build details',
  [BuildDrawerType.CommitSelector]: 'All commits',
  [BuildDrawerType.BuildConfig]: 'Build configuration',
};

export const STEPPER_ICON_COL = 36;
export const STEPPER_ICON_SIZE = 18;
/** Top/bottom padding on the icon box (matches py: 1 = 8px MUI spacing) */
export const STEPPER_ICON_PY = 8;
/** Where the connector line starts below a stage icon */
export const STEPPER_LINE_TOP = STEPPER_ICON_PY + STEPPER_ICON_SIZE + 2;
/** How far the connector line extends past its container to reach the next icon */
export const STEPPER_LINE_BOTTOM_EXT = STEPPER_ICON_PY + STEPPER_ICON_SIZE / 2;

/** Regex for valid environment variable key names */
export const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
