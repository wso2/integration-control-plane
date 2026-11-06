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

import { Box, Button, CircularProgress, IconButton, Tooltip, Typography } from '@wso2/oxygen-ui';
import { ExternalLink, Rocket } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import type { Sample } from '../types/samples';
import { Scopes } from '../constants/permissions';
import { useAgentRefusal } from '../hooks/useCan';
import { formatComponentType, sampleSourceUrl } from '../constants/integrations';
import { START_QUICKLY_CARD_MIN_HEIGHT } from '../constants/styles';

export default function SampleRowCard({
  sample,
  onDeploy,
  isDeploying,
  deployDisabled,
  deployDisabledTooltip,
  onClick,
}: {
  sample: Sample;
  onDeploy: () => void;
  isDeploying: boolean;
  deployDisabled?: boolean;
  deployDisabledTooltip?: string;
  onClick?: () => void;
}): JSX.Element {
  const agentRefusal = useAgentRefusal()(Scopes.AGENT_CREATE);
  const refusal = sample.componentType === 'ai-agent' ? agentRefusal : '';
  const sourceUrl = sampleSourceUrl(sample);

  return (
    <Box
      onClick={onClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        minHeight: START_QUICKLY_CARD_MIN_HEIGHT,
        py: 2.4,
        px: 1.5,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1.5,
        bgcolor: 'background.paper',
        gap: 1.5,
        transition: 'border-color 0.15s',
        cursor: onClick ? 'pointer' : 'default',
        opacity: deployDisabled ? 0.5 : 1,
        '&:hover': { borderColor: 'primary.main' },
      }}>
      {/* Thumbnail */}
      <Box sx={{ flexShrink: 0, alignSelf: 'center', mt: 0.25, mr: 0.75, ml: 0.75 }}>
        {sample.thumbnailPath && sample.thumbnailPath.startsWith('http') ? (
          <Box
            component="img"
            src={sample.thumbnailPath}
            alt=""
            sx={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 0.5 }}
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 0.5,
              bgcolor: 'primary.light',
              opacity: 0.6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Typography sx={{ fontSize: 18, lineHeight: 1 }}>⚡</Typography>
          </Box>
        )}
      </Box>

      {/* Title + type */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" fontWeight={600}>
          {sample.displayName}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {formatComponentType(sample.componentType)}
        </Typography>
      </Box>

      {/* Source + Deploy actions */}
      <Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Tooltip title="Go to source" placement="top">
          <IconButton
            size="small"
            aria-label="Go to source"
            onClick={(e) => {
              e.stopPropagation();
              window.open(sourceUrl, '_blank', 'noopener,noreferrer');
            }}
            sx={{ width: 34, height: 34, color: 'text.secondary', '&:hover': { color: 'primary.main' } }}>
            <ExternalLink size={14} />
          </IconButton>
        </Tooltip>
        <Tooltip title={deployDisabled ? (deployDisabledTooltip ?? '') : refusal || 'Deploy this sample'} placement="top">
          <span>
            <Button
              size="small"
              variant="contained"
              startIcon={<Rocket size={12} />}
              onClick={(e) => {
                e.stopPropagation();
                onDeploy();
              }}
              disabled={isDeploying || deployDisabled || !!refusal}
              sx={{ height: 30, fontSize: 12, px: 2 }}>
              {isDeploying ? <CircularProgress size={12} color="inherit" /> : 'Deploy'}
            </Button>
          </span>
        </Tooltip>
      </Box>
    </Box>
  );
}
