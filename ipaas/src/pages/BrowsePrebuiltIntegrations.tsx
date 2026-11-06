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

import { Box, Button, CircularProgress, IconButton, PageContent, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft, ArrowRight, Plus, X } from '@wso2/oxygen-ui-icons-react';
import { useState, useMemo, useEffect, type JSX } from 'react';
import { useLocation } from 'react-router';
import { useAppNavigate } from '../hooks/useAppNavigate';
import AppAvatar from '../components/AppAvatar';
import ApplicationCard from '../components/ApplicationCard';
import DirectionArrow from '../components/DirectionArrow';
import PrebuiltIntegrationCard from '../components/PrebuiltIntegrationCard';
import IntegrationFlowChart from '../components/IntegrationFlowChart';
import SearchField from '../components/SearchField';
import VerticalStepper from '../components/VerticalStepper';
import { usePrebuiltIntegrations, usePrebuiltDiagram } from '../hooks/usePrebuiltIntegrations';
import type { ProjectScope } from '../nav';
import { prebuiltIntegrationSetupUrl } from '../paths';
import { newComponentUrl } from '../nav';
import type { PrebuiltIntegration } from '../types/prebuilt';
import { derivePrebuiltSlug } from '../utils/prebuilt';

interface LocationState {
  selectedApplications?: string[];
  selectedIntegration?: PrebuiltIntegration;
  fromPath?: string;
}

// App slot — left / right boxes in the selection bar
// ---------------------------------------------------------------------------

interface AppSlotProps {
  app: string | null;
  isActiveTarget: boolean;
  onRemove?: () => void;
}

function AppSlot({ app, isActiveTarget, onRemove }: AppSlotProps): JSX.Element {
  return (
    <Box
      sx={{
        width: 88,
        height: 88,
        flexShrink: 0,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 1,
        border: '1px solid',
        borderStyle: app ? 'solid' : 'dashed',
        borderColor: isActiveTarget && !app ? 'primary.main' : app ? 'divider' : 'divider',
        bgcolor: app ? 'background.paper' : 'transparent',
        ...(isActiveTarget && !app
          ? {
              animation: 'slotPulse 2s ease-in-out infinite',
              '@keyframes slotPulse': {
                '0%, 100%': { boxShadow: '0 0 0 1px rgba(255, 107, 0, 0.18)' },
                '50%': { boxShadow: '0 0 0 2.5px rgba(250, 149, 76, 0.36)' },
              },
            }
          : { boxShadow: 'none', transition: 'all 0.15s' }),
      }}>
      {app ? (
        <>
          <AppAvatar name={app} size={40} />
          {onRemove && (
            <Tooltip title="Remove">
              <IconButton
                aria-label={`Remove ${app}`}
                size="small"
                onClick={onRemove}
                sx={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  width: 18,
                  height: 18,
                  minWidth: 'unset',
                  padding: 0,
                  bgcolor: 'background.paper',
                  border: '1px solid',
                  borderColor: 'divider',
                  '&:hover': { bgcolor: 'action.hover' },
                }}>
                <X size={10} />
              </IconButton>
            </Tooltip>
          )}
        </>
      ) : isActiveTarget ? (
        <Box sx={{ color: 'primary.main', opacity: 0.85 }}>
          <Plus size={24} />
        </Box>
      ) : null}
    </Box>
  );
}

interface IntegrationSlotProps {
  integration: PrebuiltIntegration | null;
  isActiveTarget: boolean;
  app1: string | null;
  app2: string | null;
  onRemove?: () => void;
}

