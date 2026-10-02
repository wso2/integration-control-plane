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

import { gql } from './graphql';
import { getOrgUuidFromToken } from '#auth';
import { GitProvider, type CreateGitCredentialInput, type CredentialDeleteEligibility, type GitCredential } from '../../types/credentials';

// Git credentials live on the projects GraphQL endpoint (same as Devant). Values
// are interpolated into the document, so escape any quotes/backslashes/newlines.
const orgUuid = () => getOrgUuidFromToken() ?? '';
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
const CRED_FIELDS = 'id name createdAt organizationUuid type referenceToken serverUrl';

function providerConfig(input: CreateGitCredentialInput): string {
  switch (input.type) {
    case GitProvider.BITBUCKET_CLOUD:
      return `bitbucketCredential: { userName: "${esc(input.bitbucketCredential.userName)}", appPassword: "${esc(input.bitbucketCredential.appPassword)}" }`;
    case GitProvider.BITBUCKET_SERVER:
      return `bitbucketServerConfig: { serverUrl: "${esc(input.bitbucketServerConfig.serverUrl.replace(/\/$/, ''))}", serverToken: "${esc(input.bitbucketServerConfig.serverToken)}" }`;
    case GitProvider.GITLAB_SELF_MANAGED:
      return `gitLabServerConfig: { serverUrl: "${esc(input.gitLabServerConfig.serverUrl.replace(/\/$/, ''))}", pat: "${esc(input.gitLabServerConfig.pat)}" }`;
    case GitProvider.AZURE_DEVOPS:
      return `azureDevOpsConfig: { organizationName: "${esc(input.azureDevOpsConfig.organizationName)}", pat: "${esc(input.azureDevOpsConfig.pat)}" }`;
    default:
      return '';
  }
}

export async function fetchGitCredentials(): Promise<GitCredential[]> {
  const d = await gql<{ commonCredentials: GitCredential[] }>(`query { commonCredentials(orgUuid: "${esc(orgUuid())}") { ${CRED_FIELDS} } }`);
  return d.commonCredentials ?? [];
}

export async function createGitCredential(input: CreateGitCredentialInput): Promise<GitCredential> {
  const d = await gql<{ createCommonCredential: GitCredential[] | GitCredential }>(
    `mutation { createCommonCredential(credential: { name: "${esc(input.name)}", type: "${input.type}", orgUuid: "${esc(orgUuid())}", ${providerConfig(input)} }) { ${CRED_FIELDS} } }`,
  );
  const created = Array.isArray(d.createCommonCredential) ? d.createCommonCredential[0] : d.createCommonCredential;
  if (!created) throw new Error('Failed to create credential: the server returned an empty result.');
  return created;
}

export async function checkGitCredentialDeletion(credentialId: string): Promise<CredentialDeleteEligibility> {
  const d = await gql<{ checkDeleteCommonCredentialV2: CredentialDeleteEligibility }>(`query { checkDeleteCommonCredentialV2(orgUuid: "${esc(orgUuid())}", credentialId: "${esc(credentialId)}") { canDelete components { projectName componentNames } } }`);
  return d.checkDeleteCommonCredentialV2;
}

export async function deleteGitCredential(credentialId: string): Promise<void> {
  await gql<{ deleteCommonCredentialV2: { message: string } }>(`mutation { deleteCommonCredentialV2(orgUuid: "${esc(orgUuid())}", credentialId: "${esc(credentialId)}") { message } }`);
}
