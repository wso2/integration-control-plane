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

import { Alert, Avatar, Button, Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, IconButton, ListingTable, Stack, TablePagination, ToggleButton, ToggleButtonGroup, Tooltip } from '@wso2/oxygen-ui';
import { MailPlus, Pencil, Trash2, UserPlus, Users } from '@wso2/oxygen-ui-icons-react';
import { useState, useCallback, useEffect, type JSX } from 'react';
import { useLocation } from 'react-router';
import { useAppNavigate } from '../../../hooks/useAppNavigate';
import SearchField from '../../SearchField';
import { Permissions } from '../../../constants/permissions';
import Authorized from '../../Authorized';
import { useAuth } from '#auth';
import { useUsers, useDeleteUser, usePendingInvitations, useDeleteInvitation } from '../../../hooks/useAuth';
import type { User } from '../../../types/auth';
import { editOrgUserUrl } from '../../../paths';
import { Loading } from './shared';
import { useFiltered, getUserInitial } from './utils';
import InviteUsersDialog from './InviteUsersDialog';

export function UsersTab({ orgHandler }: { orgHandler: string }): JSX.Element {
  const navigate = useAppNavigate();
  const location = useLocation();
  const { userId: currentUserId } = useAuth();
  const { data: users, isLoading } = useUsers(orgHandler);
  const deleteMutation = useDeleteUser(orgHandler);
  const [view, setView] = useState<'users' | 'pending'>('users');
  const [search, setSearch] = useState('');
  const [inviting, setInviting] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [tableAlert, setTableAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const getSearchStr = useCallback((u: User) => `${u.username} ${u.displayName}`, []);
  const filtered = useFiltered(users ?? [], search, getSearchStr);
  const maxPage = Math.max(0, Math.ceil(filtered.length / rowsPerPage) - 1);
  const safePage = Math.min(page, maxPage);
  const paginated = filtered.slice(safePage * rowsPerPage, safePage * rowsPerPage + rowsPerPage);

  useEffect(() => {
    const state = location.state as { created?: boolean; name?: string } | null;
    if (state?.created) {
      setTableAlert({ type: 'success', message: `User '${state.name}' created successfully.` });
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

      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }} gap={2} flexWrap="wrap">
        <ToggleButtonGroup
          exclusive
          size="small"
          value={view}
          onChange={(_, v) => {
            if (v) {
              setView(v);
              setSearch('');
              setPage(0);
            }
          }}>
          <ToggleButton value="users" sx={{ textTransform: 'none', py: 0.75 }}>
            <Users size={12} style={{ marginRight: 6 }} />
            Users
          </ToggleButton>
          <ToggleButton value="pending" sx={{ textTransform: 'none', py: 0.75 }}>
            <MailPlus size={12} style={{ marginRight: 6 }} />
            Pending Invitations
          </ToggleButton>
        </ToggleButtonGroup>
        <Stack direction="row" gap={1} alignItems="center">
          {view === 'users' && <SearchField value={search} onChange={setSearch} />}
          <Authorized permissions={Permissions.USER_MANAGE_USERS}>
            <Button variant="contained" startIcon={<UserPlus size={18} />} onClick={() => setInviting(true)} sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
              Invite Users
            </Button>
          </Authorized>
        </Stack>
      </Stack>

      {view === 'users' ? (
        <ListingTable.Container>
          <ListingTable>
            <ListingTable.Head>
              <ListingTable.Row>
                <ListingTable.Cell>User</ListingTable.Cell>
                <ListingTable.Cell>Email</ListingTable.Cell>
                <ListingTable.Cell>Groups</ListingTable.Cell>
                <ListingTable.Cell align="right" sx={{ width: 120 }}>
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
                paginated.map((u) => {
                  // The current user (the org admin viewing this) cannot edit or delete themselves.
                  const isSelf = u.userId === currentUserId;
                  return (
                    <ListingTable.Row
                      key={u.userId}
                      clickable={!isSelf}
                      tabIndex={isSelf ? undefined : 0}
                      aria-label={isSelf ? undefined : `Edit ${u.displayName}`}
                      hover={!isSelf}
                      onClick={isSelf ? undefined : () => navigate(editOrgUserUrl(orgHandler, u.userId))}
                      onKeyDown={
                        isSelf
                          ? undefined
                          : (e) => {
                              if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                                e.preventDefault();
                                navigate(editOrgUserUrl(orgHandler, u.userId));
                              }
                            }
                      }>
                      <ListingTable.Cell>
                        <Stack direction="row" alignItems="center" gap={1.5}>
                          <Avatar src={u.pictureUrl} alt={u.displayName || u.username} sx={{ width: 32, height: 32, fontSize: 14 }}>
                            {getUserInitial(u)}
                          </Avatar>
                          {u.displayName}
                        </Stack>
                      </ListingTable.Cell>
                      <ListingTable.Cell>{u.username}</ListingTable.Cell>
                      <ListingTable.Cell>{u.groupCount > 0 ? u.groups.map((g) => <Chip key={g.groupId} label={g.groupName} size="small" sx={{ mr: 0.5 }} />) : <>—</>}</ListingTable.Cell>
                      <ListingTable.Cell align="right">
                        {!isSelf && (
                          <Authorized permissions={Permissions.USER_MANAGE_USERS}>
                            <Tooltip title="Edit">
                              <IconButton
                                size="small"
                                aria-label="Edit user"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(editOrgUserUrl(orgHandler, u.userId));
                                }}>
                                <Pencil size={16} />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete">
                              <IconButton
                                size="small"
                                color="error"
                                aria-label="Delete user"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeletingUserId(u.userId);
                                }}>
                                <Trash2 size={16} />
                              </IconButton>
                            </Tooltip>
                          </Authorized>
                        )}
                      </ListingTable.Cell>
                    </ListingTable.Row>
                  );
                })
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
      ) : (
        <PendingInvitations orgHandler={orgHandler} onAlert={setTableAlert} />
      )}

      {inviting && <InviteUsersDialog orgHandler={orgHandler} onClose={() => setInviting(false)} onInvited={(count) => setTableAlert({ type: 'success', message: `Invited ${count} user${count === 1 ? '' : 's'}.` })} />}

      {deletingUserId &&
        (() => {
          const u = users?.find((x) => x.userId === deletingUserId);
          return u ? (
            <Dialog open onClose={() => setDeletingUserId(null)} maxWidth="xs" fullWidth>
              <DialogTitle>Delete User</DialogTitle>
              <DialogContent>
                <DialogContentText>
                  Are you sure you want to delete the user <strong>{u.displayName}</strong>?
                </DialogContentText>
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setDeletingUserId(null)}>Cancel</Button>
                <Button
                  variant="contained"
                  color="error"
                  onClick={() => {
                    setDeletingUserId(null);
                    deleteMutation.mutate(u.userId, {
                      onSuccess: () => setTableAlert({ type: 'success', message: `User '${u.displayName}' deleted successfully.` }),
                      onError: (error) => setTableAlert({ type: 'error', message: error.message ?? 'Failed to delete user. Please try again.' }),
                    });
                  }}>
                  Delete
                </Button>
              </DialogActions>
            </Dialog>
          ) : null;
        })()}
    </>
  );
}

