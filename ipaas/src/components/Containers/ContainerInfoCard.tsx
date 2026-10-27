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

import { Alert, Box, Button, Chip, Grid, IconButton, Paper, Slider, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Check, Clock, Copy, Pencil } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import ResourceRangeSlider from '../common/ResourceRangeSlider';
import ContainerEditForm from './ContainerEditForm';
import { formatDistanceToNow } from '../../utils/time';
import { CPU_MAX, CPU_MIN, MEMORY_MAX, MEMORY_MIN, containerImageName, isMainContainer, milliToCpu } from '../../utils/containers';
import type { ReleaseContainer } from '../../types/devopsConfigs';

interface ContainerInfoCardProps {
  container: ReleaseContainer;
  projectId: string;
  componentId: string;
  releaseId: string;
  /** The deployment track the release belongs to. */
  deploymentTrackId: string;
  isPaidOrPdpUser: boolean;
  canManage: boolean;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}

const cardSx = { p: 3, mb: 2 } as const;
const cpuFmt = (v: number): string => String(Math.round(v * 100) / 100);
const memFmt = (v: number): string => String(Math.round(v));

export default function ContainerInfoCard({ container: c, projectId, componentId, releaseId, deploymentTrackId, isPaidOrPdpUser, canManage, onSaved, onError }: ContainerInfoCardProps): JSX.Element {
  const [isEditOpen, setIsEditOpen] = useState(false);

  if (isEditOpen) {
    return (
      <ContainerEditForm
        container={c}
        projectId={projectId}
        componentId={componentId}
        releaseId={releaseId}
        deploymentTrackId={deploymentTrackId}
        isPaidOrPdpUser={isPaidOrPdpUser}
        onClose={() => setIsEditOpen(false)}
        onSaved={(m) => {
          setIsEditOpen(false);
          onSaved(m);
        }}
        onError={onError}
      />
    );
  }

  const imageName = containerImageName(c);
  const main = isMainContainer(c);
  const policyLabel = c.image_pull_policy === 'Always' ? 'Always' : 'If Not Present';

  return (
    <Paper variant="outlined" sx={cardSx}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Stack direction="row" alignItems="center" gap={1.5}>
          <Typography variant="h6" fontWeight={700}>
            {c.name}
          </Typography>
          <Chip size="small" variant="outlined" color={main ? 'success' : 'default'} label={main ? 'Main Container' : 'Init Container'} />
        </Stack>
        {canManage && (
          <Button variant="outlined" size="small" startIcon={<Pencil size={14} />} onClick={() => setIsEditOpen(true)}>
            Edit
          </Button>
        )}
      </Stack>

      <Stack direction="row" alignItems="center" gap={0.75} sx={{ mb: 2.5, color: 'text.secondary' }}>
        <Typography variant="body2">Last Updated:</Typography>
        <Clock size={14} />
        <Typography variant="body2">{c.UpdatedAt ? formatDistanceToNow(c.UpdatedAt) : '-'}</Typography>
      </Stack>

      <Grid container spacing={4}>
        <Grid size={{ xs: 12, md: 5 }}>
          {imageName ? (
            <CopyField label="Image:" value={imageName} />
          ) : (
            <Alert severity="info" sx={{ mb: 1 }}>
              No image has been deployed yet.
            </Alert>
          )}
          <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 1.5 }}>
            <Chip size="small" variant="outlined" label={`Image Pull Policy: ${policyLabel}`} sx={{ borderColor: 'divider', color: 'text.secondary' }} />
            {c.ports?.map((p) => (
              <Chip key={`${p.protocol}-${p.port}`} size="small" variant="outlined" label={`${p.protocol}: ${p.port}`} sx={{ borderColor: 'divider', color: 'text.secondary' }} />
            ))}
          </Stack>
        </Grid>
        <Grid size={{ xs: 12, md: 7 }}>
          <ResourceBars container={c} />
        </Grid>
      </Grid>

      <CommandAndArgs command={c.command} args={c.args} />
    </Paper>
  );
}

