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

import { Alert, Box, Button, Chip, CircularProgress, Stack, Typography } from '@wso2/oxygen-ui';
import TextField from '../../../../components/common/TextField';
import { Plus } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState, type JSX } from 'react';
import { useUpdateGenaiService } from '../../../hooks/useGenaiServices';
import type { GenAiService } from '../../../../types/genaiServices';

const requiredSx = { '& .MuiFormLabel-asterisk': { color: 'error.main' } };

/**
 * Editable general details: name, summary, overview, and labels. Saves via PUT /services/{id}.
 * `lockedTags` are non-removable labels (e.g. the GenAI feature tag); Third Party passes none.
 */
export default function GeneralDetailsTab({ service, lockedTags = [] }: { service: GenAiService; lockedTags?: string[] }): JSX.Element {
  const update = useUpdateGenaiService(service);
  const [name, setName] = useState(service.name);
  const [summary, setSummary] = useState(service.summary ?? '');
  const [description, setDescription] = useState(service.description ?? '');
  const [tags, setTags] = useState<string[]>(service.tags ?? []);
  const [newTag, setNewTag] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const pristine = useMemo(
    () => name === service.name && summary === (service.summary ?? '') && description === (service.description ?? '') && tags.length === (service.tags?.length ?? 0) && tags.every((t) => service.tags?.includes(t)),
    [name, summary, description, tags, service],
  );

  const addTag = () => {
    const t = newTag.trim();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setNewTag('');
  };

  const save = () => {
    setError(null);
    setSaved(false);
    update.mutate(
      { name, summary, description, tags },
      {
        onSuccess: () => setSaved(true),
        onError: (e) => setError(e instanceof Error ? e.message : 'Failed to update the service.'),
      },
    );
  };

  const reset = () => {
    setName(service.name);
    setSummary(service.summary ?? '');
    setDescription(service.description ?? '');
    setTags(service.tags ?? []);
    setError(null);
    setSaved(false);
  };

  return (
    <Box sx={{ maxWidth: 560 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {saved && (
        <Alert severity="success" onClose={() => setSaved(false)} sx={{ mb: 2 }}>
          Service updated.
        </Alert>
      )}

      <Stack gap={2}>
        <TextField label="Service Name" required fullWidth value={name} onChange={(e) => setName(e.target.value)} sx={requiredSx} />
        <TextField label="Summary" fullWidth multiline rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="A short summary of this service" />
        <TextField label="Overview" fullWidth multiline rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A detailed overview (Markdown supported)" />

        <Box>
          <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
            Labels
          </Typography>
          <Stack direction="row" gap={0.5} flexWrap="wrap" sx={{ mb: 1 }}>
            {tags.map((t) => {
              const locked = lockedTags.includes(t);
              return <Chip key={t} label={t} size="small" onDelete={locked ? undefined : () => setTags((prev) => prev.filter((x) => x !== t))} />;
            })}
            {tags.length === 0 && (
              <Typography variant="caption" color="text.secondary">
                No labels
              </Typography>
            )}
          </Stack>
          <Stack direction="row" gap={1}>
            <TextField
              size="small"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTag();
                }
              }}
              placeholder="Add a label"
              sx={{ maxWidth: 240 }}
            />
            <Button startIcon={<Plus size={16} />} onClick={addTag} disabled={!newTag.trim()}>
              Add
            </Button>
          </Stack>
        </Box>
      </Stack>

      <Stack direction="row" gap={1.5} sx={{ mt: 3 }}>
        <Button variant="contained" disabled={pristine || !name.trim() || update.isPending} startIcon={update.isPending ? <CircularProgress size={16} color="inherit" /> : undefined} onClick={save}>
          {update.isPending ? 'Saving…' : 'Update'}
        </Button>
        <Button variant="outlined" disabled={pristine || update.isPending} onClick={reset}>
          Cancel
        </Button>
      </Stack>
    </Box>
  );
}
