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

import { Box, Stack, Typography } from '@wso2/oxygen-ui';
import type { JSX, ReactNode } from 'react';

interface SelectCardProps {
  selected: boolean;
  title: string;
  description?: string;
  icon?: ReactNode;
  onClick: () => void;
}

export default function SelectCard({ selected, title, description, icon, onClick }: SelectCardProps): JSX.Element {
  return (
    <Box
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      sx={{
        cursor: 'pointer',
        border: 2,
        borderColor: selected ? 'primary.main' : 'divider',
        bgcolor: selected ? 'primary.50' : 'background.paper',
        borderRadius: 1,
        p: 1.75,
        width: 320,
        transition: 'border-color 0.15s, background-color 0.15s',
        '&:hover': { borderColor: selected ? 'primary.main' : 'primary.light' },
      }}>
      <Stack direction="row" gap={1.25} alignItems="flex-start">
        {icon && <Box sx={{ color: selected ? 'primary.main' : 'text.secondary', mt: 0.25 }}>{icon}</Box>}
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600, color: selected ? 'primary.main' : 'text.primary' }}>
            {title}
          </Typography>
          {description && (
            <Typography variant="caption" color="text.secondary">
              {description}
            </Typography>
          )}
        </Box>
      </Stack>
    </Box>
  );
}
