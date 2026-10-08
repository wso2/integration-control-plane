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

import { Alert, Box, Button, ButtonBase, Chip, Collapse, Link, MenuItem, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import { ChevronRight, Upload } from '@wso2/oxygen-ui-icons-react';
import { Fragment, useRef, useState, type JSX } from 'react';
import { EVERYONE_VISIBILITY } from '../../constants/contextEngine';
import { REQUIRED_FIELD_SX } from '../../constants/styles';
import { sourceFieldError, sourceNameError, visibleFields } from '../../utils/contextEngine';
import SecretField from '../RagIngestion/SecretField';
import FileVisibilityField from './files/FileVisibilityField';
import { StagedFilesSection, StagedVisibilityField } from './files/StagedFilesSection';
import SourceMark from './SourceMark';
import { connectorHeaderSx, fieldGroupBodySx, fieldGroupChevronSx, fieldGroupToggleSx, fieldStackSx } from './styles';
import type { ContextSourceConfig, SourceConnector, SourceFieldDef } from '../../types/contextEngine';

interface ConnectorFormProps {
  orgHandle: string;
  connector: SourceConnector;
  draft: ContextSourceConfig;
  /** Names of the other sources, for the uniqueness check. */
  otherNames: string[];
  onChange: (draft: ContextSourceConfig) => void;
  /** Shown as a "Change source" link when adding; absent when editing an existing source. */
  onChangeSource?: () => void;
  /** Roles granted query access, for visibility warnings. Set on a running engine; absent in the wizard, where access is chosen in a later step. */
  queryRoles?: string[];
}

/** A field whose value is the text contents of an uploaded file (e.g. an RML mapping). The file name is kept only for display this session; a restored draft still has the contents. */
function FileField({ def, value, onChange }: { def: SourceFieldDef; value: string; onChange: (value: string) => void }): JSX.Element {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  // The reader for the latest pick; a superseded read's result or error is ignored.
  const currentReader = useRef<FileReader | null>(null);
  const read = (file: File | undefined) => {
    if (!file) return;
    setName(file.name);
    const reader = new FileReader();
    currentReader.current = reader;
    reader.onload = () => {
      if (currentReader.current === reader) onChange(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => {
      if (currentReader.current === reader) {
        setName('');
        onChange('');
      }
    };
    reader.readAsText(file);
  };
  const clear = () => {
    currentReader.current = null;
    setName('');
    onChange('');
    if (inputRef.current) inputRef.current.value = '';
  };
  return (
    <Box>
      <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.75 }}>
        {def.label}
        {def.required ? ' *' : ''}
      </Typography>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
        <Button component="label" variant="outlined" size="small" startIcon={<Upload size={16} />}>
          {value ? 'Replace file' : 'Upload file'}
          <input
            ref={inputRef}
            type="file"
            hidden
            accept={def.accept}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = ''; // reset so re-selecting the same file fires change again
              read(file);
            }}
          />
        </Button>
        {value && <Chip label={name || 'File uploaded'} size="small" onDelete={clear} />}
      </Stack>
      {def.helper && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
          {def.helper}
        </Typography>
      )}
    </Box>
  );
}

function Field({ def, value, onChange }: { def: SourceFieldDef; value: string; onChange: (value: string) => void }): JSX.Element {
  // Required-but-empty is signalled by the disabled submit button, not red fields on first open.
  const error = value ? sourceFieldError(def, value) : '';
  if (def.kind === 'secret') return <SecretField label={def.label} required={def.required} value={value} placeholder={def.placeholder} onChange={onChange} error={error || undefined} />;
  if (def.kind === 'file') return <FileField def={def} value={value} onChange={onChange} />;
  const select = def.kind === 'select';
  const multiline = def.kind === 'urls' || def.kind === 'multiline';
  return (
    <TextField
      label={def.label}
      required={def.required}
      select={select}
      fullWidth
      size="small"
      multiline={multiline}
      minRows={multiline ? 3 : undefined}
      value={value}
      placeholder={def.placeholder}
      error={!!error}
      helperText={error || def.helper}
      onChange={(e) => onChange(e.target.value)}
      sx={def.required ? REQUIRED_FIELD_SX : undefined}>
      {select &&
        (def.options ?? []).map((o) => (
          <MenuItem key={o.value} value={o.value}>
            {o.label}
          </MenuItem>
        ))}
    </TextField>
  );
}

