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

import { Box, Tooltip, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { START_QUICKLY_CARD_MIN_HEIGHT } from '../constants/styles';
import type { PrebuiltIntegration } from '../types/prebuilt';
import AppIconsRow from './AppIconsRow';

export default function PrebuiltCard({ integration, onClick, disabled, disabledTooltip }: { integration: PrebuiltIntegration; onClick?: () => void; disabled?: boolean; disabledTooltip?: string }): JSX.Element {
  return (
    <Tooltip title={disabled ? (disabledTooltip ?? '') : ''} placement="top" arrow>
      <Box
        onClick={disabled ? undefined : onClick}
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
          cursor: disabled ? 'not-allowed' : onClick ? 'pointer' : 'default',
          userSelect: 'none',
          gap: 1.5,
          transition: 'border-color 0.15s',
          opacity: disabled ? 0.5 : 1,
          ...(!disabled && onClick ? { '&:hover': { borderColor: 'primary.main' } } : {}),
        }}>
        <AppIconsRow applications={integration.applications} bidirectional={integration.bidirectional} bgcolor="action.hover" avatarSize={28} />

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" fontWeight={600}>
            {integration.displayName}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {integration.applications.join(' • ')}
          </Typography>
        </Box>
      </Box>
    </Tooltip>
  );
}
