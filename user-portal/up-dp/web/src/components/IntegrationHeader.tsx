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

import { MenuItem, Select, Stack, Typography } from '@wso2/oxygen-ui';
import { GitBranch } from '@wso2/oxygen-ui-icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { trackLabel } from '../hooks/useIntegrations';
import type { DeploymentTrack, Integration } from '../types/portal';
import IntegrationIcon from './IntegrationIcon';

/** The integration console's compact pill select, for pickers in headers and toolbars. */
export const PILL_SELECT_SX = {
  fontSize: '0.8125rem',
  borderRadius: 5,
  '& .MuiOutlinedInput-notchedOutline': { borderRadius: 5 },
  // `&&` outranks the theme's padding for small selects, which otherwise wins or loses by style order.
  '&& .MuiSelect-select': { py: '6px', px: 1.5 },
} as const;

/** Picks a deployment track; drawn only when there is more than one. */
export function TrackSelect({ tracks, value, onChange }: { tracks: DeploymentTrack[]; value: string | undefined; onChange: (id: string) => void }) {
  const { t } = useTranslation();
  if (tracks.length < 2 || !value) return null;
  return (
    <Select
      size="small"
      value={value}
      onChange={(e) => onChange(e.target.value as string)}
      sx={{ ...PILL_SELECT_SX, minWidth: 150 }}
      inputProps={{ 'aria-label': t('integrations.header.deploymentTrack') }}
      renderValue={(id) => {
        const track = tracks.find((tr) => tr.id === id);
        return (
          <Stack direction="row" alignItems="center" gap={0.75}>
            <GitBranch size={14} />
            {track ? trackLabel(track) : id}
          </Stack>
        );
      }}>
      {tracks.map((track) => (
        <MenuItem key={track.id} value={track.id}>
          {trackLabel(track)}
          {track.latest && (
            <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
              {t('integrations.header.latest')}
            </Typography>
          )}
        </MenuItem>
      ))}
    </Select>
  );
}

const nameSx = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' } as const;

/** The integration console's integration header: type badge, name, project, description and the page's controls. */
export default function IntegrationHeader({ integration, actions }: { integration: Integration; actions?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <Stack direction={{ xs: 'column', md: 'row' }} alignItems="flex-start" justifyContent="space-between" gap={2} sx={{ mb: 3 }}>
      <Stack gap={1.5} sx={{ flex: 1, minWidth: 0, maxWidth: { md: '65%' } }}>
        <Stack direction="row" alignItems="center" gap={2}>
          <IntegrationIcon kind={integration.kind} size={48} />
          <Stack sx={{ minWidth: 0 }} gap={0.25}>
            <Typography variant="h1" sx={nameSx} title={integration.displayName}>
              {integration.displayName}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('integrations.kindAndProject', { kind: t(`common.kind.${integration.kind}`, { count: 1 }), project: integration.project.name })}
            </Typography>
          </Stack>
        </Stack>
        {integration.description && (
          <Typography variant="body2" color="text.secondary">
            {integration.description}
          </Typography>
        )}
      </Stack>
      {actions && (
        <Stack direction="row" alignItems="center" gap={1} sx={{ flexShrink: 0 }}>
          {actions}
        </Stack>
      )}
    </Stack>
  );
}
