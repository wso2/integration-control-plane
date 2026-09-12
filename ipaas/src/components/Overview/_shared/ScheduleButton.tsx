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

import { Button, ButtonGroup, ClickAwayListener, Grow, MenuItem, MenuList, Paper, Popper, Tooltip } from '@wso2/oxygen-ui';
import { CalendarClock, ChevronDown } from '@wso2/oxygen-ui-icons-react';
import { useRef, useState } from 'react';
import Authorized from '../../Authorized';
import { Permissions } from '../../../constants/permissions';
import { useStopSchedule } from '../../../hooks/useExecutions';
import ScheduleDialog from './ScheduleDialog';

export interface ScheduleButtonProps {
  envId: string;
  envName: string;
  componentId: string;
  orgHandler: string;
  releaseId: string;
  buildId?: string;
  versionId: string;
  deploymentPipelineId: string;
  hasSchedule: boolean;
  disabled?: boolean;
  /** Why the action is unavailable — shown as a tooltip while `disabled`. */
  disabledReason?: string;
  onSaveSuccess?: () => void;
  onSaveError?: (msg: string) => void;
  onStopSuccess?: () => void;
}

export default function ScheduleButton({ hasSchedule, disabled, disabledReason, onSaveSuccess, onSaveError, onStopSuccess, ...dialogProps }: ScheduleButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const splitButtonRef = useRef<HTMLDivElement>(null);
  const stopSchedule = useStopSchedule();

  // Suspends the CronJob only — the deployment has its own Stop/Start control.
  const handleStopSchedule = () => {
    setSplitOpen(false);
    stopSchedule.mutate({ componentId: dialogProps.componentId, envId: dialogProps.envId, orgHandler: dialogProps.orgHandler, releaseId: dialogProps.releaseId }, { onSuccess: () => onStopSuccess?.() });
  };

  return (
    <>
      <Authorized permissions={Permissions.INTEGRATION_MANAGE}>
        {hasSchedule ? (
          <Tooltip title={disabled ? (disabledReason ?? '') : ''} placement="top">
            <span>
            <ButtonGroup variant="contained" size="small" ref={splitButtonRef} disabled={disabled || stopSchedule.isPending}>
              <Button startIcon={<CalendarClock size={14} />} onClick={handleStopSchedule}>
                Stop Schedule
              </Button>
              <Button size="small" sx={{ px: 0.5 }} onClick={() => setSplitOpen((prev) => !prev)}>
                <ChevronDown size={14} />
              </Button>
            </ButtonGroup>
            <Popper open={splitOpen} anchorEl={splitButtonRef.current} placement="bottom-end" transition disablePortal style={{ zIndex: 1300 }}>
              {({ TransitionProps }) => (
                <Grow {...TransitionProps}>
                  <Paper elevation={3}>
                    <ClickAwayListener onClickAway={() => setSplitOpen(false)}>
                      <MenuList dense sx={{ minWidth: 160 }}>
                        <MenuItem
                          onClick={() => {
                            setSplitOpen(false);
                            setDialogOpen(true);
                          }}>
                          Edit Schedule
                        </MenuItem>
                      </MenuList>
                    </ClickAwayListener>
                  </Paper>
                </Grow>
              )}
            </Popper>
            </span>
          </Tooltip>
        ) : (
          <Tooltip title={disabled ? (disabledReason ?? '') : ''} placement="top">
            <span>
              <Button variant="contained" size="small" startIcon={<CalendarClock size={14} />} disabled={disabled} onClick={() => setDialogOpen(true)}>
                Schedule
              </Button>
            </span>
          </Tooltip>
        )}
      </Authorized>
      <ScheduleDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onSaveSuccess={onSaveSuccess} onSaveError={onSaveError} {...dialogProps} />
    </>
  );
}
