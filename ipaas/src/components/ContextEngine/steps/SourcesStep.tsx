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

import { Alert, Box, Chip, IconButton, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Check, CircleAlert, Pencil, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { isSourceValid, sourceIncompleteReason, sourceTypeName, summarizeSourceVisibility, summarizeSource } from '../../../utils/contextEngine';
import ConnectorPicker from '../ConnectorPicker';
import SourceDrawer, { type SourceDrawerStart } from '../SourceDrawer';
import SourceMark from '../SourceMark';
import { sourceListSx, sourceRowSx, sourceRowTextSx, statusChipSx, stepHeadingSx, stepHintSx } from '../styles';
import type { ContextSourceConfig } from '../../../types/contextEngine';

interface SourcesStepProps {
  orgHandle: string;
  sources: ContextSourceConfig[];
  onAdd: (source: ContextSourceConfig) => void;
  onUpdate: (index: number, source: ContextSourceConfig) => void;
  onRemove: (index: number) => void;
  /** Role handle → display name, for each row's visibility line. */
  roleNames?: Record<string, string>;
}

interface DrawerState {
  open: boolean;
  /** Bumped on every open so the drawer remounts with fresh state; kept on close for the exit animation. */
  session: number;
  start?: SourceDrawerStart;
}

function SourceRow({ source, roleNames, onEdit, onRemove }: { source: ContextSourceConfig; roleNames: Record<string, string>; onEdit: () => void; onRemove: () => void }): JSX.Element {
  const name = source.name.trim() || sourceTypeName(source.type);
  const reason = sourceIncompleteReason(source);
  return (
    <Box sx={sourceRowSx}>
      <SourceMark type={source.type} variant="tile" />
      <Box sx={sourceRowTextSx}>
        <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
          {name}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} noWrap>
          {summarizeSource(source, { labelled: true })}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} noWrap>
          Source visible to: {summarizeSourceVisibility(source, roleNames)}
        </Typography>
      </Box>
      <Chip size="small" variant="outlined" label={sourceTypeName(source.type)} />
      {reason ? (
        <Chip size="small" variant="outlined" color="warning" icon={<CircleAlert size={14} />} label={reason} sx={statusChipSx} />
      ) : (
        <Chip size="small" variant="outlined" color="success" icon={<Check size={14} />} label="Configured" sx={statusChipSx} />
      )}
      <Tooltip title="Edit">
        <IconButton size="small" aria-label={`Edit ${name}`} onClick={onEdit}>
          <Pencil size={16} />
        </IconButton>
      </Tooltip>
      <Tooltip title="Remove">
        <IconButton size="small" color="error" aria-label={`Remove ${name}`} onClick={onRemove}>
          <Trash2 size={16} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

/**
 * Step 2 — the sources the context graph is built from. Added sources are listed
 * first; the connector catalog sits on the page (live connectors, then upcoming
 * ones), and picking a connector opens its form in a drawer.
 */
export default function SourcesStep({ orgHandle, sources, onAdd, onUpdate, onRemove, roleNames = {} }: SourcesStepProps): JSX.Element {
  const [drawer, setDrawer] = useState<DrawerState>({ open: false, session: 0 });
  const openDrawer = (start?: SourceDrawerStart) => setDrawer((d) => ({ open: true, session: d.session + 1, start }));
  const closeDrawer = () => setDrawer((d) => ({ ...d, open: false }));
  // Confirms each change inline, like the console's other success alerts; it stays until dismissed or replaced by the next change.
  const [notice, setNotice] = useState<string | null>(null);
  const displayName = (s: ContextSourceConfig) => s.name.trim() || sourceTypeName(s.type);
  const submit = (config: ContextSourceConfig, index?: number) => {
    if (index === undefined) onAdd(config);
    else onUpdate(index, config);
    closeDrawer();
    setNotice(index === undefined ? `Source '${displayName(config)}' added successfully.` : `Source '${displayName(config)}' updated successfully.`);
  };
  const remove = (index: number) => {
    const removed = sources[index];
    onRemove(index);
    if (removed) setNotice(`Source '${displayName(removed)}' removed successfully.`);
  };

  const incomplete = sources.filter((s) => !isSourceValid(s)).length;
  const addedCounts = sources.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.type]: (acc[s.type] ?? 0) + 1 }), {});

  return (
    <>
      <Typography variant="subtitle2" sx={stepHeadingSx}>
        Choose Sources
      </Typography>

      <Typography variant="body2" sx={stepHintSx}>
        Add the places this engine reads content from. You can add more later.
      </Typography>

      {notice && (
        <Alert severity="success" onClose={() => setNotice(null)} sx={{ mb: 3 }}>
          {notice}
        </Alert>
      )}

      {sources.length > 0 && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {sources.length} source{sources.length === 1 ? '' : 's'} added
            {incomplete > 0 && (
              <>
                {' · '}
                <Box component="span" sx={{ color: 'warning.dark' }}>
                  {incomplete} need{incomplete === 1 ? 's' : ''} attention
                </Box>
              </>
            )}
          </Typography>
          <Box sx={sourceListSx}>
            {sources.map((s, i) => (
              <SourceRow key={`${s.type}-${i}`} source={s} roleNames={roleNames} onEdit={() => openDrawer({ config: s, index: i })} onRemove={() => remove(i)} />
            ))}
          </Box>
        </Box>
      )}

      <ConnectorPicker addedCounts={addedCounts} onPick={(connectorId) => openDrawer({ connectorId })} />

      <SourceDrawer key={drawer.session} formOnly orgHandle={orgHandle} open={drawer.open} start={drawer.start} existing={sources} onClose={closeDrawer} onSubmit={submit} />
    </>
  );
}
