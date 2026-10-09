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

import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack } from '@wso2/oxygen-ui';
import TextField from '../../../components/common/TextField';
import { useState, type JSX } from 'react';
import { useCreateKafkaTopic, useKafkaTopics, useKafkaUserConfigs, useUpdateKafkaTopic } from '../../hooks/usePlatformServices';
import type { KafkaTopic, KafkaTopicCreatePayload, KafkaTopicUpdatePayload } from '../../../types/platformServices';

interface TopicDialogProps {
  brokerId: string;
  topic?: KafkaTopic;
  onClose: () => void;
}

export default function TopicDialog({ brokerId, topic, onClose }: TopicDialogProps): JSX.Element {
  const isEditMode = !!topic;
  const { data: allTopics = [] } = useKafkaTopics(brokerId);
  const { data: configs } = useKafkaUserConfigs();
  const create = useCreateKafkaTopic(brokerId);
  const update = useUpdateKafkaTopic(brokerId);
  const isPending = create.isPending || update.isPending;

  const [topicName, setTopicName] = useState(topic?.topic_name ?? '');
  const [partitions, setPartitions] = useState(topic?.partitions?.toString() ?? '');
  const [replication, setReplication] = useState(topic?.replication?.toString() ?? '');
  const [minInSyncReplicas, setMinInSyncReplicas] = useState(topic?.minimum_in_sync_replicas?.toString() ?? '');
  const [retentionHours, setRetentionHours] = useState(topic?.retention_hours?.toString() ?? '');
  const [retentionBytes, setRetentionBytes] = useState(topic?.retention_bytes?.toString() ?? '');
  const [cleanupPolicy, setCleanupPolicy] = useState<'delete' | 'compact' | 'compact,delete'>(topic?.cleanup_policy ?? 'delete');
  const [error, setError] = useState<string | null>(null);

  const duplicateTopicExists = (name: string) => allTopics.some((t) => t.topic_name === name && t.topic_name !== topic?.topic_name);

  const validateField = (fieldName: string, value: string, min?: number, max?: number): string | null => {
    if (!value) return null;
    const num = Number(value);
    if (isNaN(num)) return `${fieldName} must be a number`;
    if (min !== undefined && num < min) return `Must be between ${min} and ${max}`;
    if (max !== undefined && num > max) return `Must be between ${min} and ${max}`;
    return null;
  };

  const getFieldError = (fieldName: string, value: string): string | null => {
    if (fieldName === 'partitions') {
      const config = configs?.partitions;
      if (config) return validateField(fieldName, value, config.minimum, config.maximum);
    } else if (fieldName === 'replication') {
      const config = configs?.replication;
      if (config) return validateField(fieldName, value, config.minimum, config.maximum);
    } else if (fieldName === 'minInSyncReplicas') {
      const config = configs?.minimum_in_sync_replicas;
      if (config) return validateField(fieldName, value, config.minimum, config.maximum);
    } else if (fieldName === 'retentionBytes') {
      const config = configs?.retention_bytes;
      if (config) return validateField(fieldName, value, config.minimum, config.maximum);
    }
    return null;
  };

  const getHelperText = (fieldName: string): string | undefined => {
    if (fieldName === 'partitions') return configs?.partitions?.description;
    if (fieldName === 'replication') return configs?.replication?.description;
    if (fieldName === 'minInSyncReplicas') return configs?.minimum_in_sync_replicas?.description;
    if (fieldName === 'retentionBytes') return configs?.retention_bytes?.description;
    return undefined;
  };

  const isFormValid = (): boolean => {
    if (!topicName.trim()) return false;
    if (!isEditMode && duplicateTopicExists(topicName)) return false;
    if (partitions && getFieldError('partitions', partitions)) return false;
    if (replication && getFieldError('replication', replication)) return false;
    if (minInSyncReplicas && getFieldError('minInSyncReplicas', minInSyncReplicas)) return false;
    if (retentionBytes && getFieldError('retentionBytes', retentionBytes)) return false;
    return true;
  };

  const handleSubmit = () => {
    setError(null);

    if (!topicName.trim()) {
      setError('Topic name is required');
      return;
    }

    if (!isEditMode && duplicateTopicExists(topicName)) {
      setError('A topic with this name already exists.');
      return;
    }

    const payload: KafkaTopicCreatePayload | KafkaTopicUpdatePayload = {
      ...(partitions && { partitions: Number(partitions) }),
      ...(replication && { replication: Number(replication) }),
      ...(minInSyncReplicas && { minimum_in_sync_replicas: Number(minInSyncReplicas) }),
      ...(retentionHours && { retention_hours: Number(retentionHours) }),
      ...(retentionBytes && { retention_bytes: Number(retentionBytes) }),
      ...(cleanupPolicy && { cleanup_policy: cleanupPolicy }),
    };

    if (isEditMode && topic) {
      update.mutate(
        { topicName: topic.topic_name, payload: payload as KafkaTopicUpdatePayload },
        {
          onSuccess: () => onClose(),
          onError: (err) => setError(err instanceof Error ? err.message : 'Failed to update topic'),
        },
      );
    } else {
      create.mutate({ topic_name: topicName, ...payload } as KafkaTopicCreatePayload, {
        onSuccess: () => onClose(),
        onError: (err) => setError(err instanceof Error ? err.message : 'Failed to create topic'),
      });
    }
  };

  return (
    <Dialog open onClose={isPending ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEditMode ? 'Edit Topic' : 'Create Topic'}</DialogTitle>
      <DialogContent>
        <Stack gap={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            label="Topic Name"
            fullWidth
            size="small"
            value={topicName}
            onChange={(e) => setTopicName(e.target.value)}
            disabled={isEditMode}
            required
            error={!isEditMode && duplicateTopicExists(topicName) && topicName.trim() !== ''}
            helperText={!isEditMode && duplicateTopicExists(topicName) && topicName.trim() !== '' ? 'A topic with this name already exists.' : ''}
          />

          <TextField
            label="Partitions"
            fullWidth
            size="small"
            type="number"
            value={partitions}
            onChange={(e) => setPartitions(e.target.value)}
            error={!!getFieldError('partitions', partitions)}
            helperText={getFieldError('partitions', partitions) || getHelperText('partitions')}
          />

          <TextField
            label="Replication"
            fullWidth
            size="small"
            type="number"
            value={replication}
            onChange={(e) => setReplication(e.target.value)}
            error={!!getFieldError('replication', replication)}
            helperText={getFieldError('replication', replication) || getHelperText('replication')}
          />

          <TextField
            label="Min In-Sync Replicas"
            fullWidth
            size="small"
            type="number"
            value={minInSyncReplicas}
            onChange={(e) => setMinInSyncReplicas(e.target.value)}
            error={!!getFieldError('minInSyncReplicas', minInSyncReplicas)}
            helperText={getFieldError('minInSyncReplicas', minInSyncReplicas) || getHelperText('minInSyncReplicas')}
          />

          <TextField label="Retention Hours" fullWidth size="small" type="number" value={retentionHours} onChange={(e) => setRetentionHours(e.target.value)} helperText="Number of hours to retain messages" />

          <TextField
            label="Retention Bytes"
            fullWidth
            size="small"
            type="number"
            value={retentionBytes}
            onChange={(e) => setRetentionBytes(e.target.value)}
            error={!!getFieldError('retentionBytes', retentionBytes)}
            helperText={getFieldError('retentionBytes', retentionBytes) || getHelperText('retentionBytes')}
          />

          <TextField select label="Cleanup Policy" size="small" fullWidth value={cleanupPolicy} onChange={(e) => setCleanupPolicy(e.target.value as 'delete' | 'compact' | 'compact,delete')}>
            <MenuItem value="delete">Delete</MenuItem>
            <MenuItem value="compact">Compact</MenuItem>
            <MenuItem value="compact,delete">Compact and Delete</MenuItem>
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSubmit} disabled={!isFormValid() || isPending} startIcon={isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {isPending ? (isEditMode ? 'Saving…' : 'Creating…') : isEditMode ? 'Save' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
