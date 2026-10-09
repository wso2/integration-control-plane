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

import { Alert, Button, CircularProgress, IconButton, MenuItem, PageContent, Select, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import TextField from '../../components/common/TextField';
import { ArrowLeft, Eye, FileText, Pencil, Trash2, Upload } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { useParams } from 'react-router';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useCreateRuleset, useRuleset, useRulesetContent, useRulesets, useUpdateRuleset } from '../hooks/useGovernance';
import FieldLabel from '../components/Governance/FieldLabel';
import GovernanceFormSkeleton from '../components/Governance/GovernanceFormSkeleton';
import RulesetEditor from '../components/Governance/RulesetEditor';
import { orgGovernanceUrl } from '../../paths';
import { RulesetAppliesTo, type Ruleset } from '../../types/governance';
import type { OrgScope } from '../../nav';

// Documentation-link validator — matches Devant's permissive URL regex.
const urlRegex = /^(http(s)?:\/\/)?(www\.)?(localhost|[a-zA-Z0-9@:%._+~#=]{2,256}\.[a-z]{2,6}\b)([-a-zA-Z0-9@:%_+.~#?&//=]*)$/;

const appliesToOptions = [
  { value: RulesetAppliesTo.API_DEFINITIONS, label: 'API Definitions' },
  { value: RulesetAppliesTo.API_METADATA, label: 'API Metadata' },
  { value: RulesetAppliesTo.DOCUMENTATION, label: 'Documentation' },
];

const artifactTypeOptions = [
  { value: 'http_api', label: 'HTTP API' },
  { value: 'all_apis', label: 'All APIs' },
];

/** Governance API 400s carry a JSON envelope in the thrown message; surface it verbatim. */
function parseRulesetError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const jsonStart = error.message.indexOf('{');
  if (jsonStart === -1) return fallback;
  try {
    const parsed = JSON.parse(error.message.slice(jsonStart)) as { message?: string; description?: string };
    return [parsed.message, parsed.description].filter(Boolean).join(': ') || fallback;
  } catch {
    return fallback;
  }
}

export default function CreateRuleset(scope: OrgScope): JSX.Element {
  const navigate = useAppNavigate();
  const { rulesetId } = useParams<{ rulesetId?: string }>();
  const isEditing = !!rulesetId;

  const { data: currentRuleset, isLoading: rulesetLoading, isError: rulesetError, refetch: refetchRuleset } = useRuleset(rulesetId ?? '');
  const { data: rulesetContentData } = useRulesetContent(rulesetId ?? '');
  const { data: rulesetListData, isLoading: rulesetListLoading } = useRulesets();

  const createRuleset = useCreateRuleset();
  const updateRuleset = useUpdateRuleset();

  const [name, setName] = useState('');
  const [appliesTo, setAppliesTo] = useState<RulesetAppliesTo>(RulesetAppliesTo.API_DEFINITIONS);
  const [artifactType, setArtifactType] = useState('http_api');
  const [description, setDescription] = useState('');
  const [provider, setProvider] = useState('');
  const [docLink, setDocLink] = useState('');
  const [rulesetContent, setRulesetContent] = useState('');
  const [isChanged, setIsChanged] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const readonly = !!currentRuleset?.isDefault;

  // Seed metadata fields from the loaded ruleset when editing.
  useEffect(() => {
    if (currentRuleset) {
      setName(currentRuleset.name);
      setAppliesTo(currentRuleset.appliesTo);
      setArtifactType(currentRuleset.artifactType ?? 'http_api');
      setDescription(currentRuleset.description);
      setProvider(currentRuleset.provider);
      setDocLink(currentRuleset.documentationLink);
    }
  }, [currentRuleset]);

  // Seed editor content from the dedicated raw-text endpoint.
  useEffect(() => {
    if (typeof rulesetContentData === 'string') {
      setRulesetContent(rulesetContentData);
    }
  }, [rulesetContentData]);

  const rulesets = useMemo(() => rulesetListData?.list ?? [], [rulesetListData]);
  const isNameDuplicate = useMemo(() => rulesets.some((r) => r.name === name && r.id !== currentRuleset?.id), [rulesets, name, currentRuleset]);
  const isDocLinkValid = !docLink || urlRegex.test(docLink.trim());

  const goBack = () => navigate(orgGovernanceUrl(scope.org));

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        setRulesetContent(reader.result);
        setIsChanged(true);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleEditorChange = (value: string) => {
    setRulesetContent(value);
    setIsChanged(true);
  };

  const handleSave = () => {
    setSubmitError(null);
    const payload: Ruleset = {
      name,
      appliesTo,
      artifactType,
      description,
      documentationLink: docLink,
      provider,
      rulesetContent,
    };
    if (isEditing && currentRuleset && rulesetId) {
      updateRuleset.mutate(
        { rulesetId, ruleset: { ...currentRuleset, ...payload } },
        {
          onSuccess: goBack,
          onError: (err) => setSubmitError(parseRulesetError(err, 'Failed to update ruleset')),
        },
      );
    } else {
      createRuleset.mutate(payload, {
        onSuccess: goBack,
        onError: (err) => setSubmitError(parseRulesetError(err, 'Failed to create ruleset')),
      });
    }
  };

  // `isSuccess` keeps the control disabled through the deferred navigation:
  // the mutation settles before the route changes, which would otherwise re-enable
  // submit and allow a duplicate.
  const isSaving = createRuleset.isPending || updateRuleset.isPending || createRuleset.isSuccess || updateRuleset.isSuccess;
  const canSave = !!name && !!appliesTo && !!provider && !!rulesetContent && isChanged && !isNameDuplicate && isDocLinkValid && !readonly;

  if (isEditing && (rulesetLoading || rulesetListLoading)) {
    return (
      <PageContent>
        <Button startIcon={<ArrowLeft size={16} />} onClick={goBack} sx={{ mb: 2 }} disabled>
          Back to governance
        </Button>
        <GovernanceFormSkeleton />
      </PageContent>
    );
  }

  if (isEditing && rulesetError) {
    return (
      <PageContent>
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => refetchRuleset()}>
              Retry
            </Button>
          }>
          Failed to load ruleset.
        </Alert>
      </PageContent>
    );
  }

  if (isEditing && !currentRuleset) {
    return (
      <PageContent>
        <Button startIcon={<ArrowLeft size={16} />} onClick={goBack} sx={{ mb: 2 }}>
          Back to governance
        </Button>
        <Alert severity="warning">Ruleset not found.</Alert>
      </PageContent>
    );
  }

  return (
    <PageContent>
      <Button startIcon={<ArrowLeft size={16} />} onClick={goBack} sx={{ mb: 2 }}>
        Back to governance
      </Button>

      <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
        {isEditing ? 'Ruleset Details' : 'Create Spectral Ruleset'}
      </Typography>

      <Stack gap={3} sx={{ maxWidth: 720 }}>
        <Stack gap={0.5}>
          <FieldLabel required>Name</FieldLabel>
          <TextField
            fullWidth
            placeholder="Enter ruleset name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setIsChanged(true);
            }}
            disabled={readonly}
            error={isNameDuplicate}
            helperText={isNameDuplicate ? 'Ruleset name already exists' : undefined}
          />
        </Stack>

        <Stack direction="row" gap={2}>
          <Stack gap={0.5} flex={1}>
            <FieldLabel required>Applies To</FieldLabel>
            <Select
              value={appliesTo}
              disabled={readonly}
              onChange={(e) => {
                setAppliesTo(e.target.value as RulesetAppliesTo);
                setIsChanged(true);
              }}>
              {appliesToOptions.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </Select>
          </Stack>
          <Stack gap={0.5} flex={1}>
            <FieldLabel>Artifact Type</FieldLabel>
            <Select
              value={artifactType}
              disabled={readonly}
              onChange={(e) => {
                setArtifactType(e.target.value);
                setIsChanged(true);
              }}>
              {artifactTypeOptions.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </Select>
          </Stack>
        </Stack>

        <Stack gap={0.5}>
          <FieldLabel optional>Description</FieldLabel>
          <TextField
            fullWidth
            multiline
            minRows={3}
            placeholder="Enter description"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setIsChanged(true);
            }}
            disabled={readonly}
          />
        </Stack>

        <Stack gap={0.5}>
          <FieldLabel required>Provider</FieldLabel>
          <TextField
            fullWidth
            placeholder="John Doe"
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value);
              setIsChanged(true);
            }}
            disabled={readonly}
          />
        </Stack>

        <Stack gap={0.5}>
          <FieldLabel optional>Documentation Link</FieldLabel>
          <TextField
            fullWidth
            placeholder="https://example.com"
            value={docLink}
            onChange={(e) => {
              setDocLink(e.target.value);
              setIsChanged(true);
            }}
            disabled={readonly}
            error={!isDocLinkValid}
            helperText={!isDocLinkValid ? 'Invalid Documentation URL' : undefined}
          />
        </Stack>

        <Stack gap={1}>
          <FieldLabel required>Spectral Ruleset</FieldLabel>
          {rulesetContent ? (
            <Stack direction="row" alignItems="center" gap={1} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 1.5, py: 1 }}>
              <FileText size={18} />
              <Typography variant="body2" sx={{ flexGrow: 1 }}>
                Ruleset content loaded
              </Typography>
              <Tooltip title={readonly ? 'View Ruleset' : 'Edit Ruleset'}>
                <IconButton size="small" onClick={() => setIsEditorOpen(true)}>
                  {readonly ? <Eye size={16} /> : <Pencil size={16} />}
                </IconButton>
              </Tooltip>
              {!readonly && (
                <Tooltip title="Remove Ruleset">
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => {
                      setRulesetContent('');
                      setIsChanged(true);
                    }}>
                    <Trash2 size={16} />
                  </IconButton>
                </Tooltip>
              )}
            </Stack>
          ) : (
            !readonly && (
              <Stack direction="row" gap={1}>
                <Button variant="outlined" startIcon={<Upload size={18} />} onClick={() => fileInputRef.current?.click()}>
                  Upload .yaml / .json file
                </Button>
                <Button variant="text" startIcon={<Pencil size={18} />} onClick={() => setIsEditorOpen(true)}>
                  Edit in editor
                </Button>
                <input ref={fileInputRef} type="file" accept=".yaml,.yml,.json" hidden onChange={handleFileSelect} />
              </Stack>
            )
          )}
        </Stack>
      </Stack>

      {submitError && (
        <Alert severity="error" sx={{ mt: 3, maxWidth: 720 }}>
          {submitError}
        </Alert>
      )}

      <Stack direction="row" gap={1.5} sx={{ mt: 4 }}>
        <Button variant="outlined" onClick={goBack} disabled={isSaving}>
          Cancel
        </Button>
        {!readonly && (
          <Button variant="contained" onClick={handleSave} disabled={!canSave || isSaving} startIcon={isSaving ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {isEditing ? 'Update' : 'Create'}
          </Button>
        )}
      </Stack>

      <RulesetEditor open={isEditorOpen} fileContent={rulesetContent} onFileContentChange={handleEditorChange} onClose={() => setIsEditorOpen(false)} readOnly={readonly} />
    </PageContent>
  );
}
