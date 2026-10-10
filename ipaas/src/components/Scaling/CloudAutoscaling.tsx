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

import { Alert, Box, Button, CircularProgress, Collapse, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Skeleton, Stack, Typography } from '@wso2/oxygen-ui';
import { useEffect, useRef, useState, type JSX } from 'react';
import { useAutoscaling, useUpdateAutoscaling } from '../../hooks/useScaling';
import { useBillingOrg } from '../../hooks/useBillingOrg';
import { BILLING_PRODUCT_CODE } from '../../constants/subscription';
import { isPaidPlan } from '../../utils/billing';
import { CLOUD_HPA_CARD, CLOUD_MEMORY_THRESHOLD, CPU_THRESHOLD, NO_AUTOSCALING_CARD, SCALE_TO_ZERO_CARD } from '../../constants/scaling';
import ScaleMethodCard from './ScaleMethodCard';
import RangeInput from './RangeInput';
import ThresholdSlider from './ThresholdSlider';
import type { Autoscaling } from '../../types/scaling';
import { atMaxReplicasMessage, blockedAutoscalingMessages } from '../../utils/scaling';
import { alertSx, cardsRowSx, sectionSx, sectionTitleSx } from './CloudAutoscaling.styles';

const NOT_AVAILABLE = 'Not available yet';
const APPLYING_MESSAGE = 'Applying the autoscaling settings…';
// An HPA change is part of the deployment, so applying it replaces the running replicas once.
const APPLIED_MESSAGE = 'Autoscaling settings applied. They take effect within a few minutes as the replicas are replaced.';
// Matches the Runtime page's notices. Only "applied" hides itself: "applying" holds until its result
// replaces it, and an error stays until dismissed so it cannot vanish before it is read.
const APPLIED_HIDE_MS = 6000;
const REDEPLOY_FOR_MEMORY = 'Redeploy this integration to the environment to use a memory threshold';
const noop = (): void => undefined;

interface HpaValues {
  minReplicas: number;
  maxReplicas: number;
  cpuUtilizationPercentage: number;
  /** Unset, the HPA scales on CPU alone. */
  memoryUtilizationPercentage?: number;
}

// The BFF reports no bounds until autoscaling is first enabled, and a bound written outside the
// console may exceed today's limit; either way the form opens on values it can submit.
function initialValues(a: Autoscaling): HpaValues {
  const maxReplicas = Math.min(a.maxReplicas ?? 2, a.maxReplicasLimit);
  return {
    minReplicas: Math.min(a.minReplicas ?? 1, maxReplicas),
    maxReplicas,
    cpuUtilizationPercentage: a.cpuUtilizationPercentage ?? CPU_THRESHOLD.default,
  };
}

interface ReplicaBounds {
  minReplicas: number;
  maxReplicas: number;
}

const sameBounds = (a: ReplicaBounds, b: ReplicaBounds): boolean => a.minReplicas === b.minReplicas && a.maxReplicas === b.maxReplicas;

const replicaActionsSx = { display: 'flex', gap: 1, pb: 0.5 } as const;

// Every applied HPA change replaces the running replicas once, so a threshold change waits for a
// short pause: a run of keyboard steps on a slider becomes one write, not one rollout per step.
const APPLY_DELAY_MS = 800;

/**
 * The settings of an enabled autoscaler. Thresholds apply on their own once a slider is let go;
 * replica bounds are edited together and applied with Update, which, with Reset, shows only while
 * the bounds differ from what the server holds.
 */
