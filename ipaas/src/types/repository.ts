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

export interface BuildpackConfig {
  versionId: string;
  buildContext: string;
  isUnitTestEnabled: boolean;
  languageVersion: string;
  // Absent when the build does not check out submodules.
  pullLatestSubmodules?: boolean;
  enableTrivyScan: boolean;
  keyValues?: Array<{ id?: string; key: string; value: string }>;
}

export interface Repository {
  gitProvider: string;
  organizationApp: string;
  nameApp: string;
  branch: string;
  appSubPath: string;
  bitbucketServerUrl?: string;
  serverUrl?: string;
  projectApp?: string;
  buildpackConfig?: BuildpackConfig[];
}

export interface Commit {
  sha: string;
  message: string;
  isLatest: boolean;
  author: {
    name: string;
    date: string;
    email: string;
    avatarUrl: string;
  };
}

export interface UserRepo {
  orgName: string;
  repositories: { name: string }[];
  /** GitHub App installation granting access to this account's repos (cloud GitHub-App flow only). */
  installationId?: string;
}

export interface RepoBranch {
  name: string;
  isDefault: boolean;
}

export interface RepoMetadata {
  isBareRepo: boolean;
  isSubPathEmpty: boolean;
  isSubPathValid: boolean;
  isValidRepo: boolean;
  hasBallerinaTomlInPath: boolean;
  hasBallerinaTomlInRoot: boolean;
  isDockerfilePathValid: boolean;
  hasDockerfileInPath: boolean;
  hasPomXmlInPath: boolean;
  hasPomXmlInRoot: boolean;
  isBuildpackPathValid: boolean;
  isProcfileExists: boolean;
  isEndpointYamlExists: boolean;
}

export type DetectedMode = 'mi' | 'ballerina' | 'empty' | 'non-empty' | null;

export interface RepoTreeNode {
  path: string;
  subPath: string;
  type: 'tree' | 'blob';
  children?: RepoTreeNode[];
}

export interface ChoreoSampleImageEntry {
  name: string;
  [key: string]: unknown;
}
