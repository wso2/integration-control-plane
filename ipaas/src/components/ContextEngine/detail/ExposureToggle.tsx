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

import { Alert, Box, Chip, CircularProgress, FormControlLabel, Stack, Switch, Typography } from '@wso2/oxygen-ui';
import { useState, type JSX } from 'react';
import { useUpdateContextEngineExposure } from '../../../hooks/useContextEngine';
import { HttpError } from '../../../types/http';
import { exposureHeaderSx, mutedSx } from '../styles';
import type { ContextEngineDetail } from '../../../types/contextEngine';

interface ExposureToggleProps {
  engine: ContextEngineDetail;
  surface: 'api' | 'mcp';
  title: string;
  description: string;
}

/** Publish / unpublish header shared by the API and MCP tabs. */
export default function ExposureToggle({ engine, surface, title, description }: ExposureToggleProps): JSX.Element {
  const update = useUpdateContextEngineExposure(engine.id);
  const [error, setError] = useState<string | null>(null);
  const published = engine.exposure[surface];

  const toggle = (next: boolean) => {
    setError(null);
    update.mutate(
      { ...engine.exposure, [surface]: next },
      {
        onError: (e) => setError(e instanceof HttpError && (e.status === 404 || e.status === 405) ? 'Publishing is not available on this engine yet — the exposure route has not been enabled.' : "Couldn't update publishing. Please try again."),
      },
    );
  };

  return (
    <>
      <Box sx={exposureHeaderSx}>
        <Box>
          <Stack direction="row" alignItems="center" gap={1}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              {title}
            </Typography>
            <Chip size="small" variant="outlined" color={published ? 'success' : 'default'} label={published ? 'Published' : 'Not published'} />
          </Stack>
          <Typography variant="body2" sx={mutedSx}>
            {description}
          </Typography>
        </Box>
        <FormControlLabel
          control={update.isPending ? <CircularProgress size={20} sx={{ mx: 1.5 }} /> : <Switch checked={published} onChange={(_e, checked) => toggle(checked)} inputProps={{ 'aria-label': `Publish ${title}` }} />}
          label={published ? 'Published' : 'Publish'}
          labelPlacement="start"
          sx={{ flexShrink: 0 }}
        />
      </Box>
      {error && (
        <Alert severity="warning" variant="outlined" onClose={() => setError(null)} sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
    </>
  );
}
