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

import { Box, FormControlLabel, Radio, RadioGroup, Tooltip, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import type { EgressMode } from '../../../../types/egressPolicy';

const OPTIONS: { value: EgressMode; title: string; description: string }[] = [
  { value: 'allow-all', title: 'Allow all', description: 'All outbound traffic is allowed.' },
  { value: 'deny-all', title: 'Deny all', description: 'All outbound traffic is blocked.' },
];

interface EgressModeSelectionProps {
  value: EgressMode;
  onChange: (mode: EgressMode) => void;
  /** Once a policy exists the mode is fixed; the controls are disabled. */
  locked: boolean;
}

/** The Allow-all / Deny-all mode picker. Locked after a policy is created. */
export default function EgressModeSelection({ value, onChange, locked }: EgressModeSelectionProps): JSX.Element {
  return (
    <Tooltip title={locked ? 'The policy mode cannot be changed after creation. Delete the policy and create a new one to switch.' : ''} placement="top-start">
      <RadioGroup row value={value} onChange={(e) => onChange(e.target.value as EgressMode)} sx={{ gap: 1.5, mb: 3, flexWrap: 'nowrap' }}>
        {OPTIONS.map((o) => (
          <Box key={o.value} sx={{ width: 260, border: '1px solid', borderColor: value === o.value ? 'primary.main' : 'divider', borderRadius: 1, px: 1.5, py: 1, opacity: locked && value !== o.value ? 0.6 : 1 }}>
            <FormControlLabel
              value={o.value}
              disabled={locked}
              control={<Radio size="small" />}
              label={
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {o.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>
                    {o.description}
                  </Typography>
                </Box>
              }
              sx={{ alignItems: 'flex-start', m: 0, gap: 0.5 }}
            />
          </Box>
        ))}
      </RadioGroup>
    </Tooltip>
  );
}
