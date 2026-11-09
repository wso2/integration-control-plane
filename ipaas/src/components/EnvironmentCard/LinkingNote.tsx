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

import { CircularProgress, Stack, Typography } from '@wso2/oxygen-ui';

/** While a link write is on its way, the link actions wait for it: this says why they don't answer. */
export function LinkingNote() {
  return (
    <Stack direction="row" alignItems="center" gap={1} role="status" sx={{ mb: 1.5 }}>
      <CircularProgress size={12} />
      <Typography variant="caption" color="text.secondary">
        Linking…
      </Typography>
    </Stack>
  );
}
