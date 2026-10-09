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
import { fetchAuditLogs } from '#api/auditLogs';
import { useOrgUuid } from '../../hooks/useOrgUuid';
import type { AuditLogEntry, AuditLogsRequest } from '../../types/auditLogs';

/**
 * Runs an audit-logs query for the current org. The `request` object is part of the query
 * key, so changing any filter re-fetches automatically.
 */
export function useAuditLogs(request: AuditLogsRequest, enabled = true) {
  const orgUuid = useOrgUuid();
  return useQuery<AuditLogEntry[]>({
    queryKey: ['auditLogs', orgUuid, request],
    queryFn: () => fetchAuditLogs(orgUuid!, request),
    enabled: enabled && !!orgUuid,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
