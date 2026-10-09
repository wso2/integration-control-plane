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

import { Box, Card, CardContent, Collapse, IconButton, InputAdornment, ListingTable, Skeleton, Stack, TablePagination, TableSortLabel, Tooltip, Typography } from '@wso2/oxygen-ui';
import TextField from '../../../components/common/TextField';
import { ChevronDown, ExternalLink, Search } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState, type JSX } from 'react';
import { useSortState } from '../../hooks/useSortState';
import { STANDALONE_RULESET_LABEL } from '../../constants/compliance';
import type { ComplianceLine, ComplianceNestedItem, ComplianceRow } from '../../../types/compliance';
import { sortNestedItems } from '../../utils/compliance';
import ComplianceErrorAlert from './ComplianceErrorAlert';
import ComplianceNestedLine from './ComplianceNestedLine';
import ComplianceRowIndicator from './ComplianceRowIndicator';
import ComplianceStatusChip from './ComplianceStatusChip';
import ViolationChips from './ViolationChips';

interface ExpandableComplianceTableProps {
  title: string;
  /** First column header, e.g. "Projects", "Components", "Policy". */
  nameLabel: string;
  /** Third (indicator) column header, e.g. "Policies", "Projects", "Component". */
  infoLabel: string;
  /** Word shown next to the failed count, e.g. "Violated" or "Non-Compliant". */
  failedWord: string;
  /** Nested-table first column header, e.g. "Policy" or "Projects". */
  nestedNameLabel: string;
  /** Nested-table third column header (ruleset lines). Omit when nested items have no sub-lines. */
  nestedInfoLabel?: string;
  rows: ComplianceRow[];
  isLoading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  onRowClick?: (row: ComplianceRow) => void;
  onItemClick?: (row: ComplianceRow, item: ComplianceNestedItem) => void;
  onSubItemClick?: (row: ComplianceRow, item: ComplianceNestedItem, sub: ComplianceLine) => void;
}

type SortKey = 'name' | 'status' | 'info';

const COL_COUNT = 4;

/**
 * Port of Devant's ApiGovernance ExpandableDetailTable: searchable, sortable,
 * paginated card table whose rows expand into a nested name/status/lines table.
 */
