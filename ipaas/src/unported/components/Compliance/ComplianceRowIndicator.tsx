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

import { Box, LinearProgress, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import type { ComplianceRow } from '../../../types/compliance';
import { complianceStatusColor, complianceStatusLabel, isFailedStatus } from '../../utils/compliance';

interface ComplianceRowIndicatorProps {
  row: ComplianceRow;
  /** Word shown next to the failed count, e.g. "Violated" or "Non-Compliant". */
  failedWord: string;
}

/** The "1/3 Violated" fraction with its status-colored progress bar. */
export default function ComplianceRowIndicator({ row, failedWord }: ComplianceRowIndicatorProps): JSX.Element {
  const failed = isFailedStatus(row.status);
  const success = complianceStatusColor(row.status) === 'success';
  if (!row.total) return <Typography variant="body2">N/A</Typography>;
  const count = success ? row.total : row.failed;
  // Neutral rows (not-applicable/unapplied) show their own status, not a "Violated" count.
  const word = failed ? failedWord : complianceStatusLabel(row.status);
  return (
    <Box sx={{ width: '100%', minWidth: 160 }}>
      <Typography variant="body2" noWrap sx={{ color: failed ? 'error.main' : success ? 'success.main' : 'text.secondary', fontWeight: 600 }}>
        {count}/{row.total}
        <Box component="span" sx={{ ml: 1.5 }}>
          {word}
        </Box>
      </Typography>
      <LinearProgress variant="determinate" value={row.failed > 0 ? (row.failed / row.total) * 100 : 100} color={failed ? 'error' : success ? 'success' : 'inherit'} sx={{ mt: 0.5, height: 4, borderRadius: 2 }} />
    </Box>
  );
}
