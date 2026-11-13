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

import { Alert, Box, CircularProgress, Typography } from '@wso2/oxygen-ui';
import { useState, type JSX } from 'react';
import { useStagedEngineSources } from '../../../hooks/stagedEngineSources';
import type { ContextEngineSetup } from '../../../types/contextEngine';

const listSx = { m: 0, mt: 1, pl: 2.5 } as const;
const alertSx = { mb: 3 } as const;

interface SetupStatusAlertProps {
  engineId: string;
  setup?: ContextEngineSetup;
}

/** Where adding a new engine's sources stands: the BFF's connector sources, and the File Upload sources this tab holds. */
export default function SetupStatusAlert({ engineId, setup }: SetupStatusAlertProps): JSX.Element | null {
  const staged = useStagedEngineSources(engineId);
  const [dismissed, setDismissed] = useState(false);
  const pending = setup?.status === 'pending' || staged.waiting > 0;
  const warnings = [...(setup?.status === 'failed' ? setup.warnings : []), ...staged.failures];

  if (pending) {
    return (
      <Alert severity="info" variant="outlined" icon={<CircularProgress size={18} />} sx={alertSx}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          Setting up…
        </Typography>
        {staged.waiting > 0 ? 'Your sources are added once the engine is running. Keep this tab open until then: your files are uploaded from it.' : 'Your sources are added once the engine is running. You can leave this page.'}
      </Alert>
    );
  }
  if (dismissed) return null;
  if (setup?.status === 'interrupted') {
    return (
      <Alert severity="warning" variant="outlined" onClose={() => setDismissed(true)} sx={alertSx}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          Setup interrupted
        </Typography>
        Some sources may not have been added. Add the missing ones from this page.
      </Alert>
    );
  }
  if (warnings.length === 0) return null;
  return (
    <Alert severity="warning" variant="outlined" onClose={() => setDismissed(true)} sx={alertSx}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        Setup failed
      </Typography>
      The engine was created, but not every source was added. Add the missing ones from this page.
      <Box component="ul" sx={listSx}>
        {warnings.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </Box>
    </Alert>
  );
}
