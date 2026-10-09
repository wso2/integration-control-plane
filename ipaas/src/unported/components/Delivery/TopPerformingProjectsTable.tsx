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

import { Alert, Box, Link, ListingTable, Skeleton, TablePagination, Typography } from '@wso2/oxygen-ui';
import { useEffect, useMemo, useState, type JSX } from 'react';
import type { ProjectDoraRow } from '../../../types/delivery';

interface TopPerformingProjectsTableProps {
  rows: ProjectDoraRow[];
  isLoading: boolean;
  onRowClick: (row: ProjectDoraRow) => void;
}

/** Org-level "Top Performing Projects" DORA table with client-side pagination (5/10). */
export default function TopPerformingProjectsTable({ rows, isLoading, onRowClick }: TopPerformingProjectsTableProps): JSX.Element {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);

  useEffect(() => {
    setPage(0);
  }, [rows.length]);

  const pageRows = useMemo(() => rows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage), [rows, page, rowsPerPage]);

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="h6" sx={{ fontWeight: 600, mt: 4, mb: 2 }}>
        Top Performing Projects
      </Typography>
      {isLoading ? (
        <Skeleton variant="rounded" height={240} />
      ) : rows.length === 0 ? (
        <Alert severity="info">No data available.</Alert>
      ) : (
        <>
          <ListingTable.Container sx={{ maxHeight: 'none', height: 'auto' }}>
            <ListingTable>
              <ListingTable.Head>
                <ListingTable.Row>
                  <ListingTable.Cell>Project Name</ListingTable.Cell>
                  <ListingTable.Cell align="center">Deployment Count</ListingTable.Cell>
                  <ListingTable.Cell align="center">Change Failure Rate%</ListingTable.Cell>
                  <ListingTable.Cell align="center">Mean Time to Recovery (Days)</ListingTable.Cell>
                  <ListingTable.Cell align="center">Lead Time for Change (Days)</ListingTable.Cell>
                  <ListingTable.Cell align="right">Owner</ListingTable.Cell>
                </ListingTable.Row>
              </ListingTable.Head>
              <ListingTable.Body>
                {pageRows.map((row) => (
                  <ListingTable.Row key={row.id} hover={!!row.handler} onClick={row.handler ? () => onRowClick(row) : undefined} sx={row.handler ? { cursor: 'pointer' } : undefined}>
                    <ListingTable.Cell>
                      {row.handler ? (
                        <Link
                          component="button"
                          type="button"
                          variant="body2"
                          underline="hover"
                          color="inherit"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRowClick(row);
                          }}
                          sx={{ fontWeight: 500 }}>
                          {row.name}
                        </Link>
                      ) : (
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {row.name}
                        </Typography>
                      )}
                    </ListingTable.Cell>
                    <ListingTable.Cell align="center">{row.deployments}</ListingTable.Cell>
                    <ListingTable.Cell align="center">{row.failureRate}</ListingTable.Cell>
                    <ListingTable.Cell align="center">{row.recoveryTime}</ListingTable.Cell>
                    <ListingTable.Cell align="center">{row.leadTime}</ListingTable.Cell>
                    <ListingTable.Cell align="right">{row.owner || '—'}</ListingTable.Cell>
                  </ListingTable.Row>
                ))}
              </ListingTable.Body>
            </ListingTable>
          </ListingTable.Container>
          {rows.length > 5 && (
            <TablePagination
              component="div"
              count={rows.length}
              page={page}
              rowsPerPage={rowsPerPage}
              rowsPerPageOptions={[5, 10]}
              onPageChange={(_, p) => setPage(p)}
              onRowsPerPageChange={(e) => {
                setRowsPerPage(parseInt(e.target.value, 10));
                setPage(0);
              }}
              labelRowsPerPage="Items per page"
            />
          )}
        </>
      )}
    </Box>
  );
}
