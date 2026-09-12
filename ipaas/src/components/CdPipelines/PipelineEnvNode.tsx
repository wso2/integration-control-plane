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

import { Chip, IconButton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { X } from '@wso2/oxygen-ui-icons-react';
import type { ReactNode } from 'react';

interface PipelineEnvNodeProps {
  name: string;
  /** Region / dataplane subtitle (e.g. "US"). */
  region?: string;
  critical?: boolean;
  /** When provided, renders a remove control (used by the builder). */
  onRemove?: () => void;
  disabled?: boolean;
}

/** A single environment box in a promotion path — shared by the read-only path and the builder. */
export default function PipelineEnvNode({ name, region, critical, onRemove, disabled }: PipelineEnvNodeProps): ReactNode {
  return (
    <Stack sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 0.75, px: 2.5, py: 1.75, minWidth: 200, gap: 0.25, bgcolor: 'background.paper' }}>
      <Stack direction="row" alignItems="center" gap={1}>
        <Typography variant="body1" sx={{ fontWeight: 600, flex: 1, wordBreak: 'break-word' }}>
          {name}
        </Typography>
        {critical && <Chip label="Critical" size="small" color="warning" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />}
        {onRemove && (
          <Tooltip title="Remove">
            <IconButton size="small" color="error" disabled={disabled} onClick={onRemove} aria-label={`Remove ${name}`} sx={{ p: 0.25 }}>
              <X size={14} />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
      {region && (
        <Typography variant="caption" color="text.secondary">
          {region}
        </Typography>
      )}
    </Stack>
  );
}
