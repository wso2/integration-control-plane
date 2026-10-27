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

import { Alert, Box, Button, CircularProgress, Drawer, IconButton, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import { X } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { EVERYONE_VISIBILITY } from '../../../constants/contextEngine';
import { REQUIRED_FIELD_SX } from '../../../constants/styles';
import { useUpdateContextSource } from '../../../hooks/useContextEngine';
import { engineMessage, sourceNameError, sourceTypeName, uploadSourceRules, visibilityError, visibilityTags } from '../../../utils/contextEngine';
import { HttpError } from '../../../types/http';
import FileVisibilityField from '../files/FileVisibilityField';
import OwnerAccessButton from './OwnerAccessButton';
import SourceMark from '../SourceMark';
import { connectorHeaderSx, drawerBodySx, drawerFooterSx, drawerHeaderSx, fieldStackSx, filesDrawerSx, mutedSx } from '../styles';
import type { ContextSource, FileVisibility } from '../../../types/contextEngine';

interface EditSourceDrawerProps {
  engineId: string;
  orgHandle: string;
  source: ContextSource;
  /** Names of the engine's other sources, for the uniqueness check. */
  otherNames: string[];
  /** Roles granted query access, to flag rules whose role cannot query. */
  queryRoles: string[];
  open: boolean;
  onClose: () => void;
}

/**
 * Rename a registered source or replace a connector's visibility rules. The
 * engine keeps rules but does not return them, so the form starts from what this
 * browser last saved; saving replaces the whole set. A File Upload source has no
 * rules to edit: each file's visibility is chosen in the Files drawer.
 */
export default function EditSourceDrawer({ engineId, orgHandle, source, otherNames, queryRoles, open, onClose }: EditSourceDrawerProps): JSX.Element {
  const isUpload = source.type === 'upload';
  const [name, setName] = useState(source.name);
  const [visibility, setVisibility] = useState<FileVisibility>(EVERYONE_VISIBILITY);
  const update = useUpdateContextSource(engineId);
  const nameError = sourceNameError(name, otherNames);
  const visError = isUpload ? '' : visibilityError(visibility);
  const canSave = nameError === '' && visError === '' && !update.isPending;
  const forbidden = update.error instanceof HttpError && update.error.status === 403;

  const save = () => {
    update.mutate(
      { sourceId: source.id, name: name.trim(), ...(isUpload ? {} : { audience: uploadSourceRules(visibilityTags(visibility, queryRoles)) }) },
      { onSuccess: onClose },
    );
  };

  return (
    <Drawer anchor="right" open={open} onClose={onClose} variant="temporary" sx={filesDrawerSx}>
      <Box sx={drawerHeaderSx}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Edit source
        </Typography>
        <IconButton size="small" aria-label="Close" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </Box>

      <Box sx={drawerBodySx}>
        <Box sx={connectorHeaderSx}>
          <SourceMark type={source.type} size={24} variant="tile" />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {sourceTypeName(source.type)}
            </Typography>
            <Typography variant="body2" sx={mutedSx}>
              Connection settings are kept by the engine and cannot be changed here yet.
            </Typography>
          </Box>
        </Box>

        <Stack sx={fieldStackSx}>
          <TextField
            label="Source Name"
            required
            fullWidth
            size="small"
            value={name}
            error={!!nameError && name.trim() !== ''}
            helperText={name.trim() !== '' ? nameError || undefined : 'How this source appears in the engine.'}
            onChange={(e) => setName(e.target.value)}
            sx={REQUIRED_FIELD_SX}
          />
        </Stack>

        {isUpload ? (
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Who can see uploaded files
            </Typography>
            <Typography variant="body2" sx={{ ...mutedSx, mt: 0.5, lineHeight: 1.5 }}>
              Each file is shared when it is uploaded: with everyone who can query this engine, or with some roles. Change it per file from the Files drawer.
            </Typography>
          </Box>
        ) : (
          <>
            <Alert severity="info" variant="outlined">
              The engine does not report a source&apos;s current visibility, so this starts from everyone who can query. Saving replaces who can see this content.
            </Alert>
            <FileVisibilityField id="edit-source-visibility" label="Who can see this content" orgHandle={orgHandle} queryRoles={queryRoles} value={visibility} onChange={setVisibility} />
          </>
        )}

        {update.isError && (
          <Alert severity="error" variant="outlined" action={forbidden ? <OwnerAccessButton engineId={engineId} onGranted={save} /> : undefined}>
            {forbidden ? 'Changing a source needs the manage permission on this engine.' : engineMessage(update.error, "Couldn't save the source.")}
          </Alert>
        )}
      </Box>

      <Box sx={drawerFooterSx}>
        <Button variant="outlined" onClick={onClose} disabled={update.isPending}>
          Cancel
        </Button>
        <Button variant="contained" disabled={!canSave} startIcon={update.isPending ? <CircularProgress size={14} color="inherit" /> : undefined} onClick={save}>
          {update.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </Box>
    </Drawer>
  );
}
