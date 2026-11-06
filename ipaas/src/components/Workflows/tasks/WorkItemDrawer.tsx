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

import { Box, DrawerPanel, Skeleton, Stack } from '@wso2/oxygen-ui';
import type { JSX, ReactNode } from 'react';
import { useOpenMaximized } from '../shared/useOpenMaximized';
import * as styles from './WorkItemDrawer.styles';

/** The width a detail view is restored to from maximized. */
const DRAWER_WIDTH = 960;

interface WorkItemDrawerProps {
  /** The item shown, or null when the drawer is closed. */
  openId: string | null;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * The frame of a task's or review's detail: it opens maximized over the page, like the execution
 * view, and a person may restore it to a side panel for the item in front of them.
 */
export default function WorkItemDrawer({ openId, title, onClose, children }: WorkItemDrawerProps): JSX.Element {
  const maximized = useOpenMaximized(openId);
  const close = () => {
    // Focus left inside a closing drawer is hidden from assistive technology with it.
    (document.activeElement as HTMLElement | null)?.blur();
    onClose();
  };
  return (
    <DrawerPanel open={!!openId} onClose={close} width={DRAWER_WIDTH} {...maximized}>
      <DrawerPanel.Header>
        <DrawerPanel.Title>{title}</DrawerPanel.Title>
        <DrawerPanel.Actions>
          <DrawerPanel.ExpandButton expandLabel="Maximize" collapseLabel="Restore" />
          <DrawerPanel.CloseButton />
        </DrawerPanel.Actions>
      </DrawerPanel.Header>
      <DrawerPanel.Body>
        <Box sx={styles.content}>{children}</Box>
      </DrawerPanel.Body>
    </DrawerPanel>
  );
}

const ROWS = [0, 1, 2, 3, 4];

/** Stands in for a detail while it loads: its heading and its first two sections. */
export function WorkItemDetailSkeleton(): JSX.Element {
  return (
    <Stack gap={2.5} aria-busy="true">
      <Stack gap={1}>
        <Skeleton variant="text" width="40%" height={32} />
        <Skeleton variant="text" width="30%" />
      </Stack>
      <Box sx={styles.skeletonSection}>
        <Skeleton variant="text" width={120} />
        {ROWS.map((row) => (
          <Skeleton key={row} variant="text" width={`${70 - row * 8}%`} />
        ))}
      </Box>
      <Box sx={styles.skeletonSection}>
        <Skeleton variant="text" width={120} />
        <Skeleton variant="rounded" height={96} />
      </Box>
    </Stack>
  );
}
