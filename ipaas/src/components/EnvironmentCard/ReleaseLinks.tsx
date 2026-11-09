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

import { Chip, Stack, Typography } from '@wso2/oxygen-ui';
import { useIntegrationLinks } from '../../hooks/useConfiguration';

const chipSx = { height: 20, fontSize: '0.7rem', borderRadius: 0.75 } as const;

/**
 * What an environment's release uses: its resources, whether the integration's links wait for a deploy, and whether
 * values changed since its pods started. The Integration Platform has no restart for a running deployment, so the
 * values apply on Stop and Start.
 */
export function ReleaseLinks({ projectId, componentId, env }: { projectId: string; componentId: string; env: string }) {
  const { data: links } = useIntegrationLinks(projectId, componentId, true);
  const release = links?.environments.find((e) => e.name === env);
  if (!links || !release?.deployed || (release.resources.length === 0 && !release.linksNeedDeploy)) return null;
  const name = (ref: string) => links.resources.find((r) => r.id === ref)?.displayName ?? ref;

  return (
    <Stack gap={0.75} sx={{ mt: 2 }} aria-label={`Resources in ${env}`}>
      {release.resources.length > 0 && (
        <>
          <Typography variant="caption" color="text.secondary">
            This release uses
          </Typography>
          <Stack direction="row" gap={0.75} flexWrap="wrap">
            {release.resources.map((r) => (
              <Chip key={r.ref} label={name(r.ref)} size="small" variant="outlined" sx={chipSx} />
            ))}
          </Stack>
        </>
      )}
      {release.linksNeedDeploy && <Chip label="Links apply on the next Apply" size="small" color="info" variant="outlined" sx={{ ...chipSx, alignSelf: 'flex-start' }} />}
      {release.valuesChanged && <Chip label="Values changed · Stop and start to apply" size="small" color="warning" variant="outlined" sx={{ ...chipSx, alignSelf: 'flex-start' }} />}
    </Stack>
  );
}
