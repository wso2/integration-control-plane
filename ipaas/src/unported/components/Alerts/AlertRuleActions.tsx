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

import { Box, FormControlLabel, IconButton, Switch } from '@wso2/oxygen-ui';
import { Edit2, Trash2 } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import type { AlertRule } from '../../../types/alerts';

interface AlertRuleActionsProps {
  rowData: AlertRule;
  setIsEditAlertRule: (v: boolean) => void;
  setSelectedAlertRule: (rule: AlertRule) => void;
  setIsDeleteAlertRule: (v: boolean) => void;
  setIsToggleAlertRule: (v: boolean) => void;
  disabled?: boolean;
}

export default function AlertRuleActions(props: AlertRuleActionsProps): JSX.Element {
  const { rowData, setIsEditAlertRule, setSelectedAlertRule, setIsDeleteAlertRule, setIsToggleAlertRule, disabled } = props;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 1, justifyContent: 'flex-end' }}>
      <FormControlLabel
        control={
          <Switch
            size="small"
            checked={rowData.enabled}
            disabled={disabled}
            slotProps={{ input: { 'aria-label': `Toggle alert rule ${rowData.enabled ? 'off' : 'on'}` } }}
            onChange={(e) => {
              setIsToggleAlertRule(true);
              setSelectedAlertRule({ ...rowData });
              e.stopPropagation();
            }}
          />
        }
        label=""
      />
      <IconButton
        size="small"
        disabled={disabled}
        onClick={(e) => {
          setIsEditAlertRule(true);
          setSelectedAlertRule(rowData);
          e.stopPropagation();
        }}
        aria-label="Edit alert">
        <Edit2 size={16} />
      </IconButton>
      <IconButton
        size="small"
        color="error"
        disabled={disabled}
        onClick={(e) => {
          setIsDeleteAlertRule(true);
          setSelectedAlertRule(rowData);
          e.stopPropagation();
        }}
        aria-label="Delete alert">
        <Trash2 size={16} />
      </IconButton>
    </Box>
  );
}
