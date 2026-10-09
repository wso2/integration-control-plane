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

import { Alert, Button, Chip, CircularProgress, FormControlLabel, PageContent, Radio, RadioGroup, Stack, Typography } from '@wso2/oxygen-ui';
import TextField from '../../components/common/TextField';
import { ArrowLeft } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useState, type JSX } from 'react';
import { useParams } from 'react-router';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useCreatePolicy, usePolicies, usePolicy, useRulesets, useUpdatePolicy } from '../hooks/useGovernance';
import EnforcementDetailsTable from '../components/Governance/EnforcementDetailsTable';
import FieldLabel from '../components/Governance/FieldLabel';
import GovernanceCard from '../components/Governance/GovernanceCard';
import GovernanceCatalog from '../components/Governance/GovernanceCatalog';
import GovernanceFormSkeleton from '../components/Governance/GovernanceFormSkeleton';
import SearchField from '../../components/SearchField';
import { orgGovernanceUrl } from '../../paths';
import { PolicyType, type GovernancePolicyInfo, type RulesetInfo } from '../../types/governance';
import type { OrgScope } from '../../nav';

export default function CreatePolicy(scope: OrgScope): JSX.Element {
  const navigate = useAppNavigate();
  const { policyId } = useParams<{ policyId?: string }>();
  const isEditing = !!policyId;

  const { data: currentPolicy, isLoading: policyLoading, isError: policyError, refetch: refetchPolicy } = usePolicy(policyId ?? '');
  const { data: policyListData, isLoading: policyListLoading } = usePolicies();
  const { data: rulesetsData, isLoading: rulesetsLoading, isError: rulesetsError, refetch: refetchRulesets } = useRulesets();

  const createPolicy = useCreatePolicy();
  const updatePolicy = useUpdatePolicy();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedItems, setSelectedItems] = useState<RulesetInfo[]>([]);
  const [isChanged, setIsChanged] = useState(false);
  const [search, setSearch] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Seed the form from the loaded policy when editing.
  useEffect(() => {
    if (currentPolicy) {
      setName(currentPolicy.name);
      setDescription(currentPolicy.description);
      setSelectedItems(currentPolicy.rulesets ?? []);
    }
  }, [currentPolicy]);

  const rulesets = useMemo(() => rulesetsData?.list ?? [], [rulesetsData]);
  const policies = useMemo(() => policyListData?.list ?? [], [policyListData]);

  const isNameDuplicate = useMemo(() => policies.some((p) => p.name === name && p.id !== currentPolicy?.id), [policies, name, currentPolicy]);

  const filteredRulesets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rulesets;
    return rulesets.filter((r) => [r.name, r.description].some((f) => (f ?? '').toLowerCase().includes(q)));
  }, [rulesets, search]);

  const selectedIds = useMemo(() => new Set(selectedItems.map((r) => r.id)), [selectedItems]);

  const goBack = () => navigate(orgGovernanceUrl(scope.org));

  const handleToggleSelect = (ruleset: RulesetInfo) => {
    setIsChanged(true);
    setSelectedItems((prev) => (prev.some((r) => r.id === ruleset.id) ? prev.filter((r) => r.id !== ruleset.id) : [...prev, ruleset]));
  };

  const handleRemove = (ruleset: RulesetInfo) => {
    setIsChanged(true);
    setSelectedItems((prev) => prev.filter((r) => r.id !== ruleset.id));
  };

  const handleSave = () => {
    setSubmitError(null);
    const basePolicy: GovernancePolicyInfo = {
      name,
      description,
      policyType: PolicyType.RULESET,
      rulesets: selectedItems,
      labels: [],
    };
    if (isEditing && currentPolicy && policyId) {
      updatePolicy.mutate(
        { policyId, policy: { ...currentPolicy, ...basePolicy } },
        {
          onSuccess: goBack,
          onError: () => setSubmitError('Failed to update policy'),
        },
      );
    } else {
      createPolicy.mutate(basePolicy, {
        onSuccess: goBack,
        onError: () => setSubmitError('Failed to create policy'),
      });
    }
  };

  // `isSuccess` keeps the control disabled through the deferred navigation:
  // the mutation settles before the route changes, which would otherwise re-enable
  // submit and allow a duplicate.
  const isSaving = createPolicy.isPending || updatePolicy.isPending || createPolicy.isSuccess || updatePolicy.isSuccess;
  const canSave = !!name && selectedItems.length > 0 && isChanged && !isNameDuplicate;

  // Edit mode: show loading and not-found states before rendering the form.
  if (isEditing && (policyLoading || policyListLoading)) {
    return (
      <PageContent>
        <Button startIcon={<ArrowLeft size={16} />} onClick={goBack} sx={{ mb: 2 }} disabled>
          Back to governance
        </Button>
        <GovernanceFormSkeleton />
      </PageContent>
    );
  }

  if (isEditing && policyError) {
    return (
      <PageContent>
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => refetchPolicy()}>
              Retry
            </Button>
          }>
          Failed to load policy.
        </Alert>
      </PageContent>
    );
  }

  if (isEditing && !currentPolicy) {
    return (
      <PageContent>
        <Button startIcon={<ArrowLeft size={16} />} onClick={goBack} sx={{ mb: 2 }}>
          Back to governance
        </Button>
        <Alert severity="warning">Policy not found.</Alert>
      </PageContent>
    );
  }

  return (
    <PageContent>
      <Button startIcon={<ArrowLeft size={16} />} onClick={goBack} sx={{ mb: 2 }}>
        Back to governance
      </Button>

      <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
        {isEditing ? 'Policy Details' : 'Create Policy'}
      </Typography>

      <Stack gap={3} sx={{ maxWidth: 720 }}>
        <Stack gap={0.5}>
          <FieldLabel required>Name</FieldLabel>
          <TextField
            fullWidth
            placeholder="Enter Name"
            value={name}
            onChange={(e) => {
              setIsChanged(true);
              setName(e.target.value);
            }}
            error={isNameDuplicate}
            helperText={isNameDuplicate ? 'Policy name already exists' : undefined}
          />
        </Stack>

        <Stack gap={0.5}>
          <FieldLabel optional>Description</FieldLabel>
          <TextField
            fullWidth
            multiline
            minRows={3}
            placeholder="Enter Description"
            value={description}
            onChange={(e) => {
              setIsChanged(true);
              setDescription(e.target.value);
            }}
          />
        </Stack>

        <Stack gap={1}>
          <Typography variant="body2">Applicability</Typography>
          <RadioGroup row value="global">
            <FormControlLabel value="global" control={<Radio />} label="Global" />
            <FormControlLabel value="specify" control={<Radio />} label="Specify" disabled />
          </RadioGroup>
        </Stack>

        <Stack gap={1}>
          <Typography variant="body2">Enforcement Details</Typography>
          <EnforcementDetailsTable />
        </Stack>
      </Stack>

      <Stack gap={2} sx={{ mt: 4 }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Select Rulesets
        </Typography>

        {selectedItems.length > 0 && (
          <Stack gap={1} mb={1}>
            <Typography variant="body2">Added Rulesets</Typography>
            <Stack direction="row" gap={1} flexWrap="wrap">
              {selectedItems.map((item) => (
                <Chip key={item.id} label={item.name} variant="outlined" color="primary" onDelete={() => handleRemove(item)} />
              ))}
            </Stack>
          </Stack>
        )}

        <SearchField value={search} onChange={setSearch} placeholder="Search..." fullWidth />

        {rulesetsLoading ? (
          <CircularProgress sx={{ display: 'block', mx: 'auto', py: 8 }} />
        ) : rulesetsError ? (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => refetchRulesets()}>
                Retry
              </Button>
            }>
            Failed to load rulesets.
          </Alert>
        ) : (
          <GovernanceCatalog
            items={filteredRulesets}
            renderCard={(ruleset) => {
              const id = ruleset.id;
              if (!id) return null;
              return (
                <GovernanceCard
                  id={id}
                  name={ruleset.name}
                  description={ruleset.description}
                  isDefault={ruleset.isDefault}
                  provider={ruleset.provider}
                  documentationLink={ruleset.documentationLink}
                  selected={selectedIds.has(id)}
                  onToggleSelect={() => handleToggleSelect(ruleset)}
                />
              );
            }}
            emptyMessage="No rulesets found."
            itemsPerPageLabel="Rulesets per page"
          />
        )}
      </Stack>

      {submitError && (
        <Alert severity="error" sx={{ mt: 3 }}>
          {submitError}
        </Alert>
      )}

      <Stack direction="row" gap={1.5} sx={{ mt: 4 }}>
        <Button variant="outlined" onClick={goBack} disabled={isSaving}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={!canSave || isSaving} startIcon={isSaving ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {isEditing ? 'Update' : 'Create'}
        </Button>
      </Stack>
    </PageContent>
  );
}
