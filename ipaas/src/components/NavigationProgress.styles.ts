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

import type { Theme } from '@wso2/oxygen-ui';

/**
 * Fixed to the viewport, not the layout: public pages (login, policies) have no
 * header to anchor to. Above `tooltip` so a navigation started from a dialog is
 * still visible, and click-through so it can never swallow an interaction.
 */
/** Shared with PageLoader, so the two progress bars stay the same weight. */
const BAR_HEIGHT = 3;

export const bar = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  height: BAR_HEIGHT,
  zIndex: (t: Theme) => t.zIndex.tooltip,
  pointerEvents: 'none',
  // A glow to lift the bar off a light background.
  boxShadow: (t: Theme) => `0 1px 10px ${t.palette.primary.main}`,
  "html[data-color-scheme='dark'] &": {
    boxShadow: 'none',
  },
} as const;
