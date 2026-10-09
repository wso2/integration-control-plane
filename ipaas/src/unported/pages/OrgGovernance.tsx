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

import { Alert, Button, Divider, Grid, PageContent, PageTitle, Skeleton, Stack, Typography } from '@wso2/oxygen-ui';
import { Plus } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState, type JSX } from 'react';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { usePolicies, useRulesets, useDocuments, useDeletePolicy, useDeleteRuleset, useDeleteDocument } from '../hooks/useGovernance';
import AddPolicyDialog from '../components/Governance/AddPolicyDialog';
import DeleteGovernanceDialog from '../components/Governance/DeleteGovernanceDialog';
import GovernanceCard, { GOVERNANCE_CARD_HEIGHT } from '../components/Governance/GovernanceCard';
import GovernanceCatalog from '../components/Governance/GovernanceCatalog';
import PolicyTable from '../components/Governance/PolicyTable';
import PillTabs from '../../components/PillTabs';
import SearchField from '../../components/SearchField';
import { orgGovernanceNewPolicyUrl, orgGovernanceNewAiPolicyUrl, orgGovernanceNewRulesetUrl, orgGovernanceNewDocumentUrl, orgGovernancePolicyUrl, orgGovernanceRulesetUrl, orgGovernanceDocumentUrl } from '../../paths';
import type { OrgScope } from '../../nav';
import type { GovernancePolicyInfo, RulesetInfo, DocumentInfo } from '../../types/governance';

function PolicyListSkeleton(): JSX.Element {
  return (
    <Stack gap={1} aria-busy="true" aria-label="Loading policies">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} variant="rounded" height={48} />
      ))}
    </Stack>
  );
}

function CatalogGridSkeleton(): JSX.Element {
  return (
    <Grid container spacing={2} aria-busy="true" aria-label="Loading">
      {Array.from({ length: 4 }).map((_, i) => (
        <Grid key={i} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
          <Skeleton variant="rounded" height={GOVERNANCE_CARD_HEIGHT} />
        </Grid>
      ))}
    </Grid>
  );
}

