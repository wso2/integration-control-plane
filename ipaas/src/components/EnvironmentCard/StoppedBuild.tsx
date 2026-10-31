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

import { Alert, Box, Typography } from '@wso2/oxygen-ui';
import { useDeploymentStatus } from '../../hooks/useDeployments';
import type { ResourceLink } from '../../types/configuration';
import { LINKS_UNREADABLE } from '../../utils/buildProgress';
import { LinkSuggestions } from './LinkSuggestions';

interface StoppedBuildProps {
  projectId: string;
  componentId: string;
  versionId: string;
  open: boolean;
  links: ResourceLink[];
}

const boxSx = { mb: 1.5 } as const;

/** When the latest build stopped on a link: why, and that build's suggestions to change the link. */
export function StoppedBuild({ projectId, componentId, versionId, open, links }: StoppedBuildProps) {
  const { data: builds } = useDeploymentStatus(componentId, versionId);
  const latest = builds?.[0];
  if (!open || !latest?.stopped || latest.stopped.reason === LINKS_UNREADABLE) return null;
  return (
    <Box sx={boxSx}>
      <Alert severity="error" sx={{ mb: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          The latest build stopped
        </Typography>
        <Typography variant="body2">{latest.stopped.message}. Change the link to a connection this build has, or unlink it, then build again.</Typography>
      </Alert>
      <LinkSuggestions projectId={projectId} componentId={componentId} open={open} links={links} build={latest.name} />
    </Box>
  );
}
