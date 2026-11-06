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

import { Alert, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import ConfirmDeleteDialog from '../ConfirmDeleteDialog';
import { useDeleteKnowledgeBase } from '../../hooks/useKnowledgeBases';
import type { KnowledgeBase } from '../../types/knowledgeBase';

interface DeleteKnowledgeBaseDialogProps {
  knowledgeBase: KnowledgeBase;
  onClose: () => void;
  onDeleted: () => void;
}

/**
 * Deletes a knowledge base's service. A knowledge base that still has data
 * sources cannot be deleted: they would keep ingesting into a knowledge base
 * nothing serves.
 */
export default function DeleteKnowledgeBaseDialog({ knowledgeBase, onClose, onDeleted }: DeleteKnowledgeBaseDialogProps): JSX.Element {
  const del = useDeleteKnowledgeBase();
  const sources = knowledgeBase.dataSources.length;
  return (
    <ConfirmDeleteDialog
      title={
        <>
          Delete <strong>{knowledgeBase.displayName}</strong>?
        </>
      }
      isPending={del.isPending}
      confirmDisabled={sources > 0}
      onClose={onClose}
      onConfirm={() => del.mutate(knowledgeBase.name, { onSuccess: onDeleted })}>
      {sources > 0 ? (
        <Alert severity="warning">
          This knowledge base has {sources} data source{sources === 1 ? '' : 's'}. Delete {sources === 1 ? 'it' : 'them'} first.
        </Alert>
      ) : (
        <Typography variant="body2">The knowledge base service will be removed. The documents already stored in your vector store are not deleted.</Typography>
      )}
      {del.error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {del.error.message}
        </Alert>
      )}
    </ConfirmDeleteDialog>
  );
}
