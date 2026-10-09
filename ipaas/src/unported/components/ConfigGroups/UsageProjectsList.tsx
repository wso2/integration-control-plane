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

import { Box, Chip, Stack, Typography } from '@wso2/oxygen-ui';
import { Boxes, FolderGit2 } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import type { ConfigGroupUsageProject } from '../../../types/configGroups';

interface UsageProjectsListProps {
  projects: ConfigGroupUsageProject[];
}

export default function UsageProjectsList({ projects }: UsageProjectsListProps): JSX.Element {
  return (
    <Stack gap={2}>
      {projects.map((project) => (
        <Box key={project.projectId} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2 }}>
          <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1.5 }}>
            <FolderGit2 size={16} style={{ opacity: 0.7 }} />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {project.projectName}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {project.projectHandler}
            </Typography>
          </Stack>
          <Stack gap={1} sx={{ pl: 3 }}>
            {project.usageInComponents.map((component) => (
              <Stack key={component.componentId} direction="row" alignItems="center" gap={1} flexWrap="wrap">
                <Boxes size={14} style={{ opacity: 0.6 }} />
                <Typography variant="body2">{component.componentName}</Typography>
                {component.usageInReleases.map((release) => (
                  <Chip key={release.envTemplateId} label={release.envTemplateName} size="small" variant="outlined" />
                ))}
              </Stack>
            ))}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}
