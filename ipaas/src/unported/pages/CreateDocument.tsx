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
import { ArrowLeft, Download, FileText, Trash2, Upload } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useRef, useState, type JSX } from 'react';
import { useParams } from 'react-router';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useCreateDocument, useDocument, useUpdateDocument } from '../hooks/useGovernance';
import FieldLabel from '../components/Governance/FieldLabel';
import GovernanceFormSkeleton from '../components/Governance/GovernanceFormSkeleton';
import { orgGovernanceUrl } from '../../paths';
import { RulesetAppliesTo, type DocumentInfo } from '../../types/governance';
import type { OrgScope } from '../../nav';

const appliesToLabels: Record<RulesetAppliesTo, string> = {
  [RulesetAppliesTo.API_DEFINITIONS]: 'API Definitions',
  [RulesetAppliesTo.API_METADATA]: 'API Metadata',
  [RulesetAppliesTo.DOCUMENTATION]: 'Documentation',
};

export default function CreateDocument(scope: OrgScope): JSX.Element {
  const navigate = useAppNavigate();
  const { documentId } = useParams<{ documentId?: string }>();
  const isEditing = !!documentId;

  const { data: currentDocument, isLoading: documentLoading, isError: documentError, refetch: refetchDocument } = useDocument(documentId ?? '');

  const createDocument = useCreateDocument();
  const updateDocument = useUpdateDocument();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [appliesTo, setAppliesTo] = useState<RulesetAppliesTo>(RulesetAppliesTo.API_DEFINITIONS);
  const [content, setContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [isChanged, setIsChanged] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const readonly = !!currentDocument?.isDefault;

  // Seed fields from the loaded document when editing. Content is base64 —
  // we keep it as-is and show the filename rather than re-rendering the PDF.
  useEffect(() => {
    if (currentDocument) {
      setName(currentDocument.name);
      setDescription(currentDocument.description);
      setAppliesTo(currentDocument.appliesTo);
      setContent(currentDocument.content);
      setFileName(`${currentDocument.name}.pdf`);
    }
  }, [currentDocument]);

  const goBack = () => navigate(orgGovernanceUrl(scope.org));

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        // readAsDataURL gives "data:application/pdf;base64,XXXX" — keep only the base64 part.
        const base64 = reader.result.split(',')[1] ?? '';
        setContent(base64);
        setIsChanged(true);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemoveFile = () => {
    setContent('');
    setFileName('');
    setIsChanged(true);
  };

  const handleDownload = () => {
    const element = document.createElement('a');
    element.href = `data:application/pdf;base64,${content}`;
    element.download = fileName || `${name}.pdf`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleSave = () => {
    setSubmitError(null);
    const payload: DocumentInfo = { name, description, appliesTo, content };
    if (isEditing && currentDocument && documentId) {
      updateDocument.mutate(
        { documentId, document: { ...currentDocument, ...payload } },
        {
          onSuccess: goBack,
          onError: () => setSubmitError('Failed to update document'),
        },
      );
    } else {
      createDocument.mutate(payload, {
        onSuccess: goBack,
        onError: () => setSubmitError('Failed to create document'),
      });
    }
  };

  // `isSuccess` keeps the control disabled through the deferred navigation:
  // the mutation settles before the route changes, which would otherwise re-enable
  // submit and allow a duplicate.
  const isSaving = createDocument.isPending || updateDocument.isPending || createDocument.isSuccess || updateDocument.isSuccess;
  const canSave = !!name.trim() && !!appliesTo && !!content && !!description && isChanged && !readonly;

  if (isEditing && documentLoading) {
    return (
      <PageContent>
        <Button startIcon={<ArrowLeft size={16} />} onClick={goBack} sx={{ mb: 2 }} disabled>
          Back to governance
        </Button>
        <GovernanceFormSkeleton />
      </PageContent>
    );
  }

  if (isEditing && documentError) {
    return (
      <PageContent>
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => refetchDocument()}>
              Retry
            </Button>
          }>
          Failed to load document.
        </Alert>
      </PageContent>
    );
  }

  if (isEditing && !currentDocument) {
    return (
      <PageContent>
        <Button startIcon={<ArrowLeft size={16} />} onClick={goBack} sx={{ mb: 2 }}>
          Back to governance
        </Button>
        <Alert severity="warning">Document not found.</Alert>
      </PageContent>
    );
  }

  return (
    <PageContent>
      <Button startIcon={<ArrowLeft size={16} />} onClick={goBack} sx={{ mb: 2 }}>
        Back to governance
      </Button>

      <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
        {isEditing ? 'Document Details' : 'Create Document'}
      </Typography>

      {readonly && (
        <Alert severity="info" sx={{ mb: 3, maxWidth: 720 }}>
          Default document cannot be edited.
        </Alert>
      )}

      <Stack gap={3} sx={{ maxWidth: 720 }}>
        <Stack gap={0.5}>
          <FieldLabel required>Name</FieldLabel>
          <TextField
            fullWidth
            placeholder="Enter Name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setIsChanged(true);
            }}
            disabled={readonly}
          />
        </Stack>

        <Stack gap={1}>
          <FieldLabel required>Document</FieldLabel>
          {content ? (
            <Stack direction="row" alignItems="center" gap={1} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 1.5, py: 1 }}>
              <FileText size={18} />
              <Typography variant="body2" sx={{ flexGrow: 1 }}>
                {fileName || 'Selected document'}
              </Typography>
              {isEditing && (
                <Tooltip title="Download Document">
                  <IconButton size="small" onClick={handleDownload}>
                    <Download size={16} />
                  </IconButton>
                </Tooltip>
              )}
              {!readonly && (
                <Tooltip title="Remove Document">
                  <IconButton size="small" color="error" onClick={handleRemoveFile}>
                    <Trash2 size={16} />
                  </IconButton>
                </Tooltip>
              )}
            </Stack>
          ) : (
            !readonly && (
              <Stack direction="row">
                <Button variant="outlined" startIcon={<Upload size={18} />} onClick={() => fileInputRef.current?.click()}>
                  Upload .pdf file
                </Button>
                <input ref={fileInputRef} type="file" accept=".pdf" hidden onChange={handleFileSelect} />
              </Stack>
            )
          )}
        </Stack>

        <Stack gap={0.5}>
          <FieldLabel required>Description</FieldLabel>
          <TextField
            fullWidth
            multiline
            minRows={3}
            placeholder="Enter Description"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setIsChanged(true);
            }}
            disabled={readonly}
          />
        </Stack>

        <Stack direction="row" gap={2}>
          <Stack gap={0.5} flex={1}>
            <FieldLabel>Applies To</FieldLabel>
            <Select value={appliesTo} disabled>
              {Object.values(RulesetAppliesTo).map((v) => (
                <MenuItem key={v} value={v}>
                  {appliesToLabels[v]}
                </MenuItem>
              ))}
            </Select>
          </Stack>
          <Stack gap={0.5} flex={1}>
            <FieldLabel>Artifact Type</FieldLabel>
            <Select value="http_api" disabled>
              <MenuItem value="http_api">HTTP API</MenuItem>
            </Select>
          </Stack>
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
    </PageContent>
  );
}