function HpaForm({ autoscaling, canManage, applying, onApply }: { autoscaling: Autoscaling; canManage: boolean; applying: boolean; onApply: (values: HpaValues) => void }): JSX.Element {
  const saved = initialValues(autoscaling);
  const savedBounds: ReplicaBounds = { minReplicas: saved.minReplicas, maxReplicas: saved.maxReplicas };
  const [bounds, setBounds] = useState<ReplicaBounds>(savedBounds);
  const [cpu, setCpu] = useState(saved.cpuUtilizationPercentage);
  // Held apart from the on/off switch so turning memory off and on again keeps the chosen target.
  const [memoryOn, setMemoryOn] = useState(autoscaling.memoryUtilizationPercentage !== undefined);
  const [memoryTarget, setMemoryTarget] = useState(autoscaling.memoryUtilizationPercentage ?? CLOUD_MEMORY_THRESHOLD.default);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Bounds sent with Update that the server has not reported yet. A threshold applied meanwhile must
  // carry them, or it would write the old bounds back over the update.
  const updatedBounds = useRef<ReplicaBounds | null>(null);
  // A change still waiting out its delay must not fire into a form that is gone.
  useEffect(() => () => clearTimeout(timer.current), []);

  const locked = !canManage;
  // A release that cannot render memory refuses a memory target, but one already set must still be
  // removable, so the switch stays usable while it is on.
  const memoryLocked = locked || (!autoscaling.memoryEffective && !memoryOn);
  const dirty = !sameBounds(bounds, savedBounds);

  // Unsaved bound edits stay out of a threshold write: they apply only with Update.
  const appliedBounds = (): ReplicaBounds => (updatedBounds.current && !sameBounds(updatedBounds.current, savedBounds) ? updatedBounds.current : savedBounds);

  const scheduleThresholds = (cpuTarget: number, on: boolean, target: number) => {
    clearTimeout(timer.current);
    const memory = on ? target : undefined;
    if (cpuTarget === saved.cpuUtilizationPercentage && memory === autoscaling.memoryUtilizationPercentage) return;
    timer.current = setTimeout(() => {
      onApply({ ...appliedBounds(), cpuUtilizationPercentage: cpuTarget, memoryUtilizationPercentage: memory });
    }, APPLY_DELAY_MS);
  };

  const update = () => {
    // The update carries the thresholds as they stand, so a pending threshold write is folded into it.
    clearTimeout(timer.current);
    updatedBounds.current = bounds;
    onApply({ ...bounds, cpuUtilizationPercentage: cpu, memoryUtilizationPercentage: memoryOn ? memoryTarget : undefined });
  };

  return (
    <Stack gap={2.5}>
      <Stack direction="row" alignItems="flex-end" gap={2} flexWrap="wrap">
        {/* Each bound clamps against the other, so min can never cross max. */}
        <RangeInput label="Min replicas" value={bounds.minReplicas} onChange={(v) => setBounds({ ...bounds, minReplicas: Math.min(v, bounds.maxReplicas) })} min={1} max={bounds.maxReplicas} disabled={locked || applying} />
        <RangeInput label="Max replicas" value={bounds.maxReplicas} onChange={(v) => setBounds({ ...bounds, maxReplicas: Math.max(v, bounds.minReplicas) })} min={bounds.minReplicas} max={autoscaling.maxReplicasLimit} disabled={locked || applying} />
        {dirty && canManage && (
          <Box sx={replicaActionsSx}>
            <Button size="small" variant="outlined" color="secondary" onClick={() => setBounds(savedBounds)} disabled={applying}>
              Reset
            </Button>
            <Button size="small" variant="contained" onClick={update} disabled={applying} startIcon={applying ? <CircularProgress size={14} color="inherit" /> : undefined}>
              Update
            </Button>
          </Box>
        )}
      </Stack>
      <Stack direction={{ xs: 'column', md: 'row' }} gap={2}>
        {/* The autoscaler needs a CPU target, so the metric cannot be switched off. Sliders apply when let go, not while dragging. */}
        <ThresholdSlider label="CPU Threshold" enabled value={cpu} min={CPU_THRESHOLD.min} max={CPU_THRESHOLD.max} onToggle={noop} onChange={setCpu} onCommit={(v) => scheduleThresholds(v, memoryOn, memoryTarget)} disabled={locked} toggleLocked />
        {/* Opt-in beside CPU: the HPA follows whichever metric asks for more replicas. */}
        <ThresholdSlider
          label="Memory Threshold"
          enabled={memoryOn}
          value={memoryTarget}
          min={CLOUD_MEMORY_THRESHOLD.min}
          max={CLOUD_MEMORY_THRESHOLD.max}
          onToggle={(on) => {
            setMemoryOn(on);
            scheduleThresholds(cpu, on, memoryTarget);
          }}
          onChange={setMemoryTarget}
          onCommit={(v) => scheduleThresholds(cpu, memoryOn, v)}
          disabled={memoryLocked}
          note={autoscaling.memoryEffective ? undefined : REDEPLOY_FOR_MEMORY}
        />
      </Stack>
    </Stack>
  );
}

/**
 * What the HPA reports that no other part of the page shows: a load it is capped from meeting, and
 * why it is not scaling. The replica counts sit in the replicas table and the utilization in the
 * usage cards, so nothing renders while the HPA is scaling freely.
 */
