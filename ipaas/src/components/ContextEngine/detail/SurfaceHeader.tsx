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

import { Box, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { mutedSx, surfaceHeaderSx } from '../styles';

interface SurfaceHeaderProps {
  title: string;
  description: string;
}

/**
 * Title of the API and MCP tabs. Whether the engine serves each surface is a deployment setting
 * the control plane provisions, so there is nothing to toggle here.
 */
export default function SurfaceHeader({ title, description }: SurfaceHeaderProps): JSX.Element {
  return (
    <Box sx={surfaceHeaderSx}>
      <Typography variant="h6" sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
      <Typography variant="body2" sx={mutedSx}>
        {description}
      </Typography>
    </Box>
  );
}
