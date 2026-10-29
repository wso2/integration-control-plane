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
import { useMemo, useSyncExternalStore } from 'react';
import { hexToRgba, KIND_SLOTS, type GraphPalette } from '../../../utils/contextGraph';
import { toMermaidSafeColor } from '../../../utils/mermaid';

export interface GraphColors {
  accent: string;
  record: string;
  entity: string;
  muted: string;
  link: string;
  /** A conflict between two facts: the theme's error colour. */
  conflict: string;
  /** One colour per kind slot (see `kindSlots`): blue, aqua, pink, green, purple. */
  kinds: string[];
}

/**
 * The kind colours, one set per colour scheme. Both sets were checked with the
 * data-viz palette validator, every pair against every other and against the
 * orange accent, on the theme's white and near-black surfaces: every two colours
 * stay apart for full colour vision (worst pair 15.6 light, 17.9 dark, floor 15),
 * and for red-green colour blindness they sit in the band that is allowed only
 * with a second cue, which the legend, the kind in brackets in the search and
 * the kind on the entity panel give. The accent orange is kept out of both
 * sets, so a selected or lit point never looks like a kind. Five is the most
 * that pass; more kinds would not be told apart, so the rest share the neutral
 * entity colour.
 */
const KIND_COLORS: Record<'light' | 'dark', string[]> = {
  light: ['#2a78d6', '#1baf7a', '#d81b60', '#008300', '#7b1fa2'],
  dark: ['#2a78d6', '#26a69a', '#d81b60', '#008300', '#8e24aa'],
};

const SCHEME_ATTRIBUTE = 'data-color-scheme';

function readScheme(): 'light' | 'dark' {
  return typeof document !== 'undefined' && document.documentElement.getAttribute(SCHEME_ATTRIBUTE) === 'dark' ? 'dark' : 'light';
}

function subscribeScheme(onChange: () => void): () => void {
  if (typeof document === 'undefined') return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: [SCHEME_ATTRIBUTE] });
  return () => observer.disconnect();
}

/**
 * The colour scheme in use. Oxygen UI switches it by setting `data-color-scheme`
 * on `<html>`; the theme object's own `palette.mode` stays the same in both, so
 * it cannot say.
 */
export function useColorScheme(): 'light' | 'dark' {
  return useSyncExternalStore(subscribeScheme, readScheme, () => 'light');
}

/**
 * The graph's colours from the app theme, so the canvas follows light and dark
 * mode: records in the text colour, entities in their kind's colour or, past the
 * coloured kinds, the secondary text colour, and everything an answer used in the
 * accent.
 */
export function useGraphTheme(): { colors: GraphColors; palette: GraphPalette } {
  const theme = useTheme();
  const scheme = useColorScheme();
  return useMemo(() => {
    const colors: GraphColors = {
      accent: toMermaidSafeColor(theme.palette.primary.main, '#f26b1d'),
      record: toMermaidSafeColor(theme.palette.text.primary, '#1d2028'),
      entity: toMermaidSafeColor(theme.palette.text.secondary, '#8a92a6'),
      muted: toMermaidSafeColor(theme.palette.divider, '#c9ccd5'),
      link: toMermaidSafeColor(theme.palette.text.disabled, '#b9bcc6'),
      conflict: toMermaidSafeColor(theme.palette.error.main, '#d32f2f'),
      kinds: KIND_COLORS[scheme].slice(0, KIND_SLOTS),
    };
    const palette: GraphPalette = {
      node: { record: hexToRgba(colors.record), entity: hexToRgba(colors.entity) },
      kinds: colors.kinds.map((c) => hexToRgba(c)),
      link: {
        // Document lines are faint until their document or entity is selected (see `litLinkColors`).
        mentions: hexToRgba(colors.link, 0.22),
        relates: hexToRgba(colors.entity, 0.7),
        conflicts: hexToRgba(colors.conflict, 0.9),
      },
      lit: hexToRgba(colors.accent),
    };
    return { colors, palette };
  }, [theme, scheme]);
}
