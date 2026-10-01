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

import { Alert, Box, Button, Drawer, IconButton, LinearProgress, MenuItem, Stack, TextField, Tooltip, Typography } from '@wso2/oxygen-ui';
import { FileText, RefreshCw, Search, Tag, Trash2, Upload, X } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { refreshUploads, relabelUpload, removeUpload, retryForbidden, retryUpload, startUploads, useSourceLabels, useSourceUploads, type FileToUpload } from '../../../hooks/contextUploads';
import { UPLOAD_STATUS_LABEL } from '../../../constants/contextEngine';
import { checkStagedFile, contentTypeForFile, engineMessage, formatBytes, isUploadActive, stagedSummary, summarizeUploads } from '../../../utils/contextEngine';
import { dropStagedFile, getStagedFile, stageFiles } from '../../../utils/stagedFiles';
import { formatDistanceToNow } from '../../../utils/time';
import ConfirmDeleteDialog from '../../ConfirmDeleteDialog';
import OwnerAccessButton from '../detail/OwnerAccessButton';
import SourceMark from '../SourceMark';
import FileDropzone from './FileDropzone';
import StagedFileList from './StagedFileList';
import UploadStatusChip from './UploadStatusChip';
import { drawerBodySx, drawerFooterSx, drawerHeaderSx, fileListSx, filesDrawerSx, filesToolbarSx, mutedSx, progressBarSx, sectionLabelSx, uploadRowBodySx, uploadRowHeadSx, uploadRowSx } from '../styles';
import type { ContextSource, StagedFileMeta, UploadEntry, UploadFileStatus } from '../../../types/contextEngine';

interface FilesDrawerProps {
  engineId: string;
  source: ContextSource;
  open: boolean;
  onClose: () => void;
}

const NEW_LABEL = '\u0000new';

/** Pick a label the files are visible under, or type a new one. */
function LabelSelect({ id, labels, value, onChange, onAdd, label }: { id: string; labels: string[]; value: string; onChange: (label: string) => void; onAdd: (label: string) => void; label: string }): JSX.Element {
  const [adding, setAdding] = useState(labels.length === 0);
  const [typed, setTyped] = useState('');
  const commit = () => {
    const next = typed.trim();
    if (!next) return;
    onAdd(next);
    onChange(next);
    setTyped('');
    setAdding(false);
  };
  if (adding) {
    return (
      <Stack direction="row" gap={1} alignItems="flex-start">
        <TextField
          id={id}
          size="small"
          fullWidth
          label={label}
          value={typed}
          placeholder="e.g. engineering"
          helperText="A new label needs a visibility rule on this source, or its files are held back."
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
        />
        <Button size="small" variant="outlined" onClick={commit} disabled={!typed.trim()} sx={{ mt: 0.5, flexShrink: 0 }}>
          Use label
        </Button>
        {labels.length > 0 && (
          <Button size="small" variant="text" onClick={() => setAdding(false)} sx={{ mt: 0.5, flexShrink: 0 }}>
            Cancel
          </Button>
        )}
      </Stack>
    );
  }
  return (
    <TextField id={id} select size="small" fullWidth label={label} value={value} helperText="Members of the label’s role, with query access, can find these files." onChange={(e) => (e.target.value === NEW_LABEL ? setAdding(true) : onChange(e.target.value))}>
      {labels.map((l) => (
        <MenuItem key={l} value={l}>
          {l}
        </MenuItem>
      ))}
      <MenuItem value={NEW_LABEL}>Add a label…</MenuItem>
    </TextField>
  );
}

