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

import type { GitRefType } from '../constants/build';

export interface DeployComponentInput {
  componentId: string;
  versionId: string;
  envId: string;
  sha: string;
  branch: string;
  shaDate: string;
  gitRefType: GitRefType;
  cron?: string;
  cronTimezone?: string;
  commitTag?: string;
}

export interface UpdateBuildpackConfigsInput {
  componentId: string;
  versionId: string;
  buildContext: string;
  languageVersion: string;
  // Left out, these keep the stored values.
  environmentVariables?: { id?: string; key: string; value: string }[];
  isUnitTestEnabled?: boolean;
  pullLatestSubmodules: boolean;
  enableTrivyScan: boolean;
}

export interface BuildEnvVar {
  id?: string;
  key: string;
  value: string;
}

export interface BuildStep {
  number: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface BuildStage {
  log: string | null;
  status: string | null;
  steps: BuildStep[];
}

export interface BuildRunLogs {
  init: BuildStage;
  build: BuildStage;
  deploy: BuildStage;
}
