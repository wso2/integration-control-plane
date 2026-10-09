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

import { Alert, Autocomplete, Box, Button, CircularProgress, MenuItem, PageContent, PageTitle, Stack, Typography } from '@wso2/oxygen-ui';
import TextField from '../../components/common/TextField';
import { ArrowLeft, GitHub } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useState, type JSX } from 'react';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useOrgUuid } from '../../hooks/useOrgUuid';
import { useDeliveryConfig, useDeliveryDataPlanes, useSaveDeliveryConfig, useUpdateDeliveryConfig } from '../hooks/useDeliveryInsights';
import VerticalStepper from '../../components/VerticalStepper';
import ServiceNowIcon from '../assets/icons/ServiceNowIcon';
import JiraIcon from '../assets/icons/JiraIcon';
import type { OrgScope, ProjectScope } from '../../nav';

const STEP_LABELS = ['Select Incident Tracker', 'Configure', 'Filter Labels'];

function TrackerTile({ name, selected, disabled, icon }: { name: string; selected?: boolean; disabled?: boolean; icon?: JSX.Element }): JSX.Element {
  return (
    <Stack
      alignItems="center"
      justifyContent="center"
      gap={1}
      sx={{
        width: 140,
        height: 96,
        border: '1px solid',
        borderColor: selected ? 'primary.main' : 'divider',
        borderRadius: 2,
        opacity: disabled ? 0.5 : 1,
        bgcolor: selected ? 'action.selected' : 'transparent',
      }}>
      {icon}
      <Typography variant="body2" sx={{ fontWeight: selected ? 600 : 400 }}>
        {name}
      </Typography>
      {disabled && (
        <Typography variant="caption" color="text.secondary">
          Coming Soon
        </Typography>
      )}
    </Stack>
  );
}

/**
 * Change Failure Rate & Mean Time to Recovery configuration wizard — port of
 * Devant's ConfigureViewDialog (3-step vertical stepper). Registers GitHub as the
 * incident source against the `cio-incident-configurator` service; incidents are
 * scraped from issues across the org's connected repositories, filtered by label.
 * Add mode POSTs the full config (all repositories); edit mode PUTs the changed
 * label criteria. Per-repository selection (GitHub OAuth) is not ported.
 */
