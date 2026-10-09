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

import { Alert, Box, Button, CircularProgress, Grid, PageContent, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import TextField from '../../components/common/TextField';
import { ArrowLeft } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useState, type JSX } from 'react';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { isPlatformServicesEnabled, useCreateServer, useDatabaseServers, useServicePlans } from '../hooks/usePlatformServices';
import { useSubscriptions } from '../../hooks/useSubscription';
import { useOrgUuid } from '../../hooks/useOrgUuid';
import { PAID_SUBSCRIPTION_TYPE } from '../../constants/subscription';
import { CLOUD_PROVIDERS, DATABASE_KIND, FREE_TIER_DISABLED_PROVIDERS, regionLabel, SERVICE_NAME_ERROR, SERVICE_NAME_REGEX, type DbServerKind } from '../../constants/platformServices';
import { REQUIRED_FIELD_SX } from '../../constants/styles';
import { plansForProviderRegion, toCreateError } from '../utils/platformServices';
import ComingSoon from '../../pages/ComingSoon';
import VerticalStepper from '../../components/VerticalStepper';
import SelectableCard from '../components/Databases/create/SelectableCard';
import PlanCard from '../components/Databases/create/PlanCard';
import type { OrgScope } from '../../nav';
import type { CloudProvider, CloudRegion, CreateError, ServicePlan, ServiceType } from '../../types/platformServices';

const assetUrl = (path: string): string => `${import.meta.env.BASE_URL}${path}`;
/** Section sub-headings, deliberately smaller than the page title. */
const sectionHeadingSx = { fontWeight: 600, mb: 1.5 } as const;

/**
 * Shared create wizard for both Databases and Vector Databases. The `kind`
 * descriptor supplies the offered engines, the `is_vector_enabled` payload flag,
 * the routing segment and the title/label copy — see {@link DbServerKind}.
 */
