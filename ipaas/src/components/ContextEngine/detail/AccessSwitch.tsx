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

import { CircularProgress, FormControlLabel, Stack, Switch, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { useSetContextEngineAccess } from '../../../hooks/useContextEngine';
import type { ContextEngineAccess } from '../../../types/contextEngine';

interface AccessSwitchProps {
  engineId: string;
  access: ContextEngineAccess;
  surface: keyof ContextEngineAccess;
}

const LABELS: Record<keyof ContextEngineAccess, string> = { api: 'API access', mcp: 'MCP access' };

/** Lets callers through to one public surface, or turns them away with a 403, at the engine's gateway. */
export default function AccessSwitch({ engineId, access, surface }: AccessSwitchProps): JSX.Element {
  const set = useSetContextEngineAccess(engineId);
  const checked = set.isPending ? (set.variables[surface] ?? access[surface]) : access[surface];
  return (
    <Stack alignItems="flex-end">
      <Stack direction="row" alignItems="center" gap={1}>
        {set.isPending && <CircularProgress size={16} aria-label="Applying" />}
        <FormControlLabel label={LABELS[surface]} labelPlacement="start" control={<Switch checked={checked} disabled={set.isPending} onChange={(_e, on) => set.mutate({ [surface]: on })} />} />
      </Stack>
      {set.isError && (
        <Typography variant="caption" color="error">
          {set.error.message || "Couldn't change access. Try again."}
        </Typography>
      )}
    </Stack>
  );
}
