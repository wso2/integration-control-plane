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

export const rowSx = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  px: 2,
  py: 1.75,
  borderRadius: 1,
  bgcolor: 'action.hover',
} as const;

/** The orb avatar; `live` tints and pulses it while a call is connected. */
export const orbSx = (live: boolean) =>
  ({
    width: 44,
    height: 44,
    bgcolor: live ? 'primary.main' : 'background.paper',
    color: live ? 'primary.contrastText' : 'text.disabled',
    boxShadow: 2,
    animation: live ? 'voice-tester-pulse 1.6s ease-in-out infinite' : 'none',
    '@keyframes voice-tester-pulse': {
      '0%, 100%': { transform: 'scale(1)' },
      '50%': { transform: 'scale(1.08)' },
    },
  }) as const;

export const textSx = { flex: 1, minWidth: 0 } as const;

export const transcriptSx = { maxHeight: 280, overflowY: 'auto', p: 2, mt: 1.5 } as const;

export const hiddenSx = { display: 'none' } as const;
