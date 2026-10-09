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

import { Box, Card, CardContent, Chip, IconButton, Link, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { ExternalLink, Pencil, Trash2 } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';

interface GovernanceCardProps {
  id: string;
  name: string;
  description: string;
  isDefault?: boolean | null;
  provider?: string;
  documentationLink?: string;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

/** Fixed card height so every card aligns and skeletons match the loaded layout. */
export const GOVERNANCE_CARD_HEIGHT = 220;

const cardContainerStyles = {
  position: 'relative' as const,
  height: GOVERNANCE_CARD_HEIGHT,
  display: 'flex',
  flexDirection: 'column' as const,
  border: '1px solid',
  borderColor: 'divider',
  transition: 'all 0.2s ease',
  '&:hover': {
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
  },
} as const;

const selectedCardStyles = {
  ...cardContainerStyles,
  borderColor: 'primary.main',
  borderWidth: 2,
} as const;

export default function GovernanceCard({ id, name, description, isDefault, provider, documentationLink, onEdit, onDelete, selected, onToggleSelect }: GovernanceCardProps): JSX.Element {
  const isSelectable = !!onToggleSelect;
  const cardStyles = selected ? selectedCardStyles : cardContainerStyles;

  return (
    <Card
      sx={{
        ...cardStyles,
        cursor: isSelectable ? 'pointer' : 'default',
      }}
      {...(isSelectable
        ? {
            role: 'button',
            tabIndex: 0,
            'aria-pressed': selected,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onToggleSelect(id);
              }
            },
          }
        : {})}
      onClick={() => isSelectable && onToggleSelect(id)}>
      <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', pb: 2, minHeight: 0 }}>
        <Stack gap={1.5} sx={{ flex: 1, minHeight: 0 }}>
          <Stack direction="row" gap={1} alignItems="flex-start">
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                bgcolor: 'text.primary',
                color: 'background.paper',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
              <Typography sx={{ fontSize: 15, fontWeight: 700, lineHeight: 1 }}>{name.slice(0, 2).toUpperCase()}</Typography>
            </Box>
            <Stack flex={1} gap={0.5} sx={{ minWidth: 0 }}>
              <Typography variant="subtitle2" noWrap sx={{ fontWeight: 600 }}>
                {name}
              </Typography>
              {isDefault && <Chip label="Default" size="small" variant="outlined" sx={{ alignSelf: 'flex-start' }} />}
            </Stack>
          </Stack>

          {description && (
            <Tooltip title={description}>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                {description}
              </Typography>
            </Tooltip>
          )}

          {provider && (
            <Stack direction="row" gap={0.5} alignItems="center">
              <Typography variant="caption" color="text.secondary">
                Provider:
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 500 }}>
                {provider}
              </Typography>
            </Stack>
          )}

          {documentationLink && (
            <Link href={documentationLink} target="_blank" rel="noopener noreferrer" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, width: 'fit-content' }}>
              <Typography variant="caption">Documentation</Typography>
              <ExternalLink size={14} />
            </Link>
          )}

          <Stack direction="row" gap={0.5} justifyContent="flex-end" sx={{ mt: 'auto' }}>
            {onEdit && (
              <Tooltip title="Edit">
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(id);
                  }}>
                  <Pencil size={16} />
                </IconButton>
              </Tooltip>
            )}
            {onDelete && (
              <Tooltip title="Delete">
                <IconButton
                  size="small"
                  color="error"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(id);
                  }}>
                  <Trash2 size={16} />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
