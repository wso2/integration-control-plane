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

import { ListingTable, Stack, Typography } from '@wso2/oxygen-ui';
import { useTranslation } from 'react-i18next';
import type { Integration } from '../../types/portal';
import IntegrationIcon from '../IntegrationIcon';
import IntegrationStatus from './IntegrationStatus';

const tableSx = { '& .MuiTableBody-root .MuiTableCell-root': { py: 2 } } as const;

/** The list view: the console's card-variant listing table. */
export default function IntegrationsTable({ integrations, waiting, onOpen }: { integrations: Integration[]; waiting: (id: string) => number; onOpen: (integration: Integration) => void }) {
  const { t } = useTranslation();
  return (
    <ListingTable.Container disablePaper>
      <ListingTable variant="card" density="compact" sx={tableSx}>
        <ListingTable.Head>
          <ListingTable.Row>
            <ListingTable.Cell>{t('integrations.table.name')}</ListingTable.Cell>
            <ListingTable.Cell>{t('integrations.table.description')}</ListingTable.Cell>
            <ListingTable.Cell>{t('integrations.table.type')}</ListingTable.Cell>
            <ListingTable.Cell>{t('integrations.table.project')}</ListingTable.Cell>
            <ListingTable.Cell sx={{ minWidth: 240 }}>{t('integrations.table.status')}</ListingTable.Cell>
          </ListingTable.Row>
        </ListingTable.Head>
        <ListingTable.Body>
          {integrations.map((integration) => (
            <ListingTable.Row
              key={integration.id}
              variant="card"
              hover
              clickable
              tabIndex={0}
              aria-label={t('integrations.open', { name: integration.displayName })}
              onClick={() => onOpen(integration)}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  onOpen(integration);
                }
              }}>
              <ListingTable.Cell>
                <Stack direction="row" alignItems="center" gap={1.5}>
                  <IntegrationIcon kind={integration.kind} />
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {integration.displayName}
                  </Typography>
                </Stack>
              </ListingTable.Cell>
              <ListingTable.Cell>
                <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 280 }}>
                  {integration.description}
                </Typography>
              </ListingTable.Cell>
              <ListingTable.Cell>
                <Typography variant="body2" noWrap>
                  {t(`common.kind.${integration.kind}`, { count: 1 })}
                </Typography>
              </ListingTable.Cell>
              <ListingTable.Cell>
                <Typography variant="body2" color="text.secondary" noWrap>
                  {integration.project.name}
                </Typography>
              </ListingTable.Cell>
              <ListingTable.Cell>
                <IntegrationStatus integration={integration} waiting={waiting(integration.id)} />
              </ListingTable.Cell>
            </ListingTable.Row>
          ))}
        </ListingTable.Body>
      </ListingTable>
    </ListingTable.Container>
  );
}
