/**
 * Copyright (c) 2024, WSO2 LLC. (http://www.wso2.com).
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

import { ColorSchemeImage, useThemeContent } from '@wso2/oxygen-ui';

export default function Logo() {
  const icpLogo = (
    <ColorSchemeImage
      src={{
        light: `${import.meta.env.BASE_URL}assets/images/logo/WSO2-Integration-Black.svg`,
        dark: `${import.meta.env.BASE_URL}assets/images/logo/WSO2-Integration-White.svg`,
      }}
      alt={{ light: 'WSO2 Integration logo', dark: 'WSO2 Integration logo' }}
      sx={{ height: 20, width: 'auto', aspectRatio: '400 / 55' }}
    />
  );

  const Logo = useThemeContent({
    default: icpLogo,
    acrylicPurple: icpLogo,
    choreo: icpLogo,
  });

  return Logo;
}
