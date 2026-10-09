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
import { XCircle } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { STANDALONE_RULESET_LABEL } from '../../constants/compliance';
import type { ComplianceLine } from '../../../types/compliance';
import { complianceStatusColor } from '../../utils/compliance';
import ViolationChips from './ViolationChips';

interface ComplianceNestedLineProps {
  line: ComplianceLine;
  onClick?: () => void;
}

/** Status-marked name line inside an expanded row (e.g. one ruleset), with optional click-through. */
export default function ComplianceNestedLine({ line, onClick }: ComplianceNestedLineProps): JSX.Element {
  const color = complianceStatusColor(line.status);
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 0.25 }}>
      {color === 'error' ? (
        <Box component="span" sx={{ color: 'error.main', display: 'inline-flex' }}>
          <XCircle size={14} />
        </Box>
      ) : (
        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: color === 'success' ? 'success.main' : 'text.disabled', mx: '4px' }} />
      )}
      {onClick && line.id ? (
        <Typography component="button" type="button" variant="body2" onClick={onClick} sx={{ background: 'none', border: 0, p: 0, cursor: 'pointer', color: 'inherit', textAlign: 'left', '&:hover': { textDecoration: 'underline' } }}>
          {line.name}
        </Typography>
      ) : (
        <Typography variant="body2">{line.name ?? STANDALONE_RULESET_LABEL}</Typography>
      )}
      {line.violations && <ViolationChips counts={line.violations} showZeroes={false} />}
    </Stack>
  );
}
