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

import { Alert, Box, Button, Card, Chip, CircularProgress, Grid, InputAdornment, TextField, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft, ArrowRight, CircleCheck, Database, Server, Workflow } from '@wso2/oxygen-ui-icons-react';
import { useRef, useState, type JSX } from 'react';
import SelectableCard from '../common/SelectableCard';
import PlanCard from './PlanCard';
import TemporalPlanCard from '../Temporal/TemporalPlanCard';
import { DatabasePlansSkeleton } from './DatabaseSkeletons';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { Scopes } from '../../constants/permissions';
import { useCan } from '../../hooks/useCan';
import { useUnsavedChanges } from '../../contexts/UnsavedChangesContext';
import { useCreateDatabaseServer, useDatabaseOffering, useDatabaseServers } from '../../hooks/useDatabases';
import { useCreateTemporalServer, useTemporalOffering, useTemporalServers } from '../../hooks/useTemporal';
import { PLATFORM_SERVICE_TYPES, type PlatformServiceKind } from '../../constants/databases';
import { REQUIRED_FIELD_SX } from '../../constants/styles';
import { databaseNameError, toCreateDatabaseError } from '../../utils/databases';
import { temporalNameError, toCreateTemporalError } from '../../utils/temporal';
import { databaseUrl, temporalUrl, type OrgScope } from '../../nav';
import type { DatabasePlane } from '../../types/databases';
import * as styles from './CreateServiceWizard.styles';

type Step = 'service' | 'details';
const STEPS: Step[] = ['service', 'details'];

const assetUrl = (path: string): string => `${import.meta.env.BASE_URL}${path}`;
const fieldSx = { maxWidth: 480, ...REQUIRED_FIELD_SX } as const;

function planeLabel(plane: DatabasePlane): string {
  return [plane.displayName || plane.name, plane.region, plane.cloud?.toUpperCase()].filter(Boolean).join(' · ');
}

interface CreateServiceWizardProps {
  scope: OrgScope;
  /** Leaves the wizard from its first step; without it, the first step offers no Cancel. */
  onCancel?: () => void;
  /** Opens on the details step for this service; Back still reaches the service step. */
  initialKind?: PlatformServiceKind;
}

