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

import { Alert, Box, Button, CircularProgress, Grid, PageContent, Stack, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft, Workflow } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import TextField from '../components/common/TextField';
import SelectableCard from '../components/Databases/SelectableCard';
import PlanCard from '../components/Databases/PlanCard';
import TemporalPlanCard from '../components/Temporal/TemporalPlanCard';
import { DatabasePlansSkeleton } from '../components/Databases/DatabaseSkeletons';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { useCreateDatabaseServer, useDatabaseOffering, useDatabaseServers } from '../hooks/useDatabases';
import { useCreateTemporalServer, useTemporalOffering, useTemporalServers } from '../hooks/useTemporal';
import { PLATFORM_SERVICE_TYPES, type PlatformServiceKind } from '../constants/databases';
import { REQUIRED_FIELD_SX } from '../constants/styles';
import { databaseNameError, toCreateDatabaseError } from '../utils/databases';
import { temporalNameError, toCreateTemporalError } from '../utils/temporal';
import { databaseUrl, orgDatabasesUrl, temporalUrl, type OrgScope } from '../nav';
import type { DatabasePlane } from '../types/databases';

const assetUrl = (path: string): string => `${import.meta.env.BASE_URL}${path}`;
const sectionHeadingSx = { fontWeight: 600, mb: 1.5 } as const;
const fieldSx = { maxWidth: 480, ...REQUIRED_FIELD_SX } as const;

function planeLabel(plane: DatabasePlane): string {
  const name = plane.displayName || plane.name;
  const where = [plane.region, plane.cloud?.toUpperCase()].filter(Boolean).join(', ');
  return where ? `${name} (${where})` : name;
}

