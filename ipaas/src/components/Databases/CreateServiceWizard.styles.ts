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

// The wizard frame, modelled on Oxygen's FullScreenWizard but sized to sit inside PageContent.
export const wizardSx = {
  display: 'flex',
  flexDirection: 'column',
  borderRadius: '0 0 16px 16px',
  // The step lines take the place of the top border.
  borderTop: 0,
  overflow: 'hidden',
} as const;

export const progressSx = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 1,
} as const;

export const progressSegmentSx = (reached: boolean) =>
  ({
    height: 2,
    borderRadius: 1.5,
    bgcolor: reached ? 'primary.main' : 'action.selected',
    transition: 'background-color 0.2s',
  }) as const;

export const bodySx = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 3.5,
  p: { xs: 3, md: 5 },
} as const;

export const stepHeaderSx = {
  display: 'flex',
  flexDirection: 'column',
  gap: 1.25,
  // Focus lands here on Back, for keyboard and screen-reader users; no ring is drawn.
  outline: 'none',
} as const;

export const stepTitleSx = { fontWeight: 600, letterSpacing: '-0.015em' } as const;

export const chipsSx = { display: 'flex', flexWrap: 'wrap', gap: 1 } as const;

// On the Chip itself, so it outranks the theme's own icon margin.
export const chipSx = { '& .MuiChip-icon': { marginLeft: '8px' } } as const;

export const nameInputSx = { fontFamily: 'monospace' } as const;

export const nameValidSx = { display: 'flex', color: 'success.main' } as const;

export const planSectionSx = { display: 'flex', flexDirection: 'column', gap: 1.75 } as const;

export const planGridSx = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
  gap: 2,
} as const;

export const footerSx = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: 2,
  px: { xs: 3, md: 5 },
  py: 2,
  borderTop: 1,
  borderColor: 'divider',
} as const;

export const footerActionsSx = { display: 'flex', alignItems: 'center', gap: 1.5, ml: 'auto' } as const;
