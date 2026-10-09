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

import { Box, Button, Card, Chip, CircularProgress, Divider, IconButton, InputAdornment, Tooltip, Typography } from '@wso2/oxygen-ui';
import TextField from '../../../components/common/TextField';
import { Clock, Edit, Eye } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useState, type JSX } from 'react';
import type { ApimApiInfo } from '../../../types/apim';
import type { EnvEndpoint } from '../../../types/component';
import { useMarketplaceService, useUpdateMarketplaceService } from '../../../hooks/useApim';
import LabelsAutocomplete from './LabelsAutocomplete';
import OverviewEditorDialog from './OverviewEditorDialog';

function getInitial(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase();
}

function statusColor(status: string): 'success' | 'warning' | 'default' {
  if (status?.toUpperCase() === 'PUBLISHED') return 'success';
  if (status?.toUpperCase() === 'PROTOTYPE') return 'warning';
  return 'default';
}

function formatAge(createdTime: string): string {
  const ms = Date.now() - parseInt(createdTime, 10) * 1000;
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);
  if (years > 0) return `${years} year${years > 1 ? 's' : ''} ago`;
  if (months > 0) return `${months} month${months > 1 ? 's' : ''} ago`;
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'just now';
}

function formatDateTime(createdTime: string): string {
  return new Date(parseInt(createdTime, 10) * 1000).toLocaleString();
}

function visibilityLabel(v: string): string {
  if (v === 'PUBLIC') return 'Public';
  if (v === 'PROJECT') return 'Project';
  return 'Organization';
}

function visibilityTooltipBody(v: string): string {
  if (v === 'PUBLIC') return 'Service is publicly accessible.';
  if (v === 'PROJECT') return 'Service is accessible within the project.';
  return 'Service is accessible within the organization.';
}

interface PreviewCardProps {
  displayName: string;
  projectName?: string;
  version?: string;
  status?: string;
  visibility?: string[];
  createdTime?: string;
}

function PreviewCard({ displayName, projectName, version, status, visibility, createdTime }: PreviewCardProps) {
  const visibilities = visibility?.length ? visibility : [];
  const visLabel = visibilities.map(visibilityLabel).join(', ');

  return (
    <Card variant="outlined" sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5, minHeight: 160 }}>
      <Box
        sx={{
          width: 48,
          height: 48,
          borderRadius: 1,
          bgcolor: 'action.hover',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
        <Typography variant="h6" component="p" sx={{ fontWeight: 600, color: 'text.secondary' }}>
          {getInitial(displayName)}
        </Typography>
      </Box>

      <Box>
        <Typography variant="body1" sx={{ fontWeight: 600, mb: 0.25 }}>
          {displayName || '—'}
        </Typography>
        {projectName && (
          <Typography variant="body2" color="text.secondary">
            {projectName}
          </Typography>
        )}
      </Box>

      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
        {version && <Chip label={`Version: ${version}`} size="small" variant="filled" color="primary" sx={{ height: 20, fontSize: '0.7rem' }} />}
        {status && <Chip label={`Status: ${status.charAt(0).toUpperCase()}${status.slice(1).toLowerCase()}`} size="small" variant="outlined" color={statusColor(status)} sx={{ height: 20, fontSize: '0.7rem' }} />}
      </Box>

      <Box sx={{ flex: 1 }} />
      <Divider />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1 }}>
        {visibilities.length > 0 && (
          <Tooltip
            title={
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                  Network Visibility
                </Typography>
                {visibilities.map((v) => (
                  <Typography key={v} variant="body2">
                    <strong>{visibilityLabel(v)}</strong>: {visibilityTooltipBody(v)}
                  </Typography>
                ))}
              </Box>
            }
            placement="top"
            arrow>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'default', color: 'text.secondary' }}>
              <Eye size={13} />
              <Typography variant="caption" color="text.secondary">
                {visLabel}
              </Typography>
            </Box>
          </Tooltip>
        )}
        {createdTime && (
          <Tooltip title={formatDateTime(createdTime)} placement="top" arrow>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 'auto', cursor: 'default', color: 'text.secondary' }}>
              <Clock size={13} />
              <Typography variant="caption" color="text.secondary">
                {formatAge(createdTime)}
              </Typography>
            </Box>
          </Tooltip>
        )}
      </Box>
    </Card>
  );
}

interface MarketplaceTabProps {
  apimId: string;
  componentId: string;
  version: string;
  endpoint: EnvEndpoint | null;
  endpointName: string;
  projectName?: string;
  apimInfo: ApimApiInfo;
  onSave: (patch: Partial<ApimApiInfo>) => void;
  onCancel: () => void;
  saving: boolean;
}

