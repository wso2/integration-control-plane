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

import { Alert, Button, CircularProgress, Grid, IconButton, InputAdornment, PageContent, Stack, Tooltip, Typography, TextField } from '@wso2/oxygen-ui';
import { ArrowLeft, Edit } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useRef, useState, type JSX } from 'react';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { useUnsavedChanges } from '../contexts/UnsavedChangesContext';
import { Scopes } from '../constants/permissions';
import { useCan } from '../hooks/useCan';
import BusyFields from '../components/common/BusyFields';
import { useCreateProject } from '../hooks/useProjects';
import { useProjectHandler } from '../hooks/useProjectHandler';
import { resourceUrl, narrow, type OrgScope } from '../nav';
import { validateProjectName, validateProjectHandler, normalizeProjectError } from '../utils/projectValidation';
import { isQuotaError } from '../utils/apiErrors';

const editHandleSx = { color: 'text.primary' } as const;

export default function CreateProject(scope: OrgScope): JSX.Element {
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitErrorSeverity, setSubmitErrorSeverity] = useState<'error' | 'warning'>('error');
  // Shown on blur, not per keystroke.
  const [nameErrorShown, setNameErrorShown] = useState<string | null>(null);

  const { handler: effectiveHandler, handlerEdited, isCheckingAvailability, availability, availabilityError, handlerTaken, replacedHandler, startEditing, stopEditing, onHandlerChange } = useProjectHandler(displayName);
  const createProject = useCreateProject();
  const canCreate = useCan()(Scopes.PROJECT_CREATE);
  const navigate = useAppNavigate();
  const orgHomeUrl = resourceUrl(scope, 'overview');
  const allowLeave = useUnsavedChanges(displayName !== '' || description !== '' || effectiveHandler !== '');

  const nameError = displayName ? validateProjectName(displayName) : null;
  const handlerInputRef = useRef<HTMLInputElement>(null);
  const handlerInvalid = effectiveHandler ? validateProjectHandler(effectiveHandler) : null;
  // Gates submit at once, but the message waits until the edit is committed (Enter or blur).
  const handlerError = handlerEdited ? null : handlerInvalid;

  // The input is disabled until editing starts, so it can only take focus afterwards.
  useEffect(() => {
    if (handlerEdited) handlerInputRef.current?.focus();
  }, [handlerEdited]);

  // A failed availability check must not hard-block submit — the create call still validates uniqueness.
  const availabilityReady = !effectiveHandler || effectiveHandler.length < 2 || availability !== undefined || availabilityError;
  const canSubmit = canCreate && !!displayName.trim() && !nameError && !!effectiveHandler && !handlerInvalid && !handlerTaken && !isCheckingAvailability && availabilityReady;

  const handleSubmit = async () => {
    setIsCreating(true);
    setSubmitError(null);
    try {
      const project = await createProject.mutateAsync({
        name: displayName.trim(),
        handler: effectiveHandler,
        description: description.trim(),
        orgHandler: scope.org,
      });
      allowLeave();
      navigate(resourceUrl(narrow(scope, project.handler), 'overview'));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.';
      setSubmitErrorSeverity(isQuotaError(err) ? 'warning' : 'error');
      setSubmitError(normalizeProjectError(message));
      setIsCreating(false);
    }
  };

  return (
    <PageContent fullWidth sx={{ pt: 5 }}>
      <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate(orgHomeUrl)} sx={{ mb: 2 }}>
        Back to projects
      </Button>

      <Typography variant="h1" sx={{ mb: 4 }}>
        Create a project
      </Typography>

      {submitError && (
        <Alert severity={submitErrorSeverity} role="alert" sx={{ mb: 3 }} onClose={() => setSubmitError(null)}>
          {submitError}
        </Alert>
      )}

      <BusyFields busy={isCreating}>
        <Grid container columnSpacing={3} rowSpacing={1}>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <TextField
              labelPlacement="top"
              label="Name"
              required
              placeholder="e.g. Customer Support Platform"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                setNameErrorShown(null);
                setSubmitError(null);
              }}
              onBlur={() => setNameErrorShown(nameError)}
              fullWidth
              error={!!nameErrorShown}
              helperText={nameErrorShown}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <TextField
              labelPlacement="top"
              label="Project ID"
              required
              inputRef={handlerInputRef}
              value={effectiveHandler}
              onChange={(e) => onHandlerChange(e.target.value)}
              onBlur={stopEditing}
              onKeyDown={(e) => {
                if (e.key === 'Enter') stopEditing();
              }}
              fullWidth
              disabled={!handlerEdited}
              error={!!handlerError || (handlerTaken && !replacedHandler)}
              helperText={handlerError ?? (replacedHandler ? `"${replacedHandler}" is taken, so "${effectiveHandler}" is used instead.` : handlerTaken ? 'This project ID is already taken. Edit it to choose another.' : undefined)}
              slotProps={{
                input: {
                  endAdornment: isCheckingAvailability ? (
                    <InputAdornment position="end">
                      <CircularProgress size={16} />
                    </InputAdornment>
                  ) : (
                    effectiveHandler &&
                    !handlerEdited && (
                      <InputAdornment position="end">
                        <Tooltip title="Edit project ID" placement="top">
                          <IconButton size="small" aria-label="Edit project ID" onClick={startEditing} sx={editHandleSx}>
                            <Edit size={16} />
                          </IconButton>
                        </Tooltip>
                      </InputAdornment>
                    )
                  ),
                },
              }}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 8 }}>
            <TextField labelPlacement="top" label="Description" optional placeholder="What is this project for?" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth />
          </Grid>
        </Grid>
      </BusyFields>

      <Stack direction="row" gap={2} sx={{ mt: 4 }}>
        <Button
          variant="outlined"
          color="inherit"
          onClick={() => {
            allowLeave();
            navigate(orgHomeUrl);
          }}
          disabled={isCreating}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSubmit} disabled={!canSubmit || isCreating} startIcon={isCreating ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {isCreating ? 'Creating…' : 'Create'}
        </Button>
      </Stack>
    </PageContent>
  );
}