function PendingInvitations({ orgHandler, onAlert }: { orgHandler: string; onAlert: (a: { type: 'success' | 'error'; message: string }) => void }): JSX.Element {
  const { data: invitations, isLoading, isError, refetch } = usePendingInvitations(orgHandler);
  const del = useDeleteInvitation(orgHandler);
  const [revoking, setRevoking] = useState<string | null>(null);

  if (isLoading) return <Loading />;
  if (isError)
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => refetch()}>
            Retry
          </Button>
        }>
        Failed to load pending invitations.
      </Alert>
    );

  if (!invitations?.length) return <Alert severity="info">There are no pending invitations.</Alert>;

  return (
    <ListingTable.Container>
      <ListingTable>
        <ListingTable.Head>
          <ListingTable.Row>
            <ListingTable.Cell>Email</ListingTable.Cell>
            <ListingTable.Cell>Groups</ListingTable.Cell>
            <ListingTable.Cell align="right" sx={{ width: 120 }}>
              Action
            </ListingTable.Cell>
          </ListingTable.Row>
        </ListingTable.Head>
        <ListingTable.Body>
          {invitations.map((inv) => (
            <ListingTable.Row key={inv.id}>
              <ListingTable.Cell>{inv.email}</ListingTable.Cell>
              <ListingTable.Cell>{inv.groups.length > 0 ? inv.groups.map((g) => <Chip key={g} label={g} size="small" sx={{ mr: 0.5 }} />) : <>—</>}</ListingTable.Cell>
              <ListingTable.Cell align="right">
                <Authorized permissions={Permissions.USER_MANAGE_USERS}>
                  <Tooltip title="Cancel invitation">
                    <IconButton
                      size="small"
                      color="error"
                      aria-label={`Cancel invitation for ${inv.email}`}
                      disabled={revoking === inv.id}
                      onClick={() => {
                        setRevoking(inv.id);
                        del.mutate(inv.id, {
                          onSuccess: () => {
                            setRevoking(null);
                            onAlert({ type: 'success', message: `Invitation for '${inv.email}' cancelled.` });
                          },
                          onError: (e) => {
                            setRevoking(null);
                            onAlert({ type: 'error', message: e.message ?? 'Failed to cancel the invitation.' });
                          },
                        });
                      }}>
                      <Trash2 size={16} />
                    </IconButton>
                  </Tooltip>
                </Authorized>
              </ListingTable.Cell>
            </ListingTable.Row>
          ))}
        </ListingTable.Body>
      </ListingTable>
    </ListingTable.Container>
  );
}
