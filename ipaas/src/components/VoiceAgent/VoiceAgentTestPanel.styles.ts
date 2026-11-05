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

export const panelSx = {
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 480,
  overflow: 'hidden',
} as const;

export const headerSx = {
  display: 'flex',
  alignItems: 'center',
  gap: 1.5,
  px: 2.5,
  py: 1.75,
  borderBottom: 1,
  borderColor: 'divider',
} as const;

export const stageSx = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 2,
  px: 3,
  py: 6,
  textAlign: 'center',
} as const;

export const haloSx = {
  width: 240,
  height: 240,
  borderRadius: '50%',
  border: 1,
  borderStyle: 'dashed',
  borderColor: 'divider',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
} as const;

/** The orb; `live` makes it pulse while a call is connected. */
export const orbSx = (live: boolean) =>
  ({
    width: 104,
    height: 104,
    borderRadius: '50%',
    bgcolor: live ? 'primary.light' : 'action.hover',
    boxShadow: 4,
    transition: 'background-color 300ms',
    animation: live ? 'voice-orb-pulse 1.6s ease-in-out infinite' : 'none',
    '@keyframes voice-orb-pulse': {
      '0%, 100%': { transform: 'scale(1)' },
      '50%': { transform: 'scale(1.08)' },
    },
  }) as const;

export const transcriptSx = {
  width: '100%',
  maxWidth: 720,
  maxHeight: 280,
  overflowY: 'auto',
  p: 2,
  textAlign: 'left',
} as const;

export const hiddenSx = { display: 'none' } as const;
