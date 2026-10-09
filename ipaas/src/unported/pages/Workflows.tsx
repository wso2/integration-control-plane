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

import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, IconButton, ListingTable, PageContent, Switch, Tooltip } from '@wso2/oxygen-ui';
import { GitBranch, Pencil } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState, type JSX } from 'react';
import Authorized from '../../components/Authorized';
import EmptyListing from '../../components/EmptyListing';
import OrgSettingsTabs from '../../components/Settings/OrgSettingsTabs';
import ConfigureWorkflowDialog from '../components/Settings/Workflows/ConfigureWorkflowDialog';
import { Permissions } from '../../constants/permissions';
import { useUpdateWorkflowConfig, useWorkflowConfigs, useWorkflowDefinitions } from '../hooks/useWorkflows';
import type { OrgWorkflowConfig, WorkflowDefinition } from '../../types/workflow';
import type { OrgScope } from '../../nav';

interface WorkflowRow {
  definition: WorkflowDefinition;
  config?: OrgWorkflowConfig;
  enabled: boolean;
}

export default function Workflows({ org }: OrgScope): JSX.Element {
  const { data: definitions, isLoading: loadingDefs, isError: defsError, refetch: refetchDefs } = useWorkflowDefinitions();
  const { data: configs, isLoading: loadingConfigs, isError: configsError, refetch: refetchConfigs } = useWorkflowConfigs();
  const disableMutation = useUpdateWorkflowConfig();

  const [configuring, setConfiguring] = useState<{ definition: WorkflowDefinition; config?: OrgWorkflowConfig } | null>(null);
  const [disabling, setDisabling] = useState<{ definition: WorkflowDefinition; config: OrgWorkflowConfig } | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const rows = useMemo<WorkflowRow[]>(() => {
    const byDef = new Map((configs ?? []).map((c) => [c.workflowDefinitionId, c]));
    return (definitions ?? []).map((definition) => {
      const config = byDef.get(definition.id);
      return { definition, config, enabled: config?.enabled ?? false };
    });
  }, [definitions, configs]);

  const handleToggle = (row: WorkflowRow, checked: boolean) => {
    if (checked) setConfiguring({ definition: row.definition, config: row.config });
    else if (row.config) setDisabling({ definition: row.definition, config: row.config });
  };

  const handleDisable = () => {
    if (!disabling) return;
    const { config, definition } = disabling;
    disableMutation.mutate(
      {
        configId: config.id,
        input: {
          workflowDefinitionId: config.workflowDefinitionId,
          enabled: false,
          assigneeRoles: config.assigneeRoles,
          assignees: config.assignees,
          formatRequestData: config.formatRequestData ?? true,
          ...(config.externalWorkflowEngineEndpoint ? { externalWorkflowEngineEndpoint: config.externalWorkflowEngineEndpoint } : {}),
        },
      },
      {
        onSuccess: () => {
          setDisabling(null);
          setAlert({ type: 'success', message: `'${definition.name}' disabled.` });
        },
        onError: (e) => {
          setDisabling(null);
          setAlert({ type: 'error', message: e.message || 'Failed to disable the workflow.' });
        },
      },
    );
  };

  const isLoading = loadingDefs || loadingConfigs;
  const isError = defsError || configsError;

  return (
    <PageContent>
      <OrgSettingsTabs active="workflows" />

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
            <Button
              color="inherit"
              size="small"
              onClick={() => {
                refetchDefs();
                refetchConfigs();
              }}>
              Retry
            </Button>
          }>
          Failed to load approval workflows.
        </Alert>
      ) : rows.length === 0 ? (
        <EmptyListing icon={<GitBranch size={48} />} title="No approval workflows" description="There are no workflow types available to configure for this organization." />
      ) : (
        <ListingTable.Container>
          <ListingTable>
            <ListingTable.Head>
              <ListingTable.Row>
                <ListingTable.Cell>Workflow</ListingTable.Cell>
                <ListingTable.Cell>Description</ListingTable.Cell>
                <ListingTable.Cell>Status</ListingTable.Cell>
                <ListingTable.Cell align="right">Action</ListingTable.Cell>
              </ListingTable.Row>
            </ListingTable.Head>
            <ListingTable.Body>
              {rows.map((row) => (
                <ListingTable.Row key={row.definition.id}>
                  <ListingTable.Cell>{row.definition.name}</ListingTable.Cell>
                  <ListingTable.Cell>{row.definition.description}</ListingTable.Cell>
                  <ListingTable.Cell>
                    <Authorized permissions={Permissions.USER_MANAGE_ROLES} fallback={<Chip label={row.enabled ? 'Enabled' : 'Disabled'} size="small" color={row.enabled ? 'success' : 'default'} variant="outlined" />}>
                      <Switch checked={row.enabled} onChange={(e) => handleToggle(row, e.target.checked)} disabled={disableMutation.isPending} inputProps={{ 'aria-label': `Toggle ${row.definition.name}` }} />
                    </Authorized>
                  </ListingTable.Cell>
                  <ListingTable.Cell align="right">
                    <Authorized permissions={Permissions.USER_MANAGE_ROLES}>
                      <Tooltip title="Configure approvers">
                        <span>
                          <IconButton size="small" aria-label={`Configure ${row.definition.name}`} disabled={!row.enabled} onClick={() => setConfiguring({ definition: row.definition, config: row.config })}>
                            <Pencil size={16} />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Authorized>
                  </ListingTable.Cell>
                </ListingTable.Row>
              ))}
            </ListingTable.Body>
          </ListingTable>
        </ListingTable.Container>
      )}

      {configuring && (
        <ConfigureWorkflowDialog
          orgHandler={org}
          definition={configuring.definition}
          existingConfig={configuring.config}
          onClose={() => setConfiguring(null)}
          onSaved={(name) => setAlert({ type: 'success', message: `'${name}' updated.` })}
          onError={(message) => setAlert({ type: 'error', message })}
        />
      )}

      {disabling && (
        <Dialog open onClose={() => setDisabling(null)} maxWidth="xs" fullWidth>
          <DialogTitle>Disable &lsquo;{disabling.definition.name}&rsquo;?</DialogTitle>
          <DialogContent>
            <DialogContentText>Requests of this type will no longer require approval.</DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDisabling(null)} disabled={disableMutation.isPending}>
              Cancel
            </Button>
            <Button variant="contained" color="error" onClick={handleDisable} disabled={disableMutation.isPending} startIcon={disableMutation.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
              {disableMutation.isPending ? 'Disabling…' : 'Disable'}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </PageContent>
  );
}
