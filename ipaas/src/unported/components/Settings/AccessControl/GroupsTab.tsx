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

import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, IconButton, ListingTable, TablePagination, Tooltip } from '@wso2/oxygen-ui';
import { Pencil, Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useState, type JSX } from 'react';
import { useLocation } from 'react-router';
import { useAppNavigate } from '../../../../hooks/useAppNavigate';
import SearchField from '../../../../components/SearchField';
import { useAccessControl } from '../../../../contexts/AccessControlContext';
import { Permissions } from '../../../../constants/permissions';
import { useGroups, useDeleteGroup } from '../../../../hooks/useAuth';
import { useComponentByHandler } from '../../../../hooks/useComponents';
import type { Group } from '../../../../types/auth';
import { newOrgGroupUrl, editOrgGroupUrl, projectGroupDetailUrl, componentGroupDetailUrl } from '../../../../paths';
import { Loading } from '../../../../components/Settings/AccessControl/shared';
import { useFiltered } from './utils';

export function GroupsTab({ orgHandler, projectId, projectHandler, componentHandler, readOnly }: { orgHandler: string; projectId?: string; projectHandler?: string; componentHandler?: string; readOnly?: boolean }): JSX.Element {
  const navigate = useAppNavigate();
  const location = useLocation();
  const { hasOrgPermission } = useAccessControl();
  const canManageGroups = hasOrgPermission(Permissions.USER_MANAGE_GROUPS);
  const effectiveReadOnly = readOnly || !canManageGroups;
  const { data: componentData } = useComponentByHandler(projectId ?? '', componentHandler);
  const componentId = componentData?.id;
  const { data: groups, isLoading } = useGroups(orgHandler, projectId, componentId);
  const deleteMutation = useDeleteGroup(orgHandler);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [deletingGroup, setDeletingGroup] = useState<Group | null>(null);
  const [tableAlert, setTableAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const filtered = useFiltered(groups ?? [], search, (g) => `${g.groupName} ${g.description ?? ''}`);
  const maxPage = Math.max(0, Math.ceil(filtered.length / rowsPerPage) - 1);
  const safePage = Math.min(page, maxPage);
  const paginated = filtered.slice(safePage * rowsPerPage, safePage * rowsPerPage + rowsPerPage);

  const getGroupDetailUrl = (groupId: string) => {
    if (componentHandler && projectHandler) return componentGroupDetailUrl(orgHandler, projectHandler, componentHandler, groupId);
    if (projectHandler) return projectGroupDetailUrl(orgHandler, projectHandler, groupId);
    return editOrgGroupUrl(orgHandler, groupId);
  };

  useEffect(() => {
    const state = location.state as { created?: boolean; name?: string } | null;
    if (state?.created) {
      setTableAlert({ type: 'success', message: `Group '${state.name}' created successfully.` });
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location, navigate]);

  if (isLoading) return <Loading />;
  return (
    <>
      {tableAlert && (
        <Alert severity={tableAlert.type} role={tableAlert.type === 'success' ? 'status' : 'alert'} aria-live={tableAlert.type === 'success' ? 'polite' : 'assertive'} onClose={() => setTableAlert(null)} sx={{ mb: 2 }}>
          {tableAlert.message}
        </Alert>
      )}
      <ListingTable.Container>
        <ListingTable.Toolbar
          searchSlot={<SearchField value={search} onChange={setSearch} />}
          actions={
            !effectiveReadOnly && (
              <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => navigate(newOrgGroupUrl(orgHandler))}>
                Create Group
              </Button>
            )
          }
        />
        <ListingTable>
          <ListingTable.Head>
            <ListingTable.Row>
              <ListingTable.Cell sx={{ width: '25%' }}>Name</ListingTable.Cell>
              <ListingTable.Cell sx={{ width: '42%' }}>Description</ListingTable.Cell>
              <ListingTable.Cell sx={{ width: '18%' }}>Assigned to</ListingTable.Cell>
              <ListingTable.Cell align="right" sx={{ width: '15%' }}>
                Action
              </ListingTable.Cell>
            </ListingTable.Row>
          </ListingTable.Head>
          <ListingTable.Body>
            {filtered.length === 0 ? (
              <ListingTable.Row>
                <ListingTable.Cell colSpan={4} align="center">
                  No records to display
                </ListingTable.Cell>
              </ListingTable.Row>
            ) : (
              paginated.map((g) => (
                <ListingTable.Row
                  key={g.groupId}
                  clickable
                  hover
                  tabIndex={0}
                  aria-label={`View details for ${g.groupName}`}
                  onClick={() => navigate(getGroupDetailUrl(g.groupId))}
                  onKeyDown={(e) => {
                    if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                      if (e.key === ' ') e.preventDefault();
                      navigate(getGroupDetailUrl(g.groupId));
                    }
                  }}>
                  <ListingTable.Cell>{g.groupName}</ListingTable.Cell>
                  <ListingTable.Cell sx={{ maxWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.description}</ListingTable.Cell>
                  <ListingTable.Cell>
                    {g.roleCount ?? '—'} {g.roleCount === 1 ? 'role' : g.roleCount ? 'roles' : ''}
                  </ListingTable.Cell>
                  <ListingTable.Cell align="right">
                    <Tooltip title="Edit">
                      <IconButton
                        size="small"
                        aria-label={`Edit ${g.groupName}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(getGroupDetailUrl(g.groupId));
                        }}>
                        <Pencil size={16} />
                      </IconButton>
                    </Tooltip>
                    {!effectiveReadOnly && (
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          color="error"
                          aria-label={`Delete ${g.groupName}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingGroup(g);
                          }}>
                          <Trash2 size={16} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </ListingTable.Cell>
                </ListingTable.Row>
              ))
            )}
          </ListingTable.Body>
        </ListingTable>
        <TablePagination
          sx={{ borderTop: '1px solid', borderColor: 'divider' }}
          component="div"
          count={filtered.length}
          page={safePage}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[5, 10, 25, 50]}
        />
      </ListingTable.Container>
      {deletingGroup && (
        <Dialog open onClose={() => setDeletingGroup(null)} maxWidth="sm" fullWidth>
          <DialogTitle>Delete Group</DialogTitle>
          <DialogContent>
            <DialogContentText>
              Are you sure you want to delete the group <strong>{deletingGroup.groupName}</strong>?
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeletingGroup(null)}>Cancel</Button>
            <Button
              variant="contained"
              color="error"
              onClick={() => {
                setDeletingGroup(null);
                deleteMutation.mutate(deletingGroup.groupId, {
                  onSuccess: () => setTableAlert({ type: 'success', message: `Group '${deletingGroup.groupName}' deleted successfully.` }),
                  onError: (error) => setTableAlert({ type: 'error', message: error.message ?? 'Failed to delete group. Please try again.' }),
                });
              }}>
              Delete
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}
