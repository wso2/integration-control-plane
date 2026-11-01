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

import { Alert, Box, Button, PageContent, Skeleton, Tooltip, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft, ArrowRight } from '@wso2/oxygen-ui-icons-react';
import { lazy, Suspense, useState, useMemo, type JSX } from 'react';
import { useLocation, useParams } from 'react-router';
import { useAppNavigate } from '../hooks/useAppNavigate';
import AppIconsRow from '../components/AppIconsRow';
import ImportConfigTomlButton from '../components/ImportConfigTomlButton';
const Markdown = lazy(() => import('../components/Markdown'));
import PrebuiltConfigForm from '../components/PrebuiltConfigForm';
import type { BaseType } from '../components/SchemaConfigForm';
import { formatComponentType } from '../constants/integrations';
import { usePrebuiltIntegrations, usePrebuiltInstructions, usePrebuiltConfigSchema } from '../hooks/usePrebuiltIntegrations';
import { derivePrebuiltSlug } from '../utils/prebuilt';
import { usePrebuiltIntegrationConfig } from '../contexts/PrebuiltIntegrationConfigContext';
import { useUnsavedChanges } from '../contexts/UnsavedChangesContext';
import type { ProjectScope } from '../nav';
import { prebuiltIntegrationsUrl, prebuiltIntegrationDeployUrl } from '../paths';
import type { PrebuiltIntegration } from '../types/prebuilt';
import type { SchemaConfigItem } from '../types/configuration';
import { Scopes } from '../constants/permissions';
import { useCan } from '../hooks/useCan';

interface LocationState {
  integration?: PrebuiltIntegration;
}

function InstructionsSkeleton(): JSX.Element {
  return (
    <Box>
      <Skeleton variant="text" width="50%" height={24} sx={{ mb: 1.5 }} />
      <Skeleton variant="text" width="100%" />
      <Skeleton variant="text" width="95%" />
      <Skeleton variant="text" width="88%" sx={{ mb: 2.5 }} />
      <Skeleton variant="rounded" height={52} sx={{ mb: 1.5 }} />
      <Skeleton variant="rounded" height={52} />
    </Box>
  );
}

function ConfigSkeleton(): JSX.Element {
  return (
    <Box>
      <Skeleton variant="rounded" height={44} sx={{ mb: 2.5 }} />
      {[0, 1, 2].map((i) => (
        <Box key={i} sx={{ mb: 2 }}>
          <Skeleton variant="text" width="55%" sx={{ mb: 0.75 }} />
          <Skeleton variant="rounded" height={40} />
        </Box>
      ))}
    </Box>
  );
}

