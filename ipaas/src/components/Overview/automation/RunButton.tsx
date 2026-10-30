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

import { Button, ButtonGroup, CircularProgress, ClickAwayListener, Grow, MenuItem, MenuList, Paper, Popper } from '@wso2/oxygen-ui';
import { ChevronDown, Play } from '@wso2/oxygen-ui-icons-react';
import { useRef, useState } from 'react';

interface RunButtonProps {
  envCritical?: boolean | null;
  disabled?: boolean;
  pending?: boolean;
  onRun: () => void;
  onRunWithArgs: () => void;
}

type SelectedAction = 'run' | 'runWithArgs';

export default function RunButton({ envCritical, disabled, pending, onRun, onRunWithArgs }: RunButtonProps) {
  const [splitOpen, setSplitOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<SelectedAction>('run');
  const anchorRef = useRef<HTMLDivElement>(null);
  const label = envCritical ? 'Run' : 'Test';

  const handlePrimaryClick = () => {
    if (selectedAction === 'runWithArgs') {
      onRunWithArgs();
    } else {
      onRun();
    }
  };

  const handleMenuSelect = (action: SelectedAction) => {
    setSelectedAction(action);
    setSplitOpen(false);
    if (action === 'runWithArgs') {
      onRunWithArgs();
    } else {
      onRun();
    }
  };

  return (
    <>
      <ButtonGroup variant="contained" size="small" ref={anchorRef} disabled={disabled || pending}>
        <Button startIcon={pending ? <CircularProgress color="inherit" size={14} /> : <Play size={14} />} aria-label={selectedAction === 'runWithArgs' ? `${label} with Arguments` : label} onClick={handlePrimaryClick}>
          {selectedAction === 'runWithArgs' ? `${label} with Arguments` : label}
        </Button>
        <Button size="small" sx={{ px: 0.5 }} aria-label="More run options" aria-expanded={splitOpen} aria-haspopup="menu" aria-controls="menu-run-options" onClick={() => setSplitOpen((prev) => !prev)}>
          <ChevronDown size={14} />
        </Button>
      </ButtonGroup>

      <Popper open={splitOpen} anchorEl={anchorRef.current} placement="bottom-end" transition disablePortal style={{ zIndex: 1300 }}>
        {({ TransitionProps }) => (
          <Grow {...TransitionProps}>
            <Paper elevation={3}>
              <ClickAwayListener onClickAway={() => setSplitOpen(false)}>
                <MenuList id="menu-run-options" dense sx={{ minWidth: 120 }}>
                  <MenuItem onClick={() => handleMenuSelect('run')}>{label}</MenuItem>
                  <MenuItem onClick={() => handleMenuSelect('runWithArgs')}>{label} with Arguments</MenuItem>
                </MenuList>
              </ClickAwayListener>
            </Paper>
          </Grow>
        )}
      </Popper>
    </>
  );
}
