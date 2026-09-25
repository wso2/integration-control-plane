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

import { Box, Button, Drawer, IconButton, Stack, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft, Plus, X } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { blankSource, CONNECTOR_BY_ID } from '../../constants/contextEngine';
import { isSourceValid, sourceNameError } from '../../utils/contextEngine';
import ConnectorCatalog from './ConnectorCatalog';
import ConnectorForm from './ConnectorForm';
import { drawerBodySx, drawerFooterSx, drawerHeaderSx, sourceDrawerSx } from './styles';
import type { ContextSourceConfig } from '../../types/contextEngine';

/** Where the drawer opens: the catalog (nothing set), a connector's blank form (`connectorId`), or an existing source (`config` + `index`). */
export interface SourceDrawerStart {
  connectorId?: string;
  config?: ContextSourceConfig;
  index?: number;
}

interface SourceDrawerProps {
  orgHandle: string;
  open: boolean;
  start?: SourceDrawerStart;
  /** Sources already in the wizard, for unique names and single-instance connectors. */
  existing: ContextSourceConfig[];
  onClose: () => void;
  /** `index` is set when an existing source was edited. */
  onSubmit: (config: ContextSourceConfig, index?: number) => void;
}

/**
 * Right-side drawer that adds or edits one source. Browsing and configuring
 * happen in the same panel so the form is always in view, with its own scroll
 * and a sticky footer, however large the catalog grows. Remount (change `key`)
 * to start a fresh session.
 */
export default function SourceDrawer({ orgHandle, open, start, existing, onClose, onSubmit }: SourceDrawerProps): JSX.Element {
  const [connectorId, setConnectorId] = useState<string | null>(start?.config?.type ?? start?.connectorId ?? null);
  const [draft, setDraft] = useState<ContextSourceConfig | null>(start?.config ?? (start?.connectorId ? blankSource(start.connectorId) : null));
  const editing = start?.index !== undefined;
  const connector = connectorId ? CONNECTOR_BY_ID[connectorId] : undefined;
  const otherNames = existing.filter((_, i) => i !== start?.index).map((s) => s.name);
  const canSubmit = !!draft && isSourceValid(draft) && sourceNameError(draft.name, otherNames) === '';

  const pick = (id: string) => {
    setConnectorId(id);
    setDraft(blankSource(id));
  };
  const backToCatalog = () => {
    setConnectorId(null);
    setDraft(null);
  };

  const title = connector ? (editing ? `Edit ${connector.name} source` : `Configure ${connector.name}`) : 'Add source';

  return (
    <Drawer anchor="right" open={open} onClose={onClose} variant="temporary" sx={sourceDrawerSx}>
      <Box sx={drawerHeaderSx}>
        <Stack direction="row" alignItems="center" gap={1}>
          {connector && !editing && (
            <IconButton size="small" aria-label="Back to all sources" onClick={backToCatalog}>
              <ArrowLeft size={18} />
            </IconButton>
          )}
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {title}
          </Typography>
        </Stack>
        <IconButton size="small" aria-label="Close" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </Box>

      <Box sx={drawerBodySx}>
        {connector && draft ? (
          <ConnectorForm orgHandle={orgHandle} connector={connector} draft={draft} otherNames={otherNames} onChange={setDraft} onChangeSource={editing ? undefined : backToCatalog} />
        ) : (
          <ConnectorCatalog addedIds={existing.map((s) => s.type)} onPick={pick} />
        )}
      </Box>

      {connector && draft && (
        <Box sx={drawerFooterSx}>
          <Button variant="outlined" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="contained" disabled={!canSubmit} startIcon={editing ? undefined : <Plus size={16} />} onClick={() => onSubmit(draft, start?.index)}>
            {editing ? 'Save changes' : 'Add source'}
          </Button>
        </Box>
      )}
    </Drawer>
  );
}