export default function CreateDatabaseServer(scope: OrgScope): JSX.Element {
  const navigate = useAppNavigate();
  // No type is preselected: the name rules and the plans both depend on it.
  const [kind, setKind] = useState<PlatformServiceKind | null>(null);
  const isTemporal = kind === 'temporal';

  // Every service in the organization shares one namespace of names, whatever its type.
  const databases = useDatabaseServers();
  const temporals = useTemporalServers();
  const dbOffering = useDatabaseOffering(kind === 'postgres');
  const temporalOffering = useTemporalOffering(isTemporal);
  const createDatabase = useCreateDatabaseServer();
  const createTemporal = useCreateTemporalServer();
  const create = isTemporal ? createTemporal : createDatabase;

  const [name, setName] = useState('');
  // An unset pick falls back to the provider's default plan, so the selection
  // is always a valid offering without syncing state to the fetched data.
  const [pickedPlan, setPickedPlan] = useState('');

  const offering = isTemporal ? temporalOffering : dbOffering;
  const planIds = (offering.data?.plans ?? []).map((p) => p.id);
  const planId = planIds.includes(pickedPlan) ? pickedPlan : (offering.data?.defaultPlan ?? planIds[0] ?? '');

  const takenNames = [...(databases.data ?? []), ...(temporals.data ?? [])].map((s) => s.name);
  const nameError = isTemporal ? temporalNameError(name, takenNames, offering.data?.maxNameLength) : databaseNameError(name, takenNames, offering.data?.maxNameLength);
  // Plans stay locked until the name is valid, so a missing name is never left behind a plan that already looks chosen.
  const nameReady = name !== '' && !nameError;
  const canCreate = nameReady && !!planId && !create.isPending;
  const createError = create.isError ? (isTemporal ? toCreateTemporalError(create.error) : toCreateDatabaseError(create.error)) : null;

  const pickKind = (next: PlatformServiceKind) => {
    if (next === kind) return;
    setKind(next);
    setPickedPlan('');
    createDatabase.reset();
    createTemporal.reset();
  };

  const submit = () => {
    const input = { name, plan: planId || undefined };
    if (isTemporal) createTemporal.mutate(input, { onSuccess: (server) => navigate(temporalUrl(scope, server.id)) });
    else createDatabase.mutate(input, { onSuccess: (server) => navigate(databaseUrl(scope, server.id)) });
  };

  const typeAndName = (
    <>
      <Typography variant="subtitle2" sx={sectionHeadingSx}>
        Select Service Type
      </Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {PLATFORM_SERVICE_TYPES.map((type) => (
          <Grid key={type.id} size={{ xs: 12, sm: 4 }}>
            <SelectableCard title={type.name} description={type.description} logo={type.logo && assetUrl(type.logo)} icon={<Workflow size={28} />} selected={type.id === kind} disabled={create.isPending} onSelect={() => pickKind(type.id)} />
          </Grid>
        ))}
      </Grid>
      {kind && (
        <TextField
          label="Name"
          required
          fullWidth
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={!!nameError}
          helperText={nameError || (isTemporal ? 'Lowercase letters, digits and hyphens, starting with a letter. Workers use the namespace "default".' : 'Lowercase letters, digits and hyphens.')}
          sx={fieldSx}
        />
      )}
    </>
  );

  const plane = offering.data?.plane;
  const runsOn = plane ? `, running on ${planeLabel(plane)}` : '';
  const versionLine = isTemporal ? `Temporal ${temporalOffering.data?.temporalVersion ?? ''}`.trim() : `PostgreSQL ${dbOffering.data?.postgresVersion ?? ''}`.trim();

  const planSection = offering.isLoading ? (
    <DatabasePlansSkeleton />
  ) : offering.isError ? (
    <Alert
      severity="error"
      action={
        <Button color="inherit" size="small" onClick={() => offering.refetch()}>
          Retry
        </Button>
      }>
      Failed to load the service plans.
    </Alert>
  ) : !planIds.length ? (
    <Alert severity="info">No service plans are offered.</Alert>
  ) : (
    <>
      {/* The version is the provider's or the deployment's choice, not the user's. */}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {versionLine}
        {runsOn}.
      </Typography>
      <Typography variant="subtitle2" sx={{ ...sectionHeadingSx, mb: nameReady ? sectionHeadingSx.mb : 0.5 }}>
        Select Service Plan
      </Typography>
      {!nameReady && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Enter a valid name to choose a plan.
        </Typography>
      )}
      <Stack direction="row" gap={2} flexWrap="wrap">
        {isTemporal
          ? temporalOffering.data?.plans.map((plan) => <TemporalPlanCard key={plan.id} plan={plan} selected={nameReady && planId === plan.id} disabled={!nameReady || create.isPending} onSelect={() => setPickedPlan(plan.id)} />)
          : dbOffering.data?.plans.map((plan) => <PlanCard key={plan.id} plan={plan} selected={nameReady && planId === plan.id} disabled={!nameReady || create.isPending} onSelect={() => setPickedPlan(plan.id)} />)}
      </Stack>
      {isTemporal && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
          A server keeps its plan&apos;s history shards for life, which bound its workflow throughput. Pick the plan for the throughput you will need.
        </Typography>
      )}
    </>
  );

  return (
    <PageContent>
      <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate(orgDatabasesUrl(scope))} sx={{ mb: 2 }}>
        Back to Platform Services
      </Button>

      <Box sx={{ maxWidth: 900 }}>
        <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
          Create Service
        </Typography>

        {createError && (
          <Alert severity="error" onClose={() => create.reset()} sx={{ mb: 3 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {createError.title}
            </Typography>
            <Typography variant="body2">{createError.message}</Typography>
          </Alert>
        )}

        {typeAndName}
        {kind && <Box sx={{ mt: 4 }}>{planSection}</Box>}

        <Stack direction="row" gap={1.5} sx={{ mt: 4 }}>
          <Button variant="contained" disabled={!canCreate} startIcon={create.isPending ? <CircularProgress size={16} color="inherit" /> : undefined} onClick={submit}>
            {create.isPending ? 'Creating…' : 'Create'}
          </Button>
          <Button variant="outlined" disabled={create.isPending} onClick={() => navigate(orgDatabasesUrl(scope))}>
            Cancel
          </Button>
        </Stack>
      </Box>
    </PageContent>
  );
}
