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

import { Box, Card, CardContent, Tooltip, Typography } from '@wso2/oxygen-ui';
import { ExternalLink } from '@wso2/oxygen-ui-icons-react';
import type { JSX, KeyboardEvent, MouseEvent } from 'react';
import type { IntegrationType } from '../../types/import';
import { INTEGRATION_TYPES } from '../../constants/import';
import { Scopes } from '../../constants/permissions';
import { useAgentRefusal } from '../../hooks/useCan';

// Three cards a row from lg, each as wide as one column of a four-column grid with 16px gaps.
const GRID_SX = {
  display: 'grid',
  gap: 2,
  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' },
  maxWidth: { lg: 'calc(75% - 4px)' },
} as const;

interface IntegrationTypeSelectorProps {
  selected: IntegrationType | null;
  onSelect: (type: IntegrationType) => void;
  /** Types this create cannot offer, such as one the chosen source or technology does not support. */
  excludedTypes?: readonly IntegrationType[];
}

export default function IntegrationTypeSelector({ selected, onSelect, excludedTypes = [] }: IntegrationTypeSelectorProps): JSX.Element {
  const agentRefusal = useAgentRefusal()(Scopes.AGENT_CREATE);
  return (
    <Box sx={GRID_SX}>
      {INTEGRATION_TYPES.filter((opt) => !excludedTypes.includes(opt.id)).map((opt) => {
        const isActive = selected === opt.id;
        const refusal = opt.id === 'ai-agent' ? agentRefusal : '';
        const select = () => !refusal && onSelect(opt.id);
        return (
          <Tooltip key={opt.id} title={refusal} describeChild>
            <Card
              role="button"
              tabIndex={0}
              aria-pressed={isActive}
              aria-disabled={!!refusal}
              onClick={select}
              onKeyDown={(e: KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  select();
                }
              }}
              sx={{
                border: 2,
                borderColor: isActive ? 'primary.main' : 'divider',
                bgcolor: isActive ? 'primary.50' : 'background.paper',
                cursor: refusal ? 'default' : 'pointer',
                opacity: refusal ? 0.5 : 1,
                transition: 'border-color 0.15s, background-color 0.15s',
                '&:hover': { borderColor: isActive ? 'primary.main' : 'primary.light' },
                '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
              }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 }, display: 'flex', flexDirection: 'column', height: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2" fontWeight={600} sx={{ color: isActive ? 'primary.main' : 'text.primary' }}>
                    {opt.title}
                  </Typography>
                  {opt.docLink && (
                    <Tooltip title="View documentation" placement="top">
                      <Box
                        component="a"
                        href={opt.docLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`View documentation for ${opt.title}`}
                        onClick={(e: MouseEvent) => e.stopPropagation()}
                        sx={{ display: 'flex', color: 'text.disabled', '&:hover': { color: 'text.secondary' }, ml: 0.5, flexShrink: 0 }}>
                        <ExternalLink size={13} />
                      </Box>
                    </Tooltip>
                  )}
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5, lineHeight: 1.4, flex: 1 }}>
                  {opt.description}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  {opt.icons.map((item) => (
                    <Tooltip key={item.label} title={item.label} placement="top">
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 28,
                          height: 28,
                          borderRadius: 1,
                          bgcolor: 'action.hover',
                          color: isActive ? 'primary.main' : 'text.secondary',
                        }}>
                        {item.icon}
                      </Box>
                    </Tooltip>
                  ))}
                </Box>
              </CardContent>
            </Card>
          </Tooltip>
        );
      })}
    </Box>
  );
}
