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

import { Alert, Button, Chip, CircularProgress, Dialog, DialogContent, DialogTitle, IconButton, ListingTable, Stack, Typography } from '@wso2/oxygen-ui';
import { Plus, Pencil, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { useDeleteKafkaTopic, useKafkaTopics } from '../../hooks/usePlatformServices';
import TopicDialog from './TopicDialog';
import type { KafkaTopic } from '../../../types/platformServices';

export default function TopicsTab({ brokerId }: { brokerId: string }): JSX.Element {
  const { data: topics = [], isLoading, isError, refetch } = useKafkaTopics(brokerId);
  const del = useDeleteKafkaTopic(brokerId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState<KafkaTopic | undefined>(undefined);
  const [topicToDelete, setTopicToDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleCreateClick = () => {
    setEditingTopic(undefined);
    setDialogOpen(true);
  };

  const handleEditClick = (topic: KafkaTopic) => {
    setEditingTopic(topic);
    setDialogOpen(true);
  };

  const handleDeleteClick = (topicName: string) => {
    setDeleteError(null);
    setTopicToDelete(topicName);
  };

  const handleConfirmDelete = () => {
    if (!topicToDelete) return;
    del.mutate(topicToDelete, {
      onSuccess: () => {
        setTopicToDelete(null);
      },
      onError: (error) => {
        setDeleteError(error instanceof Error ? error.message : 'Failed to delete topic');
      },
    });
  };

  const handleCloseDeleteDialog = () => {
    setTopicToDelete(null);
    setDeleteError(null);
  };

  if (isLoading) {
    return <CircularProgress sx={{ display: 'block', mx: 'auto', py: 4 }} />;
  }

  if (isError) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => refetch()}>
            Retry
          </Button>
        }>
        Failed to load topics.
      </Alert>
    );
  }

  return (
    <>
      <Stack gap={2}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Topics
          </Typography>
          <Button variant="contained" startIcon={<Plus size={16} />} onClick={handleCreateClick}>
            Create Topic
          </Button>
        </Stack>

        {topics.length === 0 ? (
          <Alert severity="info">No topics yet. Create a topic to start producing and consuming events.</Alert>
        ) : (
          <ListingTable.Container elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
            <ListingTable size="small">
              <ListingTable.Head>
                <ListingTable.Row>
                  <ListingTable.Cell>Topic</ListingTable.Cell>
                  <ListingTable.Cell>Partitions</ListingTable.Cell>
                  <ListingTable.Cell>Replication</ListingTable.Cell>
                  <ListingTable.Cell>Min In-Sync Replicas</ListingTable.Cell>
                  <ListingTable.Cell>Retention Hours</ListingTable.Cell>
                  <ListingTable.Cell>Retention Bytes</ListingTable.Cell>
                  <ListingTable.Cell>Cleanup Policy</ListingTable.Cell>
                  <ListingTable.Cell>Status</ListingTable.Cell>
                  <ListingTable.Cell align="right">Actions</ListingTable.Cell>
                </ListingTable.Row>
              </ListingTable.Head>
              <ListingTable.Body>
                {topics.map((topic) => (
                  <ListingTable.Row key={topic.topic_name}>
                    <ListingTable.Cell>{topic.topic_name}</ListingTable.Cell>
                    <ListingTable.Cell>{topic.partitions ?? '—'}</ListingTable.Cell>
                    <ListingTable.Cell>{topic.replication ?? '—'}</ListingTable.Cell>
                    <ListingTable.Cell>{topic.minimum_in_sync_replicas ?? '—'}</ListingTable.Cell>
                    <ListingTable.Cell>{topic.retention_hours ?? '—'}</ListingTable.Cell>
                    <ListingTable.Cell>{topic.retention_bytes ?? '—'}</ListingTable.Cell>
                    <ListingTable.Cell>{topic.cleanup_policy ?? '—'}</ListingTable.Cell>
                    <ListingTable.Cell>
                      <Chip size="small" variant="outlined" label={topic.state ?? '—'} color={topic.state === 'ACTIVE' ? 'success' : 'default'} />
                    </ListingTable.Cell>
                    <ListingTable.Cell align="right">
                      <Stack direction="row" gap={0.5}>
                        <IconButton size="small" aria-label={`Edit ${topic.topic_name}`} onClick={() => handleEditClick(topic)}>
                          <Pencil size={16} />
                        </IconButton>
                        <IconButton size="small" color="inherit" aria-label={`Delete ${topic.topic_name}`} onClick={() => handleDeleteClick(topic.topic_name)}>
                          <Trash2 size={16} />
                        </IconButton>
                      </Stack>
                    </ListingTable.Cell>
                  </ListingTable.Row>
                ))}
              </ListingTable.Body>
            </ListingTable>
          </ListingTable.Container>
        )}
      </Stack>

      {dialogOpen && <TopicDialog brokerId={brokerId} topic={editingTopic} onClose={() => setDialogOpen(false)} />}

      {topicToDelete && (
        <Dialog open onClose={del.isPending ? undefined : handleCloseDeleteDialog} maxWidth="sm" fullWidth>
          <DialogTitle>Delete topic</DialogTitle>
          <DialogContent>
            <Typography variant="body2" sx={{ mb: 2 }}>
              This will permanently delete <strong>{topicToDelete}</strong> and its messages.
            </Typography>
            {deleteError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {deleteError}
              </Alert>
            )}
          </DialogContent>
          <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ p: 2 }}>
            <Button onClick={handleCloseDeleteDialog} disabled={del.isPending}>
              Cancel
            </Button>
            <Button variant="contained" color="error" onClick={handleConfirmDelete} disabled={del.isPending} startIcon={del.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
              {del.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </Stack>
        </Dialog>
      )}
    </>
  );
}
