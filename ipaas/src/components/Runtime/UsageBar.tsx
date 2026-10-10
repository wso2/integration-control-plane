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
import { type JSX } from 'react';
import * as styles from './UsageBar.styles';

const clamp = (value: number): number => Math.max(0, Math.min(100, value));

/**
 * A thin horizontal usage bar; `percent` is clamped to 0–100. `target`, when given, is marked with a
 * tick so usage can be read against it; the card around the bar states the value in words.
 */
export default function UsageBar({ percent, target }: { percent: number; target?: number }): JSX.Element {
  return (
    <Box sx={styles.wrapper}>
      <Box sx={styles.track}>
        <Box sx={styles.fill(clamp(percent))} />
      </Box>
      {target !== undefined && <Box sx={styles.target(clamp(target))} aria-hidden />}
    </Box>
  );
}
