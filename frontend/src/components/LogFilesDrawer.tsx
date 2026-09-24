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

import { useState, type JSX } from 'react';
import { Box, Button, CircularProgress, Drawer, IconButton, ListingTable, Stack, TablePagination, Typography } from '@wso2/oxygen-ui';
import { Download, X } from '@wso2/oxygen-ui-icons-react';
import SearchField from './SearchField';
import { useLogFilesByRuntime } from '../api/queries';
import { FETCHABLE, settle, type Fetchable } from '../api/fetchable';

const drawerSx = {
  '& .MuiDrawer-paper': {
    width: '60%',
    maxWidth: 800,
    minWidth: 500,
    position: 'fixed',
    top: 64,
    height: 'calc(100% - 64px)',
    borderLeft: '1px solid',
    borderColor: 'divider',
  },
};

const headerSx = {
  px: 2,
  py: 1.5,
  borderBottom: '1px solid',
  borderColor: 'divider',
};

interface LogFilesDrawerProps {
  runtimeId: string;
  onClose: () => void;
}

export function LogFilesDrawer({ runtimeId, onClose }: LogFilesDrawerProps): JSX.Element {
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const { data: logFilesData, isLoading } = useLogFilesByRuntime(runtimeId, searchQuery || undefined, rowsPerPage, page * rowsPerPage);

  const handleDownload = async (fileName: string) => {
    try {
      // Import the gql function to make the query
      const { gql } = await import('../api/graphql');

      const answer = await settle(() =>
        gql<{ logFileContent: Fetchable & { content: string } }>(
          `query LogFileContent($runtimeId: String!, $fileName: String!) {
          logFileContent(runtimeId: $runtimeId, fileName: $fileName) { ${FETCHABLE}, content }
        }`,
          { runtimeId, fileName },
        ).then((d) => d.logFileContent),
      );

      const content = answer.content;

      // Create a blob and download
      const blob = new Blob([content], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();

      // Defer cleanup to allow browser to start download
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 100);
    } catch (error) {
      console.error('Error downloading log file:', error);
      // You might want to show a toast notification here
    }
  };

  const files = logFilesData?.files ?? [];
  const total = logFilesData?.count ?? 0;

  return (
    <Drawer anchor="right" open onClose={onClose} variant="persistent" sx={drawerSx}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={headerSx}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          Log Files - {runtimeId}
        </Typography>
        <IconButton size="small" aria-label="close" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </Stack>

      <Box sx={{ p: 2 }}>
        <SearchField
          value={searchQuery}
          onChange={(v) => {
            setSearchQuery(v);
            setPage(0);
          }}
          placeholder="Search log files..."
          sx={{ mb: 2, width: '100%' }}
        />

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {total} log file{total !== 1 ? 's' : ''} found
        </Typography>

        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : total === 0 ? (
          <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            {searchQuery ? 'No log files match your search.' : 'No log files available.'}
          </Typography>
        ) : (
          <>
            <ListingTable>
              <ListingTable.Head>
                <ListingTable.Row>
                  <ListingTable.Cell>File Name</ListingTable.Cell>
                  <ListingTable.Cell>Size</ListingTable.Cell>
                  <ListingTable.Cell>Actions</ListingTable.Cell>
                </ListingTable.Row>
              </ListingTable.Head>
              <ListingTable.Body>
                {files.map((file) => (
                  <ListingTable.Row key={file.fileName}>
                    <ListingTable.Cell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {file.fileName}
                      </Typography>
                    </ListingTable.Cell>
                    <ListingTable.Cell>{file.size}</ListingTable.Cell>
                    <ListingTable.Cell>
                      <Button variant="text" size="small" startIcon={<Download size={16} />} onClick={() => handleDownload(file.fileName)}>
                        Download
                      </Button>
                    </ListingTable.Cell>
                  </ListingTable.Row>
                ))}
              </ListingTable.Body>
            </ListingTable>
            {total > 0 && (
              <TablePagination
                sx={{ borderTop: '1px solid', borderColor: 'divider', mt: 1 }}
                component="div"
                count={total}
                page={page}
                onPageChange={(_, p) => setPage(p)}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={(e) => {
                  setRowsPerPage(parseInt(e.target.value, 10));
                  setPage(0);
                }}
                rowsPerPageOptions={[5, 10, 25, 50]}
              />
            )}
          </>
        )}
      </Box>
    </Drawer>
  );
}