export default function MarketplaceTab({ componentId, version, endpoint, endpointName, projectName, apimInfo, onSave, onCancel, saving }: MarketplaceTabProps): JSX.Element {
  const [displayName, setDisplayName] = useState(apimInfo.displayName ?? '');
  const [summary, setSummary] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  const { data: marketplaceService, isLoading: loadingService } = useMarketplaceService(componentId, version, endpoint);
  const { mutateAsync: updateMarketplaceService, isPending: savingService } = useUpdateMarketplaceService();
  const serviceReady = !!marketplaceService;

  // overviewSaved tracks the staged overview — committed to the API only on main Save.
  const [overviewSaved, setOverviewSaved] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  // Sync all marketplace fields when the service loads or reloads after save.
  useEffect(() => {
    setSummary(marketplaceService?.summary ?? '');
    setOverviewSaved(marketplaceService?.description ?? '');
    setTags((marketplaceService?.tags as string[] | undefined) ?? []);
  }, [marketplaceService]);

  useEffect(() => {
    setDisplayName(apimInfo.displayName ?? '');
  }, [apimInfo]);

  const tagsOriginal = (marketplaceService?.tags as string[] | undefined) ?? [];
  const summaryOriginal = marketplaceService?.summary ?? '';
  const overviewOriginal = marketplaceService?.description ?? '';
  const isDirty = displayName !== (apimInfo.displayName ?? '') || summary !== summaryOriginal || JSON.stringify(tags) !== JSON.stringify(tagsOriginal) || overviewSaved !== overviewOriginal;

  const handleSave = async (patch: Partial<ApimApiInfo>) => {
    if (marketplaceService) {
      try {
        await updateMarketplaceService({
          serviceId: marketplaceService.serviceId,
          service: { ...marketplaceService, description: overviewSaved, summary, tags },
        });
      } catch {
        // marketplace update failure does not block the APIM update
      }
    }
    onSave(patch);
  };

  return (
    <>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '3fr 2fr' }, gap: 0, alignItems: 'start' }}>
        {/* Form */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pr: 4 }}>
          <Typography variant="h3" component="h2" sx={{ mb: 0.5 }}>
            {endpointName}
          </Typography>

          <TextField label="Display Name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} fullWidth size="small" slotProps={{ htmlInput: { 'aria-label': 'Display Name' } }} />

          <TextField label="Summary" value={summary} onChange={(e) => setSummary(e.target.value)} fullWidth multiline rows={3} size="small" disabled={!serviceReady} slotProps={{ htmlInput: { 'aria-label': 'Summary' } }} />

          <TextField
            label="Overview"
            value={overviewSaved}
            fullWidth
            size="small"
            disabled
            helperText="Markdown supported"
            slotProps={{
              htmlInput: { 'aria-label': 'Overview' },
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title="Edit overview" placement="top">
                      <span>
                        <IconButton size="small" aria-label="Edit overview" onClick={() => setDialogOpen(true)} disabled={!serviceReady} sx={{ color: 'primary.main', pointerEvents: 'all' }}>
                          <Edit size={16} />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </InputAdornment>
                ),
              },
            }}
            sx={{ '& .MuiInputBase-root.Mui-disabled': { pointerEvents: 'none' }, '& .MuiInputAdornment-root': { pointerEvents: 'all' } }}
          />

          <LabelsAutocomplete value={tags} onChange={setTags} disabled={!serviceReady} />

          {!loadingService && !marketplaceService && (
            <Typography variant="caption" color="text.secondary">
              Marketplace service unavailable for this endpoint. Summary, labels, and overview cannot be edited.
            </Typography>
          )}

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="outlined" onClick={onCancel} disabled={saving || savingService || loadingService}>
              Cancel
            </Button>
            <Button variant="contained" startIcon={(saving || savingService) && <CircularProgress size={16} color="inherit" />} onClick={() => handleSave({ displayName })} disabled={!isDirty || saving || savingService || loadingService}>
              {saving || savingService ? 'Saving...' : 'Save'}
            </Button>
          </Box>
        </Box>

        {/* Preview */}
        <Box sx={{ pl: 4, borderLeft: '1px solid', borderColor: 'divider' }}>
          <Typography variant="h6" component="h3" sx={{ mb: 0.5 }}>
            Preview
          </Typography>
          <Typography variant="subtitle2" component="p" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
            How the endpoint will be displayed in the marketplace
          </Typography>
          <PreviewCard
            displayName={displayName || endpointName}
            projectName={projectName}
            version={marketplaceService?.version}
            status={marketplaceService?.status as string | undefined}
            visibility={marketplaceService?.visibility as string[] | undefined}
            createdTime={marketplaceService?.createdTime}
          />
        </Box>
      </Box>

      <OverviewEditorDialog
        open={dialogOpen}
        value={overviewSaved}
        onClose={() => setDialogOpen(false)}
        onConfirm={(val) => {
          setOverviewSaved(val);
          setDialogOpen(false);
        }}
      />
    </>
  );
}
