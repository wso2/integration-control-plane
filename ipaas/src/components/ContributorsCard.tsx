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

import { Avatar, Card, CardContent, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Info, Users } from '@wso2/oxygen-ui-icons-react';
import { useProjectContributors } from '../hooks/useProjects';
import type { JSX } from 'react';

export default function ContributorsCard({ projectId }: { projectId: string }): JSX.Element | null {
  const { data: contributors } = useProjectContributors(projectId);

  if (!contributors || contributors.length === 0) return null;

  return (
    <Card>
      <CardContent>
        <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1.5 }}>
          <Users size={20} aria-hidden="true" />
          <Typography variant="h6" component="h2" sx={{ fontWeight: 600 }}>
            Contributors
          </Typography>
          <Tooltip title="Contributors to the source of the integrations deployed in this project">
            <Info size={14} aria-label="Contributors info" style={{ color: 'var(--oxygen-palette-text-secondary, #6b7280)', cursor: 'default' }} />
          </Tooltip>
        </Stack>
        <Stack direction="row" flexWrap="wrap" gap={1}>
          {contributors.map((contributor, i) => {
            const name = contributor.displayName || contributor.email || 'Unknown contributor';
            return (
              <Tooltip key={contributor.email || `${name}-${i}`} title={`${name} · ${contributor.totalContributions} contributions`}>
                <Avatar
                  src={contributor.pictureUrl || undefined}
                  alt={name}
                  role="img"
                  tabIndex={0}
                  aria-label={`${name}: ${contributor.totalContributions} contributions`}
                  sx={{ width: 32, height: 32, fontSize: 14, bgcolor: 'primary.main', color: 'primary.contrastText', cursor: 'default' }}>
                  {name[0].toUpperCase()}
                </Avatar>
              </Tooltip>
            );
          })}
        </Stack>
      </CardContent>
    </Card>
  );
}
