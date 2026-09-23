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

import { Alert, Box, Button, CircularProgress, Grid, PageContent, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft } from '@wso2/oxygen-ui-icons-react';
import { useState, useEffect, type JSX } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useUpdateComponent, type UpdateComponentInput } from '../api/mutations';
import { useComponentByHandler, useProjectByHandler } from '../api/queries';
import IntegrationTypeSelector from '../components/IntegrationTypeSelector';
import { integrationTypeFromStored, resolveComponentSubType, resolveDisplayType, type IntegrationType } from '../constants/integrationTypes';
import { technologyLabel, type Technology } from '../constants/technologies';
import { resourceUrl, narrow, type ProjectScope, type ComponentScope } from '../nav';
import NotFound from '../components/NotFound';

export default function EditComponent(scope: ProjectScope | ComponentScope): JSX.Element {
  const navigate = useNavigate();
  const { componentHandler } = useParams<{ componentHandler: string }>();
  const { data: project, error: projectError, isLoading: projectLoading } = useProjectByHandler(scope.project);
  const projectId = project?.id ?? '';

  const { data: component, error: componentError, isLoading: componentLoading } = useComponentByHandler(projectId, componentHandler);
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [integrationType, setIntegrationType] = useState<IntegrationType>('unspecified');
  const mutation = useUpdateComponent();

  useEffect(() => {
    if (component) {
      setDisplayName(component.displayName || '');
      setDescription(component.description || '');
      setIntegrationType(integrationTypeFromStored(component.displayType, component.componentSubType));
    }
  }, [component]);

  const alertMessage = mutation.error?.message === 'Failed to fetch' ? 'Unable to connect to the server. Please check that the server is running and try again.' : mutation.error?.message;

  const resetError = () => {
    if (mutation.error) mutation.reset();
  };

  const submit = () => {
    if (!component?.id) return;
    // Technology is not editable here, so the existing runtime is what the new
    // integration type is encoded against.
    const technology = component.componentType as Technology;
    const input: UpdateComponentInput = {
      id: component.id,
      displayName: displayName.trim(),
      description: description.trim(),
      componentType: technology,
      displayType: resolveDisplayType(technology, integrationType),
      componentSubType: resolveComponentSubType(technology, integrationType),
    };
    mutation.mutate(input, {
      onSuccess: () => navigate(resourceUrl(narrow(scope, component.handler), 'overview')),
    });
  };

  if (projectLoading || componentLoading) {
    return (
      <PageContent sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
        <CircularProgress />
      </PageContent>
    );
  }

  if (projectError || componentError) {
    const errorMessage = projectError?.message || componentError?.message || 'An error occurred';
    return <NotFound message={errorMessage} backTo={resourceUrl(scope, 'overview')} backLabel="Back to Project" />;
  }

  if (!component) {
    return <NotFound message="Integration not found" backTo={resourceUrl(scope, 'overview')} backLabel="Back to Project" />;
  }

  return (
    <PageContent>
      <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate(resourceUrl(scope, 'overview'))} sx={{ mb: 2 }}>
        Back to Project Home
      </Button>

      <Typography variant="h1" sx={{ mb: 4 }}>
        Edit Integration
      </Typography>

      {mutation.error && (
        <Alert severity="error" role="alert" sx={{ mb: 5 }}>
          {alertMessage}
        </Alert>
      )}

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <TextField
            label="Display Name"
            required
            placeholder="Enter display name here"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              resetError();
            }}
            fullWidth
            slotProps={{ htmlInput: { 'aria-label': 'Display Name' } }}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <TextField label="Name" value={component.handler} fullWidth disabled slotProps={{ htmlInput: { 'aria-label': 'Name' } }} helperText="Name cannot be changed" />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <TextField label="Technology" value={technologyLabel(component.componentType)} fullWidth disabled slotProps={{ htmlInput: { 'aria-label': 'Technology' } }} helperText="Technology cannot be changed" />
        </Grid>
      </Grid>

      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" sx={{ mb: 2 }}>
          Integration Type (optional)
        </Typography>
        <IntegrationTypeSelector selected={integrationType} onSelect={setIntegrationType} technology={component.componentType as Technology} />
      </Box>

      <TextField
        label="Description"
        placeholder="Enter description here"
        value={description}
        onChange={(e) => {
          setDescription(e.target.value);
          resetError();
        }}
        fullWidth
        multiline
        minRows={2}
        sx={{ mb: 4, maxWidth: 720 }}
        slotProps={{ htmlInput: { 'aria-label': 'Description' } }}
      />

      <Stack direction="row" gap={2}>
        <Button variant="outlined" onClick={() => navigate(resourceUrl(scope, 'overview'))}>
          Cancel
        </Button>
        <Button variant="contained" onClick={submit} disabled={!displayName.trim() || mutation.isPending}>
          Save
        </Button>
      </Stack>
    </PageContent>
  );
}
