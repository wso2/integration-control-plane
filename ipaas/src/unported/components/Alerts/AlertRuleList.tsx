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

import { Box, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, Tooltip, Typography } from '@wso2/oxygen-ui';
import { type JSX, useEffect, useState } from 'react';
import type { AlertRule } from '../../../types/alerts';
import { AlertTypeConstants, type AlertRulePeriodConstants } from '../../../constants/alerts';
import { getAlertRuleMetricNameByValue, getAlertRulePeriodNameByValue } from '../../utils/alerts';
import AlertRuleActions from './AlertRuleActions';
import AlertRuleEmails from './AlertRuleEmails';
import AlertRuleTableHeaders from './AlertRuleTableHeaders';

interface AlertRuleListProps {
  alertType: AlertTypeConstants;
  alertRules: AlertRule[];
  setIsEditAlertRule: (v: boolean) => void;
  setSelectedAlertRule: (rule: AlertRule) => void;
  setIsDeleteAlertRule: (v: boolean) => void;
  setIsToggleAlertRule: (v: boolean) => void;
}

export default function AlertRuleList(props: AlertRuleListProps): JSX.Element {
  const { alertType, alertRules, setIsEditAlertRule, setSelectedAlertRule, setIsDeleteAlertRule, setIsToggleAlertRule } = props;

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);

  useEffect(() => {
    setPage(0);
  }, [alertType]);

  const paged = alertRules.slice(page * rowsPerPage, (page + 1) * rowsPerPage);

  const formatDate = (ts?: string) => {
    if (!ts) return '-';
    try {
      return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return ts;
    }
  };

  return (
    <Box sx={{ mb: 2 }}>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <AlertRuleTableHeaders category={alertType} />
          </TableHead>
          <TableBody>
            {paged.map((rule) => (
              <TableRow key={rule.id} hover>
                {(alertType === AlertTypeConstants.LATENCY || alertType === AlertTypeConstants.RESOURCES) && <TableCell>{getAlertRuleMetricNameByValue(rule.metric as AlertTypeConstants)}</TableCell>}
                {(alertType === AlertTypeConstants.LATENCY || alertType === AlertTypeConstants.TRAFFIC || alertType === AlertTypeConstants.RESOURCES) && (
                  <>
                    <TableCell>{rule.threshold}</TableCell>
                    <TableCell>{getAlertRulePeriodNameByValue(rule.period as AlertRulePeriodConstants)}</TableCell>
                  </>
                )}
                {alertType === AlertTypeConstants.STATUS_CODE && <TableCell>{getAlertRuleMetricNameByValue(rule.statusCode as AlertTypeConstants)}</TableCell>}
                {alertType === AlertTypeConstants.LOGS && <TableCell>{rule.logType}</TableCell>}
                {(alertType === AlertTypeConstants.STATUS_CODE || alertType === AlertTypeConstants.LOGS) && (
                  <>
                    <TableCell>{rule.interval} min</TableCell>
                    <TableCell>{rule.count}</TableCell>
                  </>
                )}
                {alertType === AlertTypeConstants.LOGS && (
                  <TableCell>
                    {rule.searchPhrase && rule.searchPhrase.length > 20 ? (
                      <Tooltip title={rule.searchPhrase} placement="top">
                        <span>{rule.searchPhrase.slice(0, 20)}...</span>
                      </Tooltip>
                    ) : (
                      rule.searchPhrase
                    )}
                  </TableCell>
                )}
                <TableCell>
                  <AlertRuleEmails emails={rule.emails} />
                </TableCell>
                <TableCell>
                  <Chip label={rule.enabled ? 'Enabled' : 'Disabled'} color={rule.enabled ? 'success' : 'default'} variant="outlined" size="small" />
                </TableCell>
                <TableCell>
                  <Typography variant="caption">{formatDate(rule.createdTimestamp)}</Typography>
                </TableCell>
                <TableCell align="right">
                  <AlertRuleActions rowData={rule} setIsEditAlertRule={setIsEditAlertRule} setSelectedAlertRule={setSelectedAlertRule} setIsDeleteAlertRule={setIsDeleteAlertRule} setIsToggleAlertRule={setIsToggleAlertRule} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {alertRules.length > 5 && (
        <TablePagination
          component="div"
          count={alertRules.length}
          page={page}
          rowsPerPage={rowsPerPage}
          rowsPerPageOptions={[5, 10, 25]}
          onPageChange={(_, p) => setPage(p)}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(Number(e.target.value));
            setPage(0);
          }}
        />
      )}
    </Box>
  );
}
