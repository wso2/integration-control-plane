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

import { Alert, Box, Button, CircularProgress, IconButton, ListingTable, PageContent, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { KeyRound, Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import EmptyListing from '../../components/EmptyListing';
import OrgSettingsTabs from '../../components/Settings/OrgSettingsTabs';
import AddCredentialDialog from '../../components/Settings/Credentials/AddCredentialDialog';
import DeleteCredentialDialog from '../components/Settings/Credentials/DeleteCredentialDialog';
import { useGitCredentials } from '../../hooks/useCredentials';
import type { GitCredential } from '../../types/credentials';
import type { OrgScope } from '../../nav';

const PROVIDER_LABEL: Record<string, string> = {
  github: 'GitHub',
  bitbucket: 'Bitbucket Cloud',
  'bitbucket-server': 'Bitbucket Server',
  'gitlab-server': 'GitLab (Self-managed)',
  'azure-devops': 'Azure DevOps',
};

export default function Credentials(_scope: OrgScope): JSX.Element {
  const { data: credentials, isLoading, isError, refetch } = useGitCredentials();
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<GitCredential | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  return (
    <PageContent>
      <OrgSettingsTabs active="credentials" />

      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h6">Git Credentials</Typography>
        {!!credentials?.length && (
          <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setAdding(true)} sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
            Add Credential
          </Button>
        )}
      </Stack>

      {alert && (
        <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 2 }}>
          {alert.message}
        </Alert>
      )}

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 120px)' }}>
          <CircularProgress />
        </Box>
      ) : isError ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => refetch()}>
              Retry
            </Button>
          }>
          Failed to load credentials.
        </Alert>
      ) : !credentials?.length ? (
        <EmptyListing icon={<KeyRound size={48} />} title="No git credentials" description="Add a credential so the platform can access your private source repositories." showAction actionLabel="Add Credential" onAction={() => setAdding(true)} />
      ) : (
        <ListingTable.Container>
          <ListingTable>
            <ListingTable.Head>
              <ListingTable.Row>
                <ListingTable.Cell>Name</ListingTable.Cell>
                <ListingTable.Cell>Provider</ListingTable.Cell>
                <ListingTable.Cell>Created</ListingTable.Cell>
                <ListingTable.Cell align="right">Action</ListingTable.Cell>
              </ListingTable.Row>
            </ListingTable.Head>
            <ListingTable.Body>
              {credentials.map((c) => (
                <ListingTable.Row key={c.id}>
                  <ListingTable.Cell>{c.name}</ListingTable.Cell>
                  <ListingTable.Cell>{PROVIDER_LABEL[c.type] ?? c.type}</ListingTable.Cell>
                  <ListingTable.Cell>{c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '—'}</ListingTable.Cell>
                  <ListingTable.Cell align="right">
                    <Tooltip title="Delete">
                      <IconButton size="small" color="error" aria-label={`Delete ${c.name}`} onClick={() => setDeleting(c)}>
                        <Trash2 size={16} />
                      </IconButton>
                    </Tooltip>
                  </ListingTable.Cell>
                </ListingTable.Row>
              ))}
            </ListingTable.Body>
          </ListingTable>
        </ListingTable.Container>
      )}

      {adding && <AddCredentialDialog onClose={() => setAdding(false)} onAdded={(name) => setAlert({ type: 'success', message: `Credential '${name}' added.` })} onError={(message) => setAlert({ type: 'error', message })} />}
      {deleting && <DeleteCredentialDialog credential={deleting} onClose={() => setDeleting(null)} onDeleted={(name) => setAlert({ type: 'success', message: `Credential '${name}' deleted.` })} onError={(message) => setAlert({ type: 'error', message })} />}
    </PageContent>
  );
}