export default function OrgGovernance(scope: OrgScope): JSX.Element {
  const navigate = useAppNavigate();
  const { data: policiesData, isLoading: policiesLoading, isError: policiesError, refetch: refetchPolicies } = usePolicies();
  const { data: rulesetsData, isLoading: rulesetsLoading, isError: rulesetsError, refetch: refetchRulesets } = useRulesets();
  const { data: documentsData, isLoading: documentsLoading, isError: documentsError, refetch: refetchDocuments } = useDocuments();

  const deletePolicyMutation = useDeletePolicy();
  const deleteRulesetMutation = useDeleteRuleset();
  const deleteDocumentMutation = useDeleteDocument();

  const [policySearch, setPolicySearch] = useState('');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogTab, setCatalogTab] = useState(0);
  const [addPolicyOpen, setAddPolicyOpen] = useState(false);
  const [toDeletePolicy, setToDeletePolicy] = useState<GovernancePolicyInfo | null>(null);
  const [toDeleteRuleset, setToDeleteRuleset] = useState<RulesetInfo | null>(null);
  const [toDeleteDocument, setToDeleteDocument] = useState<DocumentInfo | null>(null);

  const policies = useMemo(() => policiesData?.list ?? [], [policiesData]);
  const rulesets = useMemo(() => rulesetsData?.list ?? [], [rulesetsData]);
  const documents = useMemo(() => documentsData?.list ?? [], [documentsData]);

  const filteredPolicies = useMemo(() => {
    const q = policySearch.trim().toLowerCase();
    if (!q) return policies;
    return policies.filter((p) => [p.name, p.description].some((f) => (f ?? '').toLowerCase().includes(q)));
  }, [policies, policySearch]);

  const catalogQuery = catalogSearch.trim().toLowerCase();
  const filteredRulesets = useMemo(() => {
    if (!catalogQuery) return rulesets;
    return rulesets.filter((item) => [item.name, item.description].some((f) => (f ?? '').toLowerCase().includes(catalogQuery)));
  }, [rulesets, catalogQuery]);
  const filteredDocuments = useMemo(() => {
    if (!catalogQuery) return documents;
    return documents.filter((item) => [item.name, item.description].some((f) => (f ?? '').toLowerCase().includes(catalogQuery)));
  }, [documents, catalogQuery]);

  const handleAddPolicy = () => {
    setAddPolicyOpen(true);
  };

  const handleAddPolicyRuleset = () => {
    setAddPolicyOpen(false);
    navigate(orgGovernanceNewPolicyUrl(scope.org));
  };

  const handleAddPolicyAi = () => {
    setAddPolicyOpen(false);
    navigate(orgGovernanceNewAiPolicyUrl(scope.org));
  };

  const handleEditPolicy = (policyId: string) => {
    navigate(orgGovernancePolicyUrl(scope.org, policyId));
  };

  const handleDeletePolicy = (policy: GovernancePolicyInfo) => {
    setToDeletePolicy(policy);
  };

  const handleConfirmDeletePolicy = async () => {
    if (!toDeletePolicy?.id) return;
    try {
      await deletePolicyMutation.mutateAsync(toDeletePolicy.id);
      setToDeletePolicy(null);
    } catch (error) {
      console.error('Failed to delete policy:', error);
    }
  };

  const handleEditRuleset = (rulesetId: string) => {
    navigate(orgGovernanceRulesetUrl(scope.org, rulesetId));
  };

  const handleDeleteRuleset = (ruleset: RulesetInfo) => {
    setToDeleteRuleset(ruleset);
  };

  const handleConfirmDeleteRuleset = async () => {
    if (!toDeleteRuleset?.id) return;
    try {
      await deleteRulesetMutation.mutateAsync(toDeleteRuleset.id);
      setToDeleteRuleset(null);
    } catch (error) {
      console.error('Failed to delete ruleset:', error);
    }
  };

  const handleEditDocument = (documentId: string) => {
    navigate(orgGovernanceDocumentUrl(scope.org, documentId));
  };

  const handleDeleteDocument = (document: DocumentInfo) => {
    setToDeleteDocument(document);
  };

  const handleConfirmDeleteDocument = async () => {
    if (!toDeleteDocument?.id) return;
    try {
      await deleteDocumentMutation.mutateAsync(toDeleteDocument.id);
      setToDeleteDocument(null);
    } catch (error) {
      console.error('Failed to delete document:', error);
    }
  };

  return (
    <PageContent>
      <PageTitle>
        <PageTitle.Header>Governance</PageTitle.Header>
      </PageTitle>

      {/* Policies Section */}
      <Stack gap={2} sx={{ mb: 4, mt: 3 }}>
        <Typography variant="subtitle1">Policies</Typography>

        <Typography variant="body2" color="text.secondary">
          Create policies using rulesets or documents to standardize and regulate your artifacts effectively.
        </Typography>

        <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2}>
          {policies.length > 0 && (
            <Stack direction="row" alignItems="center" gap={1.5} ml="auto">
              <SearchField value={policySearch} onChange={setPolicySearch} placeholder="Search policies..." sx={{ minWidth: 220 }} />
              <Button variant="contained" startIcon={<Plus size={20} />} onClick={handleAddPolicy} sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
                Add Policy
              </Button>
            </Stack>
          )}
        </Stack>

        {policiesLoading ? (
          <PolicyListSkeleton />
        ) : policiesError ? (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => refetchPolicies()}>
                Retry
              </Button>
            }>
            Failed to load policies.
          </Alert>
        ) : !policies.length ? (
          <Alert severity="info">
            No policies found.{' '}
            <Button size="small" onClick={handleAddPolicy} sx={{ ml: 1 }}>
              Create your first policy
            </Button>
          </Alert>
        ) : (
          <PolicyTable policies={filteredPolicies} onEdit={handleEditPolicy} onDelete={handleDeletePolicy} />
        )}
      </Stack>

      <Divider sx={{ my: 4 }} />

      {/* Rulesets / Documents Section */}
      <Stack gap={2}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2}>
          <Stack sx={{ minWidth: 260 }}>
            <PillTabs value={catalogTab} onChange={setCatalogTab} tabs={[{ label: 'Rulesets' }, { label: 'Documents' }]} />
          </Stack>
          {(catalogTab === 0 ? rulesets : documents).length > 0 && (
            <Stack direction="row" alignItems="center" gap={1.5}>
              <SearchField value={catalogSearch} onChange={setCatalogSearch} placeholder="Search..." sx={{ minWidth: 220 }} />
              <Button variant="contained" startIcon={<Plus size={20} />} onClick={() => (catalogTab === 0 ? navigate(orgGovernanceNewRulesetUrl(scope.org)) : navigate(orgGovernanceNewDocumentUrl(scope.org)))} sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
                Add {catalogTab === 0 ? 'Ruleset' : 'Document'}
              </Button>
            </Stack>
          )}
        </Stack>

        {catalogTab === 0 ? (
          rulesetsLoading ? (
            <CatalogGridSkeleton />
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
                    onEdit={ruleset.isDefault ? undefined : () => handleEditRuleset(id)}
                    onDelete={ruleset.isDefault ? undefined : () => handleDeleteRuleset(ruleset)}
                  />
                );
              }}
              emptyMessage="No rulesets found."
              itemsPerPageLabel="Rulesets per page"
            />
          )
        ) : documentsLoading ? (
          <CatalogGridSkeleton />
        ) : documentsError ? (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => refetchDocuments()}>
                Retry
              </Button>
            }>
            Failed to load documents.
          </Alert>
        ) : (
          <GovernanceCatalog
            items={filteredDocuments}
            renderCard={(document) => {
              const id = document.id;
              if (!id) return null;
              return (
                <GovernanceCard
                  id={id}
                  name={document.name}
                  description={document.description}
                  isDefault={document.isDefault}
                  onEdit={document.isDefault ? undefined : () => handleEditDocument(id)}
                  onDelete={document.isDefault ? undefined : () => handleDeleteDocument(document)}
                />
              );
            }}
            emptyMessage="No documents found."
            itemsPerPageLabel="Documents per page"
          />
        )}
      </Stack>

      {/* Dialogs */}
      <AddPolicyDialog open={addPolicyOpen} onClose={() => setAddPolicyOpen(false)} onRulesetPolicy={handleAddPolicyRuleset} onAiPolicy={handleAddPolicyAi} />

      {toDeletePolicy && <DeleteGovernanceDialog resourceName={toDeletePolicy.name} resourceType="policy" onConfirm={handleConfirmDeletePolicy} onClose={() => setToDeletePolicy(null)} isPending={deletePolicyMutation.isPending} />}

      {toDeleteRuleset && <DeleteGovernanceDialog resourceName={toDeleteRuleset.name} resourceType="ruleset" onConfirm={handleConfirmDeleteRuleset} onClose={() => setToDeleteRuleset(null)} isPending={deleteRulesetMutation.isPending} />}

      {toDeleteDocument && <DeleteGovernanceDialog resourceName={toDeleteDocument.name} resourceType="document" onConfirm={handleConfirmDeleteDocument} onClose={() => setToDeleteDocument(null)} isPending={deleteDocumentMutation.isPending} />}
    </PageContent>
  );
}
