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

import { Box, Button, CircularProgress, Dialog, DialogContent, DialogTitle, IconButton, Stack, Typography } from '@wso2/oxygen-ui';
import { Lightbulb, X } from '@wso2/oxygen-ui-icons-react';
import { lazy, Suspense, useState, type JSX } from 'react';
const Markdown = lazy(() => import('../../Markdown'));
import { usePrebuiltInstructions, usePrebuiltIntegrations } from '../../../hooks/usePrebuiltIntegrations';
import { matchPrebuiltIntegration } from '../../../utils/prebuilt';
import type { Repository } from '../../../types/repository';

/**
 * "How to setup this integration" button — shown only for components created from
 * a prebuilt integration. Opens a modal rendering the integration's `instructions.md`.
 */
export default function SetupInstructionsButton({ repository }: { repository: Repository | null }): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const { data: prebuiltData } = usePrebuiltIntegrations();
  const integration = matchPrebuiltIntegration(repository, prebuiltData?.prebuiltIntegrations);
  const { instructions, isInstructionsLoading, isInstructionsError } = usePrebuiltInstructions(open ? integration : null);

  if (!integration) return null;

  return (
    <>
      <Button variant="contained" color="warning" startIcon={<Lightbulb size={16} />} onClick={() => setOpen(true)} sx={{ whiteSpace: 'nowrap' }}>
        How to setup this integration
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            Setup instructions
            <IconButton aria-label="Close" onClick={() => setOpen(false)} edge="end">
              <X size={18} />
            </IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent dividers sx={{ minHeight: 220 }}>
          {isInstructionsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress size={25} />
            </Box>
          ) : isInstructionsError || !instructions ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 8 }}>
              Unable to load setup instructions.
            </Typography>
          ) : (
            <Suspense fallback={null}>
              <Markdown>{instructions}</Markdown>
            </Suspense>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
