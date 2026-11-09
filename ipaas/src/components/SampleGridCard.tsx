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

import { Box, Button, Card, Chip, CircularProgress, IconButton, Tooltip, Typography } from '@wso2/oxygen-ui';
import { ExternalLink, Rocket } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import type { Sample } from '../types/samples';
import { Scopes } from '../constants/permissions';
import { useAgentRefusal, useCan } from '../hooks/useCan';
import { formatBuildPack, formatComponentType, sampleSourceUrl } from '../constants/integrations';

const MAX_WORDS = 20;

function truncateWords(text: string): { display: string; isTruncated: boolean } {
  const words = text.split(' ');
  if (words.length <= MAX_WORDS) return { display: text, isTruncated: false };
  return { display: words.slice(0, MAX_WORDS).join(' ') + '…', isTruncated: true };
}

export default function SampleGridCard({ sample, onDeploy, isDeploying }: { sample: Sample; onDeploy: () => void; isDeploying: boolean }): JSX.Element {
  const agentRefusal = useAgentRefusal()(Scopes.AGENT_CREATE);
  const canCreate = useCan()(Scopes.INTEGRATION_CREATE);
  const refusal = !canCreate ? 'You do not have permission to create integrations.' : sample.componentType === 'ai-agent' ? agentRefusal : '';
  const sourceUrl = sampleSourceUrl(sample);
  const { display: descriptionDisplay, isTruncated: isDescriptionTruncated } = truncateWords(sample.description);

  return (
    <Card
      sx={{
        display: 'flex',
        flexDirection: 'column',
        p: 2,
        gap: 1,
        transition: 'border-color 0.15s',
        '&:hover': { borderColor: 'primary.main' },
        height: '100%',
      }}>
      {/* Top: thumbnail + type chip */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
        <Box sx={{ flexShrink: 0 }}>
          {sample.thumbnailPath && sample.thumbnailPath.startsWith('http') ? (
            <Box
              component="img"
              src={sample.thumbnailPath}
              alt=""
              sx={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 0.75 }}
              onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: 0.75,
                bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'action.selected' : 'primary.light'),
                opacity: 0.6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Typography sx={{ fontSize: 20, lineHeight: 1 }}>⚡</Typography>
            </Box>
          )}
        </Box>
        <Chip label={formatComponentType(sample.componentType)} size="small" variant="outlined" sx={{ fontSize: 11, height: 20, flexShrink: 0 }} />
      </Box>

      {/* Title + description */}
      <Box sx={{ flex: 1 }}>
        <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
          {sample.displayName}{' '}
          <Typography component="span" variant="body2" color="text.secondary" fontWeight={400}>
            ({formatBuildPack(sample.buildPack)})
          </Typography>
        </Typography>
        <Tooltip title={isDescriptionTruncated ? sample.description : ''} placement="top" arrow>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.5 }}>
            {descriptionDisplay}
          </Typography>
        </Tooltip>
      </Box>

      {/* Tags */}
      {sample.tags.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {sample.tags.map((tag) => (
            <Chip key={tag} label={tag} size="small" sx={{ fontSize: 10, height: 18, bgcolor: 'action.hover' }} />
          ))}
        </Box>
      )}

      {/* Actions */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <Tooltip title="Go to source" placement="top">
          <IconButton size="small" aria-label="Go to source" onClick={() => window.open(sourceUrl, '_blank', 'noopener,noreferrer')} sx={{ width: 30, height: 30, color: 'text.secondary', '&:hover': { color: 'primary.main' } }}>
            <ExternalLink size={14} />
          </IconButton>
        </Tooltip>
        <Tooltip title={refusal || 'Deploy this sample'} placement="top">
          <span>
            <Button size="small" variant="contained" startIcon={isDeploying ? undefined : <Rocket size={12} />} onClick={onDeploy} disabled={isDeploying || !!refusal} sx={{ height: 30, fontSize: 12, px: 1.5 }}>
              {isDeploying ? <CircularProgress size={12} color="inherit" /> : 'Quick deploy'}
            </Button>
          </span>
        </Tooltip>
      </Box>
    </Card>
  );
}
