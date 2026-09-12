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

import { Box, Button, Divider, MenuItem, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import { Plus } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useState, type JSX } from 'react';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { useComponents } from '../hooks/useComponents';
import { useProjectId, useProjects } from '../hooks/useProjects';
import { newComponentUrl, newProjectUrl } from '../nav';
import { actionItemSx, containerSx, goButtonSx, subtitleSx, titleSx } from './IntegrationScopePicker.styles';
import { componentUrl } from '../paths';

const CREATE = '__create__';

/** The integration-level page the picker hands off to. */
export type ScopePickerSegment = 'build' | 'deploy' | 'test';

const TITLES: Record<ScopePickerSegment, string> = {
  build: 'Builds are scoped to a single integration.',
  deploy: 'Deployments are scoped to a single integration.',
  test: 'Testing is scoped to a single integration.',
};

export interface IntegrationScopePickerProps {
  org: string;
  /** Preselects the project (project-level pages). */
  project?: string;
  segment: ScopePickerSegment;
}

/**
 * Build, Deploy and Test only exist for one integration, so the org and project pages ask which —
 * rather than dead-ending — and hand the user to the same page one level down.
 */
export default function IntegrationScopePicker({ org, project, segment }: IntegrationScopePickerProps): JSX.Element {
  const navigate = useAppNavigate();
  const { data: projects = [] } = useProjects();
  const [projectHandler, setProjectHandler] = useState(project ?? '');
  const [componentHandler, setComponentHandler] = useState('');

  const { projectId } = useProjectId(projectHandler);
  const { data: components = [] } = useComponents(org, projectId);

  // A project switch invalidates whatever integration was picked under the previous one.
  useEffect(() => setComponentHandler(''), [projectHandler]);

  const go = () => {
    if (!projectHandler || !componentHandler) return;
    navigate(`${componentUrl(org, projectHandler, componentHandler)}/${segment}`);
  };

  return (
    <Box sx={containerSx}>
      <Typography variant="h5" sx={titleSx}>
        {TITLES[segment]}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={subtitleSx}>
        Select a project and an integration to continue.
      </Typography>

      <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} alignItems={{ sm: 'flex-end' }}>
        <TextField
          select
          fullWidth
          size="small"
          label="Project"
          value={projectHandler}
          onChange={(e) => {
            const value = e.target.value;
            if (value === CREATE) {
              navigate(newProjectUrl({ org }));
              return;
            }
            setProjectHandler(value);
          }}>
          <MenuItem value={CREATE}>
            <Stack direction="row" alignItems="center" gap={1} sx={actionItemSx}>
              <Plus size={16} />
              Create Project
            </Stack>
          </MenuItem>
          <Divider />
          {projects.map((p) => (
            <MenuItem key={p.id} value={p.handler}>
              {p.name}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          select
          fullWidth
          size="small"
          label="Integration"
          value={componentHandler}
          disabled={!projectHandler}
          onChange={(e) => {
            const value = e.target.value;
            if (value === CREATE) {
              navigate(newComponentUrl({ org, project: projectHandler }));
              return;
            }
            setComponentHandler(value);
          }}>
          <MenuItem value={CREATE}>
            <Stack direction="row" alignItems="center" gap={1} sx={actionItemSx}>
              <Plus size={16} />
              Create Integration
            </Stack>
          </MenuItem>
          <Divider />
          {components.map((c) => (
            <MenuItem key={c.id} value={c.handler}>
              {c.displayName || c.name}
            </MenuItem>
          ))}
        </TextField>

        <Button variant="contained" onClick={go} disabled={!projectHandler || !componentHandler} sx={goButtonSx}>
          Go to Integration
        </Button>
      </Stack>
    </Box>
  );
}
