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

import { Box } from '@wso2/oxygen-ui';
import { Check, Clock, Loader, Minus, X } from '@wso2/oxygen-ui-icons-react';

/** The integration console's status glyphs. */

const circle = (size: number, bgcolor: string, color: string) =>
  ({ width: size, height: size, borderRadius: '50%', bgcolor, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }) as const;

export function InProgressIcon({ size = 20 }: { size?: number }) {
  return (
    <Box sx={{ display: 'flex', flexShrink: 0, color: 'primary.main', animation: 'spin 3s linear infinite' }}>
      <Loader size={size} />
    </Box>
  );
}

export function SuccessIcon({ size = 20 }: { size?: number }) {
  return (
    <Box sx={circle(size, 'success.main', 'common.white')}>
      <Check size={Math.round(size * 0.55)} />
    </Box>
  );
}

export function FailedIcon({ size = 20 }: { size?: number }) {
  return (
    <Box sx={circle(size, 'error.main', 'common.white')}>
      <X size={Math.round(size * 0.55)} />
    </Box>
  );
}

export function WaitingIcon({ size = 20 }: { size?: number }) {
  return (
    <Box sx={circle(size, 'warning.main', 'common.white')}>
      <Clock size={Math.round(size * 0.55)} />
    </Box>
  );
}

export function SkippedIcon({ size = 20 }: { size?: number }) {
  return (
    <Box sx={circle(size, 'action.disabledBackground', 'text.secondary')}>
      <Minus size={Math.round(size * 0.55)} />
    </Box>
  );
}
