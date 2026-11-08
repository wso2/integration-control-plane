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

import { Alert, Button, CircularProgress, Grid, PageContent, PageTitle, Stack, TextField } from '@wso2/oxygen-ui';
import { ArrowLeft } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { Scopes } from '../constants/permissions';
import { useCan } from '../hooks/useCan';
import { useUnsavedChanges } from '../contexts/UnsavedChangesContext';
import BusyFields from '../components/common/BusyFields';
import EditProjectSkeleton from '../components/EditProjectSkeleton';
import PageNotFound from './PageNotFound';
import { useProjectId, useProjects, useUpdateProject } from '../hooks/useProjects';
import { resourceUrl, type ProjectScope } from '../nav';
import { orgProjectsUrl } from '../paths';
import type { Project } from '../types/project';
import { validateProjectName } from '../utils/projectValidation';
import { DESCRIPTION_MAX_LENGTH, toSingleLineDescription } from '../utils/description';

function EditProjectForm({ scope, project }: { scope: ProjectScope; project: Project }): JSX.Element {
  const navigate = useAppNavigate();
  const updateProject = useUpdateProject();
  const canUpdate = useCan()(Scopes.PROJECT_UPDATE);
  const { data: allProjects = [] } = useProjects();
  const projectHomeUrl = resourceUrl(scope, 'overview');
  // The overview edits the description on one line, so this form keeps the same shape.
  const storedDescription = project.description?.trim() ?? '';
  const originalDescription = toSingleLineDescription(storedDescription);
  const [displayName, setDisplayName] = useState(project.name);
  const [description, setDescription] = useState(originalDescription);
  const [nameErrorShown, setNameErrorShown] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const trimmedName = displayName.trim().toLowerCase();
  const nameTaken = allProjects.some((p) => p.id !== project.id && p.name.trim().toLowerCase() === trimmedName);
  const nameError = validateProjectName(displayName) ?? (nameTaken ? 'A project with this name already exists.' : null);
  const descriptionChanged = description.trim() !== originalDescription;
  const changed = displayName.trim() !== project.name || descriptionChanged;
  const canSubmit = canUpdate && changed && !nameError && !updateProject.isPending;
  const allowLeave = useUnsavedChanges(changed);

  const handleSubmit = async () => {
    setSubmitError(null);
    try {
      // An untouched description is sent as stored, so a rename keeps any line breaks it has.
      const nextDescription = descriptionChanged ? description.trim() : storedDescription;
      await updateProject.mutateAsync({ id: project.id, name: displayName.trim(), description: nextDescription || ' ', version: project.version });
      allowLeave();
      navigate(projectHomeUrl);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to update the project. Please try again.');
    }
  };

  return (
    <>
      {submitError && (
        <Alert severity="error" role="alert" sx={{ mb: 3 }} onClose={() => setSubmitError(null)}>
          {submitError}
        </Alert>
      )}

      <BusyFields busy={updateProject.isPending}>
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
            <TextField labelPlacement="top" label="Project ID" value={project.handler} fullWidth disabled />
          </Grid>
          <Grid size={{ xs: 12, md: 8 }}>
            <TextField
              labelPlacement="top"
              label="Description"
              optional
              placeholder="What is this project for?"
              value={description}
              onChange={(e) => setDescription(toSingleLineDescription(e.target.value))}
              fullWidth
              slotProps={{ htmlInput: { maxLength: DESCRIPTION_MAX_LENGTH } }}
            />
          </Grid>
        </Grid>
      </BusyFields>

      <Stack direction="row" gap={2} sx={{ mt: 4 }}>
        <Button
          variant="outlined"
          color="inherit"
          onClick={() => {
            allowLeave();
            navigate(projectHomeUrl);
          }}
          disabled={updateProject.isPending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSubmit} disabled={!canSubmit} startIcon={updateProject.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {updateProject.isPending ? 'Updating…' : 'Update project'}
        </Button>
      </Stack>
    </>
  );
}

export default function EditProject(scope: ProjectScope): JSX.Element {
  const navigate = useAppNavigate();
  const { project, isLoading, isError, refetch } = useProjectId(scope.project);

  if (isLoading) return <EditProjectSkeleton />;
  if (isError)
    return (
      <PageContent fullWidth sx={{ pt: 5 }}>
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => refetch()}>
              Retry
            </Button>
          }>
          Could not load the project.
        </Alert>
      </PageContent>
    );
  if (!project) return <PageNotFound title="Project not found" actionTo={orgProjectsUrl(scope.org)} actionLabel="Back to projects" />;

  return (
    <PageContent fullWidth sx={{ pt: 5 }}>
      <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate(resourceUrl(scope, 'overview'))} sx={{ mb: 2 }}>
        Back to project
      </Button>

      <PageTitle>
        <PageTitle.Header>Edit project</PageTitle.Header>
      </PageTitle>

      <EditProjectForm key={project.id} scope={scope} project={project} />
    </PageContent>
  );
}
