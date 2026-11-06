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

import { Box, Button, Tooltip, type SxProps, type Theme } from '@wso2/oxygen-ui';
import { Trash2 } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { Scopes } from '../constants/permissions';
import { useAgentRefusal } from '../hooks/useCan';
import { identifyIntegration } from '../utils/identifyIntegration';
import type { Component } from '../types/component';

interface DeleteIntegrationButtonProps {
  component: Component;
  onClick: () => void;
  className?: string;
  sx?: SxProps<Theme>;
}

/** A project list row's Delete. agent-manager deletes an AI agent only for a role that may delete agents. */
export default function DeleteIntegrationButton({ component, onClick, className, sx }: DeleteIntegrationButtonProps): JSX.Element {
  const agentRefusal = useAgentRefusal()(Scopes.AGENT_DELETE);
  const refusal = identifyIntegration(component.displayType ?? '', component.componentSubType ?? null).type === 'ai-agent' ? agentRefusal : '';
  return (
    <Tooltip title={refusal}>
      {/* Keeps the row from opening the integration, also when the button is disabled. */}
      <Box component="span" className={className} sx={sx} onClick={(e) => e.stopPropagation()}>
        <Button variant="outlined" size="small" color="error" startIcon={<Trash2 size={14} />} aria-label={`Delete ${component.displayName}`} disabled={!!refusal} onClick={onClick}>
          Delete
        </Button>
      </Box>
    </Tooltip>
  );
}
