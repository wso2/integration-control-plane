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

import { Alert, Box, Button, Chip, CircularProgress, PageContent, Stack, Tab, Tabs, Tooltip, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft, Store } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { useParams } from 'react-router';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useConnectionConfig, useGenaiService, useSetMarketplaceStatus } from '../hooks/useGenaiServices';
import { GENAI_LOGO_BASE, GENAI_TEMPLATE_TYPE, marketplaceStatusLabel } from '../../constants/genaiServices';
import { genaiServicesBase, inferProviderLogo } from '../utils/genaiServices';
import GeneralDetailsTab from '../components/ServiceCatalog/detail/GeneralDetailsTab';
import ServiceDefinitionTab from '../components/ServiceCatalog/detail/ServiceDefinitionTab';
import EndpointsTab from '../components/ServiceCatalog/detail/EndpointsTab';
import type { OrgScope, ProjectScope } from '../../nav';

type DetailTab = 'general' | 'definition' | 'endpoints';

const NO_ENDPOINTS_HINT = 'Go to the Endpoints section and add at least one endpoint with all the parameters to list the service in the Marketplace.';
const LOGO_BASE = `${import.meta.env.BASE_URL}${GENAI_LOGO_BASE}`;
const headingChipSx = { height: 20, '& .MuiChip-label': { px: 0.75, fontSize: 11 } } as const;

export default function GenAIServiceDetail(scope: OrgScope | ProjectScope): JSX.Element {
  const navigate = useAppNavigate();
  const { serviceId = '' } = useParams();
  const base = genaiServicesBase(scope);
  const { data: service, isLoading, isError, refetch } = useGenaiService(serviceId);
  const schemaId = service?.connectionSchemas?.[0]?.id;
  const { data: config } = useConnectionConfig(serviceId, schemaId);
  const setStatus = useSetMarketplaceStatus(serviceId);
  const [tab, setTab] = useState<DetailTab>('general');
  const [error, setError] = useState<string | null>(null);

  const available = service ? marketplaceStatusLabel(service.status) === 'Available' : false;
  const hasEndpoints = Object.keys(config?.configs ?? {}).length > 0;
  const addBlocked = !available && !hasEndpoints;
  const providerLogo = inferProviderLogo((service?.connectionSchemas?.[0]?.entries ?? []).map((e) => e.name));

  const toggleMarketplace = () => {
    setError(null);
    setStatus.mutate(available ? 'CREATED' : 'PROTOTYPE', {
      onError: (e) => setError(e instanceof Error ? e.message : 'Failed to update marketplace status.'),
    });
  };

  return (
    <PageContent>
      <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate(base)} sx={{ mb: 2 }}>
        Back to GenAI services
      </Button>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 120px)' }}>
          <CircularProgress />
        </Box>
      ) : isError || !service ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => refetch()}>
              Retry
            </Button>
          }>
          Failed to load this GenAI service.
        </Alert>
      ) : (
        <>
          <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2} sx={{ mb: 3 }}>
            <Stack direction="row" alignItems="center" gap={2}>
              {providerLogo ? (
                <Box component="img" src={`${LOGO_BASE}${providerLogo}`} alt="" sx={{ width: 44, height: 44, flexShrink: 0, borderRadius: 1, objectFit: 'contain', p: 0.75, bgcolor: 'action.hover' }} />
              ) : (
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    flexShrink: 0,
                    borderRadius: 1,
                    bgcolor: 'action.hover',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 600,
                    color: 'text.secondary',
                    textTransform: 'uppercase',
                  }}>
                  {service.name.charAt(0) || '?'}
                </Box>
              )}
              <Stack direction="row" alignItems="center" gap={1.5} flexWrap="wrap">
                <Typography variant="h5" sx={{ fontWeight: 600 }}>
                  {service.name}
                </Typography>
                <Stack direction="row" alignItems="center" gap={0.5} flexWrap="wrap">
                  <Chip label={`Version: ${service.version}`} size="small" variant="outlined" color="primary" sx={headingChipSx} />
                  <Chip label={service.serviceType} size="small" variant="outlined" color="primary" sx={headingChipSx} />
                </Stack>
              </Stack>
            </Stack>
            <Tooltip title={addBlocked ? NO_ENDPOINTS_HINT : ''}>
              <span>
                <Button variant="outlined" startIcon={<Store size={16} />} disabled={addBlocked || setStatus.isPending} onClick={toggleMarketplace} sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
                  {available ? 'Remove from Marketplace' : 'Add to Marketplace'}
                </Button>
              </span>
            </Tooltip>
          </Stack>

          {service.summary && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              {service.summary}
            </Typography>
          )}

          <Tabs value={tab} onChange={(_, v) => setTab(v as DetailTab)} sx={{ borderBottom: '1px solid', borderColor: 'divider', mb: 3 }}>
            <Tab label="General Details" value="general" />
            <Tab label="Service Definition" value="definition" />
            <Tab label="Endpoints" value="endpoints" />
          </Tabs>

          {tab === 'general' && <GeneralDetailsTab service={service} lockedTags={[GENAI_TEMPLATE_TYPE]} />}
          {tab === 'definition' && <ServiceDefinitionTab serviceId={serviceId} canEdit />}
          {tab === 'endpoints' && <EndpointsTab service={service} orgHandle={scope.org} canEdit />}
        </>
      )}
    </PageContent>
  );
}
