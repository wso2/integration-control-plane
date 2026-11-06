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

import { Box, Card, CardContent, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import type { DetectedMode } from '../../types/repository';
import { TECH_OPTIONS } from '../../constants/import';

interface TechnologySelectorProps {
  selected: 'MI' | 'BI' | null;
  detectedMode: DetectedMode;
  enabled: boolean;
  onSelect: (tech: 'MI' | 'BI') => void;
}

export default function TechnologySelector({ selected, detectedMode, enabled, onSelect }: TechnologySelectorProps): JSX.Element {
  const isCardDisabled = (id: 'MI' | 'BI') => {
    if (!enabled) return true;
    if (detectedMode === null) return true;
    if (detectedMode === 'mi') return id !== 'MI';
    if (detectedMode === 'ballerina') return id !== 'BI';
    return false;
  };

  return (
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
      {TECH_OPTIONS.map((opt) => {
        const disabled = isCardDisabled(opt.id);
        const isActive = selected === opt.id;
        return (
          <Card
            key={opt.id}
            onClick={() => {
              if (!disabled) onSelect(opt.id);
            }}
            sx={{
              width: { xs: '100%', sm: 'calc(50% - 8px)', lg: 'calc(25% - 12px)' },
              border: 2,
              borderColor: isActive ? 'primary.main' : 'divider',
              bgcolor: isActive ? 'primary.50' : 'background.paper',
              cursor: disabled ? 'default' : 'pointer',
              opacity: disabled ? 0.4 : 1,
              transition: 'border-color 0.15s, background-color 0.15s, opacity 0.15s',
              '&:hover': !disabled ? { borderColor: isActive ? 'primary.main' : 'primary.light' } : {},
            }}>
            <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box sx={{ display: 'flex', color: isActive ? 'primary.main' : 'text.secondary', flexShrink: 0 }}>{opt.icon}</Box>
                <Typography variant="body2" fontWeight={600} sx={{ color: isActive ? 'primary.main' : 'text.primary' }}>
                  {opt.label}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        );
      })}
    </Box>
  );
}