/** The configuration form for one connector, rendered from its field schema. */
export default function ConnectorForm({ orgHandle, connector, draft, otherNames, onChange, onChangeSource, queryRoles }: ConnectorFormProps): JSX.Element {
  const nameError = sourceNameError(draft.name, otherNames);
  const upload = connector.id === 'upload';
  const change = onChange;
  // A ref tracks the latest draft so a value set from an async callback (a file read finishing) merges into the current draft, not the snapshot captured when the read began.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const setValue = (key: string, value: string) => change({ ...draftRef.current, values: { ...draftRef.current.values, [key]: value } });

  // User-toggled collapse state, keyed by group; falls back to each group's default.
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const renderField = (def: SourceFieldDef) => <Field key={def.key} def={def} value={draft.values[def.key] ?? ''} onChange={(v) => setValue(def.key, v)} />;

  // Fields split into consecutive same-group runs; headers (and collapsing) apply once the form has more than one section.
  const fields = visibleFields(connector, draft.values);
  const sections: { group?: string; collapsed?: boolean; fields: SourceFieldDef[] }[] = [];
  for (const def of fields) {
    const last = sections[sections.length - 1];
    if (last && last.group === def.group) last.fields.push(def);
    else sections.push({ group: def.group, collapsed: def.groupCollapsed, fields: [def] });
  }
  const showHeaders = sections.length > 1;

  return (
    <>
      <Box sx={connectorHeaderSx}>
        <SourceMark type={connector.id} size={24} variant="tile" />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {connector.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {connector.description}
          </Typography>
        </Box>
        {onChangeSource && (
          <Link component="button" type="button" variant="body2" onClick={onChangeSource} sx={{ flexShrink: 0 }}>
            Change source
          </Link>
        )}
      </Box>

      <Stack sx={fieldStackSx}>
        <TextField
          label="Source Name"
          required
          fullWidth
          size="small"
          value={draft.name}
          error={!!nameError && draft.name.trim() !== ''}
          helperText={draft.name.trim() !== '' ? nameError || undefined : 'How this source appears in the engine.'}
          onChange={(e) => change({ ...draft, name: e.target.value })}
          sx={REQUIRED_FIELD_SX}
        />
        {sections.map((section) => {
          if (!showHeaders || !section.group) return <Fragment key={section.group ?? section.fields[0].key}>{section.fields.map(renderField)}</Fragment>;
          const group = section.group;
          const collapsed = collapsedGroups[group] ?? !!section.collapsed;
          return (
            <Box key={group}>
              <ButtonBase sx={fieldGroupToggleSx} aria-expanded={!collapsed} onClick={() => setCollapsedGroups((c) => ({ ...c, [group]: !collapsed }))}>
                <ChevronRight size={14} style={fieldGroupChevronSx(!collapsed)} />
                {group}
              </ButtonBase>
              <Collapse in={!collapsed} unmountOnExit>
                <Stack sx={fieldGroupBodySx}>{section.fields.map(renderField)}</Stack>
              </Collapse>
            </Box>
          );
        })}
        {upload ? (
          <StagedFilesSection draft={draft} onChange={change} onRunningEngine={queryRoles !== undefined} />
        ) : (
          connector.fields.length === 0 && (
            <Alert severity="info" variant="outlined">
              No connection settings.
            </Alert>
          )
        )}
      </Stack>

      <Box sx={{ mt: 2.5 }}>
        {upload ? (
          <StagedVisibilityField draft={draft} onChange={change} orgHandle={orgHandle} queryRoles={queryRoles} />
        ) : (
          <FileVisibilityField
            id="source-visibility"
            label="Who can see this content"
            orgHandle={orgHandle}
            queryRoles={queryRoles}
            value={draft.stagedVisibility ?? EVERYONE_VISIBILITY}
            onChange={(stagedVisibility) => change({ ...draft, stagedVisibility })}
          />
        )}
      </Box>
    </>
  );
}
