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
import type { JSX } from 'react';
import IntegratorIcon from '../../../../assets/icons/IntegratorIcon';
import { IDP_TYPE_LABEL, LOGO_BY_TYPE } from './idpTypes';

interface IdpLogoProps {
  type: string;
  height?: number;
  /** `icon` shows the compact mark (WSO2 pulse); `wordmark` shows the full brand logo. */
  variant?: 'icon' | 'wordmark';
}

/**
 * The logo for an IdP type. For WSO2 Identity Platform the `icon` variant renders
 * the theme-aware pulse mark (black on light, white on dark); the `wordmark`
 * variant renders the full brand logo. Other types use their static logo.
 */
export default function IdpLogo({ type, height = 48, variant = 'wordmark' }: IdpLogoProps): JSX.Element {
  if (type === 'Asgardeo' && variant === 'icon') {
    return (
      <Box sx={{ display: 'inline-flex', color: 'text.primary' }}>
        <IntegratorIcon width={height} height={height} />
      </Box>
    );
  }
  const src = LOGO_BY_TYPE[type] ?? LOGO_BY_TYPE.Custom;
  const isWordmark = type === 'Asgardeo';
  return <img src={src} alt={IDP_TYPE_LABEL[type] ?? type} style={{ height, maxWidth: isWordmark ? height * 4 : height, objectFit: 'contain' }} />;
}
