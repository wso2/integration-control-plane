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
import { FileText, RefreshCw, Search, Trash2, Upload, Users, X } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { changeUploadVisibility, refreshUploads, removeUpload, retryForbidden, retryUpload, startUploads, useSourceUploads, type FileToUpload } from '../../../hooks/contextUploads';
import { useUploadAudience } from '../../../hooks/useContextEngine';
import { EVERYONE_VISIBILITY, UPLOAD_STATUS_LABEL } from '../../../constants/contextEngine';
import { checkStagedFile, contentTypeForFile, describeUploadAudience, engineMessage, formatBytes, isUploadActive, stagedSummary, summarizeUploads, visibilityError, visibilityTags } from '../../../utils/contextEngine';
import { dropStagedFile, getStagedFile, stageFiles } from '../../../utils/stagedFiles';
import { formatDistanceToNow } from '../../../utils/time';
import ConfirmDeleteDialog from '../../ConfirmDeleteDialog';
import OwnerAccessButton from '../detail/OwnerAccessButton';
import SourceMark from '../SourceMark';
import FileDropzone from './FileDropzone';
import FileVisibilityField from './FileVisibilityField';
import StagedFileList from './StagedFileList';
import UploadStatusChip from './UploadStatusChip';
import { drawerBodySx, drawerFooterSx, drawerHeaderSx, fileListSx, filesDrawerSx, filesToolbarSx, mutedSx, progressBarSx, sectionLabelSx, uploadRowBodySx, uploadRowHeadSx, uploadRowSx } from '../styles';
import type { ContextSource, FileVisibility, StagedFileMeta, UploadEntry, UploadFileStatus } from '../../../types/contextEngine';

interface FilesDrawerProps {
  engineId: string;
  orgHandle: string;
  source: ContextSource;
  /** Roles granted query access to the engine, for the visibility warnings. */
  queryRoles: string[];
  open: boolean;
  onClose: () => void;
}

function UploadRow({
  entry,
  orgHandle,
  queryRoles,
  roleNames,
  canRetry,
  onRetry,
  onReplace,
  onChangeVisibility,
  onRemove,
}: {
  entry: UploadEntry;
  orgHandle: string;
  queryRoles: string[];
  roleNames: Record<string, string>;
  canRetry: boolean;
  onRetry: () => void;
  onReplace: () => void;
  onChangeVisibility: (visibility: FileVisibility) => Promise<void>;
  onRemove: () => void;
}): JSX.Element {
  const [sharing, setSharing] = useState<FileVisibility | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = isUploadActive(entry);
  const tone = entry.status === 'failed' ? 'error.main' : entry.status === 'held' || entry.status === 'unreadable' ? 'warning.dark' : 'text.secondary';
  const save = async () => {
    if (sharing === null) return;
    setSaving(true);
    setError(null);
    try {
      await onChangeVisibility(sharing);
      setSharing(null);
    } catch (e) {
      setError(engineMessage(e, "Couldn't change who can see it."));
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
            {formatBytes(entry.size)} · {describeUploadAudience(entry, roleNames)} · {formatDistanceToNow(entry.uploadedAt) || 'just now'}
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
                  <IconButton size="small" aria-label={`Change who can see ${entry.name}`} onClick={() => setSharing(entry.visibility ?? EVERYONE_VISIBILITY)}>
                    <Users size={16} />
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
      {(active || entry.detail || sharing !== null || error) && (
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
          {sharing !== null && (
            <Box sx={{ mt: 1.5 }}>
              <FileVisibilityField id={`share-${entry.recordId}`} label={`Who can see ${entry.name}`} orgHandle={orgHandle} queryRoles={queryRoles} value={sharing} onChange={setSharing} />
              <Stack direction="row" gap={1} justifyContent="flex-end" sx={{ mt: 1.5 }}>
                <Button size="small" variant="text" disabled={saving} onClick={() => setSharing(null)}>
                  Cancel
                </Button>
                <Button size="small" variant="contained" disabled={saving || !!visibilityError(sharing)} onClick={() => void save()}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </Stack>
            </Box>
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
export default function FilesDrawer({ engineId, orgHandle, source, queryRoles, open, onClose }: FilesDrawerProps): JSX.Element {
  const entries = useSourceUploads(engineId, source.id);
  const { everyone, roleNames } = useUploadAudience(orgHandle, queryRoles);
  const [staged, setStaged] = useState<StagedFileMeta[]>([]);
  const [visibility, setVisibility] = useState<FileVisibility>(EVERYONE_VISIBILITY);
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
    if (!files.length || visibilityError(visibility)) return;
    startUploads(engineId, source.id, files, visibility, visibilityTags(visibility, everyone));
    staged.forEach((m) => dropStagedFile(m.id));
    setStaged([]);
  };

  const replace = (files: File[]) => {
    const target = replaceTarget.current;
    const file = files[0];
    if (!target || !file) return;
    const content = [{ content: file, name: target.name, size: file.size, contentType: contentTypeForFile(file.name, file.type) || target.contentType }];
    // A new version keeps who could see the old one; "everyone" is re-read so newly created roles are included.
    if (target.visibility) startUploads(engineId, source.id, content, target.visibility, visibilityTags(target.visibility, everyone));
    else startUploads(engineId, source.id, content, undefined, target.audience, target.label);
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
              <FileVisibilityField id="upload-visibility" label={`Who can see ${sum.ready === 1 ? 'this file' : `these ${sum.ready} files`}`} orgHandle={orgHandle} queryRoles={queryRoles} value={visibility} onChange={setVisibility} />
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
              <Button variant="contained" startIcon={<Upload size={16} />} disabled={sum.ready === 0 || !!visibilityError(visibility)} onClick={upload}>
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
                    orgHandle={orgHandle}
                    queryRoles={queryRoles}
                    roleNames={roleNames}
                    canRetry={entry.status === 'failed' && !entry.jobId}
                    onRetry={() => retryUpload(engineId, source.id, entry.recordId)}
                    onReplace={() => {
                      replaceTarget.current = entry;
                      replaceInput.current?.click();
                    }}
                    onChangeVisibility={(next) => changeUploadVisibility(engineId, source.id, entry.recordId, next, visibilityTags(next, everyone))}
                    onRemove={() => setRemoving(entry)}
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
