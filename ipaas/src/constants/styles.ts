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

export const CARD_HOVER_SX = {
  boxShadow: 'none',
  transition: 'all 0.2s ease-in-out',
  cursor: 'pointer',
  '&:hover': {
    boxShadow: (theme: { palette: { primary: { main: string } } }) => `0px 0px 0px 1.5px ${theme.palette.primary.main}`,
  },
} as const;

// Tall enough for PrebuiltCard's padded app-icon row, so both Start quickly tabs list cards of one height.
export const START_QUICKLY_CARD_MIN_HEIGHT = 90;

type PrimaryTheme = { palette: { primary: { main: string } } };

export const primaryTint = (percent: number) => (t: PrimaryTheme) => `color-mix(in srgb, ${t.palette.primary.main} ${percent}%, transparent)`;

/** An icon tile lit by a soft primary glow from its top-left. Size it where it is used. */
export const LIT_ICON_SX = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  borderRadius: 1,
  border: 1,
  borderColor: primaryTint(35),
  background: (t: PrimaryTheme) => `radial-gradient(circle at 30% 25%, ${primaryTint(28)(t)}, ${primaryTint(8)(t)} 70%)`,
  color: 'primary.main',
} as const;

export const PROVIDER_ICON_SX = {
  width: 40,
  height: 40,
  color: 'text.secondary',
  '&:hover': { color: 'primary.main', bgcolor: 'action.hover' },
} as const;

/**
 * GitHub's brand guidelines require its mark to stay black/white — never
 * recolored on hover — so this omits PROVIDER_ICON_SX's hover color swap.
 */
export const GITHUB_ICON_SX = {
  width: 40,
  height: 40,
  color: 'text.primary',
  '&:hover': { bgcolor: 'action.hover' },
} as const;

/** Colors a required TextField's asterisk red. */
export const REQUIRED_FIELD_SX = { '& .MuiFormLabel-asterisk': { color: 'error.main' } } as const;

/** Label sitting above a card, outside it — the option's name in the create flows. */
export const SECTION_LABEL_SX = {
  color: 'text.secondary',
  fontWeight: 500,
} as const;

/**
 * Compact pill-shaped Select used in page headers and toolbars (environment picker,
 * deployment track, API/endpoint pickers).
 *
 * `borderRadius` is set on the root as well as the outline: oxygen's theme gives
 * MuiOutlinedInput a `background.acrylic` fill at radius 8, so rounding only the
 * notched outline leaves the root's square corners showing past the border.
 */
export const PILL_SELECT_SX = {
  fontSize: '0.8125rem',
  borderRadius: 5,
  '& .MuiOutlinedInput-notchedOutline': { borderRadius: 5 },
  '& .MuiSelect-select': { py: 0.5, px: 1.5 },
} as const;

/** Row padding for the card-variant ListingTable, shared by the project, integration and environment lists. */
export const CARD_TABLE_SX = {
  '& .MuiTableBody-root .MuiTableCell-root': { py: 2 },
} as const;

/** The shared minimum width lines up the commit that follows each card title. */
export const CARD_HEADER_TITLE_SX = { fontWeight: 600, flexShrink: 0, minWidth: '7em' } as const;

// Oxygen 0.20's SearchBar `width="standard"`; pass the prop through once the console is on 0.20.
export const SEARCH_STANDARD_WIDTH_SX = { width: '100%', maxWidth: 400 } as const;
