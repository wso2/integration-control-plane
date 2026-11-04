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

import { Box, Chip, FormControlLabel, Radio, RadioGroup, Stack, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';

/**
 * The visibility choice while choosing by role is turned off: shown greyed out on
 * "Everyone who can query this engine", so people see what is coming. It changes nothing.
 */
export default function VisibilityComingSoon({ label }: { label: string }): JSX.Element {
  return (
    <Box role="group" aria-label={`${label}, coming soon`}>
      <Stack direction="row" alignItems="center" gap={1}>
        <Typography variant="subtitle2" color="text.disabled" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
        <Chip size="small" label="Coming soon" />
      </Stack>
      <RadioGroup value="everyone" sx={{ mt: 0.5 }}>
        <FormControlLabel value="everyone" disabled control={<Radio size="small" />} label={<Typography variant="body2">Everyone who can query this engine</Typography>} />
        <FormControlLabel value="roles" disabled control={<Radio size="small" />} label={<Typography variant="body2">Only some roles</Typography>} />
      </RadioGroup>
    </Box>
  );
}
