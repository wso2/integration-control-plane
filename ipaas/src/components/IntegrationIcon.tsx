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

import { Avatar } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { EXTERNAL_COMPONENT_ICON, integrationTypeIcon } from '../constants/integrationIcons';
import type { IntegrationType } from '../types/integration';
import * as styles from './IntegrationIcon.styles';

interface IntegrationIconProps {
  type: IntegrationType | null | undefined;
  /** Diameter of the badge, in px. The glyph scales with it. */
  size?: number;
  /** Owned by another platform — renders the external glyph, muted. */
  external?: boolean;
}

/** The type badge shown wherever an integration is listed or headlined; styled like ListingCard's badge. */
export default function IntegrationIcon({ type, size = 40, external = false }: IntegrationIconProps): JSX.Element {
  const Icon = external ? EXTERNAL_COMPONENT_ICON : integrationTypeIcon(type);
  return (
    <Avatar aria-hidden="true" variant={external ? 'circular' : 'light'} color="primary" sx={styles.badge(size, external)}>
      <Icon size={Math.round(size * 0.45)} />
    </Avatar>
  );
}
