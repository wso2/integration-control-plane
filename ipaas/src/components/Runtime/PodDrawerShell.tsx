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

import { DrawerPanel, useTheme } from '@wso2/oxygen-ui';
import { useEffect, useRef, useState, type JSX, type ReactNode } from 'react';
import { POD_DRAWER_WIDTH } from '../../constants/runtime';
import * as styles from './PodDrawerShell.styles';

interface PodDrawerShellProps {
  open: boolean;
  onClose: () => void;
  /** Fires after the slide-out finishes, so the caller can drop the selected pod. */
  onExited?: () => void;
  title: ReactNode;
  children: ReactNode;
}

/**
 * Right drawer used by both pod drawers. Pod events and log lines are wide, so the
 * header carries an expand toggle that takes the drawer to the full window width.
 */
export default function PodDrawerShell({ open, onClose, onExited, title, children }: PodDrawerShellProps): JSX.Element {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const wasOpen = useRef(open);
  const onExitedRef = useRef(onExited);
  useEffect(() => {
    onExitedRef.current = onExited;
  });

  // DrawerPanel exposes no transition callbacks, so wait out the slide-out before resetting.
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    const timer = setTimeout(() => {
      wasOpen.current = false;
      setExpanded(false);
      onExitedRef.current?.();
    }, theme.transitions.duration.leavingScreen);
    return () => clearTimeout(timer);
  }, [open, theme.transitions.duration.leavingScreen]);

  const handleClose = () => {
    (document.activeElement as HTMLElement)?.blur();
    onClose();
  };

  return (
    <DrawerPanel open={open} onClose={handleClose} width={POD_DRAWER_WIDTH} expanded={expanded} onExpandedChange={setExpanded}>
      <DrawerPanel.Header>
        <DrawerPanel.Title>{title}</DrawerPanel.Title>
        <DrawerPanel.Actions>
          <DrawerPanel.ExpandButton expandLabel="Expand to full width" collapseLabel="Exit full width" />
          <DrawerPanel.CloseButton />
        </DrawerPanel.Actions>
      </DrawerPanel.Header>

      <DrawerPanel.Body sx={styles.body}>{children}</DrawerPanel.Body>
    </DrawerPanel>
  );
}