function UploadRow({
  entry,
  labels,
  canRetry,
  onRetry,
  onReplace,
  onRelabel,
  onRemove,
  onAddLabel,
}: {
  entry: UploadEntry;
  labels: string[];
  canRetry: boolean;
  onRetry: () => void;
  onReplace: () => void;
  onRelabel: (label: string) => Promise<void>;
  onRemove: () => void;
  onAddLabel: (label: string) => void;
}): JSX.Element {
  const [relabel, setRelabel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = isUploadActive(entry);
  const tone = entry.status === 'failed' ? 'error.main' : entry.status === 'held' || entry.status === 'unreadable' ? 'warning.dark' : 'text.secondary';
  const save = async () => {
    if (relabel === null || relabel === entry.label) return setRelabel(null);
    setSaving(true);
    setError(null);
    try {
      await onRelabel(relabel);
      setRelabel(null);
    } catch (e) {
      setError(engineMessage(e, "Couldn't change the label."));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Box sx={uploadRowSx}>
      <Box sx={uploadRowHeadSx}>
        <FileText size={18} aria-hidden />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
            {entry.name}
          </Typography>
          <Typography variant="caption" sx={mutedSx} noWrap>
            {formatBytes(entry.size)} · {entry.label || 'no label'} · {formatDistanceToNow(entry.uploadedAt) || 'just now'}
          </Typography>
        </Box>
        <UploadStatusChip entry={entry} />
        {!active && (
          <Stack direction="row" gap={0.25} sx={{ flexShrink: 0 }}>
            {canRetry && (
              <Tooltip title="Try again">
                <IconButton size="small" aria-label={`Retry ${entry.name}`} onClick={onRetry}>
                  <RefreshCw size={16} />
                </IconButton>
              </Tooltip>
            )}
            {entry.jobId && (
              <>
                <Tooltip title="Replace with a new version">
                  <IconButton size="small" aria-label={`Replace ${entry.name}`} onClick={onReplace}>
                    <Upload size={16} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Change who can see it">
                  <IconButton size="small" aria-label={`Change label of ${entry.name}`} onClick={() => setRelabel(entry.label)}>
                    <Tag size={16} />
                  </IconButton>
                </Tooltip>
              </>
            )}
            <Tooltip title="Remove from the engine">
              <IconButton size="small" color="error" aria-label={`Remove ${entry.name}`} onClick={onRemove}>
                <Trash2 size={16} />
              </IconButton>
            </Tooltip>
          </Stack>
        )}
      </Box>
      {(active || entry.detail || relabel !== null || error) && (
        <Box sx={uploadRowBodySx}>
          {entry.status === 'uploading' && <LinearProgress variant="determinate" value={entry.progress} aria-label={`${entry.name} upload`} sx={progressBarSx} />}
          {(entry.status === 'queued' || entry.status === 'indexing') && <LinearProgress variant="indeterminate" aria-label={`${entry.name} indexing`} sx={progressBarSx} />}
          {entry.status === 'queued' && (
            <Typography variant="caption" sx={{ ...mutedSx, display: 'block', mt: 0.75 }}>
              Uploaded · the engine is storing it.
            </Typography>
          )}
          {entry.status === 'indexing' && (
            <Typography variant="caption" sx={{ ...mutedSx, display: 'block', mt: 0.75 }}>
              {entry.detail ?? 'Uploaded · the engine is writing it into the search index. Usually under a minute.'}
            </Typography>
          )}
          {!active && entry.detail && (
            <Typography variant="caption" sx={{ color: tone, display: 'block' }}>
              {entry.detail}
            </Typography>
          )}
          {relabel !== null && (
            <Stack direction="row" gap={1} alignItems="flex-start" sx={{ mt: 1 }}>
              <Box sx={{ flex: 1 }}>
                <LabelSelect id={`relabel-${entry.recordId}`} labels={labels} value={relabel} onChange={setRelabel} onAdd={onAddLabel} label="Visible to" />
              </Box>
              <Button size="small" variant="contained" disabled={saving} onClick={() => void save()} sx={{ mt: 0.5 }}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
              <Button size="small" variant="text" disabled={saving} onClick={() => setRelabel(null)} sx={{ mt: 0.5 }}>
                Cancel
              </Button>
            </Stack>
          )}
          {error && (
            <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>
              {error}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}

/**
 * Files of one File Upload source on a running engine: add files, watch them
 * upload and index, and manage what is there. Uploads keep going after the
 * drawer closes; the Sources card shows the same progress.
 */
export default function FilesDrawer({ engineId, source, open, onClose }: FilesDrawerProps): JSX.Element {
  const entries = useSourceUploads(engineId, source.id);
  const { labels, addLabel } = useSourceLabels(source.id);
  const [staged, setStaged] = useState<StagedFileMeta[]>([]);
  const [label, setLabel] = useState('');
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<UploadFileStatus | 'all'>('all');
  const [removing, setRemoving] = useState<UploadEntry | null>(null);
  const [removePending, setRemovePending] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<UploadEntry | null>(null);

  useEffect(() => {
    if (open) refreshUploads(engineId, source.id);
  }, [open, engineId, source.id]);
  useEffect(() => {
    if (!label && labels.length) setLabel(labels[0]);
  }, [labels, label]);

  const existingNames = useMemo(() => entries.map((e) => e.name), [entries]);
  const sum = stagedSummary(staged, existingNames);
  const forbidden = entries.some((e) => e.forbidden);
  const visible = entries.filter((e) => (statusFilter === 'all' || e.status === statusFilter) && (!filter.trim() || e.name.toLowerCase().includes(filter.trim().toLowerCase())));

  const toUploads = (metas: StagedFileMeta[]): FileToUpload[] =>
    metas.flatMap((m) => {
      const content = getStagedFile(m.id);
      return content && !checkStagedFile(m, existingNames).problem ? [{ content, name: m.name, size: m.size, contentType: m.contentType }] : [];
    });

  const upload = () => {
    const files = toUploads(staged);
    if (!files.length || !label) return;
    startUploads(engineId, source.id, files, label);
    staged.forEach((m) => dropStagedFile(m.id));
    setStaged([]);
  };

  const replace = (files: File[]) => {
    const target = replaceTarget.current;
    const file = files[0];
    if (!target || !file) return;
    startUploads(engineId, source.id, [{ content: file, name: target.name, size: file.size, contentType: contentTypeForFile(file.name, file.type) || target.contentType }], target.label);
    replaceTarget.current = null;
  };

  const confirmRemove = async () => {
    if (!removing) return;
    setRemovePending(true);
    setRemoveError(null);
    try {
      await removeUpload(engineId, source.id, removing.recordId);
      setRemoving(null);
    } catch (e) {
      setRemoveError(engineMessage(e, "Couldn't remove the file."));
    } finally {
      setRemovePending(false);
    }
  };

  return (
    <Drawer anchor="right" open={open} onClose={onClose} variant="temporary" sx={filesDrawerSx}>
      <Box sx={drawerHeaderSx}>
        <Stack direction="row" alignItems="center" gap={1.5} sx={{ minWidth: 0 }}>
          <SourceMark type={source.type} variant="tile" />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }} noWrap>
              {source.name}
            </Typography>
            <Typography variant="caption" sx={mutedSx}>
              File Upload · {summarizeUploads(entries)}
            </Typography>
          </Box>
        </Stack>
        <IconButton size="small" aria-label="Close" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </Box>

      <Box sx={drawerBodySx}>
        {forbidden && (
          <Alert severity="warning" variant="outlined" action={<OwnerAccessButton engineId={engineId} onGranted={() => retryForbidden(engineId, source.id)} />}>
            Uploading needs upload access to this engine. As an access manager you can give it to yourself.
          </Alert>
        )}

        <FileDropzone
          compact={entries.length > 0 || staged.length > 0}
          hint="Text, Markdown, HTML or JSON, up to 25 MB each. PDFs are stored now and become searchable when the engine gains a PDF reader."
          onFiles={(files) => setStaged((s) => stageFiles(s, files))}
        />

        {staged.length > 0 && (
          <Box>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Selected ({staged.length})
              </Typography>
              <Typography variant="caption" sx={mutedSx}>
                {sum.ready} will upload{sum.skipped ? ` · ${sum.skipped} skipped` : ''}
              </Typography>
            </Stack>
            <StagedFileList
              files={staged}
              existingNames={existingNames}
              onRemove={(id) => {
                dropStagedFile(id);
                setStaged((s) => s.filter((f) => f.id !== id));
              }}
            />
            <Box sx={{ mt: 2 }}>
              <LabelSelect id="upload-label" labels={labels} value={label} onChange={setLabel} onAdd={addLabel} label={`Who can see these ${sum.ready} file${sum.ready === 1 ? '' : 's'}`} />
            </Box>
            <Stack direction="row" justifyContent="flex-end" gap={1.5} sx={{ mt: 2 }}>
              <Button
                variant="outlined"
                onClick={() => {
                  staged.forEach((m) => dropStagedFile(m.id));
                  setStaged([]);
                }}>
                Clear
              </Button>
              <Button variant="contained" startIcon={<Upload size={16} />} disabled={sum.ready === 0 || !label} onClick={upload}>
                Upload {sum.ready} file{sum.ready === 1 ? '' : 's'}
              </Button>
            </Stack>
          </Box>
        )}

        {entries.length > 0 && (
          <Box>
            <Box sx={{ ...filesToolbarSx, mb: 1.5 }}>
              <Typography variant="subtitle2" sx={{ ...sectionLabelSx, mb: 0, flexGrow: 1 }}>
                Files ({entries.length})
              </Typography>
              <TextField
                size="small"
                placeholder="Filter files…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                slotProps={{ input: { startAdornment: <Search size={14} style={{ marginRight: 6, opacity: 0.6 }} /> } }}
                inputProps={{ 'aria-label': 'Filter files' }}
                sx={{ width: 200 }}
              />
              <TextField select size="small" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as UploadFileStatus | 'all')} inputProps={{ 'aria-label': 'Status' }} sx={{ minWidth: 150 }}>
                <MenuItem value="all">All statuses</MenuItem>
                {(Object.keys(UPLOAD_STATUS_LABEL) as UploadFileStatus[]).map((s) => (
                  <MenuItem key={s} value={s}>
                    {UPLOAD_STATUS_LABEL[s]}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
            <Box sx={fileListSx}>
              {visible.length === 0 ? (
                <Typography variant="body2" sx={{ ...mutedSx, p: 2 }}>
                  No files match.
                </Typography>
              ) : (
                visible.map((entry) => (
                  <UploadRow
                    key={entry.recordId}
                    entry={entry}
                    labels={labels}
                    canRetry={entry.status === 'failed' && !entry.jobId}
                    onRetry={() => retryUpload(engineId, source.id, entry.recordId)}
                    onReplace={() => {
                      replaceTarget.current = entry;
                      replaceInput.current?.click();
                    }}
                    onRelabel={(next) => relabelUpload(engineId, source.id, entry.recordId, next)}
                    onRemove={() => setRemoving(entry)}
                    onAddLabel={addLabel}
                  />
                ))
              )}
            </Box>
            <Typography variant="caption" sx={{ ...mutedSx, display: 'block', mt: 1, lineHeight: 1.5 }}>
              This list is what this browser uploaded. Removing a file deletes it from search and the graph on the engine&apos;s next pass.
            </Typography>
          </Box>
        )}
        <input
          ref={replaceInput}
          type="file"
          hidden
          aria-label="Replacement file"
          onChange={(e) => {
            replace(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
      </Box>

      <Box sx={drawerFooterSx}>
        <Button variant="outlined" onClick={onClose}>
          Close
        </Button>
      </Box>

      {removing && (
        <ConfirmDeleteDialog
          title={
            <>
              Remove <strong>{removing.name}</strong>?
            </>
          }
          onConfirm={() => void confirmRemove()}
          onClose={() => {
            if (!removePending) setRemoving(null);
          }}
          isPending={removePending}
          confirmLabel="Remove"
          pendingLabel="Removing…">
          <Typography variant="body2" color="text.secondary">
            It leaves search and the graph on the engine&apos;s next pass. Its text can remain in storage until the engine compacts, which is planned for a later release.
          </Typography>
          {removeError && (
            <Alert severity="error" variant="outlined" sx={{ mt: 1.5 }}>
              {removeError}
            </Alert>
          )}
        </ConfirmDeleteDialog>
      )}
    </Drawer>
  );
}
