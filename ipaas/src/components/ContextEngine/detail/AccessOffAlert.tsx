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

import { Alert, Button, CircularProgress } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { useSetContextEngineAccess } from '../../../hooks/useContextEngine';
import type { ContextEngineAccess } from '../../../types/contextEngine';

const NAMES: Record<keyof ContextEngineAccess, string> = { api: 'API', mcp: 'MCP' };

/** Says a surface is off, with a button that turns it back on. */
export default function AccessOffAlert({ engineId, surface }: { engineId: string; surface: keyof ContextEngineAccess }): JSX.Element {
  const set = useSetContextEngineAccess(engineId);
  return (
    <Alert
      severity="warning"
      variant="outlined"
      sx={{ mb: 3 }}
      action={
        <Button size="small" color="inherit" disabled={set.isPending} startIcon={set.isPending ? <CircularProgress size={14} color="inherit" /> : undefined} onClick={() => set.mutate({ [surface]: true })}>
          {set.isPending ? 'Applying…' : 'Turn on'}
        </Button>
      }>
      {set.isError ? set.error.message || "Couldn't turn it on. Try again." : `${NAMES[surface]} access is off. Clients get a 403.`}
    </Alert>
  );
}
