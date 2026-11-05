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

import { Alert, Box, Button, Chip, Grid, IconButton, Paper, Stack, Tooltip, Typography, RelativeTime } from '@wso2/oxygen-ui';
import { Check, Copy, Pencil } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import ResourceRangeSlider from '../common/ResourceRangeSlider';
import ContainerEditForm from './ContainerEditForm';
import { formatDateTime, formatDistanceToNow } from '../../utils/time';
import { CPU_MAX, CPU_MIN, MEMORY_MAX, MEMORY_MIN, containerImageName, formatCpu, isMainContainer } from '../../utils/containers';
import type { PlanAccess } from '../../utils/billing';
import type { ReleaseContainer } from '../../types/devopsConfigs';

interface ContainerInfoCardProps {
  container: ReleaseContainer;
  projectId: string;
  componentId: string;
  releaseId: string;
  /** The deployment track the release belongs to. */
  deploymentTrackId: string;
  plan: PlanAccess;
  canManage: boolean;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}

const cardSx = { p: 3, mb: 2 } as const;
const memFmt = (v: number): string => String(Math.round(v));

export default function ContainerInfoCard({ container: c, projectId, componentId, releaseId, deploymentTrackId, plan, canManage, onSaved, onError }: ContainerInfoCardProps): JSX.Element {
  const [isEditOpen, setIsEditOpen] = useState(false);

  if (isEditOpen) {
    return (
      <ContainerEditForm
        container={c}
        projectId={projectId}
        componentId={componentId}
        releaseId={releaseId}
        deploymentTrackId={deploymentTrackId}
        plan={plan}
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
  const policyLabel = c.image_pull_policy === 'Always' ? 'Always' : 'If not present';

  return (
    <Paper variant="outlined" sx={cardSx}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Stack direction="row" alignItems="center" gap={1.5}>
          <Typography variant="h6" fontWeight={700}>
            {c.name}
          </Typography>
          <Chip size="small" variant="outlined" color={main ? 'success' : 'default'} label={main ? 'Main container' : 'Init container'} />
        </Stack>
        {canManage && (
          <Button variant="outlined" size="small" startIcon={<Pencil size={14} />} onClick={() => setIsEditOpen(true)}>
            Edit
          </Button>
        )}
      </Stack>

      {c.UpdatedAt ? (
        <RelativeTime time={formatDistanceToNow(c.UpdatedAt)} dateTime={c.UpdatedAt} tooltip={formatDateTime(c.UpdatedAt)} action="Last updated" sx={{ mb: 2.5 }} />
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
          Last updated —
        </Typography>
      )}

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
            <Chip size="small" variant="outlined" label={`Image pull policy: ${policyLabel}`} sx={{ borderColor: 'divider', color: 'text.secondary' }} />
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

/** Read-only CPU/Memory display. */
function ResourceBars({ container: c }: { container: ReleaseContainer }): JSX.Element {
  return (
    <Grid container spacing={3}>
      <Grid size={{ xs: 12, md: 6 }}>
        <ResourceRangeSlider label="CPU request / limit" unit="CPU" min={CPU_MIN} max={CPU_MAX} step={1} request={c.cpu ?? 0} limit={c.cpu_limit ?? 0} viewMode format={formatCpu} />
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <ResourceRangeSlider label="Memory request / limit" unit="Mi" min={MEMORY_MIN} max={MEMORY_MAX} step={1} request={c.memory ?? 0} limit={c.memory_limit ?? 0} viewMode format={memFmt} />
      </Grid>
    </Grid>
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
