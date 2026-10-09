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

import { Accordion, AccordionDetails, AccordionSummary, Box, Button, CircularProgress, MenuItem, Tooltip, Typography } from '@wso2/oxygen-ui';
import TextField from '../../../components/common/TextField';
import { ChevronDown, CircleHelp, Pencil } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useRef, useState, type JSX } from 'react';
import type { ApimApiInfo } from '../../../types/apim';
import { useApimThumbnail, useUpdateApimThumbnail } from '../../../hooks/useApim';
import LabelsAutocomplete from './LabelsAutocomplete';

const VISIBILITY_OPTIONS = [
  { value: 'PUBLIC', label: 'Public' },
  { value: 'PRIVATE', label: 'Private' },
  { value: 'RESTRICTED', label: 'Restricted' },
] as const;

function extractTags(apimInfo: ApimApiInfo): string[] {
  const raw = apimInfo.tags as string[] | undefined;
  return Array.isArray(raw) ? raw : [];
}

interface DeveloperPortalTabProps {
  apimId: string;
  apimInfo: ApimApiInfo;
  onSave: (patch: Partial<ApimApiInfo>) => void;
  onCancel: () => void;
  onError: (message: string) => void;
  saving: boolean;
}

interface BusinessInfo {
  businessOwner: string;
  businessOwnerEmail: string;
  technicalOwner: string;
  technicalOwnerEmail: string;
}

function extractBusinessInfo(apimInfo: ApimApiInfo): BusinessInfo {
  const raw = apimInfo.businessInformation as Partial<BusinessInfo> | undefined;
  return {
    businessOwner: raw?.businessOwner ?? '',
    businessOwnerEmail: raw?.businessOwnerEmail ?? '',
    technicalOwner: raw?.technicalOwner ?? '',
    technicalOwnerEmail: raw?.technicalOwnerEmail ?? '',
  };
}