function IntegrationSlot({ integration, isActiveTarget, app1, onRemove }: IntegrationSlotProps): JSX.Element {
  const isHidden = !app1;
  if (isHidden) {
    return (
      <Box
        sx={{
          flex: 1,
          minHeight: 88,
          borderRadius: 2,
          border: '1px dashed',
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      />
    );
  }

  if (integration) {
    return (
      <Box
        sx={{
          flex: 1,
          minHeight: 88,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0.5,
          px: 2,
          borderRadius: 1,
          border: '1px solid',
          borderColor: 'primary.main',
          bgcolor: 'background.paper',
        }}>
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1 }}>
          {integration.componentType ?? 'Integration'}
        </Typography>
        <Typography variant="body2" fontWeight={700} textAlign="center" sx={{ lineHeight: 1.3 }}>
          {integration.displayName}
        </Typography>
        <Box sx={{ color: 'text.secondary', mt: 0.25 }}>
          <DirectionArrow bidirectional={integration.bidirectional} size={16} />
        </Box>
        {onRemove && (
          <Tooltip title="Remove">
            <IconButton
              aria-label="Remove"
              size="small"
              onClick={onRemove}
              sx={{
                position: 'absolute',
                top: 4,
                right: 4,
                width: 18,
                height: 18,
                minWidth: 'unset',
                padding: 0,
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'divider',
                '&:hover': { bgcolor: 'action.hover' },
              }}>
              <X size={10} />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    );
  }

  if (isActiveTarget) {
    return (
      <Box
        sx={{
          flex: 1,
          minHeight: 88,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0.5,
          px: 2,
          borderRadius: 2,
          border: '1px dashed',
          borderColor: 'primary.main',
          bgcolor: 'transparent',
          animation: 'integrationPulse 2s ease-in-out infinite',
          '@keyframes integrationPulse': {
            '0%, 100%': { boxShadow: '0 0 0 1px rgba(250, 149, 76, 0.18)' },
            '50%': { boxShadow: '0 0 0 2.5px rgba(250, 149, 76, 0.36)' },
          },
        }}>
        <Box sx={{ color: 'primary.main' }}>
          <Plus size={22} />
        </Box>
        <Typography variant="caption" textAlign="center" sx={{ color: 'primary.main', lineHeight: 1.3, maxWidth: 160 }}>
          Select a prebuilt integration from the list below
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 88,
        borderRadius: 2,
        border: '1px dashed',
        borderColor: 'primary.main',
        bgcolor: 'transparent',
      }}
    />
  );
}

interface SelectionBarProps {
  app1: string | null;
  app2: string | null;
  integration: PrebuiltIntegration | null;
  wizardStep: number;
  onRemoveApp1: () => void;
  onRemoveApp2: () => void;
  onRemoveIntegration: () => void;
}

function SelectionBar({ app1, app2, integration, wizardStep, onRemoveApp1, onRemoveApp2, onRemoveIntegration }: SelectionBarProps): JSX.Element {
  const app2IsActiveTarget = wizardStep === 1;
  const integrationIsActiveTarget = wizardStep === 2;

  return (
    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
      <AppSlot app={app1} isActiveTarget={false} onRemove={app1 ? onRemoveApp1 : undefined} />
      <IntegrationSlot integration={integration} isActiveTarget={integrationIsActiveTarget} app1={app1} app2={app2} onRemove={integration ? onRemoveIntegration : undefined} />
      <AppSlot app={app2} isActiveTarget={app2IsActiveTarget} onRemove={app2 ? onRemoveApp2 : undefined} />
    </Stack>
  );
}

function DiagramPanel({ integration, onSetup }: { integration: PrebuiltIntegration; onSetup: () => void }): JSX.Element {
  const { diagram, isDiagramLoading } = usePrebuiltDiagram(integration);

  return (
    <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ mt: 1, flex: 1 }}>
      <Box sx={{ width: 88, flexShrink: 0 }} />

      <Stack sx={{ flex: 1, minWidth: 0 }} gap={1.5}>
        <Box
          sx={{
            position: 'relative',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            overflow: 'hidden',
            height: 320,
            backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.13) 0.5px, transparent 2px)',
            backgroundSize: '24px 24px',
            bgcolor: 'background.paper',
          }}>
          {isDiagramLoading ? (
            <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CircularProgress size={28} />
            </Box>
          ) : diagram ? (
            <IntegrationFlowChart diagram={diagram} />
          ) : (
            <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                No flow diagram available
              </Typography>
            </Box>
          )}
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="contained" endIcon={<ArrowRight size={16} />} onClick={onSetup}>
            Configure &amp; Deploy
          </Button>
        </Box>
      </Stack>

      {/* Right spacer — matches AppSlot width */}
      <Box sx={{ width: 88, flexShrink: 0 }} />
    </Stack>
  );
}

