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

import { useQuery } from '@tanstack/react-query';
import { fetchEnvTemplates } from '../api/deploymentPipelines';
import type { EnvTemplate } from '../types/deploymentPipeline';
import { useOrgs } from './useOrg';

const ROOT_KEY = 'deploymentPipelines';

/** Resolve an org's numeric id (env-templates are keyed by it) from its handle. */
function useOrgNumericId(orgHandle: string): number | undefined {
  const { data: orgs } = useOrgs();
  return orgs?.find((o) => o.handle === orgHandle)?.numericId;
}

export function useEnvTemplates(orgHandle: string) {
  const orgNumericId = useOrgNumericId(orgHandle);
  return useQuery<EnvTemplate[]>({
    queryKey: [ROOT_KEY, 'envTemplates', orgNumericId],
    queryFn: () => fetchEnvTemplates(orgNumericId!),
    enabled: orgNumericId != null,
  });
}