export function CreateDatabaseServerView({ scope, kind }: { scope: OrgScope; kind: DbServerKind }): JSX.Element {
  const navigate = useAppNavigate();
  const orgUuid = useOrgUuid();
  const base = `/organizations/${scope.org}/admin/${kind.segment}`;

  const { data: subscriptions } = useSubscriptions(orgUuid ?? '');
  const isSubscribed = (subscriptions?.list ?? []).some((s) => s.subscriptionType === PAID_SUBSCRIPTION_TYPE);
  const billingConsoleUrl = window.API_CONFIG?.billingConsoleUrl;

  const [activeStep, setActiveStep] = useState(0);
  const [storageType, setStorageType] = useState<ServiceType>(kind.serviceTypes[0]?.id ?? 'postgres');
  const [serviceName, setServiceName] = useState('');
  const [provider, setProvider] = useState<CloudProvider | ''>('');
  const [region, setRegion] = useState<CloudRegion | ''>('');
  const [planId, setPlanId] = useState('');
  const [error, setError] = useState<CreateError | null>(null);

  const plansQuery = useServicePlans(storageType);
  const servers = useDatabaseServers(kind.variant);
  const create = useCreateServer(kind.variant);

  const disabledProviders = useMemo(() => (isSubscribed ? [] : FREE_TIER_DISABLED_PROVIDERS), [isSubscribed]);

  // Default the provider (first non-disabled offered one) and region once plans load / type changes.
  useEffect(() => {
    const data = plansQuery.data;
    if (!data) return;
    const allowed = data.providers.filter((p) => !disabledProviders.includes(p));
    setProvider((allowed[0] ?? data.providers[0] ?? '') as CloudProvider | '');
    setRegion((data.regions[0] ?? '') as CloudRegion | '');
  }, [plansQuery.data, disabledProviders]);

  const availablePlans = useMemo<ServicePlan[]>(() => {
    if (!plansQuery.data || !provider || !region) return [];
    return plansForProviderRegion(plansQuery.data.plans, provider, region);
  }, [plansQuery.data, provider, region]);

  // Auto-select a valid plan for the current provider/region/subscription.
  useEffect(() => {
    const selectable = availablePlans.filter((p) => isSubscribed || p.free_trial_available);
    if (selectable.some((p) => p.id === planId)) return;
    setPlanId(selectable[0]?.id ?? availablePlans[0]?.id ?? '');
  }, [availablePlans, planId, isSubscribed]);

  const nameInUse = (servers.data ?? []).some((s) => s.name === serviceName);
  const nameInvalid = serviceName !== '' && !SERVICE_NAME_REGEX.test(serviceName);
  const nameError = nameInUse ? 'Service name already in use' : nameInvalid ? SERVICE_NAME_ERROR : '';
  const hasPlans = !!plansQuery.data?.plans.length;
  const step1Valid = hasPlans && serviceName !== '' && !nameInUse && !nameInvalid;

  if (!isPlatformServicesEnabled()) {
    return <ComingSoon title="Coming Soon" description={`${kind.listTitle} management is currently under development.`} />;
  }

  const submit = () => {
    if (!provider || !region || !planId) return;
    setError(null);
    create.mutate(
      // Brokers reject is_vector_enabled — it's a db-servers-only flag.
      { name: serviceName, cloud_provider: provider, cloud_region: region, service_plan_id: planId, ...(kind.variant === 'brokers' ? {} : { is_vector_enabled: kind.isVector }) },
      {
        onSuccess: (server) => navigate(`${base}/${server.id}/overview`),
        onError: (e) => setError(toCreateError(e, kind.serverNoun)),
      },
    );
  };

  return (
    <PageContent>
      <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate(base)} sx={{ mb: 2 }}>
        {kind.backToListLabel}
      </Button>

      <Stack direction="row" gap={4} alignItems="flex-start">
        <Box sx={{ width: { xs: '100%', md: 220 }, flexShrink: 0, pt: 1 }}>
          <VerticalStepper activeStep={activeStep} steps={[kind.variant === 'brokers' ? 'Select Broker Type' : 'Select Database Type', 'Select service plan']} />
        </Box>
        <Box sx={{ flex: 1, maxWidth: 900, mt: 2 }}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
            {kind.createTitle}
          </Typography>

          {error && (
            <Alert
              severity={error.upgrade ? 'warning' : 'error'}
              onClose={() => setError(null)}
              action={
                error.upgrade && billingConsoleUrl && orgUuid ? (
                  <Button color="inherit" size="small" variant="outlined" onClick={() => window.open(`${billingConsoleUrl}/cloud/devant/upgrade?orgId=${encodeURIComponent(orgUuid)}`, '_blank', 'noopener,noreferrer')}>
                    Upgrade
                  </Button>
                ) : undefined
              }
              sx={{ mb: 3, alignItems: 'center' }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {error.title}
              </Typography>
              <Typography variant="body2">{error.message}</Typography>
            </Alert>
          )}

          {plansQuery.isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 120px)' }}>
              <CircularProgress />
            </Box>
          ) : activeStep === 0 ? (
            <>
              {!kind.isVector && (
                <Typography variant="subtitle2" sx={sectionHeadingSx}>
                  {kind.variant === 'brokers' ? 'Select Message Broker' : 'Select Cloud Storage'}
                </Typography>
              )}
              <Grid container spacing={2} sx={{ mb: 3 }}>
                {kind.serviceTypes.map((t) => {
                  const card = (
                    <SelectableCard title={t.name} description={t.description} logo={assetUrl(t.logo)} logoDark={t.logoDark ? assetUrl(t.logoDark) : undefined} selected={storageType === t.id} disabled={t.disabled} onSelect={() => setStorageType(t.id)} />
                  );
                  return (
                    <Grid key={t.id} size={{ xs: 12, sm: 4 }}>
                      {t.disabled ? (
                        <Tooltip title="This database type is currently unavailable.">
                          <span>{card}</span>
                        </Tooltip>
                      ) : (
                        card
                      )}
                    </Grid>
                  );
                })}
              </Grid>
              <TextField label="Service Name" required fullWidth value={serviceName} onChange={(e) => setServiceName(e.target.value)} error={!!nameError} helperText={nameError} placeholder="Enter service name" sx={{ maxWidth: 480, ...REQUIRED_FIELD_SX }} />
            </>
          ) : (
            <>
              {!isSubscribed && (
                <Alert severity="info" sx={{ mb: 3 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Try out a 7-day free trial!
                  </Typography>
                  <Typography variant="body2">Try out a developer database for 7 days at no cost. Upgrade your subscription to unlock all cloud providers and production-ready service plans.</Typography>
                </Alert>
              )}

              <Typography variant="subtitle2" sx={sectionHeadingSx}>
                Select Cloud Provider
              </Typography>
              <Grid container spacing={2} sx={{ mb: 3 }}>
                {(plansQuery.data?.providers ?? []).map((p) => {
                  const info = CLOUD_PROVIDERS.find((c) => c.id === p);
                  const disabled = disabledProviders.includes(p);
                  const card = <SelectableCard title={info?.name ?? p} logo={info ? assetUrl(info.logo) : undefined} selected={provider === p} disabled={disabled} onSelect={() => setProvider(p)} />;
                  return (
                    <Grid key={p} size={{ xs: 6, sm: 3 }}>
                      {disabled ? (
                        <Tooltip title="Upgrade your subscription to select this cloud provider.">
                          <span>{card}</span>
                        </Tooltip>
                      ) : (
                        card
                      )}
                    </Grid>
                  );
                })}
              </Grid>

              <Typography variant="subtitle2" sx={sectionHeadingSx}>
                Select Region
              </Typography>
              <Grid container spacing={2} sx={{ mb: 3 }}>
                {(plansQuery.data?.regions ?? []).map((r) => (
                  <Grid key={r} size={{ xs: 6, sm: 3 }}>
                    <SelectableCard title={regionLabel(r)} selected={region === r} onSelect={() => setRegion(r)} />
                  </Grid>
                ))}
              </Grid>

              <Typography variant="subtitle2" sx={sectionHeadingSx}>
                Select Service Plan
              </Typography>
              <Stack direction="row" gap={2} flexWrap="wrap">
                {provider &&
                  region &&
                  availablePlans.map((plan) => {
                    const disabled = !isSubscribed && !plan.free_trial_available;
                    return <PlanCard key={plan.id} plan={plan} provider={provider} region={region} selected={planId === plan.id} disabled={disabled} onSelect={() => setPlanId(plan.id)} />;
                  })}
              </Stack>
            </>
          )}
          <Stack direction="row" gap={1.5} sx={{ mt: 4 }}>
            <Button variant="outlined" disabled={activeStep === 0} onClick={() => setActiveStep((s) => Math.max(0, s - 1))}>
              Back
            </Button>
            {activeStep === 0 ? (
              <Button variant="contained" disabled={!step1Valid} onClick={() => setActiveStep(1)}>
                Next
              </Button>
            ) : (
              <Button variant="contained" disabled={!planId || create.isPending} startIcon={create.isPending ? <CircularProgress size={16} color="inherit" /> : undefined} onClick={submit}>
                {create.isPending ? 'Creating…' : 'Create'}
              </Button>
            )}
          </Stack>
        </Box>
      </Stack>
    </PageContent>
  );
}

export default function CreateDatabaseServer(scope: OrgScope): JSX.Element {
  return <CreateDatabaseServerView scope={scope} kind={DATABASE_KIND} />;
}
