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

/** Shared by the drawers that host MiConfigEditor: MiConfigureDrawer and MiPromoteDrawer. */
export const drawerSx = {
  '& .MuiDrawer-paper': {
    width: 560,
    position: 'fixed',
    top: 64,
    height: 'calc(100% - 64px)',
    borderLeft: '1px solid',
    borderColor: 'divider',
    display: 'flex',
    flexDirection: 'column',
  },
} as const;

export const headerSx = { px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 } as const;

export const bodySx = { flex: 1, overflow: 'auto', px: 3, py: 2 } as const;

export const footerSx = { px: 2, py: 1.5, borderTop: '1px solid', borderColor: 'divider', flexShrink: 0 } as const;
