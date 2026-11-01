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

import { Alert, Button, CircularProgress, Grid, PageContent, Skeleton, Stack, Typography } from '@wso2/oxygen-ui';
import TextField from '../components/common/TextField';
import { ArrowLeft } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { useAppNavigate } from '../hooks/useAppNavigate';
import BusyFields from '../components/common/BusyFields';
import NotFound from '../components/NotFound';
import { useProjectId, useUpdateProject } from '../hooks/useProjects';
import { resourceUrl, broaden, type ProjectScope } from '../nav';
import type { Project } from '../types/project';
import { validateProjectName } from '../utils/projectValidation';
import { DESCRIPTION_MAX_LENGTH, toSingleLineDescription } from '../utils/description';

function EditProjectForm({ scope, project }: { scope: ProjectScope; project: Project }): JSX.Element {
  const navigate = useAppNavigate();
  const updateProject = useUpdateProject();
  const projectHomeUrl = resourceUrl(scope, 'overview');
  // The overview edits the description on one line, so this form keeps the same shape.
  const originalDescription = toSingleLineDescription(project.description?.trim() ?? '');
  const [displayName, setDisplayName] = useState(project.name);
  const [description, setDescription] = useState(originalDescription);
  const [nameErrorShown, setNameErrorShown] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const nameError = validateProjectName(displayName);
  const changed = displayName.trim() !== project.name || description.trim() !== originalDescription;
  const canSubmit = changed && !nameError && !updateProject.isPending;

  const handleSubmit = async () => {
    setSubmitError(null);
    try {
      await updateProject.mutateAsync({ id: project.id, name: displayName.trim(), description: description.trim() || ' ', version: project.version });
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
              label="Name"
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
            <TextField label="Project ID" value={project.handler} fullWidth disabled />
          </Grid>
          <Grid size={{ xs: 12, md: 8 }}>
            <TextField
              label="Description (Optional)"
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
        <Button variant="outlined" onClick={() => navigate(projectHomeUrl)} disabled={updateProject.isPending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSubmit} disabled={!canSubmit} startIcon={updateProject.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {updateProject.isPending ? 'Saving…' : 'Save Changes'}
        </Button>
      </Stack>
    </>
  );
}

export default function EditProject(scope: ProjectScope): JSX.Element {
  const navigate = useAppNavigate();
  const { project, isLoading } = useProjectId(scope.project);

  if (isLoading) {
    return (
      <PageContent fullWidth sx={{ pt: 5 }} aria-busy="true" aria-label="Loading project">
        <Skeleton variant="rounded" width={80} height={32} sx={{ mb: 2 }} />
        <Skeleton variant="text" width={280} height={48} sx={{ mb: 4 }} />
        <Grid container columnSpacing={3} rowSpacing={1}>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <Skeleton variant="rounded" height={56} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <Skeleton variant="rounded" height={56} />
          </Grid>
          <Grid size={{ xs: 12, md: 8 }}>
            <Skeleton variant="rounded" height={56} />
          </Grid>
        </Grid>
      </PageContent>
    );
  }
  if (!project) return <NotFound message="Project not found" backTo={resourceUrl(broaden(scope)!, 'overview')} backLabel="Back to Projects" />;

  return (
    <PageContent fullWidth sx={{ pt: 5 }}>
      <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate(resourceUrl(scope, 'overview'))} sx={{ mb: 2 }}>
        Back
      </Button>

      <Typography variant="h1" sx={{ mb: 4 }}>
        Edit project
      </Typography>

      <EditProjectForm key={project.id} scope={scope} project={project} />
    </PageContent>
  );
}