export default function ExpandableComplianceTable(props: ExpandableComplianceTableProps): JSX.Element {
  const { title, nameLabel, infoLabel, failedWord, nestedNameLabel, nestedInfoLabel, rows, isLoading, error, onRetry, onRowClick, onItemClick, onSubItemClick } = props;
  const [search, setSearch] = useState('');
  const { sortKey, sortOrder, handleSort } = useSortState<SortKey>('info');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const dir = sortOrder === 'asc' ? 1 : -1;
    return rows
      .filter((r) => !needle || r.searchText.toLowerCase().includes(needle))
      .slice()
      .sort((a, b) => {
        if (sortKey === 'info') {
          if (a.failed !== b.failed) return (a.failed - b.failed) * dir;
          return a.name.localeCompare(b.name);
        }
        const av = sortKey === 'name' ? a.name : a.status;
        const bv = sortKey === 'name' ? b.name : b.status;
        if (av === bv) return a.name.localeCompare(b.name);
        return av.localeCompare(bv) * dir;
      });
  }, [rows, search, sortKey, sortOrder]);

  const paged = useMemo(() => filtered.slice(page * rowsPerPage, (page + 1) * rowsPerPage), [filtered, page, rowsPerPage]);

  if (isLoading) {
    return <Skeleton variant="rounded" height={320} sx={{ flexGrow: 1 }} />;
  }

  return (
    <Card variant="outlined" sx={{ flexGrow: 1 }}>
      <CardContent>
        <Stack spacing={1.5}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="h6">{title}</Typography>
            <TextField
              size="small"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Search"
              inputProps={{ 'aria-label': `Search ${title}` }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={16} />
                  </InputAdornment>
                ),
              }}
              sx={{ maxWidth: 260 }}
            />
          </Stack>
          {error ? (
            <ComplianceErrorAlert message="Failed to load compliance data." onRetry={onRetry} />
          ) : (
            <>
              <Box sx={{ overflowX: 'auto' }}>
                <ListingTable size="small">
                  <ListingTable.Head>
                    <ListingTable.Row>
                      <ListingTable.Cell sx={{ width: 200 }}>
                        <TableSortLabel active={sortKey === 'name'} direction={sortOrder} onClick={() => handleSort('name')}>
                          {nameLabel}
                        </TableSortLabel>
                      </ListingTable.Cell>
                      <ListingTable.Cell sx={{ width: 130 }}>
                        <TableSortLabel active={sortKey === 'status'} direction={sortOrder} onClick={() => handleSort('status')}>
                          Status
                        </TableSortLabel>
                      </ListingTable.Cell>
                      <ListingTable.Cell>
                        <TableSortLabel active={sortKey === 'info'} direction={sortOrder} onClick={() => handleSort('info')}>
                          {infoLabel}
                        </TableSortLabel>
                      </ListingTable.Cell>
                      <ListingTable.Cell sx={{ width: 56 }} />
                    </ListingTable.Row>
                  </ListingTable.Head>
                  <ListingTable.Body>
                    {paged.length === 0 && (
                      <ListingTable.Row>
                        <ListingTable.Cell colSpan={COL_COUNT} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                          No data available
                        </ListingTable.Cell>
                      </ListingTable.Row>
                    )}
                    {paged.map((row) => {
                      const isOpen = !!expanded[row.id];
                      const items = sortNestedItems(row.items);
                      return [
                        <ListingTable.Row key={row.id}>
                          <ListingTable.Cell>
                            <Stack direction="row" spacing={0.5} alignItems="center">
                              <Typography variant="body2" noWrap>
                                {row.name}
                              </Typography>
                              {onRowClick && (
                                <Tooltip title="Open">
                                  <IconButton size="small" aria-label={`Open ${row.name}`} onClick={() => onRowClick(row)}>
                                    <ExternalLink size={14} />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </Stack>
                          </ListingTable.Cell>
                          <ListingTable.Cell>
                            <ComplianceStatusChip status={row.status} />
                          </ListingTable.Cell>
                          <ListingTable.Cell>
                            <Stack direction="row" spacing={2} alignItems="center">
                              <ComplianceRowIndicator row={row} failedWord={failedWord} />
                              {row.violations && <ViolationChips counts={row.violations} />}
                            </Stack>
                          </ListingTable.Cell>
                          <ListingTable.Cell align="center">
                            <IconButton size="small" aria-label={isOpen ? `Collapse ${row.name}` : `Expand ${row.name}`} disabled={items.length === 0} onClick={() => setExpanded((prev) => ({ ...prev, [row.id]: !prev[row.id] }))}>
                              <ChevronDown size={16} style={{ transform: isOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }} />
                            </IconButton>
                          </ListingTable.Cell>
                        </ListingTable.Row>,
                        <ListingTable.Row key={`${row.id}-detail`}>
                          <ListingTable.Cell colSpan={COL_COUNT} sx={{ py: 0, border: isOpen ? undefined : 0 }}>
                            <Collapse in={isOpen} unmountOnExit>
                              <Box sx={{ my: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                                <ListingTable size="small">
                                  <ListingTable.Head>
                                    <ListingTable.Row>
                                      <ListingTable.Cell sx={{ width: 200 }}>{nestedNameLabel}</ListingTable.Cell>
                                      <ListingTable.Cell sx={{ width: 130 }}>Status</ListingTable.Cell>
                                      {nestedInfoLabel && <ListingTable.Cell>{nestedInfoLabel}</ListingTable.Cell>}
                                    </ListingTable.Row>
                                  </ListingTable.Head>
                                  <ListingTable.Body>
                                    {items.map((item, i) => (
                                      <ListingTable.Row key={item.id ?? `item-${i}`}>
                                        <ListingTable.Cell>
                                          <Stack direction="row" spacing={0.5} alignItems="center">
                                            <Typography variant="body2" noWrap>
                                              {item.name ?? STANDALONE_RULESET_LABEL}
                                            </Typography>
                                            {onItemClick && item.id && (
                                              <Tooltip title="Open">
                                                <IconButton size="small" aria-label={`Open ${item.name ?? 'item'}`} onClick={() => onItemClick(row, item)}>
                                                  <ExternalLink size={14} />
                                                </IconButton>
                                              </Tooltip>
                                            )}
                                          </Stack>
                                        </ListingTable.Cell>
                                        <ListingTable.Cell>
                                          <ComplianceStatusChip status={item.status} />
                                        </ListingTable.Cell>
                                        {nestedInfoLabel && (
                                          <ListingTable.Cell>
                                            {(item.subItems ?? []).map((sub, j) => (
                                              <ComplianceNestedLine key={sub.id ?? `sub-${j}`} line={sub} onClick={onSubItemClick && sub.id ? () => onSubItemClick(row, item, sub) : undefined} />
                                            ))}
                                          </ListingTable.Cell>
                                        )}
                                      </ListingTable.Row>
                                    ))}
                                  </ListingTable.Body>
                                </ListingTable>
                              </Box>
                            </Collapse>
                          </ListingTable.Cell>
                        </ListingTable.Row>,
                      ];
                    })}
                  </ListingTable.Body>
                </ListingTable>
              </Box>
              {filtered.length > 5 && (
                <TablePagination
                  component="div"
                  count={filtered.length}
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
