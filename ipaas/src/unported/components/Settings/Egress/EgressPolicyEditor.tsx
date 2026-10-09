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

import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, IconButton, ListingTable, Stack, Tooltip } from '@wso2/oxygen-ui';
import TextField from '../../../../components/common/TextField';
import { Plus, ShieldOff, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState, type JSX } from 'react';
import Authorized from '../../../../components/Authorized';
import EmptyListing from '../../../../components/EmptyListing';
import EgressModeSelection from './EgressModeSelection';
import { Permissions } from '../../../../constants/permissions';
import { useCreateEgressPolicy, useDeleteEgressPolicy, useEgressPolicy, useUpdateEgressPolicy } from '../../../hooks/useEgressControl';
import type { EgressMode, EgressRule } from '../../../../types/egressPolicy';
import { buildEgressRequest, createEgressRule, detectRuleType, modeOfPolicy, rulesForMode } from '../../../utils/egressPolicy';

interface EgressPolicyEditorProps {
  /** When set, the policy is scoped to this project (org-scoped when omitted). */
  projectId?: string;
}

export default function EgressPolicyEditor({ projectId }: EgressPolicyEditorProps): JSX.Element {
  const { data: policy, isLoading, isError, refetch } = useEgressPolicy(projectId);
  const create = useCreateEgressPolicy(projectId);
  const update = useUpdateEgressPolicy(projectId);
  const remove = useDeleteEgressPolicy(projectId);

  const [creating, setCreating] = useState(false);
  const [draftMode, setDraftMode] = useState<EgressMode>('allow-all');
  const [ruleName, setRuleName] = useState('');
  const [ruleValue, setRuleValue] = useState('');
  const [formError, setFormError] = useState('');
  const [deletingRule, setDeletingRule] = useState<EgressRule | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const mode: EgressMode = policy ? modeOfPolicy(policy) : draftMode;
  const rules = rulesForMode(policy ?? null, mode);
  const saving = create.isPending || update.isPending;
  const scope = projectId ? 'project' : 'organization';

  // Live validation of the rule value against the active mode.
  const valueError = useMemo(() => {
    const v = ruleValue.trim();
    if (!v) return '';
    const type = detectRuleType(v);
    if (!type) return mode === 'allow-all' ? 'Enter a valid CIDR range (e.g. 10.0.0.0/24).' : 'Enter a valid CIDR range (e.g. 10.0.0.0/24) or domain (e.g. api.example.com).';
    if (mode === 'allow-all' && type !== 'CIDR') return 'Allow-all policies accept CIDR ranges only.';
    return '';
  }, [ruleValue, mode]);

  const resetForm = () => {
    setRuleName('');
    setRuleValue('');
    setFormError('');
  };

  const handleAddRule = () => {
    setFormError('');
    let rule: EgressRule;
    try {
      rule = createEgressRule(ruleName.trim(), ruleValue.trim(), mode);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Invalid rule.');
      return;
    }
    const handlers = {
      onSuccess: () => {
        resetForm();
        setCreating(false);
      },
      onError: (e: Error) => setAlert({ type: 'error', message: e.message || 'Failed to save the rule.' }),
    };
    if (policy) update.mutate({ policyId: policy.id, input: buildEgressRequest(mode, [...rules, rule], policy.id) }, handlers);
    else create.mutate(buildEgressRequest(mode, [rule]), handlers);
  };

  const handleDeleteRule = () => {
    if (!policy || !deletingRule) return;
    const remaining = rules.filter((r) => r.rule_id !== deletingRule.rule_id);
    const handlers = {
      onSuccess: () => {
        setDeletingRule(null);
        setAlert({ type: 'success', message: 'Rule removed.' });
      },
      onError: (e: Error) => {
        setDeletingRule(null);
        setAlert({ type: 'error', message: e.message || 'Failed to remove the rule.' });
      },
    };
    if (remaining.length > 0) update.mutate({ policyId: policy.id, input: buildEgressRequest(mode, remaining, policy.id) }, handlers);
    else remove.mutate(policy.id, handlers);
  };

  const showEditor = !!policy || creating;

  return (
    <>
      {alert && (
        <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 2 }}>
          {alert.message}
        </Alert>
      )}

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
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
          Failed to load the egress policy.
        </Alert>
      ) : !showEditor ? (
        <Authorized permissions={Permissions.ENVIRONMENT_MANAGE} fallback={<EmptyListing icon={<ShieldOff size={48} />} title="No egress policy" description={`No egress policy is configured for this ${scope}.`} />}>
          <EmptyListing icon={<ShieldOff size={48} />} title="No egress policy" description={`Create an egress policy to control outbound traffic from this ${scope}'s integrations.`} showAction actionLabel="Create Policy" onAction={() => setCreating(true)} />
        </Authorized>
      ) : (
        <>
          <EgressModeSelection value={mode} onChange={setDraftMode} locked={!!policy} />

          <Authorized permissions={Permissions.ENVIRONMENT_MANAGE}>
            <Stack direction="row" gap={1} alignItems="flex-start" sx={{ mb: 3 }}>
              <TextField label="Rule name" value={ruleName} onChange={(e) => setRuleName(e.target.value)} size="small" sx={{ flex: 1 }} />
              <TextField label={mode === 'allow-all' ? 'CIDR' : 'CIDR or domain'} value={ruleValue} onChange={(e) => setRuleValue(e.target.value)} size="small" sx={{ flex: 1 }} error={!!valueError || !!formError} helperText={valueError || formError || ' '} />
              <Button
                variant="contained"
                startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <Plus size={16} />}
                onClick={handleAddRule}
                disabled={!ruleName.trim() || !ruleValue.trim() || !!valueError || saving}
                sx={{ mt: 0.5, whiteSpace: 'nowrap' }}>
                Add rule
              </Button>
            </Stack>
          </Authorized>

          {rules.length === 0 ? (
            <EmptyListing icon={<ShieldOff size={48} />} title="No rules yet" description={mode === 'allow-all' ? 'Add a CIDR range to deny specific outbound destinations.' : 'Add a CIDR range or domain to allow specific outbound destinations.'} />
          ) : (
            <ListingTable.Container>
              <ListingTable>
                <ListingTable.Head>
                  <ListingTable.Row>
                    <ListingTable.Cell>Name</ListingTable.Cell>
                    <ListingTable.Cell>Destination</ListingTable.Cell>
                    <ListingTable.Cell>Type</ListingTable.Cell>
                    <ListingTable.Cell>Added</ListingTable.Cell>
                    <ListingTable.Cell align="right">Action</ListingTable.Cell>
                  </ListingTable.Row>
                </ListingTable.Head>
                <ListingTable.Body>
                  {rules.map((r) => (
                    <ListingTable.Row key={r.rule_id}>
                      <ListingTable.Cell>{r.name}</ListingTable.Cell>
                      <ListingTable.Cell>{r.value}</ListingTable.Cell>
                      <ListingTable.Cell>
                        <Chip label={r.type} size="small" variant="outlined" />
                      </ListingTable.Cell>
                      <ListingTable.Cell>{new Date(r.created_at).toLocaleDateString()}</ListingTable.Cell>
                      <ListingTable.Cell align="right">
                        <Authorized permissions={Permissions.ENVIRONMENT_MANAGE}>
                          <Tooltip title="Delete rule">
                            <IconButton size="small" color="error" aria-label={`Delete ${r.name}`} onClick={() => setDeletingRule(r)}>
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
          )}
        </>
      )}

      {deletingRule && (
        <Dialog open onClose={() => setDeletingRule(null)} maxWidth="xs" fullWidth>
          <DialogTitle>Delete rule &lsquo;{deletingRule.name}&rsquo;?</DialogTitle>
          <DialogContent>
            <DialogContentText>{rules.length === 1 ? 'This is the last rule — removing it deletes the egress policy entirely.' : 'This removes the rule from the egress policy.'}</DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeletingRule(null)} disabled={saving || remove.isPending}>
              Cancel
            </Button>
            <Button variant="contained" color="error" onClick={handleDeleteRule} disabled={saving || remove.isPending} startIcon={saving || remove.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
              Delete
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}
