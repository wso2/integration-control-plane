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

import { Box, TableCell, TableRow, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Info } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { AlertTypeConstants, TOOLTIP_COUNT, TOOLTIP_INTERVAL, TOOLTIP_PERIOD, TOOLTIP_THRESHOLD } from '../../../constants/alerts';

interface AlertRuleTableHeadersProps {
  category: AlertTypeConstants;
}

interface Header {
  key: string;
  label: string;
  tooltip?: string;
  align?: 'left' | 'right' | 'center';
}

export default function AlertRuleTableHeaders({ category }: AlertRuleTableHeadersProps): JSX.Element {
  const typeHeaders: Header[] = [];

  if (category === AlertTypeConstants.LATENCY || category === AlertTypeConstants.RESOURCES) {
    typeHeaders.push({ key: 'metric', label: 'Metric' });
  }
  if (category === AlertTypeConstants.LATENCY || category === AlertTypeConstants.TRAFFIC || category === AlertTypeConstants.RESOURCES) {
    typeHeaders.push({ key: 'threshold', label: 'Threshold', tooltip: TOOLTIP_THRESHOLD }, { key: 'period', label: 'Period', tooltip: TOOLTIP_PERIOD });
  }
  if (category === AlertTypeConstants.STATUS_CODE) {
    typeHeaders.push({ key: 'statusCode', label: 'Status Code' });
  }
  if (category === AlertTypeConstants.LOGS) {
    typeHeaders.push({ key: 'logType', label: 'Log Type' });
  }
  if (category === AlertTypeConstants.STATUS_CODE || category === AlertTypeConstants.LOGS) {
    typeHeaders.push({ key: 'interval', label: 'Interval', tooltip: TOOLTIP_INTERVAL }, { key: 'count', label: 'Count', tooltip: TOOLTIP_COUNT });
  }
  if (category === AlertTypeConstants.LOGS) {
    typeHeaders.push({ key: 'searchPhrase', label: 'Search Phrase' });
  }

  const commonHeaders: Header[] = [
    { key: 'emails', label: 'Emails' },
    { key: 'enabled', label: 'State' },
    { key: 'createdTimestamp', label: 'Created' },
    { key: 'actions', label: 'Actions', align: 'right' },
  ];

  const renderHeader = (h: Header) => (
    <TableCell key={h.key} align={h.align ?? 'left'}>
      {h.tooltip ? (
        <Tooltip title={h.tooltip} placement="top">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="caption" sx={{ fontWeight: 600, textTransform: 'uppercase', color: 'text.secondary' }}>
              {h.label}
            </Typography>
            <Info size={12} color="inherit" />
          </Box>
        </Tooltip>
      ) : (
        <Typography variant="caption" sx={{ fontWeight: 600, textTransform: 'uppercase', color: 'text.secondary' }}>
          {h.label}
        </Typography>
      )}
    </TableCell>
  );

  return (
    <TableRow>
      {typeHeaders.map(renderHeader)}
      {commonHeaders.map(renderHeader)}
    </TableRow>
  );
}