export default function DeveloperPortalTab({ apimId, apimInfo, onSave, onCancel, onError, saving }: DeveloperPortalTabProps): JSX.Element {
  const [displayName, setDisplayName] = useState(apimInfo.displayName ?? '');
  const [description, setDescription] = useState((apimInfo.description as string) ?? '');
  const [visibility, setVisibility] = useState((apimInfo.visibility as string) ?? 'PRIVATE');
  const [tags, setTags] = useState<string[]>(extractTags(apimInfo));
  const [bizInfo, setBizInfo] = useState<BusinessInfo>(extractBusinessInfo(apimInfo));
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: existingThumbnail } = useApimThumbnail(apimId, !!apimInfo.hasThumbnail);
  const { mutateAsync: uploadThumbnail, isPending: uploadingThumbnail } = useUpdateApimThumbnail();

  useEffect(() => {
    setDisplayName(apimInfo.displayName ?? '');
    setDescription((apimInfo.description as string) ?? '');
    setVisibility((apimInfo.visibility as string) ?? 'PRIVATE');
    setTags(extractTags(apimInfo));
    setBizInfo(extractBusinessInfo(apimInfo));
    setThumbnailFile(null);
    setThumbnailPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [apimInfo]);

  const originalBiz = extractBusinessInfo(apimInfo);

  const isDirty =
    displayName !== (apimInfo.displayName ?? '') ||
    description !== ((apimInfo.description as string) ?? '') ||
    visibility !== ((apimInfo.visibility as string) ?? 'PRIVATE') ||
    JSON.stringify(tags) !== JSON.stringify(extractTags(apimInfo)) ||
    JSON.stringify(bizInfo) !== JSON.stringify(originalBiz) ||
    !!thumbnailFile;

  const handleThumbnailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size >= 1_000_000) {
      alert('File size should be less than 1MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setThumbnailPreview(reader.result as string);
    reader.readAsDataURL(file);
    setThumbnailFile(file);
  };

  const handleCancel = () => {
    setDisplayName(apimInfo.displayName ?? '');
    setDescription((apimInfo.description as string) ?? '');
    setVisibility((apimInfo.visibility as string) ?? 'PRIVATE');
    setTags(extractTags(apimInfo));
    setBizInfo(extractBusinessInfo(apimInfo));
    setThumbnailFile(null);
    setThumbnailPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onCancel();
  };

  const handleSave = async () => {
    if (thumbnailFile) {
      try {
        await uploadThumbnail({ apimId, file: thumbnailFile });
        setThumbnailFile(null);
      } catch {
        onError('Failed to upload thumbnail. Please try again.');
        return;
      }
    }
    await onSave({ displayName, description, visibility, tags, businessInformation: bizInfo });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* General Details accordion */}
      <Accordion defaultExpanded disableGutters elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, '&:before': { display: 'none' } }}>
        <AccordionSummary expandIcon={<ChevronDown size={18} />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              General Details
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Icon, Name, Description, Labels, and Visibility
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 0, pb: 2 }}>
          {/* Thumbnail / Icon upload */}
          <Box>
            <Box
              component="label"
              aria-label="Upload API icon"
              sx={{
                position: 'relative',
                width: 100,
                height: 100,
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'action.hover',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                '&:hover .thumbnail-edit-btn': { opacity: 1 },
                '&:focus-within': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
              }}>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleThumbnailChange} />
              {(thumbnailPreview ?? existingThumbnail) ? (
                <Box component="img" src={thumbnailPreview ?? existingThumbnail ?? undefined} alt="API icon" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <Typography variant="h4" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                  {(apimInfo.displayName?.[0] ?? apimInfo.name?.[0] ?? '?').toUpperCase()}
                </Typography>
              )}
              <Box
                className="thumbnail-edit-btn"
                sx={{
                  position: 'absolute',
                  bottom: 4,
                  right: 4,
                  bgcolor: 'background.paper',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: '50%',
                  width: 22,
                  height: 22,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: 0,
                  transition: 'opacity 0.15s',
                  pointerEvents: 'none',
                }}>
                <Pencil size={14} />
              </Box>
            </Box>
          </Box>

          <TextField label="Display Name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} fullWidth size="small" />

          <TextField label="Description (Optional)" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth multiline rows={4} size="small" placeholder='e.g. "This API allows you to connect to Salesforce."' />

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TextField select label="Visibility" fullWidth size="small" value={visibility} onChange={(e) => setVisibility(e.target.value as string)}>
              {VISIBILITY_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </TextField>
            <Tooltip
              title={
                <Box>
                  <Typography variant="body2">Public: Visible to all</Typography>
                  <Typography variant="body2">Private: Visible to organization members.</Typography>
                  <Typography variant="body2">Restricted: Visible to specific members within the organization.</Typography>
                </Box>
              }
              arrow>
              <Box sx={{ display: 'flex', alignItems: 'center', color: 'text.secondary', cursor: 'help', flexShrink: 0 }}>
                <CircleHelp size={16} />
              </Box>
            </Tooltip>
          </Box>

          <LabelsAutocomplete value={tags} onChange={setTags} />
        </AccordionDetails>
      </Accordion>

      {/* Business Information accordion */}
      <Accordion disableGutters elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, '&:before': { display: 'none' } }}>
        <AccordionSummary expandIcon={<ChevronDown size={18} />}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Business Information
          </Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 0, pb: 2 }}>
          {/* Business Owner */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Business Owner
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField label="Name (Optional)" value={bizInfo.businessOwner} onChange={(e) => setBizInfo((prev) => ({ ...prev, businessOwner: e.target.value }))} size="small" fullWidth placeholder='e.g. "John Doe"' />
              <TextField label="Email (Optional)" type="email" value={bizInfo.businessOwnerEmail} onChange={(e) => setBizInfo((prev) => ({ ...prev, businessOwnerEmail: e.target.value }))} size="small" fullWidth placeholder='e.g. "john@acme.com"' />
            </Box>
          </Box>

          {/* Technical Owner */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Technical Owner
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField label="Name (Optional)" value={bizInfo.technicalOwner} onChange={(e) => setBizInfo((prev) => ({ ...prev, technicalOwner: e.target.value }))} size="small" fullWidth placeholder='e.g. "Jane Doe"' />
              <TextField label="Email (Optional)" type="email" value={bizInfo.technicalOwnerEmail} onChange={(e) => setBizInfo((prev) => ({ ...prev, technicalOwnerEmail: e.target.value }))} size="small" fullWidth placeholder='e.g. "jane@acme.com"' />
            </Box>
          </Box>
        </AccordionDetails>
      </Accordion>

      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button variant="outlined" onClick={handleCancel} disabled={saving || uploadingThumbnail}>
          Cancel
        </Button>
        <Button variant="contained" startIcon={(saving || uploadingThumbnail) && <CircularProgress size={16} color="inherit" />} onClick={handleSave} disabled={!isDirty || saving || uploadingThumbnail}>
          {saving || uploadingThumbnail ? 'Saving...' : 'Save'}
        </Button>
      </Box>
    </Box>
  );
}
