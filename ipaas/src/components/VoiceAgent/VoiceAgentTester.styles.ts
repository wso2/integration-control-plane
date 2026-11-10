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

import { pulseSx, transcriptBaseSx } from './VoiceSession.styles';

export const rowSx = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  px: 2,
  py: 1.75,
  borderRadius: 1,
  bgcolor: 'action.hover',
} as const;

export const orbSx = (live: boolean) =>
  ({
    width: 44,
    height: 44,
    bgcolor: live ? 'primary.main' : 'background.paper',
    color: live ? 'primary.contrastText' : 'text.disabled',
    boxShadow: 2,
    ...pulseSx(live),
  }) as const;

export const textSx = { flex: 1, minWidth: 0 } as const;

export const transcriptSx = { ...transcriptBaseSx, mt: 1.5 } as const;

export const errorSx = { mt: 1.5 } as const;
