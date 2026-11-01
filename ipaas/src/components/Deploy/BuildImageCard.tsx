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

import { Avatar, Card, Chip, CircularProgress, Divider, IconButton, Stack, Tooltip, Typography, RelativeTime } from '@wso2/oxygen-ui';
import { Check, Copy, Edit, GitBranch } from '@wso2/oxygen-ui-icons-react';
import { useState } from 'react';
import type { JSX } from 'react';
import type { DeploymentTrackImage } from '../../types/deployment';
import { formatDateTime, formatDistanceToNow } from '../../utils/time';

interface BuildImageCardProps {
  image: DeploymentTrackImage;
  isLatest: boolean;
  variant?: 'detail' | 'selectable';
  isSelected?: boolean;
  onSelect?: () => void;
  onEdit?: () => void;
  hideEdit?: boolean;
  /** Set when the card stands in for a build that has not produced an image yet. */
  buildState?: 'queued' | 'running' | null;
}

export default function BuildImageCard({ image, isLatest, variant = 'detail', isSelected = false, onSelect, onEdit, hideEdit = false, buildState = null }: BuildImageCardProps): JSX.Element {
  const isPendingBuild = buildState !== null;
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(image.runId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit?.();
  };

  const isSelectable = variant === 'selectable';

  return (
    <Card
      onClick={isSelectable ? onSelect : undefined}
      role={isSelectable ? 'button' : undefined}
      tabIndex={isSelectable ? 0 : undefined}
      onKeyDown={
        isSelectable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect?.();
              }
            }
          : undefined
      }
      sx={{
        border: '1px solid',
        borderColor: isPendingBuild ? 'warning.main' : isSelected ? 'primary.main' : 'divider',
        borderRadius: 1,
        p: 1.5,
        bgcolor: isSelectable ? (isSelected ? 'action.selected' : 'transparent') : undefined,
        cursor: isSelectable ? 'pointer' : 'default',
        ...(isSelectable && { '&:hover': { bgcolor: isSelected ? 'action.selected' : 'action.hover' } }),
      }}>
      {/* ── Build ID row — Edit button (header-right) + selectable check ── */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.25 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Build ID
        </Typography>

        <Stack direction="row" gap={0.25} alignItems="center">
          {variant === 'detail' && !hideEdit && !isPendingBuild && (
            <Tooltip title="Change image">
              <IconButton size="small" onClick={handleEdit} sx={{ p: 0.25 }}>
                <Edit size={12} />
              </IconButton>
            </Tooltip>
          )}
          {isSelectable && isSelected && <Check size={16} style={{ color: 'var(--oxygen-palette-primary-main)', flexShrink: 0 }} />}
        </Stack>
      </Stack>

      {/* ── Run ID + Copy (always inline) + status chip ── */}
      <Stack direction="row" alignItems="center" gap={0.75} sx={{ mb: 0.5 }}>
        <Typography variant="body2" sx={{ fontFamily: 'monospace', color: isPendingBuild ? 'text.secondary' : undefined }}>
          {isPendingBuild ? '—' : image.runId}
        </Typography>
        {variant === 'detail' && !isPendingBuild && (
          <Tooltip title={copied ? 'Copied!' : 'Copy Build ID'}>
            <IconButton size="small" onClick={handleCopy} sx={{ p: 0.25 }}>
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </IconButton>
          </Tooltip>
        )}
        {buildState === 'running' ? (
          <Chip label="Building" size="small" color="warning" icon={<CircularProgress size={10} color="inherit" />} sx={{ height: 18, fontSize: '0.65rem' }} />
        ) : buildState === 'queued' ? (
          <Chip label="Queued" size="small" sx={{ height: 18, fontSize: '0.65rem' }} />
        ) : isLatest ? (
          <Chip label="Latest" size="small" color="success" sx={{ height: 18, fontSize: '0.65rem' }} />
        ) : null}
      </Stack>

      {/* ── Time ago / started ── */}
      <RelativeTime time={formatDistanceToNow(image.builtAt)} dateTime={image.builtAt} tooltip={formatDateTime(image.builtAt)} action={isPendingBuild ? (buildState === 'queued' ? 'Queued' : 'Started') : undefined} size="small" sx={{ mb: 1.5 }} />

      <Divider sx={{ mb: 1.5 }} />

      {/* ── Commit Details ── */}
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 0.75 }}>
        Commit Details
      </Typography>

      <Tooltip title={image.commitMessage} placement="bottom-start">
        <Typography
          variant="body2"
          sx={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            mb: 0.5,
            cursor: 'default',
          }}>
          {image.commitMessage}
        </Typography>
      </Tooltip>

      <Stack direction="row" alignItems="center" gap={0.5} sx={{ mb: 0.5 }}>
        <GitBranch size={13} style={{ opacity: 0.5, flexShrink: 0 }} />
        <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
          {image.commitHash.slice(0, 8)}
        </Typography>
      </Stack>

      {image.author?.name && (
        <Stack direction="row" alignItems="center" gap={0.5}>
          <Avatar src={image.author.avatarUrl} alt={image.author.name} sx={{ width: 16, height: 16, fontSize: 10 }}>
            {image.author.name[0]?.toUpperCase()}
          </Avatar>
          <Typography variant="caption" color="text.secondary">
            by {image.author.name}
          </Typography>
        </Stack>
      )}
    </Card>
  );
}
