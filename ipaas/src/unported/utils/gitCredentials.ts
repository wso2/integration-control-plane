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

import { GitProvider, type GitCredential } from '../../types/credentials';

/**
 * Filter stored credentials down to those usable for the given provider. Bitbucket cloud and
 * server share the Bitbucket card, so either type matches a Bitbucket selection (mirrors Devant).
 */
export function credentialsForProvider(credentials: GitCredential[], provider: string): GitCredential[] {
  if (provider === GitProvider.BITBUCKET_CLOUD || provider === GitProvider.BITBUCKET_SERVER) {
    return credentials.filter((c) => c.type === GitProvider.BITBUCKET_CLOUD || c.type === GitProvider.BITBUCKET_SERVER);
  }
  return credentials.filter((c) => c.type === provider);
}
