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

import { useTheme } from '@wso2/oxygen-ui';
import { useMemo } from 'react';
import { hexToRgba, type GraphPalette } from '../../../utils/contextGraph';
import { toMermaidSafeColor } from '../../../utils/mermaid';

export interface GraphColors {
  accent: string;
  record: string;
  entity: string;
  muted: string;
  link: string;
}

/**
 * The graph's colours from the app theme, so the canvas follows light and dark
 * mode: records in the text colour, entities in the secondary text colour, and
 * everything an answer used in the accent.
 */
export function useGraphTheme(): { colors: GraphColors; palette: GraphPalette } {
  const theme = useTheme();
  return useMemo(() => {
    const colors: GraphColors = {
      accent: toMermaidSafeColor(theme.palette.primary.main, '#f26b1d'),
      record: toMermaidSafeColor(theme.palette.text.primary, '#1d2028'),
      entity: toMermaidSafeColor(theme.palette.text.secondary, '#8a92a6'),
      muted: toMermaidSafeColor(theme.palette.divider, '#c9ccd5'),
      link: toMermaidSafeColor(theme.palette.text.disabled, '#b9bcc6'),
    };
    const palette: GraphPalette = {
      node: { record: hexToRgba(colors.record), entity: hexToRgba(colors.entity) },
      link: {
        // Document lines are faint until their document or entity is selected (see `litLinkColors`).
        mentions: hexToRgba(colors.link, 0.22),
        relates: hexToRgba(colors.entity, 0.7),
      },
      lit: hexToRgba(colors.accent),
    };
    return { colors, palette };
  }, [theme]);
}