export default function PrebuiltIntegrationSetup(scope: ProjectScope): JSX.Element {
  const can = useCan();
  const refusal = !can(Scopes.INTEGRATION_CREATE) ? "Your role doesn't allow creating integrations" : !can(Scopes.INTEGRATION_DEPLOY) ? "Your role doesn't allow deploying integrations" : '';
  const navigate = useAppNavigate();
  const location = useLocation();
  const { slug } = useParams<{ slug: string }>();
  const locationState = (location.state ?? {}) as LocationState;
  const fromState = locationState.integration ?? null;

  const { data: prebuiltData, isLoading: isPrebuiltLoading } = usePrebuiltIntegrations();
  const integration = useMemo((): PrebuiltIntegration | null => {
    if (fromState) return fromState;
    if (!slug || !prebuiltData?.prebuiltIntegrations) return null;
    return prebuiltData.prebuiltIntegrations.find((item) => derivePrebuiltSlug(item) === slug) ?? null;
  }, [fromState, slug, prebuiltData]);

  const [configValues, setConfigValues] = useState<SchemaConfigItem[]>([]);
  const [requiredComplete, setRequiredComplete] = useState(false);
  const [tomlFileName, setTomlFileName] = useState<string | null>(null);
  const [tomlValues, setTomlValues] = useState<Map<string, BaseType> | null>(null);
  const [tomlError, setTomlError] = useState<string | null>(null);
  const { setIntegration, setConfigValues: storeConfigValues } = usePrebuiltIntegrationConfig();
  // The form seeds required booleans as false on mount, so only other values count as input.
  const allowLeave = useUnsavedChanges(tomlFileName !== null || configValues.some((item) => item.values.some((v) => v.value !== 'false')));

  const { instructions, isInstructionsLoading } = usePrebuiltInstructions(integration);
  const { configSchema, isConfigSchemaLoading } = usePrebuiltConfigSchema(integration);

  const hasSchema = !isConfigSchemaLoading && configSchema && Object.keys(configSchema.properties ?? {}).length > 0;

  // Deploy button is enabled when: no schema (nothing to fill), or all required fields are filled.
  // While the schema is still loading we keep the button disabled.
  const deployEnabled = !refusal && !isConfigSchemaLoading && (!hasSchema || requiredComplete);

  const handleDeploy = () => {
    if (!integration || !slug) return;
    setIntegration(integration);
    storeConfigValues(configValues);
    allowLeave();
    navigate(prebuiltIntegrationDeployUrl(scope.org, scope.project, slug));
  };

  const handleBack = () => {
    navigate(prebuiltIntegrationsUrl(scope.org, scope.project), {
      state: {
        selectedApplications: integration?.applications,
        selectedIntegration: integration,
      },
    });
  };

  if (!integration) {
    if (!fromState && isPrebuiltLoading) {
      return (
        <PageContent fullWidth sx={{ pt: 5 }}>
          <Skeleton variant="rounded" width={220} height={36} sx={{ mb: 3 }} />
          <Skeleton variant="rounded" height={72} sx={{ mb: 4 }} />
          <Skeleton variant="rounded" height={360} />
        </PageContent>
      );
    }
    return (
      <PageContent fullWidth sx={{ pt: 5 }}>
        <Button startIcon={<ArrowLeft size={16} />} onClick={handleBack} sx={{ mb: 3, pl: 0 }}>
          Back to prebuilt integrations
        </Button>
        <Typography color="error">Integration not found. Please go back and select an integration.</Typography>
      </PageContent>
    );
  }

  return (
    <PageContent fullWidth sx={{ pt: 5, pb: 6 }}>
      <Button startIcon={<ArrowLeft size={16} />} onClick={handleBack} sx={{ mb: 3, pl: 0 }}>
        Back to prebuilt integrations
      </Button>

      {/* ── Header ── */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2.5,
          mb: 6,
        }}>
        <AppIconsRow applications={integration.applications} bidirectional={integration.bidirectional} avatarSize={44} bgcolor="action.hover" />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h1" sx={{ mb: 0.5, lineHeight: 1.25 }}>
            {integration.displayName}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
            {integration.description}
          </Typography>
          <Typography variant="body2" color="primary.main" sx={{ fontWeight: 400 }}>
            {formatComponentType(integration.componentType)}
          </Typography>
        </Box>
      </Box>

      {/* ── Two-column body ── */}
      <Box
        sx={{
          display: 'grid',
          gap: 4,
          gridTemplateColumns: '1fr',
          alignItems: 'start',
          '@media (min-width: 960px)': { gridTemplateColumns: '1fr 1fr' },
        }}>
        {/* Left: Setup Instructions — sticky once heading hits top of viewport */}
        <Box sx={{ position: 'sticky', top: 80, alignSelf: 'flex-start' }}>
          <Typography variant="h2" sx={{ mb: 2 }}>
            Setup instructions
          </Typography>
          {isInstructionsLoading ? (
            <InstructionsSkeleton />
          ) : instructions ? (
            <Suspense fallback={null}>
              <Markdown>{instructions}</Markdown>
            </Suspense>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No setup instructions available.
            </Typography>
          )}
        </Box>

        {/* Right: Configurations */}
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h2">Configurations</Typography>
            <ImportConfigTomlButton
              schema={configSchema ?? null}
              fileName={tomlFileName}
              onImport={(values, name) => {
                setTomlValues(values);
                setTomlFileName(name);
                setTomlError(null);
              }}
              onClear={() => {
                setTomlFileName(null);
                setTomlValues(null);
              }}
              onError={(msg) => setTomlError(msg)}
            />
          </Box>

          {tomlError && (
            <Alert severity="error" onClose={() => setTomlError(null)} sx={{ mb: 2 }}>
              {tomlError}
            </Alert>
          )}

          {isConfigSchemaLoading ? (
            <ConfigSkeleton />
          ) : hasSchema ? (
            <PrebuiltConfigForm configSchema={configSchema} onChange={setConfigValues} onRequiredComplete={setRequiredComplete} seededValues={tomlValues ?? undefined} />
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              This integration has no configurable fields.
            </Typography>
          )}

          <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end' }}>
            <Tooltip title={refusal || 'Please fill the required fields to deploy the integration'} disableHoverListener={deployEnabled} placement="top" arrow>
              <span>
                <Button variant="contained" endIcon={<ArrowRight size={16} />} onClick={handleDeploy} disabled={!deployEnabled}>
                  Deploy integration
                </Button>
              </span>
            </Tooltip>
          </Box>
        </Box>
      </Box>
    </PageContent>
  );
}