/** Read-only CPU/Memory display (dual sliders when limits are set, else request-only + a warning). */
function ResourceBars({ container: c }: { container: ReleaseContainer }): JSX.Element {
  const limitDisabled = c.limit_disabled ?? false;
  if (!limitDisabled) {
    return (
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <ResourceRangeSlider label="CPU Request / Limit" unit="CPU" min={CPU_MIN} max={CPU_MAX} step={0.01} request={milliToCpu(c.cpu ?? 0)} limit={milliToCpu(c.cpu_limit ?? 0)} viewMode format={cpuFmt} />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <ResourceRangeSlider label="Memory Request / Limit" unit="Mi" min={MEMORY_MIN} max={MEMORY_MAX} step={1} request={c.memory ?? 0} limit={c.memory_limit ?? 0} viewMode format={memFmt} />
        </Grid>
      </Grid>
    );
  }
  return (
    <Grid container spacing={3}>
      <Grid size={{ xs: 12, md: 6 }}>
        <ReadonlySingle label="CPU Request" unit="CPU" min={CPU_MIN} max={CPU_MAX} value={milliToCpu(c.cpu ?? 0)} format={cpuFmt} />
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <ReadonlySingle label="Memory Request" unit="Mi" min={MEMORY_MIN} max={MEMORY_MAX} value={c.memory ?? 0} format={memFmt} />
      </Grid>
      <Grid size={{ xs: 12 }}>
        <Alert severity="warning">Resource limits are disabled for this container. Containers without resource limits can freely use up resources and can negatively impact the performance of other integrations.</Alert>
      </Grid>
    </Grid>
  );
}

function ReadonlySingle({ label, unit, min, max, value, format }: { label: string; unit: string; min: number; max: number; value: number; format: (v: number) => string }): JSX.Element {
  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="subtitle2" fontWeight={600}>
          {label}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {format(value)} {unit}
        </Typography>
      </Stack>
      <Box sx={{ px: 1 }}>
        <Slider value={value} min={min} max={max} disabled aria-label={label} />
      </Box>
    </Box>
  );
}

function CommandAndArgs({ command, args }: { command?: string[] | null; args?: string[] | null }): JSX.Element | null {
  const hasCommand = (command?.length ?? 0) > 0;
  const hasArgs = (args?.length ?? 0) > 0;
  if (!hasCommand && !hasArgs) return null;
  return (
    <Stack gap={1.5} sx={{ mt: 3 }}>
      {hasCommand && <CodeLine label="Command" value={command as string[]} />}
      {hasArgs && <CodeLine label="Arguments" value={args as string[]} />}
    </Stack>
  );
}

function CodeLine({ label, value }: { label: string; value: string[] }): JSX.Element {
  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5 }}>
        {label}
      </Typography>
      <Box component="pre" sx={{ m: 0, px: 1.5, py: 1, bgcolor: 'action.hover', borderRadius: 1, fontSize: '0.8125rem', fontFamily: 'monospace', color: 'text.secondary', overflowX: 'auto' }}>
        {JSON.stringify(value)}
      </Box>
    </Box>
  );
}

/** A read-only value with a label and a copy-to-clipboard control. */
function CopyField({ label, value }: { label: string; value: string }): JSX.Element {
  const [copied, setCopied] = useState(false);
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard?.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };
  return (
    <Stack direction="row" alignItems="center" gap={1} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 1.5, py: 0.75, maxWidth: '100%' }}>
      <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={value}>
        {value}
      </Typography>
      <Tooltip title={copied ? 'Copied' : 'Copy'}>
        <IconButton size="small" edge="end" aria-label="Copy image" onClick={copy} sx={{ ml: 'auto' }}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </IconButton>
      </Tooltip>
    </Stack>
  );
}
