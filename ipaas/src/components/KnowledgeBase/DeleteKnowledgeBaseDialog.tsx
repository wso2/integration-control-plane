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

import { Alert, Box, TextField, Typography } from '@wso2/oxygen-ui';
import { useState, type JSX } from 'react';
import ConfirmDeleteDialog from '../ConfirmDeleteDialog';
import { useDeleteKnowledgeBase } from '../../hooks/useKnowledgeBases';
import type { KnowledgeBase } from '../../types/knowledgeBase';

interface DeleteKnowledgeBaseDialogProps {
  knowledgeBase: KnowledgeBase;
  onClose: () => void;
  onDeleted: () => void;
}

/**
 * Deletes a knowledge base's service once its name is typed back. A knowledge base that still
 * has data sources cannot be deleted: they would keep ingesting into a knowledge base nothing
 * serves. The BFF refuses that delete too.
 */
export default function DeleteKnowledgeBaseDialog({ knowledgeBase, onClose, onDeleted }: DeleteKnowledgeBaseDialogProps): JSX.Element {
  const del = useDeleteKnowledgeBase();
  const [confirmText, setConfirmText] = useState('');
  const sources = knowledgeBase.dataSources;
  const blocked = sources.length > 0;
  return (
    <ConfirmDeleteDialog
      title={
        <>
          Delete <strong>{knowledgeBase.displayName}</strong>?
        </>
      }
      isPending={del.isPending}
      confirmDisabled={blocked || confirmText.trim() !== knowledgeBase.name}
      cancelLabel={blocked ? 'Close' : 'Cancel'}
      onClose={onClose}
      onConfirm={() => del.mutate(knowledgeBase.name, { onSuccess: onDeleted })}>
      {blocked ? (
        <Alert severity="warning">
          This knowledge base has {sources.length} data source{sources.length === 1 ? '' : 's'}. Delete {sources.length === 1 ? 'it' : 'them'} first:
          <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
            {sources.map((ds) => (
              <li key={ds.name}>{ds.displayName}</li>
            ))}
          </Box>
        </Alert>
      ) : (
        <>
          <Typography variant="body2" sx={{ mb: 2 }}>
            The knowledge base service will be removed. The documents already stored in your vector store are not deleted. This cannot be undone.
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Type <strong>{knowledgeBase.name}</strong> to confirm.
          </Typography>
          <TextField
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            fullWidth
            size="small"
            placeholder="Enter the knowledge base name"
            autoFocus
            disabled={del.isPending}
            slotProps={{ htmlInput: { 'aria-label': 'Knowledge base name' } }}
          />
        </>
      )}
      {del.error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {del.error.message}
        </Alert>
      )}
    </ConfirmDeleteDialog>
  );
}
