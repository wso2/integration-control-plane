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

import { Box, Card, CardContent, IconButton, ListingTable, Skeleton, Stack, TablePagination, TableSortLabel, Tooltip, Typography } from '@wso2/oxygen-ui';
import { ExternalLink } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState, type JSX } from 'react';
import { useSortState } from '../../hooks/useSortState';
import type { RuleAdherenceResponse } from '../../../types/governance';
import ComplianceErrorAlert from './ComplianceErrorAlert';
import ComplianceStatusChip from './ComplianceStatusChip';
import ViolationChips from './ViolationChips';

interface RulesetsAdherenceSummaryCardProps {
  data?: RuleAdherenceResponse | null;
  isLoading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  onRulesetClick?: (rulesetId: string) => void;
}

type SortKey = 'name' | 'status' | 'violations';

export default function RulesetsAdherenceSummaryCard(props: RulesetsAdherenceSummaryCardProps): JSX.Element {
  const { data, isLoading, error, onRetry, onRulesetClick } = props;
  const { sortKey, sortOrder, handleSort } = useSortState<SortKey>('violations');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);

  const sorted = useMemo(() => {
    const dir = sortOrder === 'asc' ? 1 : -1;
    return (data?.list ?? []).slice().sort((a, b) => {
      if (sortKey === 'violations') {
        if (a.ruleViolations.error !== b.ruleViolations.error) {
          return (a.ruleViolations.error - b.ruleViolations.error) * dir;
        }
        return a.rulesetName.localeCompare(b.rulesetName);
      }
      const av = sortKey === 'name' ? a.rulesetName : a.status;
      const bv = sortKey === 'name' ? b.rulesetName : b.status;
      if (av === bv) return a.rulesetName.localeCompare(b.rulesetName);
      return av.localeCompare(bv) * dir;
    });
  }, [data, sortKey, sortOrder]);

  const paged = useMemo(() => sorted.slice(page * rowsPerPage, (page + 1) * rowsPerPage), [sorted, page, rowsPerPage]);

  if (isLoading) {
    return <Skeleton variant="rounded" height={280} />;
  }

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={1.5}>
          <Typography variant="h6">Rulesets Adherence Summary</Typography>
          {error ? (
            <ComplianceErrorAlert message="Failed to load rule details." onRetry={onRetry} />
          ) : (
            <>
              <Box sx={{ overflowX: 'auto' }}>
                <ListingTable size="small">
                  <ListingTable.Head>
                    <ListingTable.Row>
                      <ListingTable.Cell sx={{ width: 200 }}>
                        <TableSortLabel active={sortKey === 'name'} direction={sortOrder} onClick={() => handleSort('name')}>
                          Ruleset
                        </TableSortLabel>
                      </ListingTable.Cell>
                      <ListingTable.Cell sx={{ width: 130 }}>
                        <TableSortLabel active={sortKey === 'status'} direction={sortOrder} onClick={() => handleSort('status')}>
                          Status
                        </TableSortLabel>
                      </ListingTable.Cell>
                      <ListingTable.Cell>
                        <TableSortLabel active={sortKey === 'violations'} direction={sortOrder} onClick={() => handleSort('violations')}>
                          Violations
                        </TableSortLabel>
                      </ListingTable.Cell>
                    </ListingTable.Row>
                  </ListingTable.Head>
                  <ListingTable.Body>
                    {paged.length === 0 ? (
                      <ListingTable.Row>
                        <ListingTable.Cell colSpan={3} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                          No data available
                        </ListingTable.Cell>
                      </ListingTable.Row>
                    ) : (
                      paged.map((entry) => (
                        <ListingTable.Row key={entry.rulesetId}>
                          <ListingTable.Cell>
                            <Stack direction="row" spacing={0.5} alignItems="center">
                              <Typography variant="body2" noWrap>
                                {entry.rulesetName}
                              </Typography>
                              {onRulesetClick && (
                                <Tooltip title={`Open ${entry.rulesetName}`}>
                                  <IconButton size="small" aria-label={`Open ${entry.rulesetName}`} onClick={() => onRulesetClick(entry.rulesetId)}>
                                    <ExternalLink size={14} />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </Stack>
                          </ListingTable.Cell>
                          <ListingTable.Cell>
                            <ComplianceStatusChip status={entry.status} />
                          </ListingTable.Cell>
                          <ListingTable.Cell>
                            <ViolationChips counts={entry.ruleViolations} />
                          </ListingTable.Cell>
                        </ListingTable.Row>
                      ))
                    )}
                  </ListingTable.Body>
                </ListingTable>
              </Box>
              {sorted.length > 5 && (
                <TablePagination
                  component="div"
                  count={sorted.length}
                  page={page}
                  onPageChange={(_, p) => setPage(p)}
                  rowsPerPage={rowsPerPage}
                  onRowsPerPageChange={(e) => {
                    setRowsPerPage(Number(e.target.value));
                    setPage(0);
                  }}
                  rowsPerPageOptions={[5, 10, 25]}
                />
              )}
            </>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
