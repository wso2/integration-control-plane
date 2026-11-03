/*
 * Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com). All Rights Reserved.
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein is strictly forbidden, unless permitted by WSO2 in accordance with
 * the WSO2 Commercial License available at http://wso2.com/licenses.
 * For specific language governing the permissions and limitations under
 * this license, please see the license as well as any agreement you've
 * entered into with WSO2 governing the purchase of this software and any
 * associated services.
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