export default function BrowsePrebuiltIntegrations(scope: ProjectScope): JSX.Element {
  const navigate = useAppNavigate();
  const location = useLocation();
  const locationState = (location.state ?? {}) as LocationState;

  const { data, isLoading, isError } = usePrebuiltIntegrations();
  const allApplications = useMemo(() => data?.applications ?? [], [data]);
  const allIntegrations = useMemo(() => data?.prebuiltIntegrations ?? [], [data]);

  const [firstApp, setFirstApp] = useState<string | null>(null);
  const [secondApp, setSecondApp] = useState<string | null>(null);
  const [selectedIntegration, setSelectedIntegration] = useState<PrebuiltIntegration | null>(null);
  const [appSearch, setAppSearch] = useState('');
  const [integrationSearch, setIntegrationSearch] = useState('');

  useEffect(() => {
    const apps = locationState.selectedApplications ?? [];
    const preselected = locationState.selectedIntegration ?? null;
    if (apps.length >= 1) setFirstApp(apps[0]);
    if (apps.length >= 2) setSecondApp(apps[1]);
    if (preselected) setSelectedIntegration(preselected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wizardStep = !firstApp ? 0 : !secondApp ? 1 : !selectedIntegration ? 2 : 3;

  const compatibleSecondApps = useMemo(() => {
    if (!firstApp) return allApplications;
    const compatible = new Set<string>();
    allIntegrations.forEach((integ) => {
      if (integ.applications.includes(firstApp)) {
        integ.applications.forEach((a) => {
          if (a !== firstApp) compatible.add(a);
        });
      }
    });
    return Array.from(compatible).sort();
  }, [firstApp, allIntegrations, allApplications]);

  const filteredIntegrations = useMemo(() => {
    if (!firstApp || !secondApp) return [];
    const byApps = allIntegrations.filter((i) => i.applications.includes(firstApp) && i.applications.includes(secondApp));
    if (!integrationSearch) return byApps;
    return byApps.filter((i) => i.displayName.toLowerCase().includes(integrationSearch.toLowerCase()));
  }, [firstApp, secondApp, allIntegrations, integrationSearch]);

  const displayedApps = useMemo(() => {
    const pool = wizardStep === 0 ? allApplications : compatibleSecondApps;
    if (!appSearch) return pool;
    return pool.filter((a) => a.toLowerCase().includes(appSearch.toLowerCase()));
  }, [wizardStep, allApplications, compatibleSecondApps, appSearch]);

  const handleAppClick = (app: string) => {
    setAppSearch('');
    if (wizardStep === 0) {
      setFirstApp(app);
    } else if (wizardStep === 1) {
      setSecondApp(app);
    }
  };

  const handleSetup = () => {
    if (!selectedIntegration) return;
    navigate(prebuiltIntegrationSetupUrl(scope.org, scope.project, derivePrebuiltSlug(selectedIntegration)), {
      state: { integration: selectedIntegration },
    });
  };

  const goBack = () => {
    if (wizardStep === 3) {
      setSelectedIntegration(null);
      return;
    }
    if (wizardStep === 2) {
      setSecondApp(null);
      setSelectedIntegration(null);
      return;
    }
    if (wizardStep === 1) {
      setFirstApp(null);
      setSecondApp(null);
      setSelectedIntegration(null);
      return;
    }
    navigate(locationState.fromPath ?? newComponentUrl(scope));
  };

  const backLabel = wizardStep === 0 ? 'Back to create integration' : 'Go back';

  const subtitle =
    wizardStep === 0 ? "Let's start by choosing an application to integrate" : wizardStep === 1 ? `Choose an application to integrate ${firstApp} with` : wizardStep === 2 ? `Get started with pre-built integrations for ${firstApp} and ${secondApp}` : null;

  if (isLoading) {
    return (
      <PageContent fullWidth sx={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </PageContent>
    );
  }

  if (isError) {
    return (
      <PageContent fullWidth sx={{ pt: 5 }}>
        <Button startIcon={<ArrowLeft size={16} />} onClick={goBack} sx={{ mb: 3 }}>
          {backLabel}
        </Button>
        <Typography color="error">Failed to load prebuilt integrations. Please try again.</Typography>
      </PageContent>
    );
  }

  return (
    <PageContent fullWidth sx={{ display: 'flex', flex: 1, overflow: 'hidden', height: '100%', pt: 5, pb: 3 }}>
      <Box
        sx={{
          width: 280,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          pr: 2,
        }}>
        <Button startIcon={<ArrowLeft size={16} />} onClick={goBack} sx={{ mb: 4, alignSelf: 'flex-start', pl: 0 }}>
          {backLabel}
        </Button>

        <VerticalStepper activeStep={wizardStep} steps={['Choose your first application', 'Select a second application to integrate with', 'Pick a prebuilt integration and configure']} />
      </Box>

      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          p: 4,
          display: 'flex',
          flexDirection: 'column',
        }}>
        {wizardStep === 0 && (
          <Box sx={{ mb: 3, mt: 5 }}>
            <Typography variant="h2" sx={{ mb: 0.5 }}>
              What should we integrate today?
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {subtitle}
            </Typography>
          </Box>
        )}

        {wizardStep >= 1 && (
          <>
            <Box sx={{ mt: 5 }}>
              <SelectionBar
                app1={firstApp}
                app2={secondApp}
                integration={selectedIntegration}
                wizardStep={wizardStep}
                onRemoveApp1={() => {
                  setFirstApp(secondApp);
                  setSecondApp(null);
                  setSelectedIntegration(null);
                }}
                onRemoveApp2={() => {
                  setSecondApp(null);
                  setSelectedIntegration(null);
                }}
                onRemoveIntegration={() => setSelectedIntegration(null)}
              />
            </Box>
            {subtitle && (
              <Typography variant="body1" color="text.secondary" textAlign="center" sx={{ mt: 2, mb: 3 }}>
                {subtitle}
              </Typography>
            )}
          </>
        )}

        {wizardStep <= 1 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <SearchField value={appSearch} onChange={setAppSearch} placeholder="Search applications" width="standard" sx={{ mb: 3 }} />
            {displayedApps.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No applications found{appSearch ? ` for "${appSearch}"` : ''}.
              </Typography>
            ) : (
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                  gap: 2,
                }}>
                {displayedApps.map((app) => (
                  <ApplicationCard key={app} name={app} avatarSize={56} selected={app === firstApp || app === secondApp} onClick={() => handleAppClick(app)} />
                ))}
              </Box>
            )}
          </Box>
        )}

        {wizardStep === 2 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            {filteredIntegrations.length > 4 && <SearchField value={integrationSearch} onChange={setIntegrationSearch} placeholder="Search integrations" width="standard" sx={{ mb: 2 }} />}
            {filteredIntegrations.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No integrations found for {firstApp} and {secondApp}.
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {filteredIntegrations.map((integration) => (
                  <PrebuiltIntegrationCard key={integration.componentPath} integration={integration} selected={false} onClick={() => setSelectedIntegration(integration)} />
                ))}
              </Box>
            )}
          </Box>
        )}

        {wizardStep === 3 && selectedIntegration && <DiagramPanel integration={selectedIntegration} onSetup={handleSetup} />}
      </Box>
    </PageContent>
  );
}
