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

import { Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import ConfirmDeleteDialog from '../../../../components/ConfirmDeleteDialog';

interface AlertRuleDeleteDialogProps {
  isOpen: boolean;
  alertType?: string;
  handleClose: () => void;
  handleConfirm: () => void;
  isLoading: boolean;
}

export default function AlertRuleDeleteDialog(props: AlertRuleDeleteDialogProps): JSX.Element | null {
  const { isOpen, alertType, isLoading, handleClose, handleConfirm } = props;

  if (!isOpen) return null;

  return (
    <ConfirmDeleteDialog title="Delete Alert Rule" onConfirm={handleConfirm} onClose={handleClose} isPending={isLoading}>
      <Typography variant="body1" gutterBottom>
        Are you sure you want to delete the <strong>{alertType}</strong> type alert rule?
      </Typography>
      <Typography variant="body2">This action is irreversible. All associated alerts will be lost.</Typography>
    </ConfirmDeleteDialog>
  );
}