/** The two-step create flow for a platform service: pick the type, then name it and choose a plan. */
export default function CreateServiceWizard({ scope, onCancel, initialKind }: CreateServiceWizardProps): JSX.Element {
  const navigate = useAppNavigate();
  // Unset until picked or passed in: the name rules and the plans both depend on it.
  const [kind, setKind] = useState<PlatformServiceKind | null>(initialKind ?? null);
  const isTemporal = kind === 'temporal';
  const [step, setStep] = useState<Step>(initialKind ? 'details' : 'service');
  const stepIndex = STEPS.indexOf(step);
  const stepHeadingRef = useRef<HTMLDivElement>(null);

  // Every service in the organization shares one namespace of names, whatever its type.
  const databases = useDatabaseServers();
  const temporals = useTemporalServers();
  const dbOffering = useDatabaseOffering(kind === 'postgres');
  const temporalOffering = useTemporalOffering(isTemporal);
  const createDatabase = useCreateDatabaseServer();
  const createTemporal = useCreateTemporalServer();
  const create = isTemporal ? createTemporal : createDatabase;
  const canManage = useCan()(Scopes.CONFIG_MANAGE);

  const [name, setName] = useState('');
  // An unset pick falls back to the default plan, so the choice is always a valid offering.
  const [pickedPlan, setPickedPlan] = useState('');

  const offering = isTemporal ? temporalOffering : dbOffering;
  const plans = offering.data?.plans ?? [];
  const planIds = plans.map((p) => p.id);
  const defaultPlan = offering.data?.defaultPlan;
  const fallbackPlan = defaultPlan && planIds.includes(defaultPlan) ? defaultPlan : (planIds[0] ?? '');
  const planId = planIds.includes(pickedPlan) ? pickedPlan : fallbackPlan;

  // A name can only be judged unique once both lists are in; the format is still checked as the user types.
  const takenNames = databases.data && temporals.data ? [...databases.data, ...temporals.data].map((s) => s.name) : null;
  const namesFailed = (databases.isError && !databases.data) || (temporals.isError && !temporals.data);
  const retryNames = () => [databases, temporals].filter((q) => q.isError).forEach((q) => q.refetch());
  const validateName = isTemporal ? temporalNameError : databaseNameError;
  const nameError = validateName(name, takenNames ?? [], offering.data?.maxNameLength);
  const nameReady = name !== '' && !nameError && takenNames !== null;
  const allowLeave = useUnsavedChanges(name !== '' && !create.isSuccess);
  const canCreate = canManage && nameReady && !!planId && !offering.isError && !create.isPending;
  const createError = create.isError ? (isTemporal ? toCreateTemporalError(create.error) : toCreateDatabaseError(create.error)) : null;

  // The heading stays mounted across steps, so it can take focus at once; the details step focuses its name field itself.
  const goBack = () => {
    setName('');
    setPickedPlan('');
    createDatabase.reset();
    createTemporal.reset();
    setStep('service');
    stepHeadingRef.current?.focus();
  };

  const cancel = (leave: () => void) => () => {
    allowLeave();
    leave();
  };

  const submit = () => {
    const input = { name, plan: planId || undefined };
    const open = (url: string) => {
      allowLeave();
      navigate(url);
    };
    if (isTemporal) createTemporal.mutate(input, { onSuccess: (server) => open(temporalUrl(scope, server.id)) });
    else createDatabase.mutate(input, { onSuccess: (server) => open(databaseUrl(scope, server.id)) });
  };

  const createLabel = isTemporal ? 'Create Temporal server' : 'Create database';
  const plane = offering.data?.plane;
  const version = isTemporal ? temporalOffering.data?.temporalVersion : dbOffering.data?.postgresVersion;

  const serviceStep = (
    <Grid container spacing={2}>
      {PLATFORM_SERVICE_TYPES.map((type) => (
        <Grid key={type.id} size={{ xs: 12, sm: 6, md: 3 }}>
          <SelectableCard title={type.name} description={type.description} logo={type.logo && assetUrl(type.logo)} icon={<Workflow size={28} />} selected={type.id === kind} disabled={create.isPending} onSelect={() => setKind(type.id)} />
        </Grid>
      ))}
    </Grid>
  );

  // The version and the plane are the provider's or the deployment's choice, not the user's.
  const offeringChips = offering.data && (
    <Box sx={styles.chipsSx}>
      {version && <Chip variant="outlined" size="small" sx={styles.chipSx} icon={isTemporal ? <Workflow size={14} /> : <Database size={14} />} label={`${isTemporal ? 'Temporal' : 'PostgreSQL'} ${version}`} />}
      {plane && <Chip variant="outlined" size="small" sx={styles.chipSx} icon={<Server size={14} />} label={planeLabel(plane)} />}
    </Box>
  );

  const nameField = (
    <Box>
      <TextField
        labelPlacement="top"
        label="Name"
        required
        fullWidth
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={!!nameError}
        helperText={nameError || (isTemporal ? 'Lowercase letters, digits and hyphens, starting with a letter. Workers use the namespace "default".' : 'Lowercase letters, digits and hyphens.')}
        slotProps={{
          input: {
            sx: styles.nameInputSx,
            endAdornment: nameReady ? (
              <InputAdornment position="end">
                <Box component="span" aria-hidden sx={styles.nameValidSx}>
                  <CircleCheck size={18} />
                </Box>
              </InputAdornment>
            ) : undefined,
          },
        }}
        sx={fieldSx}
      />
      {namesFailed && (
        <Alert
          severity="error"
          sx={{ mt: 2, maxWidth: 480 }}
          action={
            <Button color="inherit" size="small" onClick={retryNames}>
              Retry
            </Button>
          }>
          Couldn&apos;t load the existing services, so the name can&apos;t be checked yet.
        </Alert>
      )}
    </Box>
  );

  const planCards = offering.isLoading ? (
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
    <Box role="radiogroup" aria-labelledby="service-plan-title" sx={styles.planGridSx}>
      {isTemporal
        ? temporalOffering.data?.plans.map((plan) => <TemporalPlanCard key={plan.id} plan={plan} selected={planId === plan.id} disabled={create.isPending} onSelect={() => setPickedPlan(plan.id)} />)
        : dbOffering.data?.plans.map((plan) => <PlanCard key={plan.id} plan={plan} selected={planId === plan.id} disabled={create.isPending} onSelect={() => setPickedPlan(plan.id)} />)}
    </Box>
  );

  const planSection = (
    <Box sx={styles.planSectionSx}>
      <Typography id="service-plan-title" variant="subtitle1" component="h3" sx={{ fontWeight: 600 }}>
        Service plan
      </Typography>
      {planCards}
    </Box>
  );

  return (
    <Card variant="outlined" sx={styles.wizardSx}>
      <Box role="progressbar" aria-label="Progress" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={stepIndex + 1} aria-valuetext={`Step ${stepIndex + 1} of ${STEPS.length}`} sx={styles.progressSx}>
        {STEPS.map((id, i) => (
          <Box key={id} sx={styles.progressSegmentSx(i <= stepIndex)} />
        ))}
      </Box>

      <Box sx={styles.bodySx}>
        <Box ref={stepHeadingRef} tabIndex={-1} sx={styles.stepHeaderSx}>
          <Typography variant="h4" component="h2" sx={styles.stepTitleSx}>
            {step === 'service' ? 'Select a service' : createLabel}
          </Typography>
          {step === 'service' ? (
            <Typography variant="body1" color="text.secondary">
              Choose the managed service to create in this organization.
            </Typography>
          ) : (
            offeringChips
          )}
        </Box>

        {createError && (
          <Alert severity="error" onClose={() => create.reset()}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {createError.title}
            </Typography>
            <Typography variant="body2">{createError.message}</Typography>
          </Alert>
        )}

        {step === 'service' ? (
          serviceStep
        ) : (
          <>
            {nameField}
            {planSection}
          </>
        )}
      </Box>

      <Box sx={styles.footerSx}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Step {stepIndex + 1} of {STEPS.length}
        </Typography>
        <Box sx={styles.footerActionsSx}>
          {step === 'service' ? (
            <>
              {onCancel && (
                <Button variant="outlined" color="inherit" onClick={cancel(onCancel)}>
                  Cancel
                </Button>
              )}
              <Button variant="contained" disabled={!kind} endIcon={<ArrowRight size={16} />} onClick={() => setStep('details')}>
                Continue
              </Button>
            </>
          ) : (
            <>
              <Button variant="outlined" color="inherit" startIcon={<ArrowLeft size={16} />} disabled={create.isPending} onClick={goBack}>
                Back
              </Button>
              <Button variant="contained" disabled={!canCreate} startIcon={create.isPending ? <CircularProgress size={16} color="inherit" /> : undefined} onClick={submit}>
                {create.isPending ? 'Creating…' : createLabel}
              </Button>
            </>
          )}
        </Box>
      </Box>
    </Card>
  );
}
