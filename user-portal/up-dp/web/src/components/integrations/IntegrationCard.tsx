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

import { Box, Card, CardActionArea, Divider, Stack, Typography } from '@wso2/oxygen-ui';
import { useTranslation } from '../../i18n';
import type { Integration } from '../../types/portal';
import IntegrationIcon from '../IntegrationIcon';
import IntegrationStatus from './IntegrationStatus';

const cardSx = { height: '100%', display: 'flex', flexDirection: 'column', transition: 'border-color 0.15s, box-shadow 0.15s', '&:hover': { boxShadow: 2, borderColor: 'primary.main' } } as const;
const descriptionSx = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: '2.86em' } as const;

/** An integration as the console lays out a project card: badge and name, description, a status line. */
export default function IntegrationCard({ integration, waiting, onOpen }: { integration: Integration; waiting: number; onOpen: () => void }) {
  const { t } = useTranslation();
  return (
    <Card variant="outlined" sx={cardSx}>
      <CardActionArea onClick={onOpen} sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start', p: 2.5 }} aria-label={t('integrations.open', { name: integration.displayName })}>
        <Stack direction="row" alignItems="center" gap={2} sx={{ mb: 1.5 }}>
          <IntegrationIcon kind={integration.kind} size={44} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }} noWrap title={integration.displayName}>
              {integration.displayName}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap component="div">
              {t('integrations.kindAndProject', { kind: t(`common.kind.${integration.kind}`, { count: 1 }), project: integration.project.name })}
            </Typography>
          </Box>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={descriptionSx} title={integration.description}>
          {integration.description || t('integrations.card.noDescription')}
        </Typography>
      </CardActionArea>
      <Divider />
      <Box sx={{ px: 2.5, py: 1.25 }}>
        <IntegrationStatus integration={integration} waiting={waiting} />
      </Box>
    </Card>
  );
}
