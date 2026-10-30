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

import { Alert, Box, Button, Chip, CircularProgress, IconButton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Cpu, Eye, EyeOff, Layers, MemoryStick, RefreshCw, Server } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX, type ReactNode } from 'react';
import { useRevealTemporalCredentials } from '../../hooks/useTemporal';
import { DATABASE_STATUS_COLORS, DATABASE_STATUS_LABELS } from '../../constants/databases';
import { cpuLabel, memoryLabel, planLabel } from '../../utils/databases';
import CopyField from '../Databases/CopyField';
import DetailRow from '../Databases/DetailRow';
import type { TemporalPlan, TemporalServerDetail } from '../../types/temporal';

const cardSx = { border: '1px solid', borderColor: 'divider', borderRadius: 1 } as const;
const LABEL_WIDTH = 150;

function PlanStat({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }): JSX.Element {
  return (
    <Box>
      <Stack direction="row" alignItems="center" gap={0.75} sx={{ color: 'text.secondary', mb: 0.5 }}>
        {icon}
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
      </Stack>
      <Typography variant="body2">{children}</Typography>
    </Box>
  );
}

interface TemporalOverviewTabProps {
  service: TemporalServerDetail;
  /** The server's plan from the offering; undefined while it loads or for a plan no longer offered. */
  plan?: TemporalPlan;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export default function TemporalOverviewTab({ service, plan, onRefresh, isRefreshing }: TemporalOverviewTabProps): JSX.Element {
  const reveal = useRevealTemporalCredentials(service.id);
  const [showKey, setShowKey] = useState(false);
  const credentials = reveal.data;
  // Workers dial host:port as one address.
  const address = service.host && service.port ? `${service.host}:${service.port}` : service.host;

  const hideKey = () => {
    reveal.reset();
    setShowKey(false);
  };

  return (
    <Box>
      <Box sx={cardSx}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={1} sx={{ px: 3, py: 1.5 }}>
          <Stack direction="row" alignItems="center" gap={2}>
            <Typography variant="body2" color="text.secondary" sx={{ width: LABEL_WIDTH }}>
              Status
            </Typography>
            <Chip label={DATABASE_STATUS_LABELS[service.status]} color={DATABASE_STATUS_COLORS[service.status]} size="small" variant="outlined" />
          </Stack>
          <Tooltip title="Refresh">
            <span>
              <IconButton size="small" aria-label="Refresh" onClick={onRefresh} disabled={isRefreshing}>
                <RefreshCw size={16} />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>

        <DetailRow label="Address:" labelWidth={LABEL_WIDTH}>
          {address ? <CopyField value={address} aria-label="address" /> : <Typography variant="body2">Not available yet</Typography>}
        </DetailRow>
        <DetailRow label="Namespace:" labelWidth={LABEL_WIDTH}>
          {service.namespace ? <CopyField value={service.namespace} aria-label="namespace" /> : <Typography variant="body2">—</Typography>}
        </DetailRow>
        {service.host && !service.reachable && (
          <Box sx={{ px: 3, pb: 1.5 }}>
            <Alert severity="warning">This Temporal server is not published, so integrations cannot reach this address. It is reachable only from inside the provider&apos;s platform.</Alert>
          </Box>
        )}

        {credentials ? (
          <DetailRow
            label="API Key:"
            labelWidth={LABEL_WIDTH}
            action={
              <Button size="small" onClick={hideKey}>
                Hide key
              </Button>
            }>
            <CopyField
              value={credentials.apiKey}
              aria-label="API key"
              password={!showKey}
              endAction={
                <IconButton size="small" aria-label={showKey ? 'Hide API key' : 'Show API key'} onClick={() => setShowKey((v) => !v)} edge="end">
                  {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </IconButton>
              }
            />
          </DetailRow>
        ) : (
          <DetailRow label="API Key:" labelWidth={LABEL_WIDTH}>
            <Stack gap={0.5} alignItems="flex-start">
              <Button variant="outlined" size="small" startIcon={reveal.isPending ? <CircularProgress size={14} color="inherit" /> : <Eye size={16} />} disabled={reveal.isPending || service.status !== 'ACTIVE'} onClick={() => reveal.mutate()}>
                View API Key
              </Button>
              {reveal.isError && (
                <Typography variant="caption" color="error">
                  {reveal.error.message}
                </Typography>
              )}
            </Stack>
          </DetailRow>
        )}
        <Typography variant="caption" color="text.secondary" component="p" sx={{ px: 3, py: 1.5, m: 0, borderTop: '1px solid', borderColor: 'divider' }}>
          Connect workers over TLS to the address above, in the namespace above, sending the API key as a bearer token.
        </Typography>
      </Box>

      <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 4, mb: 1.5 }}>
        Current Service Plan
      </Typography>
      <Box sx={{ ...cardSx, p: 3 }}>
        <Stack direction="row" flexWrap="wrap" gap={7} alignItems="flex-start">
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {service.plan ? planLabel(service.plan) : '—'}
            </Typography>
            {service.runningVersion && (
              <Typography variant="body2" color="text.secondary">
                Temporal {service.runningVersion}
              </Typography>
            )}
          </Box>
          {plan && (
            <>
              <PlanStat icon={<Server size={15} />} label="Replicas">
                {plan.replicas > 1 ? `${plan.replicas} (highly available)` : '1 (not highly available)'}
              </PlanStat>
              {plan.cpu && (
                <PlanStat icon={<Cpu size={15} />} label="CPU">
                  {cpuLabel(plan.cpu)}
                </PlanStat>
              )}
              {plan.memory && (
                <PlanStat icon={<MemoryStick size={15} />} label="Memory">
                  {memoryLabel(plan.memory)}
                </PlanStat>
              )}
              {plan.historyShards !== undefined && (
                <PlanStat icon={<Layers size={15} />} label="History shards">
                  {plan.historyShards}
                </PlanStat>
              )}
            </>
          )}
        </Stack>
      </Box>
    </Box>
  );
}
