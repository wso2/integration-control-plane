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

import { ColorSchemeImage } from '@wso2/oxygen-ui';
import { BUNDLED_LOGO, usePortalConfig } from '../config/portalConfig';

/** The portal's logo for the current colour scheme: `PORTAL_LOGO_LIGHT_URL` and `PORTAL_LOGO_DARK_URL`, or the bundled wordmark. */
export default function Logo() {
  const { logo, productName } = usePortalConfig();
  const bundled = logo.light === BUNDLED_LOGO.light && logo.dark === BUNDLED_LOGO.dark;
  return (
    <ColorSchemeImage
      src={{ light: logo.light, dark: logo.dark }}
      alt={{ light: productName, dark: productName }}
      sx={{ height: 20, width: 'auto', aspectRatio: bundled ? '616 / 55' : undefined }}
    />
  );
}
