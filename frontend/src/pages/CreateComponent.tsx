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

import { Alert, Box, Button, Grid, IconButton, PageContent, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft, Edit } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { useNavigate } from 'react-router';
import { useCreateComponent, type CreateComponentInput } from '../api/mutations';
import { useProjectByHandler } from '../api/queries';
import IntegrationTypeSelector from '../components/IntegrationTypeSelector';
import TechnologySelector from '../components/TechnologySelector';
import { integrationTypesFor, resolveComponentSubType, resolveDisplayType, type IntegrationType } from '../constants/integrationTypes';
import type { Technology } from '../constants/technologies';
import { resourceUrl, narrow, type ProjectScope } from '../nav';

function toHandler(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function CreateComponent(scope: ProjectScope): JSX.Element {
  const navigate = useNavigate();
  const { data: project } = useProjectByHandler(scope.project);
  const projectId = project?.id ?? '';

  const [displayName, setDisplayName] = useState('');
  const [handler, setHandler] = useState('');
  const [handlerEdited, setHandlerEdited] = useState(false);
  const [description, setDescription] = useState('');
  const [componentType, setComponentType] = useState<Technology>('BI');
  const [integrationType, setIntegrationType] = useState<IntegrationType>('unspecified');
  const mutation = useCreateComponent();

  const effectiveHandler = handlerEdited ? handler : toHandler(displayName);
  const nameError = displayName.trim() && (effectiveHandler.length < 3 || effectiveHandler.length > 64);

  const errorMessage = mutation.error?.message?.toLowerCase() || '';
  const isDuplicateError = !!mutation.error && (/already taken/i.test(mutation.error.message) || errorMessage.includes('already exists') || errorMessage.includes('duplicate'));

  const alertMessage =
    mutation.error?.message === 'Failed to fetch'
      ? 'Unable to connect to the server. Please check that the server is running and try again.'
      : isDuplicateError
        ? 'An integration with this name already exists. Please choose a different name.'
        : mutation.error?.message;

  const resetError = () => {
    if (mutation.error) mutation.reset();
  };

  const submit = () => {
    const input: CreateComponentInput = {
      displayName,
      name: effectiveHandler,
      description,
      orgHandler: scope.org,
      projectId,
      componentType,
      displayType: resolveDisplayType(componentType, integrationType),
      componentSubType: resolveComponentSubType(componentType, integrationType),
    };
    mutation.mutate(input, {
      onSuccess: (component) => navigate(resourceUrl(narrow(scope, component.handler), 'overview')),
    });
  };

  return (
    <PageContent>
      <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate(resourceUrl(scope, 'overview'))} sx={{ mb: 2 }}>
        Back to Project Home
      </Button>

      <Typography variant="h1" sx={{ mb: 4 }}>
        Create New Integration
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
            error={!!nameError}
            helperText={nameError ? 'Integration name must be between 3 and 64 characters.' : undefined}
            slotProps={{ htmlInput: { 'aria-label': 'Display Name' } }}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <TextField
            label="Name"
            value={effectiveHandler}
            onChange={(e) => {
              setHandler(e.target.value);
              setHandlerEdited(true);
              resetError();
            }}
            fullWidth
            disabled={!handlerEdited}
            slotProps={{
              htmlInput: { 'aria-label': 'Name' },
              input: {
                endAdornment: (
                  <IconButton
                    size="small"
                    aria-label="Edit name"
                    onClick={() => {
                      if (!handlerEdited) {
                        setHandler(effectiveHandler);
                      }
                      setHandlerEdited(!handlerEdited);
                    }}>
                    <Edit size={16} />
                  </IconButton>
                ),
              },
            }}
          />
        </Grid>
      </Grid>

      <TextField
        label="Description"
        placeholder="Enter description here"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        fullWidth
        multiline
        minRows={2}
        sx={{ mb: 4, maxWidth: 720 }}
        slotProps={{ htmlInput: { 'aria-label': 'Description' } }}
      />

      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" sx={{ mb: 2 }}>
          Technology
        </Typography>
        <TechnologySelector
          selected={componentType}
          onSelect={(t) => {
            setComponentType(t);
            // Not every type is offered by every technology (Workflow is Ballerina-only), so a
            // selection the new technology does not offer falls back to the default.
            if (!integrationTypesFor(t).some((o) => o.id === integrationType)) setIntegrationType('unspecified');
          }}
        />
      </Box>

      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" sx={{ mb: 2 }}>
          Integration Type (optional)
        </Typography>
        <IntegrationTypeSelector selected={integrationType} onSelect={setIntegrationType} technology={componentType} />
      </Box>

      <Stack direction="row" gap={2}>
        <Button variant="outlined" onClick={() => navigate(resourceUrl(scope, 'overview'))}>
          Cancel
        </Button>
        <Button variant="contained" onClick={submit} disabled={!displayName.trim() || effectiveHandler.length < 3 || effectiveHandler.length > 64 || mutation.isPending}>
          Create
        </Button>
      </Stack>
    </PageContent>
  );
}
