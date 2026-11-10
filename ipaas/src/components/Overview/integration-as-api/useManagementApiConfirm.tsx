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
import { useState, type ReactNode } from 'react';
import ConfirmDeleteDialog from '../../ConfirmDeleteDialog';

interface ManagementApiConfirmOptions {
  /** The dialog's question, naming the change. */
  title: string;
  /** What the change puts at risk (workflowIntegration's MANAGEMENT_API_*_WARNING). */
  warning: string;
  /** The confirm button's label: the editor's own verb. */
  confirmLabel: string;
}

export interface ManagementApiConfirm {
  /** Runs `change` at once for any other endpoint, and once confirmed for a workflow's Management API. */
  request: (change: () => void) => void;
  /** The confirmation while it is open; render it beside the editor. */
  dialog: ReactNode;
}

/**
 * Asks before a change to a workflow's Management API goes through, saying what it puts at risk: the console's
 * workflow pages and the User Portal call that API. A change to any other endpoint goes straight ahead.
 */
export function useManagementApiConfirm(isManagementApi: boolean, { title, warning, confirmLabel }: ManagementApiConfirmOptions): ManagementApiConfirm {
  const [change, setChange] = useState<(() => void) | null>(null);
  const close = () => setChange(null);
  return {
    request: (next) => (isManagementApi ? setChange(() => next) : next()),
    dialog: change ? (
      <ConfirmDeleteDialog
        title={title}
        onConfirm={() => {
          close();
          change();
        }}
        onClose={close}
        isPending={false}
        confirmLabel={confirmLabel}
        maxWidth="xs">
        <Typography variant="body2">{warning}</Typography>
      </ConfirmDeleteDialog>
    ) : null,
  };
}
