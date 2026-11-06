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

/** Positions the target tick against the bar; the bar itself stays the only thing in the flow. */
export const wrapper = {
  position: 'relative',
  width: '100%',
} as const;

/** The track clips the fill's rounded end, so the tick lives outside it. */
export const track = {
  width: '100%',
  height: 6,
  borderRadius: 3,
  bgcolor: 'action.hover',
  overflow: 'hidden',
} as const;

export const fill = (percent: number) =>
  ({
    width: `${percent}%`,
    height: '100%',
    borderRadius: 3,
    bgcolor: 'primary.main',
  }) as const;

/** Taller than the bar and in the text colour, so it reads over both the track and the fill. */
export const target = (percent: number) =>
  ({
    position: 'absolute',
    top: -3,
    left: `${percent}%`,
    width: 2,
    height: 12,
    borderRadius: 1,
    bgcolor: 'text.primary',
    transform: 'translateX(-50%)',
  }) as const;
