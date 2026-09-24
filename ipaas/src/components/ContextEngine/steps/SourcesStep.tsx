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

import { Box, Button, Chip, IconButton, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Check, CircleAlert, Pencil, Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { POPULAR_CONNECTORS, SOURCE_CONNECTORS } from '../../../constants/contextEngine';
import { isSourceValid, sourceIncompleteReason, sourceTypeName, summarizeSource } from '../../../utils/contextEngine';
import SourceDrawer, { type SourceDrawerStart } from '../SourceDrawer';
import SourceMark from '../SourceMark';
import { emptySourcesCardSx, marksRowSx, quickAddButtonSx, quickAddRowSx, sourceListSx, sourceRowSx, sourceRowTextSx, sourcesToolbarSx, stepHeadingSx, stepHintSx } from '../styles';
import type { ContextSourceConfig } from '../../../types/contextEngine';

interface SourcesStepProps {
  sources: ContextSourceConfig[];
  onAdd: (source: ContextSourceConfig) => void;
  onUpdate: (index: number, source: ContextSourceConfig) => void;
  onRemove: (index: number) => void;
}

interface DrawerState {
  open: boolean;
  /** Bumped on every open so the drawer remounts with fresh state; kept on close for the exit animation. */
  session: number;
  start?: SourceDrawerStart;
}

function SourceRow({ source, onEdit, onRemove }: { source: ContextSourceConfig; onEdit: () => void; onRemove: () => void }): JSX.Element {
  const name = source.name.trim() || sourceTypeName(source.type);
  const reason = sourceIncompleteReason(source);
  return (
    <Box sx={sourceRowSx}>
      <SourceMark type={source.type} variant="tile" />
      <Box sx={sourceRowTextSx}>
        <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
          {name}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', display: 'block' }} noWrap>
          {summarizeSource(source)}
        </Typography>
      </Box>
      <Chip size="small" variant="outlined" label={sourceTypeName(source.type)} />
      {reason ? <Chip size="small" variant="outlined" color="warning" icon={<CircleAlert size={14} />} label={reason} /> : <Chip size="small" variant="outlined" color="success" icon={<Check size={14} />} label="Configured" />}
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
 * Step 1 — the sources the context graph is built from. The step itself only
 * lists what has been added; browsing the catalog and filling a connector's
 * form happen in a drawer, so the page stays short however many connectors exist.
 */
export default function SourcesStep({ sources, onAdd, onUpdate, onRemove }: SourcesStepProps): JSX.Element {
  const [drawer, setDrawer] = useState<DrawerState>({ open: false, session: 0 });
  const openDrawer = (start?: SourceDrawerStart) => setDrawer((d) => ({ open: true, session: d.session + 1, start }));
  const closeDrawer = () => setDrawer((d) => ({ ...d, open: false }));
  const submit = (config: ContextSourceConfig, index?: number) => {
    if (index === undefined) onAdd(config);
    else onUpdate(index, config);
    closeDrawer();
  };

  const incomplete = sources.filter((s) => !isSourceValid(s)).length;

  return (
    <>
      <Typography variant="subtitle2" sx={stepHeadingSx}>
        Choose Sources
      </Typography>
      <Typography variant="body2" sx={stepHintSx}>
        Pick where the context graph is built from. Add as many sources as you need; each one is configured in its own panel.
      </Typography>

      {sources.length === 0 ? (
        <>
          <Box sx={emptySourcesCardSx}>
            <Box sx={marksRowSx}>
              {POPULAR_CONNECTORS.map((c) => (
                <SourceMark key={c.id} type={c.id} variant="tile" />
              ))}
            </Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 1 }}>
              No sources yet
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 520 }}>
              Browse {SOURCE_CONNECTORS.length} connectors across cloud storage, wikis, code, ticketing, databases and the web, or upload files directly.
            </Typography>
            <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => openDrawer()} sx={{ mt: 0.5 }}>
              Add source
            </Button>
          </Box>
          <Box sx={quickAddRowSx}>
            <Typography variant="body2" color="text.secondary">
              Quick add
            </Typography>
            {POPULAR_CONNECTORS.map((c) => (
              <Button key={c.id} size="small" variant="outlined" startIcon={<SourceMark type={c.id} size={16} />} endIcon={<Plus size={14} />} onClick={() => openDrawer({ connectorId: c.id })} aria-label={`Quick add ${c.name}`} sx={quickAddButtonSx}>
                {c.name}
              </Button>
            ))}
          </Box>
        </>
      ) : (
        <>
          <Box sx={sourcesToolbarSx}>
            <Typography variant="body2" color="text.secondary">
              {sources.length} source{sources.length === 1 ? '' : 's'}
              {incomplete > 0 && (
                <>
                  {' · '}
                  <Box component="span" sx={{ color: 'warning.dark' }}>
                    {incomplete} need{incomplete === 1 ? 's' : ''} attention
                  </Box>
                </>
              )}
            </Typography>
            <Button size="small" variant="outlined" startIcon={<Plus size={16} />} onClick={() => openDrawer()}>
              Add source
            </Button>
          </Box>
          <Box sx={sourceListSx}>
            {sources.map((s, i) => (
              <SourceRow key={`${s.type}-${i}`} source={s} onEdit={() => openDrawer({ config: s, index: i })} onRemove={() => onRemove(i)} />
            ))}
          </Box>
        </>
      )}

      <SourceDrawer key={drawer.session} open={drawer.open} start={drawer.start} existing={sources} onClose={closeDrawer} onSubmit={submit} />
    </>
  );
}
