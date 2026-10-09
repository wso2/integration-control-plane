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

import { Skeleton, Stack } from '@wso2/oxygen-ui';
import type { JSX } from 'react';

/**
 * Form-shaped placeholder shown while a governance edit page loads its entity.
 * Mirrors the stacked field layout so the form fades in without a layout jump.
 */
export default function GovernanceFormSkeleton(): JSX.Element {
  return (
    <Stack gap={3} sx={{ maxWidth: 720 }} aria-busy="true" aria-label="Loading">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} variant="rounded" height={56} />
      ))}
    </Stack>
  );
}
