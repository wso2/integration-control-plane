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

import { Alert, Button, Card, CardActionArea, Chip, CircularProgress, PageContent, Stack, Typography } from '@wso2/oxygen-ui';
import TextField from '../../components/common/TextField';
import { REQUIRED_FIELD_SX } from '../../constants/styles';
import { Upload } from '@wso2/oxygen-ui-icons-react';
import { useRef, useState, type JSX } from 'react';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useCreateCertificate } from '../hooks/useCertificates';
import { useEnvironmentTemplates } from '../../hooks/useEnvironments';
import { useOrgs } from '../../hooks/useOrg';
import { useOrgUuid } from '../../hooks/useOrgUuid';
import { orgCertificatesUrl } from '../../paths';
import type { OrgScope } from '../../nav';

export default function CreateCertificate(scope: OrgScope): JSX.Element {
  const navigate = useAppNavigate();

  const { data: orgs } = useOrgs();
  const org = orgs?.find((o) => o.handle === scope.org);
  const tokenOrgUuid = useOrgUuid();
  const orgUuid = org?.uuid ?? tokenOrgUuid ?? '';
  const orgId = org?.numericId ? String(org.numericId) : '';

  const { data: templates } = useEnvironmentTemplates(orgId);
  const createMutation = useCreateCertificate();

  const [certName, setCertName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [certBase64, setCertBase64] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const envTemplateIds = (templates ?? []).map((t) => t.id);

  // Same constraints as Devant's certificate upload: .pem only, 20 MB cap.
  const MAX_FILE_MB = 20;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pem')) {
      setFileError('Only .pem files are supported.');
      e.target.value = '';
      return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setFileError(`File exceeds the ${MAX_FILE_MB} MB limit.`);
      e.target.value = '';
      return;
    }

    setFileError('');
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      setCertBase64(content.split(',')[1] ?? '');
    };
    reader.readAsDataURL(file);
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setCertBase64('');
    setFileError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const nameError = nameTouched && !certName.trim();

  const canSubmit = certName.trim() && certBase64 && envTemplateIds.length > 0 && !createMutation.isPending && orgUuid;

  const handleAdd = () => {
    if (!canSubmit) return;
    createMutation.mutate(
      {
        orgUuid,
        name: certName.trim(),
        description: description.trim(),
        certificateType: 'TLS',
        certificate: certBase64,
        environmentUuids: envTemplateIds,
        privateKey: null,
      },
      {
        onSuccess: () => {
          navigate(orgCertificatesUrl(scope.org));
        },
      },
    );
  };

  return (
    <PageContent sx={REQUIRED_FIELD_SX}>
      <Button variant="text" onClick={() => navigate(orgCertificatesUrl(scope.org))} sx={{ mb: 2 }}>
        ← Back
      </Button>

      <Stack sx={{ maxWidth: 720, gap: 3 }}>
        <Stack gap={1}>
          <Typography variant="subtitle1">Choose why you're adding this certificate.</Typography>
          <Stack direction="row" gap={2}>
            <Card
              role="radio"
              aria-checked="true"
              sx={{
                flex: 1,
                border: '1px solid',
                borderColor: 'primary.main',
                cursor: 'pointer',
                opacity: 1,
              }}>
              <CardActionArea sx={{ p: 2 }}>
                <Typography variant="subtitle2">Verify External Server</Typography>
                <Typography variant="body2" color="text.secondary">
                  Use a public certificate to confirm another server's identity for secure TLS connections.
                </Typography>
              </CardActionArea>
            </Card>
            <Card
              sx={{
                flex: 1,
                border: '1px solid',
                borderColor: 'divider',
                opacity: 0.55,
                pointerEvents: 'none',
              }}>
              <Stack sx={{ p: 2 }}>
                <Typography variant="subtitle2">Secure Website Domain (Coming Soon)</Typography>
                <Typography variant="body2" color="text.secondary">
                  Use SSL/TLS to safely secure your custom domains.
                </Typography>
              </Stack>
            </Card>
          </Stack>
        </Stack>

        <TextField required label="Name" value={certName} onChange={(e) => setCertName(e.target.value)} onBlur={() => setNameTouched(true)} error={nameError} helperText={nameError ? 'Certificate name is required.' : ' '} fullWidth />

        <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} multiline minRows={2} fullWidth />

        <Stack gap={1}>
          <Typography variant="subtitle2">Certificate file</Typography>
          <Typography variant="caption" color="text.secondary">
            PEM-encoded public certificate (.pem, max {MAX_FILE_MB} MB)
          </Typography>
          {!selectedFile ? (
            <Button variant="outlined" startIcon={<Upload size={16} />} sx={{ maxWidth: '25%' }} onClick={() => fileInputRef.current?.click()}>
              Upload certificate
            </Button>
          ) : (
            <Chip label={selectedFile.name} onDelete={handleClearFile} sx={{ width: 'fit-content' }} />
          )}
          <input ref={fileInputRef} type="file" accept=".pem" hidden onChange={handleFileSelect} />
          {fileError && (
            <Typography variant="caption" color="error.main">
              {fileError}
            </Typography>
          )}
        </Stack>

        {createMutation.isError && <Alert severity="error">Failed to add the certificate. Check that the file is a valid PEM certificate.</Alert>}

        <Stack direction="row" gap={1.5} sx={{ mt: 2 }}>
          <Button variant="text" onClick={() => navigate(orgCertificatesUrl(scope.org))} disabled={createMutation.isPending}>
            Cancel
          </Button>
          <Button variant="contained" disabled={!canSubmit} startIcon={createMutation.isPending ? <CircularProgress size={16} color="inherit" /> : undefined} onClick={handleAdd}>
            Add
          </Button>
        </Stack>
      </Stack>
    </PageContent>
  );
}
