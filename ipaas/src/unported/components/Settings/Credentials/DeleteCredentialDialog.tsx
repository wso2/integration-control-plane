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
import type { ReactNode } from 'react';
import { useCredentialDeleteEligibility, useDeleteGitCredential } from '../../../../hooks/useCredentials';
import ConfirmDeleteDialog from '../../../../components/ConfirmDeleteDialog';
import DeletionEligibilityContent from '../../../../components/DeletionEligibilityContent';
import type { GitCredential } from '../../../../types/credentials';

/**
 * Confirms deleting a git credential. Runs the deletion-eligibility check on open;
 * if the credential is in use, lists the blocking components and disables the action.
 */
export default function DeleteCredentialDialog({ credential, onClose, onDeleted, onError }: { credential: GitCredential; onClose: () => void; onDeleted: (name: string) => void; onError: (message: string) => void }): ReactNode {
  const { data: eligibility, isLoading, isError, refetch } = useCredentialDeleteEligibility(credential.id);
  const del = useDeleteGitCredential();

  const doDelete = () =>
    del.mutate(credential.id, {
      onSuccess: () => {
        onClose();
        onDeleted(credential.name);
      },
      onError: (e) => {
        onClose();
        onError(e.message);
      },
    });

  return (
    <ConfirmDeleteDialog
      title={
        <>
          Delete <strong>&lsquo;{credential.name}&rsquo;</strong>?
        </>
      }
      onConfirm={doDelete}
      onClose={onClose}
      isPending={del.isPending}
      confirmDisabled={!eligibility?.canDelete}>
      <DeletionEligibilityContent
        entityLabel="credential"
        isLoading={isLoading}
        isError={isError || !eligibility}
        canDelete={!!eligibility?.canDelete}
        onRetry={() => refetch()}
        blockedDetails={(eligibility?.components ?? []).map((c) => (
          <Typography key={c.projectName} variant="body2">
            {c.projectName}: {c.componentNames.join(', ')}
          </Typography>
        ))}
      />
    </ConfirmDeleteDialog>
  );
}
