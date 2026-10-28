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
import { useState } from 'react';
import { useUpdateEndpoint } from '../../hooks/useComponents';
import type { EnvEndpoint } from '../../types/component';
import { VISIBILITY_OPTS } from '../EndpointCard';

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
  onBack: () => void;
}

export function ManageEndpoint({ ep, componentId, projectId, versionId, releaseId, onBack }: ManageEndpointProps) {
  const [visibilities, setVisibilities] = useState<string[]>(ep.networkVisibilities ?? [ep.visibility ?? 'Public']);
  const [saveError, setSaveError] = useState<string | null>(null);
  const updateEp = useUpdateEndpoint();

  const handleToggle = (key: string) => {
    setVisibilities((prev) => (prev.includes(key) ? prev.filter((v) => v !== key) : [...prev, key]));
  };

  const handleSave = () => {
    setSaveError(null);
    updateEp.mutate(
      { componentId, projectId, versionId, releaseId, endpointId: ep.id, displayName: ep.displayName, networkVisibilities: visibilities },
      {
        onSuccess: onBack,
        onError: (err) => setSaveError(err instanceof Error ? err.message : 'Failed to update endpoint'),
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

      {/* Network visibility */}
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
        Network Visibility
      </Typography>
      <Stack gap={1} sx={{ mb: 2 }}>
        {VISIBILITY_OPTS.map(({ key, label, Icon, description }) => {
          const checked = visibilities.includes(key);
          return (
            <Box
              key={key}
              onClick={() => handleToggle(key)}
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1.25,
                p: 1.5,
                border: '1px solid',
                borderColor: checked ? 'primary.main' : 'divider',
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
              <Checkbox checked={checked} size="small" sx={{ p: 0, flexShrink: 0, mt: 0.25 }} onClick={(e) => e.stopPropagation()} onChange={() => handleToggle(key)} />
            </Box>
          );
        })}
      </Stack>

      {saveError && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {saveError}
        </Alert>
      )}

      <Stack direction="row" justifyContent="flex-end" gap={1}>
        <Button onClick={onBack}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={updateEp.isPending || visibilities.length === 0} startIcon={updateEp.isPending ? <CircularProgress color="inherit" size={16} /> : undefined}>
          {updateEp.isPending ? 'Updating…' : 'Update'}
        </Button>
      </Stack>
    </Box>
  );
}
