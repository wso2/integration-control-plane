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

import { IconButton, Tooltip } from '@wso2/oxygen-ui';
import { MCP } from '@wso2/oxygen-ui-icons-react';
import type { ReactNode } from 'react';
import { useAppNavigate } from '../../../../hooks/useAppNavigate';
import { useApimApi } from '../../../../hooks/useApim';
import { generateMcpUrl } from '../../../../nav';

interface GenerateMcpButtonProps {
  apimId?: string | null;
  /** Handle of the source Integration as API — lets the flow's Back/Cancel return here. */
  sourceHandler: string;
  orgHandler: string;
  projectHandler: string;
}

/**
 * "Generate MCP Server" header action — **specific to Integration as API**.
 * It is NOT part of the generic `OverviewHeaderActions` (which other API-backed
 * types like AI Agent share); integration-as-api plugs it into that block's
 * `extra` slot, so it never shows for other types. Routes to ICP's native MCP
 * convert flow with this API preselected.
 */
export default function GenerateMcpButton({ apimId, sourceHandler, orgHandler, projectHandler }: GenerateMcpButtonProps): ReactNode {
  const navigate = useAppNavigate();
  const { data: apimApi } = useApimApi(apimId);
  const lifecycleStatus = apimApi?.lifeCycleStatus ?? null;
  const isPublished = lifecycleStatus === 'PUBLISHED' || lifecycleStatus === 'PROTOTYPED';
  const canGenerate = isPublished && !!apimId;

  return (
    <Tooltip title={canGenerate ? 'Generate MCP Server' : 'Publish API to generate MCP Server'}>
      <span>
        <IconButton
          size="small"
          aria-label="Generate MCP Server"
          disabled={!canGenerate}
          onClick={() => navigate(generateMcpUrl({ org: orgHandler, project: projectHandler }, apimId ?? undefined, sourceHandler))}
          sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, color: canGenerate ? 'text.secondary' : 'text.disabled' }}>
          <MCP size={16} />
        </IconButton>
      </span>
    </Tooltip>
  );
}
