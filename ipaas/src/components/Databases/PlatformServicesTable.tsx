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

import { Box, Chip, IconButton, ListingTable, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Database, Trash2, Workflow } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { DATABASE_STATUS_COLORS, DATABASE_STATUS_LABELS } from '../../constants/databases';
import { CARD_TABLE_SX } from '../../constants/styles';
import { isDatabaseOpenable, planLabel } from '../../utils/databases';
import { temporalPlanSpecLine } from '../../utils/temporal';
import { formatDateTime, formatDistanceToNow } from '../../utils/time';
import type { DatabasePlan, DatabaseServer } from '../../types/databases';
import type { TemporalPlan, TemporalServer } from '../../types/temporal';
import DeleteDatabaseDialog from './DeleteDatabaseDialog';
import DeleteTemporalDialog from '../Temporal/DeleteTemporalDialog';
import ServicePlanCell from './ServicePlanCell';

/** One listed platform service, of whichever type. */
export type ServiceRow = { kind: 'postgres'; server: DatabaseServer } | { kind: 'temporal'; server: TemporalServer };

const badgeSx = { height: 20, fontSize: 11, fontWeight: 600 } as const;
const dash = (
  <Typography variant="body2" color="text.secondary">
    —
  </Typography>
);

function TemporalPlanCell({ planId, plan }: { planId: string; plan?: TemporalPlan }): JSX.Element {
  const highlyAvailable = plan !== undefined && plan.replicas > 1;
  return (
    <Box sx={{ minWidth: 0 }}>
      <Stack direction="row" alignItems="center" gap={1}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: highlyAvailable ? 'primary.main' : 'text.primary' }}>
          {planLabel(planId)}
        </Typography>
        {plan && <Chip label={highlyAvailable ? 'HA' : 'Single replica'} size="small" color={highlyAvailable ? 'primary' : 'default'} variant="outlined" sx={badgeSx} />}
      </Stack>
      {plan && (
        <Typography variant="caption" color="text.secondary">
          {temporalPlanSpecLine(plan)}
        </Typography>
      )}
    </Box>
  );
}

function typeLabel(row: ServiceRow): string {
  if (row.kind === 'temporal') return 'Temporal';
  return row.server.postgresVersion ? `PostgreSQL ${row.server.postgresVersion}` : 'PostgreSQL';
}

interface PlatformServicesTableProps {
  rows: ServiceRow[];
  /** The offered plans, which describe each service's size; empty while they load, leaving just the plan names. */
  databasePlans: readonly DatabasePlan[];
  temporalPlans: readonly TemporalPlan[];
  onOpen: (row: ServiceRow) => void;
}

export default function PlatformServicesTable({ rows, databasePlans, temporalPlans, onOpen }: PlatformServicesTableProps): JSX.Element {
  const [deleting, setDeleting] = useState<ServiceRow | null>(null);
  return (
    <ListingTable.Container disablePaper>
      <ListingTable variant="card" density="compact" sx={CARD_TABLE_SX}>
        <ListingTable.Head>
          <ListingTable.Row>
            <ListingTable.Cell>Name</ListingTable.Cell>
            <ListingTable.Cell>Type</ListingTable.Cell>
            <ListingTable.Cell>Status</ListingTable.Cell>
            <ListingTable.Cell>Service Plan</ListingTable.Cell>
            <ListingTable.Cell>Created</ListingTable.Cell>
            <ListingTable.Cell align="right">Actions</ListingTable.Cell>
          </ListingTable.Row>
        </ListingTable.Head>
        <ListingTable.Body>
          {rows.map((row) => {
            const { server } = row;
            const openable = isDatabaseOpenable(server.status);
            return (
              <ListingTable.Row
                key={`${row.kind}:${server.id}`}
                variant="card"
                hover={openable}
                clickable={openable}
                role={openable ? 'button' : undefined}
                tabIndex={openable ? 0 : undefined}
                aria-label={openable ? `Open ${server.name}` : undefined}
                onClick={openable ? () => onOpen(row) : undefined}
                onKeyDown={
                  openable
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onOpen(row);
                        }
                      }
                    : undefined
                }>
                <ListingTable.Cell>
                  <Stack direction="row" alignItems="center" gap={1.5}>
                    {row.kind === 'temporal' ? <Workflow size={20} /> : <Database size={20} />}
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {server.name}
                      </Typography>
                      {row.kind === 'temporal' && row.server.namespace && (
                        <Typography variant="caption" color="text.secondary">
                          Namespace {row.server.namespace}
                        </Typography>
                      )}
                    </Box>
                  </Stack>
                </ListingTable.Cell>
                <ListingTable.Cell>
                  <Typography variant="body2">{typeLabel(row)}</Typography>
                </ListingTable.Cell>
                <ListingTable.Cell>
                  <Chip label={DATABASE_STATUS_LABELS[server.status]} color={DATABASE_STATUS_COLORS[server.status]} size="small" variant="outlined" />
                </ListingTable.Cell>
                <ListingTable.Cell>
                  {!server.plan ? (
                    dash
                  ) : row.kind === 'temporal' ? (
                    <TemporalPlanCell planId={server.plan} plan={temporalPlans.find((p) => p.id === server.plan)} />
                  ) : (
                    <ServicePlanCell planId={server.plan} plan={databasePlans.find((p) => p.id === server.plan)} nodeCount={row.server.nodeCount} storageGi={row.server.storageGi} />
                  )}
                </ListingTable.Cell>
                <ListingTable.Cell>
                  {server.createdAt ? (
                    <Box>
                      <Typography variant="body2">{formatDistanceToNow(server.createdAt)}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatDateTime(server.createdAt)}
                      </Typography>
                    </Box>
                  ) : (
                    dash
                  )}
                </ListingTable.Cell>
                <ListingTable.Cell align="right">
                  {/* A service being torn down is already on its way out. */}
                  {openable && (
                    <Tooltip title="Delete">
                      <IconButton
                        size="small"
                        color="error"
                        aria-label={`Delete ${server.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleting(row);
                        }}
                        onKeyDown={(e) => e.stopPropagation()}>
                        <Trash2 size={16} />
                      </IconButton>
                    </Tooltip>
                  )}
                </ListingTable.Cell>
              </ListingTable.Row>
            );
          })}
        </ListingTable.Body>
      </ListingTable>
      {deleting?.kind === 'postgres' && <DeleteDatabaseDialog server={deleting.server} onClose={() => setDeleting(null)} />}
      {deleting?.kind === 'temporal' && <DeleteTemporalDialog server={deleting.server} onClose={() => setDeleting(null)} />}
    </ListingTable.Container>
  );
}