function HpaAlerts({ autoscaling, observedAt }: { autoscaling: Autoscaling; observedAt: number }): JSX.Element | null {
  const { status } = autoscaling;
  if (!status) return null;
  // Why the HPA is not scaling, minus the brief metrics gap that follows every applied change.
  const blocked = blockedAutoscalingMessages(autoscaling, observedAt);
  // ScalingLimited holds at either bound; only the upper one means demand is going unmet.
  const atMax = status.conditions.some((c) => c.type === 'ScalingLimited' && c.status === 'True' && c.reason === 'TooManyReplicas');
  if (!atMax && blocked.length === 0) return null;
  return (
    <Stack gap={1} sx={sectionSx}>
      {atMax && <Alert severity="warning">{atMaxReplicasMessage(autoscaling)}</Alert>}
      {blocked.map((message) => (
        <Alert key={message} severity="warning">
          {message}
        </Alert>
      ))}
    </Stack>
  );
}

interface CloudAutoscalingProps {
  projectId: string;
  componentId: string;
  environmentId: string;
  environmentName: string;
  canManage: boolean;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}

/** Cloud's scaling body: one per-environment HPA setting, on or off. Scale to zero is shown but cannot be chosen yet. */
export default function CloudAutoscaling({ projectId, componentId, environmentId, environmentName, canManage, onSaved, onError }: CloudAutoscalingProps): JSX.Element {
  // dataUpdatedAt is when the status was read, the moment its conditions describe.
  const { data: autoscaling, dataUpdatedAt, isLoading, isError, error, refetch } = useAutoscaling(projectId, componentId, environmentId);
  const update = useUpdateAutoscaling(projectId);
  // Autoscaling is a paid feature. The billing org is the one the app shell already loads, so this
  // reads from the shared cache rather than asking billing again.
  const { org: billingOrg, isLoading: loadingPlan } = useBillingOrg(BILLING_PRODUCT_CODE);
  const paid = isPaidPlan(billingOrg);
  const [confirming, setConfirming] = useState<'enable' | 'disable' | null>(null);
  // Reports a settings change where it was made, under the threshold cards; `info` means still applying.
  const [applyStatus, setApplyStatus] = useState<{ type: 'info' | 'success' | 'error'; message: string } | null>(null);
  // Kept apart from the status so the banner keeps its text while it collapses away.
  const [applyOpen, setApplyOpen] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(hideTimer.current), []);
  // Remounts the form on its saved values after a change the platform rejected.
  const [formReset, setFormReset] = useState(0);
  // Changes apply one write at a time: one made while a write is in flight waits for it, and only the
  // latest waiting change is sent, so the last value the user chose is the one that sticks.
  const writing = useRef(false);
  const queued = useRef<HpaValues | null>(null);

  if (isLoading || loadingPlan) {
    return (
      <Stack gap={2}>
        <Skeleton variant="rounded" height={120} />
        <Skeleton variant="rounded" height={180} />
      </Stack>
    );
  }
  if (isError) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => void refetch()}>
            Retry
          </Button>
        }>
        {error instanceof Error ? error.message : 'Failed to load the scaling configuration.'}
      </Alert>
    );
  }
  if (!autoscaling) {
    return <Alert severity="info">Select an environment to configure scaling.</Alert>;
  }
  if (!autoscaling.supported) {
    return <Alert severity="info">Autoscaling isn&apos;t available for this integration type.</Alert>;
  }

  const startValues = initialValues(autoscaling);

  const showApplyStatus = (status: { type: 'info' | 'success' | 'error'; message: string }) => {
    clearTimeout(hideTimer.current);
    setApplyStatus(status);
    setApplyOpen(true);
    if (status.type === 'success') hideTimer.current = setTimeout(() => setApplyOpen(false), APPLIED_HIDE_MS);
  };

  const send = (values: HpaValues) => {
    writing.current = true;
    update.mutate(
      { componentId, environmentId, data: { enabled: true, ...values } },
      {
        // Applied only once nothing else is waiting to go out; until then the change is still being applied.
        onSuccess: () => {
          if (!queued.current) showApplyStatus({ type: 'success', message: APPLIED_MESSAGE });
        },
        onError: (e) => {
          // A rejected change leaves the saved setting in force, so the form goes back to showing it.
          queued.current = null;
          setFormReset((n) => n + 1);
          showApplyStatus({ type: 'error', message: e instanceof Error ? e.message : 'Failed to apply the autoscaling settings.' });
        },
        onSettled: () => {
          writing.current = false;
          const next = queued.current;
          queued.current = null;
          if (next) send(next);
        },
      },
    );
  };

  const apply = (values: HpaValues) => {
    showApplyStatus({ type: 'info', message: APPLYING_MESSAGE });
    if (writing.current) queued.current = values;
    else send(values);
  };

  const confirm = () => {
    const turningOn = confirming === 'enable';
    clearTimeout(hideTimer.current);
    setApplyOpen(false);
    update.mutate(
      { componentId, environmentId, data: turningOn ? { enabled: true, ...startValues } : { enabled: false } },
      {
        // An HPA change is part of the deployment, so applying it replaces the running replicas once.
        onSuccess: () => onSaved(turningOn ? 'Autoscaling turned on. It takes effect within a few minutes as the replicas are replaced.' : 'Autoscaling turned off. The integration returns to a fixed number of replicas within a few minutes.'),
        onError: (e) => onError(e instanceof Error ? e.message : turningOn ? 'Failed to turn on autoscaling.' : 'Failed to turn off autoscaling.'),
        onSettled: () => setConfirming(null),
      },
    );
  };

  return (
    <>
      {/* The platform validates the setting when it renders the release, so a saved change can still be rejected. */}
      {autoscaling.syncMessage && (
        <Alert severity="warning" sx={alertSx}>
          {autoscaling.syncMessage}
        </Alert>
      )}
      {!autoscaling.effective && (
        <Alert severity="info" sx={alertSx}>
          The release deployed to {environmentName} was built before this integration could autoscale. Redeploy it to {environmentName} to enable autoscaling.
        </Alert>
      )}

      <Stack direction={{ xs: 'column', md: 'row' }} gap={2} sx={cardsRowSx}>
        <ScaleMethodCard title={SCALE_TO_ZERO_CARD.title} description={SCALE_TO_ZERO_CARD.description} selected={false} disabled note={NOT_AVAILABLE} onSelect={noop} />
        {/* Paid plans scale with HPA; free plans run at a fixed count. Until scale to zero is available
            there is no third method, so a paid org that turns HPA on keeps it. */}
        {paid ? (
          <ScaleMethodCard
            title={CLOUD_HPA_CARD.title}
            description={CLOUD_HPA_CARD.description}
            selected={autoscaling.enabled}
            disabled={!canManage || (!autoscaling.enabled && !autoscaling.effective)}
            onSelect={() => !autoscaling.enabled && setConfirming('enable')}
          />
        ) : (
          <ScaleMethodCard title={NO_AUTOSCALING_CARD.title} description={NO_AUTOSCALING_CARD.description} selected={!autoscaling.enabled} disabled={!canManage} onSelect={() => autoscaling.enabled && setConfirming('disable')} />
        )}
      </Stack>

      <Typography variant="subtitle1" sx={sectionTitleSx}>
        Scaling Configuration
      </Typography>
      <Stack gap={2.5} sx={sectionSx}>
        {!paid ? (
          autoscaling.enabled ? (
            // A plan that lapsed leaves its autoscaling running; it can be removed, never changed.
            <Alert severity="info">Autoscaling is available on paid plans. It is still on in {environmentName} from an earlier plan; choose No Autoscaling to turn it off.</Alert>
          ) : (
            <Typography variant="body2" color="text.secondary">
              This integration runs a fixed number of replicas in {environmentName}.
            </Typography>
          )
        ) : autoscaling.enabled ? (
          // Not keyed on the saved values: the form already holds what it applied, and remounting on
          // each refetch would reset a slider the user is still dragging.
          <>
            <HpaForm key={`${formReset}:${autoscaling.memoryEffective}`} autoscaling={autoscaling} canManage={canManage} applying={update.isPending} onApply={apply} />
            <Collapse in={applyOpen} unmountOnExit>
              {applyStatus && (
                <Alert severity={applyStatus.type} icon={applyStatus.type === 'info' ? <CircularProgress size={20} color="inherit" /> : undefined} onClose={() => setApplyOpen(false)}>
                  {applyStatus.message}
                </Alert>
              )}
            </Collapse>
          </>
        ) : (
          <Typography variant="body2" color="text.secondary">
            This integration runs a fixed number of replicas in {environmentName}. Choose HPA to scale it with CPU and memory usage.
          </Typography>
        )}
      </Stack>

      {paid && autoscaling.enabled && <HpaAlerts autoscaling={autoscaling} observedAt={dataUpdatedAt} />}

      <Dialog open={confirming !== null} onClose={() => setConfirming(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{confirming === 'enable' ? 'Turn on autoscaling?' : 'Turn off autoscaling?'}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirming === 'enable' ? (
              <>
                The integration scales in <strong>{environmentName}</strong> between {startValues.minReplicas} and {startValues.maxReplicas} replicas at {startValues.cpuUtilizationPercentage}% CPU. You can change these right after. Continue?
              </>
            ) : (
              <>
                The autoscaler is removed from <strong>{environmentName}</strong> and the integration returns to a fixed number of replicas. Continue?
              </>
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(null)} disabled={update.isPending}>
            Cancel
          </Button>
          <Button variant="contained" onClick={confirm} disabled={update.isPending} startIcon={update.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {confirming === 'enable' ? 'Turn on' : 'Turn off'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
