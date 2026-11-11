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

// MOCK. The Consumers panel's styles, plus the hand-built drawer frame the integration section used before it moved to DrawerPanel.
export * from '../../../Overview/integration-as-api/apiConsumption.styles';

/** Sized and placed like the Build History drawer: below the top nav, full height beneath it. */
export const rightDrawer = {
  '& .MuiDrawer-paper': {
    width: { xs: '100%', sm: 560 },
    top: { xs: '56px', sm: '64px' },
    height: 'auto',
    bottom: 0,
  },
} as const;

export const drawerFrame = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
} as const;

export const drawerHeader = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  px: 2,
  py: 1.5,
  borderBottom: '1px solid',
  borderColor: 'divider',
  flexShrink: 0,
} as const;

export const drawerBody = {
  flex: 1,
  overflow: 'auto',
  px: 2,
  py: 2,
} as const;

export const drawerFooter = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 1,
  px: 3,
  py: 2,
  borderTop: '1px solid',
  borderColor: 'divider',
} as const;

/** Footer with destructive/secondary actions on the left and the primary on the right. */
export const drawerFooterSplit = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 1,
  px: 3,
  py: 2,
  borderTop: '1px solid',
  borderColor: 'divider',
} as const;

export const requiredMark = {
  color: 'error.main',
  ml: 0.25,
} as const;
