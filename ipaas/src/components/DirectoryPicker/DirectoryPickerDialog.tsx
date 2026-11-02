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

import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, Tooltip, Typography, TreeView, TextField } from '@wso2/oxygen-ui';
import { Folder, RefreshCw, Search } from '@wso2/oxygen-ui-icons-react';
import { useCallback, useEffect, useState, type JSX } from 'react';
import type { RepoTreeNode } from '../../types/repository';
import { renderTree, filterDirectories, buildDefaultExpanded } from '../../utils/directoryTree';

const { SimpleTreeView, TreeItem } = TreeView;

interface DirectoryPickerDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (path: string) => void;
  repoName: string;
  contents: RepoTreeNode[];
  isFetching: boolean;
  onRefetch: () => void;
  currentValue: string;
}

export default function DirectoryPickerDialog({ open, onClose, onSave, repoName, contents, isFetching, onRefetch, currentValue }: DirectoryPickerDialogProps): JSX.Element {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // The "display path" shown in the preview input inside the dialog
  const selectedPath = selectedItemId == null ? currentValue || '/' : selectedItemId === `__root__${repoName}` ? '/' : `/${selectedItemId}`;

  useEffect(() => {
    if (open) {
      setSearch('');
      if (!currentValue || currentValue === '/') {
        setSelectedItemId(`__root__${repoName}`);
      } else {
        setSelectedItemId(currentValue.replace(/^\//, ''));
      }
    }
  }, [open, currentValue, repoName]);

  const handleSelect = useCallback((_event: React.SyntheticEvent | null, itemId: string | null) => {
    setSelectedItemId(itemId);
  }, []);

  const handleContinue = () => {
    onSave(selectedPath);
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  const filtered = search ? filterDirectories(contents, search.toLowerCase()) : contents;

  const defaultExpanded = buildDefaultExpanded(currentValue);

  return (
    <Dialog open={open} onClose={handleCancel} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Typography variant="h6">Repository Sub Path</Typography>
      </DialogTitle>

      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pb: 1 }}>
        {/* Path preview */}
        <TextField labelPlacement="top" size="small" fullWidth value={`/${repoName}${selectedPath === '/' ? '' : selectedPath}`} slotProps={{ input: { readOnly: true } }} label="Selected path" />

        {/* Search */}
        <TextField
          size="small"
          fullWidth
          placeholder="Search directories…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={15} />
                </InputAdornment>
              ),
            },
          }}
        />

        {/* Tree */}
        <Box
          sx={{
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            height: 300,
            overflow: 'auto',
            position: 'relative',
            p: 0.5,
          }}>
          {isFetching ? (
            <Box display="flex" alignItems="center" justifyContent="center" height="100%">
              <CircularProgress size={24} />
            </Box>
          ) : (
            <Box display="flex" justifyContent="space-between">
              <Box flexGrow={1}>
                <SimpleTreeView onSelectedItemsChange={handleSelect} selectedItems={selectedItemId ?? ''} defaultExpandedItems={[`__root__${repoName}`, ...defaultExpanded]}>
                  {/* Root node */}
                  <TreeItem
                    itemId={`__root__${repoName}`}
                    label={
                      <Box display="flex" alignItems="center" gap={0.75}>
                        <Folder size={14} style={{ flexShrink: 0 }} />
                        <span>{repoName}</span>
                      </Box>
                    }>
                    {renderTree(filtered)}
                  </TreeItem>
                </SimpleTreeView>
              </Box>

              <Tooltip title="Refresh directory listing">
                <IconButton size="small" aria-label="Refresh directory listing" onClick={onRefetch} sx={{ alignSelf: 'flex-start', mt: 0.5 }}>
                  <RefreshCw size={14} />
                </IconButton>
              </Tooltip>
            </Box>
          )}
        </Box>

        <Typography variant="caption" color="text.secondary">
          Hint: To use an empty directory, commit a <code>.keep</code> file to your repository and select the directory here.
        </Typography>
      </DialogContent>

      <DialogActions>
        <Button variant="outlined" color="inherit" onClick={handleCancel}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleContinue} disabled={isFetching}>
          Continue
        </Button>
      </DialogActions>
    </Dialog>
  );
}
