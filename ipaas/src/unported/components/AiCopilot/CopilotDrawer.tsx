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

import { Box, Divider, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { BookOpen, Maximize2, Minimize2, MoreVertical, Plus, X } from '@wso2/oxygen-ui-icons-react';
import { useContext, useState } from 'react';
import type { JSX } from 'react';
import AIOutlineIcon from '../../assets/icons/ai/AIOutlineIcon';
import { CopilotContext } from '../../contexts/CopilotContext';
import CopilotChatWindow from './CopilotChatWindow';

const NORMAL_WIDTH = 500;
const EXPANDED_WIDTH = '100%';

export default function CopilotDrawer(): JSX.Element {
  const { showCopilot, setShowCopilot, isCopilotExpanded, setIsCopilotExpanded, clearChat } = useContext(CopilotContext);
  const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLButtonElement | null>(null);

  const panelWidth = isCopilotExpanded ? EXPANDED_WIDTH : NORMAL_WIDTH;
  const menuOpen = Boolean(menuAnchorEl);

  const handleClose = () => {
    setShowCopilot(false);
    setIsCopilotExpanded(false);
  };

  const handleNewChat = () => {
    setMenuAnchorEl(null);
    clearChat();
  };

  const handleLearnMore = () => {
    setMenuAnchorEl(null);
    window.open('https://wso2.com/choreo/docs/ai-features/choreo-copilot/', '_blank', 'noopener,noreferrer');
  };

  return (
    /* Outer box: transitions width, clips content during animation */
    <Box
      sx={{
        width: showCopilot ? panelWidth : 0,
        flexShrink: 0,
        overflow: 'hidden',
        visibility: showCopilot ? 'visible' : 'hidden',
        transition: 'width 225ms cubic-bezier(0, 0, 0.2, 1), visibility 225ms',
        borderLeft: showCopilot ? '1px solid' : 'none',
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
      }}>
      {/* Inner box: fixed width so content doesn't reflow during the width transition */}
      <Box
        sx={{
          width: panelWidth,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          bgcolor: 'background.acrylic',
          backdropFilter: isCopilotExpanded ? 'none' : 'blur(8px)',
          transition: 'background-color 225ms cubic-bezier(0, 0, 0.2, 1)',
        }}>
        {/* Header */}
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1, flexShrink: 0 }}>
          <Stack direction="row" alignItems="center" gap={1}>
            <AIOutlineIcon />
            <Box>
              <Typography variant="body1" fontWeight={500}>
                Copilot
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" alignItems="center" gap={0.25}>
            {/* Three-dots menu */}
            <Tooltip title="More options">
              <IconButton size="small" onClick={(e) => setMenuAnchorEl(e.currentTarget)} aria-label="More options" aria-controls={menuOpen ? 'copilot-more-menu' : undefined} aria-haspopup="true" aria-expanded={menuOpen} sx={{ color: 'primary.main' }}>
                <MoreVertical size={16} />
              </IconButton>
            </Tooltip>

            {/* Expand / collapse — hidden on mobile */}
            <Tooltip title={isCopilotExpanded ? 'Collapse' : 'Expand'}>
              <IconButton size="small" onClick={() => setIsCopilotExpanded((p) => !p)} aria-label={isCopilotExpanded ? 'Collapse copilot' : 'Expand copilot'} sx={{ color: 'primary.main', display: { xs: 'none', sm: 'inline-flex' } }}>
                {isCopilotExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </IconButton>
            </Tooltip>

            {/* Close */}
            <Tooltip title="Close">
              <IconButton size="small" onClick={handleClose} aria-label="Close copilot" sx={{ color: 'primary.main' }}>
                <X size={16} />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>

        {/* More-actions menu — MUI Menu handles keyboard nav, Escape, and focus management */}
        <Menu
          id="copilot-more-menu"
          anchorEl={menuAnchorEl}
          open={menuOpen}
          onClose={() => setMenuAnchorEl(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          slotProps={{ paper: { elevation: 3, sx: { minWidth: 180 } } }}>
          <MenuItem onClick={handleNewChat} dense sx={{ px: 2, py: 1 }}>
            <ListItemIcon sx={{ minWidth: 32 }}>
              <Plus size={14} />
            </ListItemIcon>
            <ListItemText primaryTypographyProps={{ variant: 'body2' }}>New Chat</ListItemText>
          </MenuItem>
          <MenuItem onClick={handleLearnMore} dense sx={{ px: 2, py: 1 }}>
            <ListItemIcon sx={{ minWidth: 32 }}>
              <BookOpen size={14} />
            </ListItemIcon>
            <ListItemText primaryTypographyProps={{ variant: 'body2' }}>Learn More</ListItemText>
          </MenuItem>
        </Menu>

        <Divider />
        <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <CopilotChatWindow />
        </Box>
      </Box>
    </Box>
  );
}
