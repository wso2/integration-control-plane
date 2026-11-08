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

import { Alert, Box, Button, PageContent, Snackbar, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { AppWindow, Plus } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { Scopes } from '../constants/permissions';
import { useCan } from '../hooks/useCan';
import { isUserPortalUnavailable, useEnableUserPortal, useUserPortalEnvironments, useUserPortals } from '../hooks/useUserPortal';
import type { OrgScope } from '../nav';
import type { UserPortal as Portal, UserPortalState } from '../types/userPortal';
import OrgSettingsTabs from '../components/Settings/OrgConfigureTabs';
import EnableUserPortalDialog from '../components/UserPortal/EnableUserPortalDialog';
import UserPortalCard from '../components/UserPortal/UserPortalCard';
import UserPortalSkeleton, { UserPortalUnavailable } from '../components/UserPortal/UserPortalSkeleton';
import * as styles from '../components/UserPortal/UserPortal.styles';

const MANAGE_REFUSAL = "Your role can't enable the User Portal.";

const SUBHEADER = 'One place for your organization’s users to chat with AI agents, run automations and act on workflow tasks you publish to it.';

type ShownPortal = Portal & { state: Exclude<UserPortalState, 'not-enabled'> };

const shown = (portal: Portal | undefined): portal is ShownPortal => !!portal && portal.state !== 'not-enabled';

const errorText = (err: unknown): string => (err instanceof Error ? err.message : 'Something went wrong.');

/** The org's User Portal, one per environment of its default deployment pipeline. A tab under Configure. */
export default function UserPortal(_scope: OrgScope): JSX.Element {
  const environments = useUserPortalEnvironments();
  const envs = environments.data ?? [];
  const portals = useUserPortals(envs.map((e) => e.id));
  const can = useCan();
  const manageRefusal = can(Scopes.ENVIRONMENT_MANAGE) ? '' : MANAGE_REFUSAL;

  const enable = useEnableUserPortal();
  const [enableOpen, setEnableOpen] = useState(false);
  const [notice, setNotice] = useState<{ text: string; severity: 'info' | 'error' } | null>(null);
  // The enable a card's Retry started, so only that card shows it running.
  const [retrying, setRetrying] = useState<string | null>(null);

  const rows = envs.map((environment, i) => ({ environment, query: portals[i] }));
  const enabled = rows.flatMap(({ environment, query }) => (shown(query?.data) ? [{ environment, portal: query.data }] : []));
  const available = rows.filter(({ query }) => query?.data?.state === 'not-enabled').map(({ environment }) => environment);
  const failedRows = rows.filter(({ query }) => query?.isError && !query.data);
  const refetchAll = () => {
    void environments.refetch();
    portals.forEach((q) => void q.refetch());
  };

  const openEnable = () => {
    enable.reset();
    setEnableOpen(true);
  };

  const startEnable = (environment: string) =>
    enable.mutate(environment, {
      onSuccess: () => {
        setEnableOpen(false);
        setNotice({ text: 'Setting up the User Portal. It opens once it is ready.', severity: 'info' });
      },
    });

  const retry = (environment: string) => {
    setRetrying(environment);
    enable.mutate(environment, {
      onSuccess: () => setNotice({ text: 'Retrying the User Portal setup.', severity: 'info' }),
      onError: (err) => setNotice({ text: errorText(err), severity: 'error' }),
      onSettled: () => setRetrying(null),
    });
  };

  const enableButton = (label: string) => {
    const refusal = manageRefusal || (available.length === 0 ? 'Every environment has a User Portal.' : '');
    return (
      <Tooltip title={refusal}>
        <Box component="span" sx={{ display: 'inline-flex' }}>
          <Button variant="contained" startIcon={<Plus size={20} />} onClick={openEnable} disabled={!!refusal}>
            {label}
          </Button>
        </Box>
      </Tooltip>
    );
  };

  const loading = environments.isLoading || portals.some((q) => q.isLoading);
  // Every portal read was refused because the BFF serves none: nothing here can work.
  const unavailable = !loading && portals.length > 0 && portals.every((q) => isUserPortalUnavailable(q.error));

  const body = (): JSX.Element => {
    if (loading) return <UserPortalSkeleton />;
    if (environments.isError)
      return (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void environments.refetch()}>
              Retry
            </Button>
          }>
          Could not load the environments of the default deployment pipeline.
        </Alert>
      );
    if (unavailable) return <UserPortalUnavailable />;
    if (envs.length === 0) return <Alert severity="info">The default deployment pipeline has no environments, so there is nowhere to enable the User Portal.</Alert>;
    if (enabled.length === 0 && failedRows.length === 0)
      return (
        <Box sx={styles.emptySx}>
          <Stack spacing={1} alignItems="center" sx={styles.emptyStackSx}>
            <Box sx={styles.emptyIconSx}>
              <AppWindow size={64} />
            </Box>
            <Typography variant="h5" component="h2" sx={{ pt: 2 }}>
              Enable the User Portal
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {SUBHEADER}
            </Typography>
            <Box sx={{ pt: 2 }}>{enableButton('Enable User Portal')}</Box>
          </Stack>
        </Box>
      );
    return (
      <Stack spacing={2}>
        {failedRows.length > 0 && (
          <Alert
            severity="warning"
            action={
              <Button color="inherit" size="small" onClick={refetchAll}>
                Retry
              </Button>
            }>
            Could not load the User Portal in {failedRows.map(({ environment }) => environment.name).join(', ')}.
          </Alert>
        )}
        <Box sx={styles.cardGridSx}>
          {enabled.map(({ environment, portal }) => (
            <UserPortalCard key={environment.id} environment={environment} portal={portal} manageRefusal={manageRefusal} retrying={retrying === environment.id} onRetry={() => retry(environment.id)} />
          ))}
        </Box>
      </Stack>
    );
  };

  return (
    <PageContent fullWidth>
      <OrgSettingsTabs active="user-portal" />
      {/* The empty state carries the description and its own Enable button. */}
      {!loading && !unavailable && enabled.length > 0 && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} sx={{ mb: 3 }}>
          <Typography variant="body2" color="text.secondary">
            {SUBHEADER}
          </Typography>
          <Box sx={{ flexShrink: 0 }}>{enableButton('Enable User Portal')}</Box>
        </Stack>
      )}
      {body()}

      {enableOpen && <EnableUserPortalDialog environments={available} isPending={enable.isPending} error={enable.isError ? errorText(enable.error) : null} onEnable={startEnable} onClose={() => setEnableOpen(false)} />}

      <Snackbar open={!!notice} autoHideDuration={4000} onClose={() => setNotice(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert onClose={() => setNotice(null)} severity={notice?.severity ?? 'info'} variant="filled">
          {notice?.text}
        </Alert>
      </Snackbar>
    </PageContent>
  );
}
