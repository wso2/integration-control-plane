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

import { Alert, Box, Button, Checkbox, CircularProgress, Stack, Typography } from '@wso2/oxygen-ui';
import { Building2, Folder, Globe } from '@wso2/oxygen-ui-icons-react';
import { useState } from 'react';
import { Scopes } from '../../constants/permissions';
import { useLeaveGuard, useUnsavedChanges } from '../../contexts/UnsavedChangesContext';
import { useCan } from '../../hooks/useCan';
import { useUpdateEndpoint } from '../../hooks/useComponents';
import type { EndpointExposure, EnvEndpoint } from '../../types/component';
import { friendlyApiError } from '../../utils/apiSecurity';
import { editorExposure, exposureLabels } from '../../utils/endpoints';

// Project access is always on, so it shows checked and locked. The gateway serves an endpoint on one
// host at a time, so Public and Organization exclude each other, and clearing the checked one leaves
// the endpoint on neither.
const VISIBILITY_OPTS: { value: 'project' | Exclude<EndpointExposure, 'none'>; label: string; Icon: typeof Globe; description: string }[] = [
  { value: 'project', label: 'Project', Icon: Folder, description: 'Integrations in the same project can always call it.' },
  { value: 'public', label: 'Public', Icon: Globe, description: 'Reachable from the internet, including integrations in your organization. The API’s security settings still apply.' },
  { value: 'organization', label: 'Organization', Icon: Building2, description: 'Reachable only from integrations in your organization.' },
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
  const canExpose = useCan()(Scopes.ENDPOINT_EXPOSE);

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

      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
        Network visibility
      </Typography>
      <Stack gap={1} sx={{ mb: 1.5 }} role="group" aria-label="Network visibility">
        {VISIBILITY_OPTS.map(({ value, label, Icon, description }) => {
          const locked = value === 'project';
          const checked = locked || exposure === value;
          const toggle = () => {
            if (!locked) setExposure((current) => (current === value ? 'none' : value));
          };
          return (
            <Box
              key={value}
              onClick={toggle}
              title={locked ? 'Always on' : undefined}
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1.25,
                p: 1.5,
                border: '1px solid',
                borderColor: locked ? 'action.disabled' : checked ? 'primary.main' : 'divider',
                borderRadius: 1,
                bgcolor: locked ? 'action.hover' : undefined,
                cursor: locked ? 'not-allowed' : 'pointer',
                transition: 'border-color 0.15s',
                '&:hover': locked ? undefined : { borderColor: 'primary.main' },
              }}>
              <Box sx={{ display: 'flex', color: locked ? 'text.disabled' : 'primary.main', mt: 0.25, flexShrink: 0 }}>
                <Icon size={18} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }} color={locked ? 'text.secondary' : undefined}>
                  {label}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {description}
                </Typography>
              </Box>
              <Checkbox checked={checked} disabled={locked} size="small" value={value} sx={{ p: 0, flexShrink: 0, mt: 0.25 }} inputProps={{ 'aria-label': label }} onClick={(e) => e.stopPropagation()} onChange={toggle} />
            </Box>
          );
        })}
      </Stack>
      {legacyBothHosts && (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          This endpoint was exposed on both the public and the organization host. An endpoint is now served on one host, so saving keeps it only on the host selected here.
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
        {canExpose && (
          <Button variant="contained" onClick={handleSave} disabled={updateEp.isPending} startIcon={updateEp.isPending ? <CircularProgress color="inherit" size={16} /> : undefined}>
            {updateEp.isPending ? 'Updating…' : 'Update'}
          </Button>
        )}
      </Stack>
    </Box>
  );
}
