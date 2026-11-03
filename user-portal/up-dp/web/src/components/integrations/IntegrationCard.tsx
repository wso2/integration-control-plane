/*
 * Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com). All Rights Reserved.
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein is strictly forbidden, unless permitted by WSO2 in accordance with
 * the WSO2 Commercial License available at http://wso2.com/licenses.
 * For specific language governing the permissions and limitations under
 * this license, please see the license as well as any agreement you've
 * entered into with WSO2 governing the purchase of this software and any
 * associated services.
 */

import { Box, Card, CardActionArea, Divider, Stack, Typography } from '@wso2/oxygen-ui';
import { useTranslation } from 'react-i18next';
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
