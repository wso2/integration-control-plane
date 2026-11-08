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

import { Alert, Box, Button, CircularProgress, Divider, DrawerPanel, MenuItem, Select, Stack, TextField, Tooltip, Typography } from '@wso2/oxygen-ui';
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { useEndpointPolicies, useSetEndpointPolicies } from '../../../hooks/useConsumers';
import { Scopes } from '../../../constants/permissions';
import { useCan } from '../../../hooks/useCan';
import type { EndpointOption } from '../../../types/consumers';
import type { CorsConfig, RateLimitConfig } from '../../../types/policy';
import { configToPolicy, policyToConfig, toRateLimitOperations } from '../../../utils/endpointPolicy';
import { isRateLimitValid } from '../../../utils/policy';
import { isPermissionError } from '../../../utils/apiErrors';
import { endpointLoadNotice, friendlyApiError, readOnlyApiSettingsNotice } from '../../../utils/apiSecurity';
import CorsSection from '../../Policies/CorsSection';
import RateLimitingSection from '../../Policies/RateLimitingSection';
import { useEndpointDrawer } from './useEndpointDrawer';
import * as styles from './apiConsumption.styles';
import { useLeaveGuard, useUnsavedChanges } from '../../../contexts/UnsavedChangesContext';

/** The gateway has a request timeout, but platform-api does not expose it for the BFF to set. */
const TIMEOUT_UNAVAILABLE = 'Endpoint timeout is not configurable from here yet';

interface ApiSettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Component name — the BFF's `componentName` path segment. */
  componentName: string;
  /** Environment name (the RFC 1123 slug) — the BFF's `environmentName` path segment. */
  envName: string;
  /** Endpoints of this environment; the drawer configures one at a time. */
  endpoints: EndpointOption[];
  /** Endpoint selected when the drawer opens. */
  activeEndpointName?: string;
  /** The deployment track whose API is configured; absent means the default track. */
  deploymentTrackId?: string;
}

