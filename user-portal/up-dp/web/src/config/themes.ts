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

import {
  AcrylicOrangeTheme,
  AcrylicPurpleTheme,
  ChoreoLabsTheme,
  ClassicTheme,
  createOxygenTheme,
  darken,
  getContrastRatio,
  HighContrastTheme,
  lighten,
  OxygenTheme,
  PaleBaseTheme,
  PaleGrayTheme,
  PaleIndigoTheme,
  type Theme,
  WSO2Theme,
} from '@wso2/oxygen-ui';

/** The Oxygen UI themes `PORTAL_THEME` can name. `choreoLabs`, the integration console's blue theme, is the default. */
export const THEMES: Record<string, Theme> = {
  choreoLabs: ChoreoLabsTheme,
  oxygen: OxygenTheme,
  acrylicOrange: AcrylicOrangeTheme,
  acrylicPurple: AcrylicPurpleTheme,
  classic: ClassicTheme,
  wso2: WSO2Theme,
  highContrast: HighContrastTheme,
  paleBase: PaleBaseTheme,
  paleGray: PaleGrayTheme,
  paleIndigo: PaleIndigoTheme,
};

const DEFAULT_THEME = 'choreoLabs';
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function primary(main: string, tone: 'light' | 'dark') {
  return {
    main,
    light: lighten(main, tone === 'light' ? 0.3 : 0.4),
    dark: darken(main, 0.25),
    contrastText: getContrastRatio(main, '#ffffff') >= 3 ? '#ffffff' : '#000000',
  };
}

/** The named theme as it is, or with its primary colour replaced by `PORTAL_PRIMARY_COLOR`. */
export function resolveTheme(key: string, primaryColor?: string): Theme {
  const base = THEMES[key] ?? THEMES[DEFAULT_THEME];
  if (!primaryColor || !HEX_COLOR.test(primaryColor)) return base;
  return createOxygenTheme(
    { colorSchemes: { light: { palette: { primary: primary(primaryColor, 'light') } }, dark: { palette: { primary: primary(primaryColor, 'dark') } } } },
    base,
  );
}
