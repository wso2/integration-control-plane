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

import { Alert, Box, Card, CardContent, Divider, Grid, IconButton, MenuItem, Paper, Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography, TextField } from '@wso2/oxygen-ui';
import { File, Folder, FolderOpen, Inbox, Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useState, useMemo, type JSX } from 'react';
import type { RepoTreeNode } from '../../types/repository';
import type { WorkspaceModule, WorkspaceIntegrationType } from '../../types/project';
import { isBallerinaModule, extractWorkspaceModules } from '../../utils/technologyDetection';
import { formatRepoNameToDisplayName } from '../../utils/string';
import { INTEGRATION_TYPE_LABELS } from '../../constants/project';
import SearchField from '../SearchField';

const HEAD_CELL_SX = { fontWeight: 600, fontSize: 11, color: 'text.secondary' } as const;

interface WorkspaceModuleTableProps {
  repoName: string;
  repoContents: RepoTreeNode[];
  modules: WorkspaceModule[];
  onChange: (modules: WorkspaceModule[]) => void;
  /** Max number of modules that can be added (org-wide quota remaining). Omit for unlimited. */
  quotaRemaining?: number;
  /** Show a warning alert below the title when no modules are configured. */
  alertWhenEmpty?: boolean;
}

export default function WorkspaceModuleTable({ repoName, repoContents, modules, onChange, quotaRemaining, alertWhenEmpty }: WorkspaceModuleTableProps): JSX.Element {
  const [search, setSearch] = useState('');
  const [quotaAlert, setQuotaAlert] = useState(false);

  const isLimited = quotaRemaining !== undefined;
  const addedPaths = new Set(modules.map((m) => m.path));

  const addModule = (path: string, name: string) => {
    if (addedPaths.has(path)) return;
    if (isLimited && modules.length >= quotaRemaining!) {
      setQuotaAlert(true);
      return;
    }
    setQuotaAlert(false);
    onChange([
      ...modules,
      {
        path,
        name,
        displayName: formatRepoNameToDisplayName(name),
        integrationType: 'service',
      },
    ]);
  };

  const allModules = useMemo(() => extractWorkspaceModules(repoContents), [repoContents]);
  const allModuleCount = allModules.length;
  const allModulesAdded = allModuleCount > 0 && allModuleCount === modules.length;

  // Root [+] = "Add All": adds every Ballerina module in the repo up to quota.
  const addAllModules = () => {
    const newModules = allModules.filter((m) => !addedPaths.has(m.path));
    if (newModules.length === 0) return;

    const canAdd = isLimited ? Math.max(0, quotaRemaining! - modules.length) : newModules.length;
    const toAdd = newModules.slice(0, canAdd);

    if (toAdd.length < newModules.length) {
      setQuotaAlert(true);
    } else {
      setQuotaAlert(false);
    }

    if (toAdd.length > 0) {
      onChange([...modules, ...toAdd]);
    }
  };

  const removeModule = (path: string) => {
    setQuotaAlert(false);
    onChange(modules.filter((m) => m.path !== path));
  };

  const updateDisplayName = (path: string, displayName: string) => {
    onChange(modules.map((m) => (m.path === path ? { ...m, displayName } : m)));
  };

  const updateIntegrationType = (path: string, type: WorkspaceIntegrationType) => {
    onChange(modules.map((m) => (m.path === path ? { ...m, integrationType: type } : m)));
  };

  const filteredContents = search ? repoContents.filter((n) => n.subPath.toLowerCase().includes(search.toLowerCase())) : repoContents;

  const renderTreeNode = (node: RepoTreeNode, indent = false) => {
    const isModule = isBallerinaModule(node);
    const alreadyAdded = addedPaths.has(node.path);
    return (
      <Stack
        key={node.path}
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{
          py: 0.75,
          px: 1,
          pl: indent ? 3 : 1,
          borderRadius: 1,
          '&:hover': { bgcolor: 'action.hover' },
        }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
          <Box sx={{ color: 'text.secondary', display: 'flex', flexShrink: 0 }}>{node.type === 'tree' ? <Folder size={18} /> : <File size={16} />}</Box>
          <Typography variant="body2" noWrap>
            {node.subPath}
          </Typography>
        </Stack>
        {isModule && (
          <Tooltip title={alreadyAdded ? 'Already added' : 'Add as integration'} placement="right">
            <IconButton
              size="small"
              aria-label={alreadyAdded ? 'Already added' : `Add ${node.subPath} as integration`}
              onClick={() => addModule(node.path, node.subPath)}
              disabled={alreadyAdded}
              sx={{
                border: 1,
                borderColor: alreadyAdded ? 'divider' : 'primary.main',
                borderRadius: 1,
                color: alreadyAdded ? 'text.disabled' : 'primary.main',
                p: 0.25,
                ml: 1,
                flexShrink: 0,
              }}>
              <Plus size={14} />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
    );
  };

  return (
    <Box>
      <Typography variant="h5" component="h2" sx={{ mb: 2 }}>
        Configure integrations
      </Typography>
      <Grid container spacing={2}>
        {/* Left panel — Workspace Directory Structure */}
        <Grid size={{ xs: 12, md: 5 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ pb: '16px !important' }}>
              <Typography variant="body2" fontWeight={600} sx={{ mb: 1.5 }}>
                Workspace directories
              </Typography>

              <SearchField value={search} onChange={setSearch} placeholder="Search directories" fullWidth sx={{ mb: 1.5 }} />

              {/* Root node */}
              {!search && (
                <Stack
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                  sx={{
                    py: 0.75,
                    px: 1,
                    borderRadius: 1,
                    bgcolor: 'action.selected',
                    mb: 0.5,
                  }}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Box sx={{ color: 'primary.main', display: 'flex' }}>
                      <FolderOpen size={18} />
                    </Box>
                    <Typography variant="body2" fontWeight={500}>
                      {repoName || '/'}
                    </Typography>
                  </Stack>
                  <Tooltip title={allModulesAdded ? 'All integrations added' : 'Add all integrations'} placement="right">
                    <IconButton
                      size="small"
                      aria-label={allModulesAdded ? 'All integrations added' : 'Add all integrations'}
                      onClick={addAllModules}
                      disabled={allModulesAdded}
                      sx={{
                        border: 1,
                        borderColor: allModulesAdded ? 'divider' : 'primary.main',
                        borderRadius: 1,
                        color: allModulesAdded ? 'text.disabled' : 'primary.main',
                        p: 0.25,
                        ml: 1,
                        flexShrink: 0,
                      }}>
                      <Plus size={14} />
                    </IconButton>
                  </Tooltip>
                </Stack>
              )}

              <Divider sx={{ mb: 0.5 }} />

              <Box sx={{ maxHeight: 300, overflowY: 'auto' }}>
                {filteredContents.length === 0 && search ? (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                    No matches found
                  </Typography>
                ) : (
                  filteredContents.map((node) => renderTreeNode(node, !search))
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Right panel — Configured Components */}
        <Grid size={{ xs: 12, md: 7 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ pb: '16px !important' }}>
              <Typography variant="body2" fontWeight={600} sx={{ mb: 1.5 }}>
                Configured integrations
              </Typography>

              {quotaAlert && (
                <Alert severity="warning" sx={{ mb: 1.5 }} onClose={() => setQuotaAlert(false)}>
                  You have exceeded the allocated integration quota. Upgrade your subscription.
                </Alert>
              )}

              {alertWhenEmpty && modules.length === 0 && (quotaRemaining === undefined || quotaRemaining > 0) && (
                <Alert severity="warning" sx={{ mb: 1.5 }}>
                  Add at least one integration from the workspace directory to proceed.
                </Alert>
              )}

              {modules.length === 0 ? (
                <Stack alignItems="center" justifyContent="center" sx={{ py: 6 }}>
                  <Box sx={{ color: 'text.disabled', mb: 1 }}>
                    <Inbox size={40} />
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    No integrations configured.
                  </Typography>
                </Stack>
              ) : (
                <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 1 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={HEAD_CELL_SX}>Integration display name</TableCell>
                        <TableCell sx={HEAD_CELL_SX}>Path</TableCell>
                        <TableCell sx={HEAD_CELL_SX}>Integration type</TableCell>
                        <TableCell sx={HEAD_CELL_SX}>Action</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {modules.map((module) => (
                        <TableRow key={module.path}>
                          <TableCell>
                            <TextField size="small" value={module.displayName} onChange={(e) => updateDisplayName(module.path, e.target.value)} variant="outlined" sx={{ minWidth: 140 }} slotProps={{ htmlInput: { 'aria-label': 'Integration display name' } }} />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                              {module.path || '/'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Select value={module.integrationType} onChange={(e) => updateIntegrationType(module.path, e.target.value as WorkspaceIntegrationType)} size="small" sx={{ minWidth: 170 }}>
                              {(Object.entries(INTEGRATION_TYPE_LABELS) as [WorkspaceIntegrationType, string][]).map(([value, label]) => (
                                <MenuItem key={value} value={value}>
                                  {label}
                                </MenuItem>
                              ))}
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Tooltip title="Remove" placement="top">
                              <IconButton aria-label="Remove" size="small" onClick={() => removeModule(module.path)} sx={{ color: 'error.main' }}>
                                <Trash2 size={16} />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
