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

import { Box, Button, Divider, IconButton, Paper, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Pencil, Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import ProbeDisplay from './ProbeDisplay';
import ProbeForm from './ProbeForm';
import { useDeleteHealthCheck, useUpdateHealthCheck } from '../../hooks/useHealthChecks';
import { hasProbe, serializeProbeForWrite } from '../../utils/healthChecks';
import { PROBE_KIND, type HealthCheck, type ProbeKind } from '../../types/healthChecks';
import type { ReleaseContainer } from '../../types/devopsConfigs';

interface HealthCheckCardProps {
  healthCheck: HealthCheck;
  container: ReleaseContainer;
  projectId: string;
  componentId: string;
  releaseId: string;
  /** The deployment track the release belongs to. */
  deploymentTrackId: string;
  environmentId: string;
  canManage: boolean;
  onNotify: (type: 'success' | 'error', message: string) => void;
}

const cardSx = { p: 3, mb: 2 } as const;

export default function HealthCheckCard({ healthCheck: hc, container, projectId, componentId, releaseId, deploymentTrackId, environmentId, canManage, onNotify }: HealthCheckCardProps): JSX.Element {
  const [formKind, setFormKind] = useState<ProbeKind | null>(null);
  const update = useUpdateHealthCheck(projectId);
  const del = useDeleteHealthCheck(projectId);
  const fallbackPort = container.ports?.[0]?.port ?? 8080;

  const hasLiveness = hasProbe(hc.probes.liveness_probe);
  const hasReadiness = hasProbe(hc.probes.readiness_probe);
  const hasTwoProbes = hasLiveness && hasReadiness;
  const busy = update.isPending || del.isPending;

  if (formKind) {
    return (
      <ProbeForm
        kind={formKind}
        healthCheck={hc}
        container={container}
        projectId={projectId}
        componentId={componentId}
        releaseId={releaseId}
        deploymentTrackId={deploymentTrackId}
        environmentId={environmentId}
        onClose={() => setFormKind(null)}
        onSaved={(m) => {
          setFormKind(null);
          onNotify('success', m);
        }}
        onError={(m) => onNotify('error', m)}
      />
    );
  }

  const deleteProbe = (kind: ProbeKind): void => {
    const done = { onSuccess: () => onNotify('success', `${kind} probe removed.`), onError: (e: unknown) => onNotify('error', e instanceof Error ? e.message : 'Failed to remove the probe.') };
    if (hasTwoProbes) {
      // Removing one of two probes: keep the other, blank out the deleted one.
      update.mutate(
        {
          componentId,
          releaseId,
          environmentId,
          deploymentTrackId,
          containerId: container.ID,
          healthCheckId: hc.ID,
          data: {
            probes: {
              liveness_probe: kind === PROBE_KIND.LIVENESS ? {} : serializeProbeForWrite(hc.probes.liveness_probe, fallbackPort),
              readiness_probe: kind === PROBE_KIND.READINESS ? {} : serializeProbeForWrite(hc.probes.readiness_probe, fallbackPort),
            },
          },
        },
        done,
      );
    } else {
      // Last probe: delete the whole health check.
      del.mutate({ componentId, releaseId, environmentId, deploymentTrackId, containerId: container.ID, healthCheckId: hc.ID }, done);
    }
  };

  const missingKind: ProbeKind = hasLiveness ? PROBE_KIND.READINESS : PROBE_KIND.LIVENESS;

  return (
    <Paper variant="outlined" sx={cardSx}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Container: {container.name}
        </Typography>
        {!hasTwoProbes && canManage && (
          <Button variant="contained" size="small" startIcon={<Plus size={14} />} disabled={busy} onClick={() => setFormKind(missingKind)}>
            Create
          </Button>
        )}
      </Stack>

      {hasLiveness && (
        <Box>
          <ProbeSectionTitle title="Liveness Probe" canManage={canManage} busy={busy} onEdit={() => setFormKind(PROBE_KIND.LIVENESS)} onDelete={() => deleteProbe(PROBE_KIND.LIVENESS)} />
          <ProbeDisplay probe={hc.probes.liveness_probe} showSuccess={false} />
        </Box>
      )}

      {hasLiveness && hasReadiness && <Divider sx={{ my: 3 }} />}

      {hasReadiness && (
        <Box>
          <ProbeSectionTitle title="Readiness Probe" canManage={canManage} busy={busy} onEdit={() => setFormKind(PROBE_KIND.READINESS)} onDelete={() => deleteProbe(PROBE_KIND.READINESS)} />
          <ProbeDisplay probe={hc.probes.readiness_probe} showSuccess />
        </Box>
      )}
    </Paper>
  );
}

function ProbeSectionTitle({ title, canManage, busy, onEdit, onDelete }: { title: string; canManage: boolean; busy: boolean; onEdit: () => void; onDelete: () => void }): JSX.Element {
  return (
    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
      <Typography variant="h6" fontWeight={700}>
        {title}
      </Typography>
      {canManage && (
        <Stack direction="row" gap={0.5}>
          <Tooltip title="Edit">
            <IconButton size="small" color="primary" aria-label={`Edit ${title}`} disabled={busy} onClick={onEdit}>
              <Pencil size={16} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton size="small" color="error" aria-label={`Delete ${title}`} disabled={busy} onClick={onDelete}>
              <Trash2 size={16} />
            </IconButton>
          </Tooltip>
        </Stack>
      )}
    </Stack>
  );
}
