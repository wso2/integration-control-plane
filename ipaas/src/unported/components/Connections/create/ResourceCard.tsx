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

import { Avatar, Box, Card, CardContent, Chip, IconButton, Stack, Typography } from '@wso2/oxygen-ui';
import { ChevronRight, Eye } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { formatVersion } from '../../../utils/connections';
import type { ConnectionCatalogItem } from '../../../../types/connections';

interface ResourceCardProps {
  item: ConnectionCatalogItem;
  onClick: () => void;
  onDetail: () => void;
}

export default function ResourceCard({ item, onClick, onDetail }: ResourceCardProps): JSX.Element {
  const initial = (item.name[0] ?? '?').toUpperCase();
  const visibility = item.visibility?.[0] ?? '';
  const statusColor = item.status?.toLowerCase() === 'published' ? 'success.main' : 'warning.main';

  return (
    <Card
      variant="outlined"
      sx={{
        height: '100%',
        borderRadius: 2,
        cursor: 'pointer',
        transition: 'box-shadow 0.15s, border-color 0.15s, transform 0.15s',
        '&:hover': { boxShadow: 4, borderColor: 'primary.main', transform: 'translateY(-2px)' },
      }}
      onClick={onClick}>
      <CardContent sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        <Stack direction="row" gap={1.25} alignItems="flex-start">
          <Avatar sx={{ width: 40, height: 40, fontSize: '1.05rem', fontWeight: 700, flexShrink: 0, bgcolor: 'grey.200', color: 'text.primary' }}>{initial}</Avatar>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="body1" fontWeight={600} noWrap title={item.name}>
              {item.name}
            </Typography>
            {item.serviceType && (
              <Typography variant="caption" color="primary.main" sx={{ fontWeight: 500 }}>
                {item.serviceType}
              </Typography>
            )}
          </Box>
          <IconButton
            size="small"
            aria-label="view service details"
            onClick={(e) => {
              e.stopPropagation();
              onDetail();
            }}
            sx={{ color: 'text.secondary', mt: -0.5, mr: -0.5, flexShrink: 0 }}>
            <ChevronRight size={16} />
          </IconButton>
        </Stack>

        {(item.version || item.status) && (
          <Stack direction="row" gap={0.5} flexWrap="wrap">
            {item.version && <Chip label={`Version: ${formatVersion(item.version)}`} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.625rem', color: 'primary.main', borderColor: 'primary.main', borderRadius: 1 }} />}
            {item.status && <Chip label={item.status} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.625rem', color: statusColor, borderColor: statusColor, borderRadius: 1 }} />}
          </Stack>
        )}

        <Typography variant="body2" color="text.secondary" sx={{ flex: 1, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.5, minHeight: 40 }}>
          {item.description ?? item.summary ?? 'No description provided.'}
        </Typography>

        {visibility && (
          <Stack direction="row" alignItems="center" gap={0.5} sx={{ mt: 'auto', pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
            <Eye size={13} />
            <Typography variant="caption" color="text.secondary">
              {visibility}
            </Typography>
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
