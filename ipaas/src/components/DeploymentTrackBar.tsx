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
import type { ReactNode } from 'react';
import { bandSx, barSx } from './DeploymentTrackBar.styles';

interface DeploymentTrackBarProps {
  /** The page's environment selector. */
  extra?: ReactNode;
}

/**
 * The band at the top of integration-level pages that holds their environment selector.
 * An integration has one implicit deployment track, so there is no track picker.
 */
export default function DeploymentTrackBar({ extra }: DeploymentTrackBarProps) {
  if (!extra) return null;
  return (
    <Box sx={bandSx}>
      <Box sx={barSx}>{extra}</Box>
    </Box>
  );
}
