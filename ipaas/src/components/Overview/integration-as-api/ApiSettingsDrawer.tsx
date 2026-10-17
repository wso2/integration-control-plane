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

import { Alert, Box, Button, CircularProgress, Divider, Drawer, IconButton, MenuItem, Select, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import TextField from '../../common/TextField';
import { X } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { useEndpointPolicies, useSetEndpointPolicies } from '../../../hooks/useConsumers';
import type { EndpointOption } from '../../../types/consumers';
import type { CorsConfig, RateLimitConfig } from '../../../types/policy';
import { configToPolicy, policyToConfig, toRateLimitOperations } from '../../../utils/endpointPolicy';
import { isRateLimitValid } from '../../../utils/policy';
import { endpointLoadNotice, friendlyApiError } from '../../../utils/apiSecurity';
import CorsSection from '../../Policies/CorsSection';
import RateLimitingSection from '../../Policies/RateLimitingSection';
import { useEndpointDrawer } from './useEndpointDrawer';
import * as styles from './apiConsumption.styles';

/** The gateway has a request timeout, but platform-api does not expose it for the BFF to set. */
const TIMEOUT_UNAVAILABLE = 'Endpoint timeout is not configurable from here yet';

interface ApiSettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  projectName: string;
  /** Component name — the BFF's `componentName` path segment. */
  componentName: string;
  /** Environment name (the RFC 1123 slug) — the BFF's `environmentName` path segment. */
  envName: string;
  /** Endpoints of this environment; the drawer configures one at a time. */
  endpoints: EndpointOption[];
  /** Endpoint selected when the drawer opens. */
  activeEndpointName?: string;
}

/** Cloud-only "API Settings" drawer: CORS and rate limiting. Authentication lives in ApiSecurityDrawer. */
export default function ApiSettingsDrawer({ open, onClose, projectName, componentName, envName, endpoints, activeEndpointName }: ApiSettingsDrawerProps): JSX.Element {
  const [cors, setCors] = useState<CorsConfig | null>(null);
  const [rateLimit, setRateLimit] = useState<RateLimitConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { selectedIdx, selectEndpoint, selectedEndpoint, endpointRef, syncKey } = useEndpointDrawer({ open, projectName, componentName, envName, endpoints, activeEndpointName });

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

  const canApply = !!endpointRef && !!cors && !!rateLimit && isRateLimitValid(rateLimit) && !loadError && !isLoading && !saving;

  const handleApply = async () => {
    if (!endpointRef || !cors || !rateLimit || !canApply) return;
    setError(null);
    try {
      await setPolicies.mutateAsync(configToPolicy(cors, rateLimit));
      onClose();
    } catch (err) {
      setError(friendlyApiError(err, 'Could not save the API settings.'));
    }
  };

  const handleCancel = () => {
    setError(null);
    onClose();
  };

  return (
    <Drawer anchor="right" open={open} onClose={handleCancel} variant="temporary" sx={styles.rightDrawer}>
      <Box sx={styles.drawerFrame}>
        <Box sx={styles.drawerHeader}>
          <Typography variant="subtitle1" fontWeight={600}>
            API Settings
          </Typography>
          <IconButton size="small" aria-label="close" onClick={handleCancel}>
            <X size={16} />
          </IconButton>
        </Box>

        <Box sx={styles.drawerBody}>
          {!selectedEndpoint ? (
            <Alert severity="info">No endpoint associated with this component.</Alert>
          ) : (
            <Stack gap={2.5}>
              {error && <Alert severity="error">{error}</Alert>}
              {notice && !error && <Alert severity={notice.severity}>{notice.text}</Alert>}

              <Stack direction="row" alignItems="center" gap={2}>
                <Typography variant="body2" fontWeight={500}>
                  Endpoints:
                </Typography>
                <Select size="small" value={selectedIdx} onChange={(e) => selectEndpoint(Number(e.target.value))} disabled={endpoints.length <= 1} sx={styles.endpointSelect}>
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
                cors &&
                rateLimit && (
                  <>
                    <Box>
                      <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>
                        CORS
                      </Typography>
                      <CorsSection value={cors} onChange={setCors} disabled={saving} />
                    </Box>

                    <Divider />

                    <Box>
                      <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>
                        Rate Limiting
                      </Typography>
                      <RateLimitingSection value={rateLimit} onChange={setRateLimit} disabled={saving} description="Limit how many requests the gateway accepts for this endpoint." apiLevelLabel="Whole endpoint" operations={operations} />
                    </Box>

                    <Divider />

                    <Box>
                      <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>
                        Resiliency
                      </Typography>
                      <Tooltip title={TIMEOUT_UNAVAILABLE}>
                        <Box component="span" sx={styles.disabledTooltipTarget}>
                          <TextField size="small" type="number" label="Endpoint timeout (ms)" value="" disabled sx={{ width: 220 }} helperText={TIMEOUT_UNAVAILABLE} />
                        </Box>
                      </Tooltip>
                    </Box>
                  </>
                )
              )}
            </Stack>
          )}
        </Box>

        <Box sx={styles.drawerFooter}>
          <Button variant="outlined" onClick={handleCancel} disabled={saving}>
            Cancel
          </Button>
          <Button variant="contained" onClick={() => void handleApply()} disabled={!canApply}>
            {saving ? <CircularProgress size={16} color="inherit" /> : 'Apply'}
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
}
