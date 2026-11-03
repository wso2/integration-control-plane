/*
 * Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com). All Rights Reserved.
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein is strictly forbidden, unless permitted by WSO2 in accordance with
 * the WSO2 Commercial License available at http://wso2.com/licenses.
 * For specific language governing the permissions and limitations under
 * this license, please see the license as well as any agreement you've
 * entered into with WSO2 governing the purchase of this software and any
 * associated services.
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