export default function ConfigureDelivery(scope: OrgScope | ProjectScope): JSX.Element {
  const navigate = useAppNavigate();
  const orgUuid = useOrgUuid() ?? '';
  const baseUrl = scope.level === 'projects' ? `/organizations/${scope.org}/projects/${scope.project}` : `/organizations/${scope.org}`;
  const dashboardUrl = `${baseUrl}/insights/delivery`;

  const { config, isLoading: configLoading } = useDeliveryConfig(orgUuid);
  const isEdit = !!config;
  const { dataPlanes, isLoading: dataPlanesLoading } = useDeliveryDataPlanes(orgUuid, true);
  const sharedDataPlanes = useMemo(() => dataPlanes.filter((dp) => dp.isShared), [dataPlanes]);

  const [activeStep, setActiveStep] = useState(0);
  const [dataPlaneId, setDataPlaneId] = useState('');
  const [incidentLabels, setIncidentLabels] = useState<string[]>([]);
  const [invalidLabels, setInvalidLabels] = useState<string[]>([]);

  // Prefill from the existing configuration (edit mode).
  useEffect(() => {
    if (config) {
      setIncidentLabels(config.selectorCriteria ? config.selectorCriteria.split(',') : []);
      setInvalidLabels(config.rejectorCriteria ? config.rejectorCriteria.split(',') : []);
    }
  }, [config]);

  // Default data plane: the configured one (kept even when it's absent from the
  // shared list — edit mode only displays it and never re-sends it), else the
  // first shared plane.
  useEffect(() => {
    setDataPlaneId((current) => {
      if (current) return current;
      if (config?.environmentId) return config.environmentId;
      return sharedDataPlanes[0]?.id ?? '';
    });
  }, [sharedDataPlanes, config]);

  const save = useSaveDeliveryConfig(orgUuid);
  const update = useUpdateDeliveryConfig(orgUuid);
  const pending = save.isPending || update.isPending;
  const errorMessage = save.error instanceof Error ? save.error.message : update.error instanceof Error ? update.error.message : null;

  const handleFinish = () => {
    const selectorCriteria = incidentLabels.join(',');
    const rejectorCriteria = invalidLabels.join(',');
    if (isEdit && config) {
      update.mutate({ selectorCriteria, rejectorCriteria, previous: { selectorCriteria: config.selectorCriteria, rejectorCriteria: config.rejectorCriteria } }, { onSuccess: () => navigate(dashboardUrl) });
    } else {
      save.mutate({ dataPlaneId, selectorCriteria, rejectorCriteria }, { onSuccess: () => navigate(dashboardUrl) });
    }
  };

  // Data-plane selection is only mandatory when creating; editing never re-sends it.
  const nextDisabled = activeStep === 1 && !isEdit && !dataPlaneId;
  const finishDisabled = incidentLabels.length === 0 || pending;

  if (configLoading) {
    return (
      <Box sx={{ display: 'flex', flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <CircularProgress color="primary" />
      </Box>
    );
  }

  return (
    <PageContent>
      <PageTitle>
        <PageTitle.Header>{isEdit ? 'Edit Delivery Insights Configuration' : 'Configure Delivery Insights'}</PageTitle.Header>
      </PageTitle>
      <Button variant="text" size="small" startIcon={<ArrowLeft size={16} />} onClick={() => navigate(dashboardUrl)} sx={{ alignSelf: 'flex-start', mt: 1 }}>
        Go to Dashboard
      </Button>

      <Stack direction="row" gap={4} alignItems="flex-start" sx={{ mt: 3 }}>
        <Box sx={{ width: { xs: '100%', md: 240 }, flexShrink: 0, pt: 1 }}>
          <VerticalStepper activeStep={activeStep} steps={STEP_LABELS} />
        </Box>
        <Box sx={{ flex: 1, maxWidth: 900, mt: 2 }}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
            Change Failure Rate and Mean Time to Recovery
          </Typography>

          {errorMessage && (
            <Alert severity="error" variant="outlined" sx={{ mb: 3 }}>
              {errorMessage}
            </Alert>
          )}

          {activeStep === 0 && (
            <Stack direction="row" gap={2}>
              <TrackerTile name="GitHub" selected icon={<GitHub size={24} />} />
              {!isEdit && (
                <>
                  <TrackerTile name="Service Now" disabled icon={<ServiceNowIcon size={24} />} />
                  <TrackerTile name="Jira" disabled icon={<JiraIcon size={24} />} />
                </>
              )}
            </Stack>
          )}

          {activeStep === 1 && (
            <Stack gap={3} sx={{ maxWidth: 560 }}>
              <Alert severity="info" variant="outlined">
                We will collect data on issues from all connected GitHub repositories to generate incident reports for the dashboard.
              </Alert>
              {dataPlanesLoading ? (
                <CircularProgress size={24} />
              ) : (
                <TextField select label="Data Plane" size="small" value={dataPlaneId} onChange={(e) => setDataPlaneId(e.target.value)} disabled={isEdit} fullWidth>
                  {isEdit && dataPlaneId && !sharedDataPlanes.some((dp) => dp.id === dataPlaneId) && <MenuItem value={dataPlaneId}>{dataPlaneId}</MenuItem>}
                  {sharedDataPlanes.map((dp) => (
                    <MenuItem key={dp.id} value={dp.id}>
                      {dp.label}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            </Stack>
          )}

          {activeStep === 2 && (
            <Stack gap={3} sx={{ maxWidth: 560 }}>
              <Autocomplete
                multiple
                freeSolo
                options={[] as string[]}
                value={incidentLabels}
                onChange={(_, value) => setIncidentLabels(value as string[])}
                renderInput={(params) => <TextField {...params} label="Incident Label" placeholder="e.g. Type/Incident" helperText="GitHub issue labels that mark an incident. Press Enter to add." />}
              />
              <Autocomplete
                multiple
                freeSolo
                options={[] as string[]}
                value={invalidLabels}
                onChange={(_, value) => setInvalidLabels(value as string[])}
                renderInput={(params) => <TextField {...params} label="Invalid Label (optional)" placeholder="e.g. Resolution/Invalid" helperText="Labels that mark an issue as not a real incident. Press Enter to add." />}
              />
            </Stack>
          )}

          <Stack direction="row" gap={1.5} sx={{ mt: 4 }}>
            <Button variant="outlined" disabled={activeStep === 0 || pending} onClick={() => setActiveStep((s) => Math.max(0, s - 1))}>
              Back
            </Button>
            {activeStep < STEP_LABELS.length - 1 ? (
              <Button variant="contained" disabled={nextDisabled} onClick={() => setActiveStep((s) => s + 1)}>
                Next
              </Button>
            ) : (
              <Button variant="contained" disabled={finishDisabled} onClick={handleFinish}>
                {pending ? (isEdit ? 'Updating…' : 'Saving…') : isEdit ? 'Update' : 'Save'}
              </Button>
            )}
          </Stack>
        </Box>
      </Stack>
    </PageContent>
  );
}
