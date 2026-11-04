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

import { Alert, Box, Button, CircularProgress, Radio, Stack, Typography } from '@wso2/oxygen-ui';
import { Building2, Folder, Globe } from '@wso2/oxygen-ui-icons-react';
import { useState } from 'react';
import { useLeaveGuard, useUnsavedChanges } from '../../contexts/UnsavedChangesContext';
import { useUpdateEndpoint } from '../../hooks/useComponents';
import type { EndpointExposure, EnvEndpoint } from '../../types/component';
import { friendlyApiError } from '../../utils/apiSecurity';
import { editorExposure, exposureLabels } from '../../utils/endpoints';

// The gateway serves an endpoint on one host at a time: the public one, the organization's internal
// one, or neither. Project access is always on and its URL always shows, so it is not a choice here.
const EXPOSURE_OPTS: { value: EndpointExposure; label: string; Icon: typeof Globe; description: string }[] = [
  { value: 'public', label: 'Public', Icon: Globe, description: 'On the gateway’s public host. Any client can call it, including integrations in your organization.' },
  { value: 'organization', label: 'Organization', Icon: Building2, description: 'On the gateway’s internal host. Only integrations in your organization can call it.' },
  { value: 'none', label: 'Project only', Icon: Folder, description: 'Not on the API gateway. Only integrations in the same project can call the endpoint.' },
];

// Pieces shared by the configure drawers (ConfigureDrawer and MiConfigureDrawer).

// ── Step indicator ────────────────────────────────────────────────────────────

export function StepIndicator({ step, steps }: { step: number; steps: string[] }) {
  return (
    <Stack direction="row" alignItems="center" sx={{ px: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}>
      {steps.map((label, idx) => {
        const num = idx + 1;
        const isActive = num === step;
        const isDone = num < step;
        return (
          <Stack key={label} direction="row" alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" alignItems="center" gap={0.75} sx={{ minWidth: 0 }}>
              <Box
                sx={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  bgcolor: isActive ? 'primary.main' : isDone ? 'success.main' : 'action.disabledBackground',
                  color: isActive || isDone ? 'primary.contrastText' : 'text.disabled',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                }}>
                {num}
              </Box>
              <Typography
                variant="caption"
                sx={{
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? 'text.primary' : 'text.secondary',
                  whiteSpace: 'nowrap',
                }}>
                {label}
              </Typography>
            </Stack>
            {idx < steps.length - 1 && <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider', mx: 0.75 }} />}
          </Stack>
        );
      })}
    </Stack>
  );
}

// ── ManageEndpoint (inline edit view) ─────────────────────────────────────────

interface ManageEndpointProps {
  ep: EnvEndpoint;
  componentId: string;
  projectId: string;
  versionId: string;
  releaseId: string;
  environmentId: string;
  onBack: () => void;
}

export function ManageEndpoint({ ep, componentId, projectId, versionId, releaseId, environmentId, onBack }: ManageEndpointProps) {
  const [{ exposure: seededExposure, legacyBothHosts }] = useState(() => editorExposure(ep));
  const [exposure, setExposure] = useState<EndpointExposure>(seededExposure);
  const [saveError, setSaveError] = useState<string | null>(null);
  const updateEp = useUpdateEndpoint();
  const allowLeave = useUnsavedChanges(exposure !== seededExposure);
  const guardNavigation = useLeaveGuard();

  const handleSave = () => {
    setSaveError(null);
    updateEp.mutate(
      { componentId, projectId, environmentId, versionId, releaseId, endpointId: ep.id, displayName: ep.displayName, networkVisibilities: exposureLabels(exposure) },
      {
        onSuccess: () => {
          allowLeave();
          onBack();
        },
        onError: (err) => setSaveError(friendlyApiError(err, 'Could not update the endpoint visibility.')),
      },
    );
  };

  return (
    <Box>
      {/* Endpoint details (read-only) */}
      <Box sx={{ mb: 2 }}>
        {[
          { label: 'Name', value: ep.displayName },
          { label: 'Port', value: ep.port != null ? String(ep.port) : null },
          { label: 'Status', value: ep.state ?? null },
          { label: 'Type', value: ep.type ?? null },
          { label: 'Context', value: ep.apiContext ?? null },
          { label: 'Schema', value: ep.apiDefinitionPath ?? null },
        ].map(({ label, value }) =>
          value ? (
            <Typography key={label} variant="body2" sx={{ mb: 0.5 }}>
              <Box component="span" sx={{ fontWeight: 700 }}>
                {label}
              </Box>
              : {value}
            </Typography>
          ) : null,
        )}
      </Box>

      {/* Gateway exposure: one host at a time, or none */}
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
        Network visibility
      </Typography>
      <Stack gap={1} sx={{ mb: 1.5 }} role="radiogroup" aria-label="Network visibility">
        {EXPOSURE_OPTS.map(({ value, label, Icon, description }) => {
          const selected = exposure === value;
          return (
            <Box
              key={value}
              onClick={() => setExposure(value)}
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1.25,
                p: 1.5,
                border: '1px solid',
                borderColor: selected ? 'primary.main' : 'divider',
                borderRadius: 1,
                cursor: 'pointer',
                transition: 'border-color 0.15s',
                '&:hover': { borderColor: 'primary.main' },
              }}>
              <Box sx={{ display: 'flex', color: 'primary.main', mt: 0.25, flexShrink: 0 }}>
                <Icon size={18} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {label}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {description}
                </Typography>
              </Box>
              <Radio checked={selected} size="small" value={value} sx={{ p: 0, flexShrink: 0, mt: 0.25 }} inputProps={{ 'aria-label': label }} onClick={(e) => e.stopPropagation()} onChange={() => setExposure(value)} />
            </Box>
          );
        })}
      </Stack>
      {legacyBothHosts && (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          This endpoint was exposed on both the public and the organization host. An endpoint is now served on one host, so it is shown as Public, which stays reachable from inside the organization through the public URL.
        </Alert>
      )}

      {saveError && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {saveError}
        </Alert>
      )}

      <Stack direction="row" justifyContent="flex-end" gap={1}>
        <Button variant="outlined" color="inherit" onClick={() => guardNavigation(onBack)}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={updateEp.isPending} startIcon={updateEp.isPending ? <CircularProgress color="inherit" size={16} /> : undefined}>
          {updateEp.isPending ? 'Updating…' : 'Update'}
        </Button>
      </Stack>
    </Box>
  );
}
