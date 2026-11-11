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

import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { AppWindow, ExternalLink, RotateCcw, Trash2 } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import type { Environment } from '../../types/environment';
import type { UserPortal, UserPortalState } from '../../types/userPortal';
import { portalBusy } from '../../utils/userPortal';
import * as styles from './UserPortal.styles';

const STATUS: Record<Exclude<UserPortalState, 'not-enabled'>, { label: string; color: 'success' | 'info' | 'warning' | 'error' | 'default' }> = {
  active: { label: 'Active', color: 'success' },
  'setting-up': { label: 'Setting up', color: 'info' },
  starting: { label: 'Starting', color: 'info' },
  unhealthy: { label: 'Not ready', color: 'warning' },
  failed: { label: 'Failed', color: 'error' },
  removing: { label: 'Removing', color: 'default' },
};

// What the card's button says while the portal can't be opened. An active portal with no address can't be either.
const WAITING: Partial<Record<UserPortalState, string>> = {
  'setting-up': 'Setting up portal…',
  starting: 'Starting portal…',
  unhealthy: 'Portal not ready',
  removing: 'Removing portal…',
};

interface UserPortalCardProps {
  environment: Environment;
  portal: UserPortal & { state: Exclude<UserPortalState, 'not-enabled'> };
  /** Why the user can't enable portals; empty when they can. */
  manageRefusal: string;
  /** Whether an enable (a retry) is running for this portal. */
  retrying: boolean;
  onRetry: () => void;
  /** Why the user can't deprovision portals; empty when they can. */
  deprovisionRefusal: string;
  onDeprovision: () => void;
}

/** One environment's User Portal: its status, a link to open it, and the actions on it. */
export default function UserPortalCard({ environment, portal, manageRefusal, retrying, onRetry, deprovisionRefusal, onDeprovision }: UserPortalCardProps): JSX.Element {
  const { state } = portal;
  const status = STATUS[state];
  const busy = portalBusy(state);

  return (
    <Card variant="outlined" sx={styles.cardSx}>
      <CardContent sx={styles.cardContentSx}>
        <Box sx={styles.cardHeadSx}>
          <Box sx={{ ...styles.logoBoxSx, opacity: busy ? 0.4 : 1 }}>
            <AppWindow size={32} />
          </Box>
          <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0, pt: 0.5 }}>
            <Typography variant="h6" sx={{ overflowWrap: 'anywhere' }}>
              {environment.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              The User Portal for integrations published in {environment.name}.
            </Typography>
          </Stack>
        </Box>

        {state === 'failed' && portal.error && (
          <Alert severity="error" variant="outlined">
            {portal.error}
          </Alert>
        )}

        <Stack spacing={2} sx={styles.detailsSx}>
          <Box sx={styles.detailRowSx}>
            <Typography variant="body1" color="text.secondary">
              Environment
            </Typography>
            <Chip label={environment.id} size="small" variant="outlined" />
          </Box>
          <Box sx={styles.detailRowSx}>
            <Typography variant="body1" color="text.secondary">
              Status
            </Typography>
            <Chip label={status.label} size="small" color={status.color} />
          </Box>
        </Stack>

        <Stack direction="row" spacing={1}>
          {state === 'active' && portal.url ? (
            <Button fullWidth size="small" sx={styles.actionButtonSx} variant="contained" component="a" href={portal.url} target="_blank" rel="noopener noreferrer" startIcon={<ExternalLink size={16} />}>
              Open portal
            </Button>
          ) : state === 'failed' ? (
            // Enabling a portal whose setup failed retries it; ipaas-service refuses a failure a retry can't repeat, and says so.
            <Tooltip title={manageRefusal}>
              <Box component="span" sx={styles.cardActionAnchorSx}>
                <Button fullWidth size="small" sx={styles.actionButtonSx} variant="contained" onClick={onRetry} disabled={!!manageRefusal || retrying} startIcon={retrying ? <CircularProgress size={16} color="inherit" /> : <RotateCcw size={16} />}>
                  {retrying ? 'Retrying…' : 'Retry setup'}
                </Button>
              </Box>
            </Tooltip>
          ) : (
            // A portal that isn't ready says why on hover: OpenChoreo's reason, which is too raw to be the headline.
            // Only such a portal has one.
            <Tooltip title={portal.readinessMessage}>
              <Box component="span" sx={styles.cardActionAnchorSx}>
                <Button fullWidth size="small" sx={styles.actionButtonSx} variant="contained" disabled startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}>
                  {WAITING[state] ?? 'Portal unavailable'}
                </Button>
              </Box>
            </Tooltip>
          )}
          {/* A portal can be deprovisioned once it is set up, until it is being removed, but not while a retry runs.
              A starting one can, so one that never comes up isn't stuck. */}
          {state !== 'setting-up' && state !== 'removing' && (
            <Tooltip title={deprovisionRefusal}>
              <Box component="span" sx={styles.cardSideActionAnchorSx}>
                <Button size="small" sx={styles.dangerActionButtonSx} variant="outlined" color="error" onClick={onDeprovision} disabled={!!deprovisionRefusal || retrying} startIcon={<Trash2 size={16} />}>
                  Deprovision
                </Button>
              </Box>
            </Tooltip>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
