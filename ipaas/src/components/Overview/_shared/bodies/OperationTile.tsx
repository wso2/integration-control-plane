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

import { Box, Button, DrawerPanel, Typography } from '@wso2/oxygen-ui';
import { useState, type ReactNode } from 'react';
import { OPERATION_TILE_LABEL_SX, VIEW_DETAILS_BUTTON_SX, operationBadgeSx, operationTileSx } from './styles';

/**
 * Colour configuration for an operation tile + its drawer header. Each consumer
 * supplies its own palette — Integration as API uses per-HTTP-method colours,
 * MCP Server uses the brand primary. Values may be theme tokens
 * (e.g. `'primary.main'`) or raw CSS colours (e.g. `'#0095FF'`); both resolve
 * through MUI's `sx`.
 */
export interface OperationTileColors {
  /** Badge background. */
  badgeBg: string;
  /** Badge text colour (default white). */
  badgeText?: string;
  /** Tile / header background; defaults to a light wash of `badgeBg`. */
  cardBg?: string;
}

interface OperationTileProps {
  /** Text inside the coloured badge (e.g. `'GET'`, `'TOOL'`). */
  badgeLabel: string;
  /** Operation path or tool name shown next to the badge. */
  label: string;
  colors: OperationTileColors;
  /** Body rendered inside the right drawer (use `OperationHeader` at its top). */
  drawerContent: ReactNode;
  /** Drawer title (default `'Details'`). */
  drawerTitle?: ReactNode;
  /** Drawer width in px (default 720; MCP tools use a narrower drawer). */
  drawerWidth?: number;
}

/**
 * Generic operation row used across Overview env-card bodies: a coloured type
 * badge, the operation path / name, and a "View details" action that opens a
 * right drawer. The reusable counterpart of devant's `OperationViews/OperationTile`
 * — Integration as API and MCP Server share this, differing only in `colors`
 * and `drawerContent`.
 */
export default function OperationTile({ badgeLabel, label, colors, drawerContent, drawerTitle = 'Details', drawerWidth = 720 }: OperationTileProps): ReactNode {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Box sx={operationTileSx(colors)}>
        <Box sx={operationBadgeSx(colors, 72)}>{badgeLabel}</Box>
        <Typography sx={OPERATION_TILE_LABEL_SX}>{label}</Typography>
        <Button variant="text" color="inherit" size="small" onClick={() => setOpen(true)} sx={VIEW_DETAILS_BUTTON_SX}>
          View details
        </Button>
      </Box>

      <DrawerPanel open={open} onClose={() => setOpen(false)} width={drawerWidth}>
        <DrawerPanel.Header>
          <DrawerPanel.Title>{drawerTitle}</DrawerPanel.Title>
          <DrawerPanel.Actions>
            <DrawerPanel.CloseButton />
          </DrawerPanel.Actions>
        </DrawerPanel.Header>
        <DrawerPanel.Body>{open && drawerContent}</DrawerPanel.Body>
      </DrawerPanel>
    </>
  );
}
