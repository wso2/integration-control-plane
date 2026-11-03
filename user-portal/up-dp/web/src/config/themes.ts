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

import {
  AcrylicOrangeTheme,
  AcrylicPurpleTheme,
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

/** The Oxygen UI themes `PORTAL_THEME` can name. `acrylicOrange`, the WSO2 Cloud consoles' theme, is the default. */
export const THEMES: Record<string, Theme> = {
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

const DEFAULT_THEME = 'acrylicOrange';
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
