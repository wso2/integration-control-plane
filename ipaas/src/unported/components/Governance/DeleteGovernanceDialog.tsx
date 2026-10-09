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
import ConfirmDeleteDialog from '../../../components/ConfirmDeleteDialog';

interface DeleteGovernanceDialogProps {
  resourceName: string;
  resourceType: 'policy' | 'ruleset' | 'document';
  onConfirm: () => void;
  onClose: () => void;
  isPending: boolean;
}

export default function DeleteGovernanceDialog({ resourceName, resourceType, onConfirm, onClose, isPending }: DeleteGovernanceDialogProps): JSX.Element {
  return (
    <ConfirmDeleteDialog
      title={
        <>
          Delete <strong>{resourceName}</strong>?
        </>
      }
      onConfirm={onConfirm}
      onClose={onClose}
      isPending={isPending}
      confirmLabel="Delete">
      <Typography>This {resourceType} will be permanently deleted and cannot be recovered.</Typography>
    </ConfirmDeleteDialog>
  );
}