/** Cloud-only "API settings" drawer: CORS and rate limiting. Authentication lives in ApiSecurityDrawer. */
export default function ApiSettingsDrawer({ open, onClose, componentName, envName, deploymentTrackId, endpoints, activeEndpointName }: ApiSettingsDrawerProps): JSX.Element {
  const canUpdate = useCan()(Scopes.ENDPOINT_UPDATE);
  const [cors, setCors] = useState<CorsConfig | null>(null);
  const [rateLimit, setRateLimit] = useState<RateLimitConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { selectedIdx, selectEndpoint, selectedEndpoint, endpointRef, syncKey } = useEndpointDrawer({ open, componentName, envName, deploymentTrackId, endpoints, activeEndpointName });

  const { data: policies, isLoading, error: loadError } = useEndpointPolicies(endpointRef, open);
  const setPolicies = useSetEndpointPolicies(endpointRef);
  const saving = setPolicies.isPending;

  /** Routes come from the APIP proxy generated from the released endpoint schema. */
  const operations = useMemo(() => toRateLimitOperations(policies?.operations), [policies?.operations]);

  // Seed the form once per (endpoint, open), so later edits survive a refetch.
  const syncedRef = useRef('');
  useEffect(() => {
    if (!open) {
      syncedRef.current = '';
      return;
    }
    if (policies && syncedRef.current !== syncKey) {
      syncedRef.current = syncKey;
      const seeded = policyToConfig(policies);
      setCors(seeded.cors);
      setRateLimit(seeded.rateLimit);
      setError(null);
    }
  }, [open, policies, syncKey]);

  const notice = endpointLoadNotice(loadError, {
    notExposed: 'This endpoint isn’t exposed as an API yet. Enable Public in Configure → Edit endpoint, then come back to configure API settings.',
    unavailable: 'API settings aren’t available in this environment.',
    readFailed: 'Could not read the current API settings.',
  });

  const readOnlyNotice = readOnlyApiSettingsNotice(policies);
  const readOnly = readOnlyNotice !== null;
  const canApply = !readOnly && !!endpointRef && !!cors && !!rateLimit && isRateLimitValid(rateLimit) && !loadError && !isLoading && !saving;

  const handleApply = async () => {
    if (!endpointRef || !cors || !rateLimit || !canApply) return;
    setError(null);
    try {
      await setPolicies.mutateAsync(configToPolicy(cors, rateLimit));
      onClose();
    } catch (err) {
      if (!isPermissionError(err)) setError(friendlyApiError(err, 'Could not save the API settings.'));
    }
  };

  const seeded = useMemo(() => (policies ? policyToConfig(policies) : null), [policies]);
  useUnsavedChanges(open && !!seeded && !!cors && !!rateLimit && JSON.stringify({ cors, rateLimit }) !== JSON.stringify(seeded));
  const guardNavigation = useLeaveGuard();

  const handleCancel = () =>
    guardNavigation(() => {
      setError(null);
      onClose();
    });

  return (
    <DrawerPanel open={open} onClose={handleCancel}>
      <DrawerPanel.Header>
        <DrawerPanel.Title>API settings</DrawerPanel.Title>
        <DrawerPanel.Actions>
          <DrawerPanel.CloseButton />
        </DrawerPanel.Actions>
      </DrawerPanel.Header>

      <DrawerPanel.Body>
        {!selectedEndpoint ? (
          <Alert severity="info">No endpoint associated with this component.</Alert>
        ) : (
          <Stack gap={2.5}>
            {error && <Alert severity="error">{error}</Alert>}
            {notice && !error && <Alert severity={notice.severity}>{notice.text}</Alert>}
            {readOnlyNotice && !notice && !error && <Alert severity="info">{readOnlyNotice}</Alert>}

            <Stack direction="row" alignItems="center" gap={2}>
              <Typography variant="body2" fontWeight={500}>
                Endpoints:
              </Typography>
              <Select size="small" value={selectedIdx} onChange={(e) => guardNavigation(() => selectEndpoint(Number(e.target.value)))} disabled={endpoints.length <= 1} sx={styles.endpointSelect}>
                {endpoints.map((ep, i) => (
                  <MenuItem key={ep.name} value={i}>
                    {ep.displayName}
                  </MenuItem>
                ))}
              </Select>
            </Stack>

            {isLoading ? (
              <Box sx={styles.centredRow}>
                <CircularProgress size={20} />
              </Box>
            ) : (
              !policies?.stateUnknown &&
              cors &&
              rateLimit && (
                <>
                  <Box>
                    <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>
                      CORS
                    </Typography>
                    <CorsSection value={cors} onChange={setCors} disabled={saving || readOnly} />
                  </Box>

                  <Divider />

                  <Box>
                    <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>
                      Rate limiting
                    </Typography>
                    <RateLimitingSection value={rateLimit} onChange={setRateLimit} disabled={saving || readOnly} description="Limit how many requests the gateway accepts for this endpoint." apiLevelLabel="Whole endpoint" operations={operations} />
                  </Box>

                  <Divider />

                  <Box>
                    <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>
                      Resiliency
                    </Typography>
                    <Tooltip title={TIMEOUT_UNAVAILABLE}>
                      <Box component="span" sx={styles.disabledTooltipTarget}>
                        <TextField labelPlacement="top" size="small" type="number" label="Endpoint timeout (ms)" value="" disabled sx={{ width: 220 }} helperText={TIMEOUT_UNAVAILABLE} />
                      </Box>
                    </Tooltip>
                  </Box>
                </>
              )
            )}
          </Stack>
        )}
      </DrawerPanel.Body>

      <DrawerPanel.Footer>
        <Button variant="outlined" color="inherit" onClick={handleCancel} disabled={saving}>
          Cancel
        </Button>
        {canUpdate && (
          <Button variant="contained" onClick={() => void handleApply()} disabled={!canApply} startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {saving ? 'Applying…' : 'Apply'}
          </Button>
        )}
      </DrawerPanel.Footer>
    </DrawerPanel>
  );
}
