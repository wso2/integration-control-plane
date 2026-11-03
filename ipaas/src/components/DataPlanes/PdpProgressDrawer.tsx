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

import { Box, Chip, CircularProgress, Divider, DrawerPanel, Stack, Typography } from '@wso2/oxygen-ui';
import { Check } from '@wso2/oxygen-ui-icons-react';
import { type JSX } from 'react';
import { PDP_PROVISION_STEPS, displayPdpProgress } from '../../constants/dataPlanes';
import { usePdps } from '../../hooks/useDataPlanes';
import { capitalize } from '../../utils/string';
import { stepIcon } from './PdpProgressDrawer.styles';

interface PdpProgressDrawerProps {
  open: boolean;
  pdpName: string | null;
  onClose: () => void;
}

function stepStatus(progress: number, index: number): 'done' | 'active' | 'pending' {
  if (progress >= PDP_PROVISION_STEPS[index].completedAtProgress) return 'done';
  const previousDone = index === 0 || progress >= PDP_PROVISION_STEPS[index - 1].completedAtProgress;
  return previousDone ? 'active' : 'pending';
}

// DrawerPanel's title text is noWrap; this long title wraps instead of truncating.
const wrapTitleSx = { '& .MuiTypography-root': { whiteSpace: 'normal' } } as const;

export default function PdpProgressDrawer({ open, pdpName, onClose }: PdpProgressDrawerProps): JSX.Element | null {
  const { data: pdps, isLoading } = usePdps(open);
  const pdp = pdps?.find((p) => p.name === pdpName);

  if (!open) return null;

  if (!pdp) {
    if (isLoading) {
      return (
        <DrawerPanel open onClose={onClose} width={480} aria-label="Provisioning progress">
          <DrawerPanel.Body>
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress />
            </Box>
          </DrawerPanel.Body>
        </DrawerPanel>
      );
    }
    return null;
  }

  const progress = displayPdpProgress(pdp.creationProgress);

  return (
    <DrawerPanel open={open} onClose={onClose} width={480}>
      <DrawerPanel.Header>
        <Stack sx={{ flex: 1, minWidth: 0 }}>
          <DrawerPanel.Title sx={wrapTitleSx}>Provisioning your new PDP on {capitalize(pdp.cloud)}</DrawerPanel.Title>
          <Stack direction="row" alignItems="center" gap={1} sx={{ mt: 1 }}>
            <Chip label={`${progress}% completed`} size="small" color="primary" variant="outlined" />
            <Typography variant="body2" color="text.secondary">
              {pdp.name}
            </Typography>
          </Stack>
        </Stack>
        <DrawerPanel.Actions>
          <DrawerPanel.CloseButton />
        </DrawerPanel.Actions>
      </DrawerPanel.Header>

      <DrawerPanel.Body>
        <Stack divider={<Divider />}>
          {PDP_PROVISION_STEPS.map((step, index) => {
            const status = stepStatus(pdp.creationProgress, index);
            return (
              <Stack key={step.name} direction="row" alignItems="center" gap={1.5} sx={{ py: 1.25 }}>
                <Box sx={stepIcon} aria-hidden>
                  {status === 'done' ? <Check size={18} color="var(--oxygen-palette-success-main, #2e7d32)" /> : status === 'active' ? <CircularProgress size={16} /> : <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'action.disabled' }} />}
                </Box>
                <Typography variant="body2" color={status === 'pending' ? 'text.secondary' : 'text.primary'}>
                  {step.name}
                </Typography>
              </Stack>
            );
          })}
        </Stack>
      </DrawerPanel.Body>
    </DrawerPanel>
  );
}
