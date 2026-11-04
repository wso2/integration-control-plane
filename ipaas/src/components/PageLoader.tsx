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
import type { JSX } from 'react';
import * as styles from './PageLoader.styles';

interface PageLoaderProps {
  /** Shown under the spinner. Omit for a bare loader. */
  label?: string;
  /** Fills the window rather than the page area — for routes rendered outside the app shell. */
  viewport?: boolean;
}

/** A page's loading state: a spinner centred in the area it fills. */
export default function PageLoader({ label, viewport = false }: PageLoaderProps): JSX.Element {
  return (
    <Stack sx={styles.frame(viewport)}>
      <CircularProgress color="primary" size={32} aria-label={label ?? 'Loading'} />
      {label && (
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
      )}
    </Stack>
  );
}
