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

import { Box, Drawer, IconButton, Stack, Tab, Tabs, Typography } from '@wso2/oxygen-ui';
import { X } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState, type JSX } from 'react';
import type { Connection } from '../../../types/connections';

interface HowToUseDrawerProps {
  open: boolean;
  onClose: () => void;
  connection: Connection;
}

const FILES = ['component.yaml v1.1', 'component.yaml v1.0', 'component-config.yaml'] as const;

/** Environment variable name for a config key, e.g. `ConsumerKey` → `CONSUMER_KEY`. */
function toEnvVar(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toUpperCase();
}

/**
 * "How to Use the Connection" drawer, mirroring Devant's HowToUseView: explains the source
 * configuration file and shows the snippet to reference this connection, per config-file version.
 */
export default function HowToUseDrawer({ open, onClose, connection }: HowToUseDrawerProps): JSX.Element {
  const [tab, setTab] = useState(0);

  const keys = useMemo(() => {
    const first = Object.values(connection.configurations ?? {})[0];
    return first ? Object.values(first.entries).map((e) => e.key) : [];
  }, [connection]);

  const snippet = useMemo(() => {
    const ref = connection.schemaName || connection.serviceName || connection.name;
    if (tab === 2) {
      // component-config.yaml
      const mappings = keys.map((k) => `        - from: ${k}\n          to: ${toEnvVar(k)}`).join('\n');
      return `apiVersion: core.choreo.dev/v1beta1\nkind: ComponentConfig\nspec:\n  outbound:\n    serviceReferences:\n      - name: ${ref}\n        connectionConfig: ${connection.schemaReference}\n        env:\n${mappings || '          # no configuration keys'}`;
    }
    const version = tab === 0 ? '1.1' : '1.0';
    const mappings = keys.map((k) => `          - from: ${k}\n            to: ${toEnvVar(k)}`).join('\n');
    return `schemaVersion: ${version}\ndependencies:\n  serviceReferences:\n    - name: ${ref}\n      connectionConfig: ${connection.schemaReference}\n      env:\n${mappings || '        # no configuration keys'}`;
  }, [tab, keys, connection]);

  return (
    <Drawer anchor="right" open={open} onClose={onClose} variant="temporary" sx={{ '& .MuiDrawer-paper': { width: { xs: '100%', md: '52%', lg: '46%' }, maxWidth: 900, top: { xs: '56px', sm: '64px' }, height: 'auto', bottom: 0 } }}>
      <Stack sx={{ height: '100%' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            How to Use the Connection
          </Typography>
          <IconButton size="small" aria-label="close" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </Stack>

        <Box sx={{ flex: 1, overflowY: 'auto', p: 3 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
            What is your source configuration file?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            The source configuration file is located within the <code>.choreo</code> directory at the root of the project directory.
          </Typography>

          <Tabs value={tab} onChange={(_e, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
            {FILES.map((f) => (
              <Tab key={f} label={f} sx={{ textTransform: 'none', minHeight: 40 }} />
            ))}
          </Tabs>

          <Box
            component="pre"
            sx={{
              m: 0,
              p: 2,
              borderRadius: 1,
              bgcolor: 'action.hover',
              border: '1px solid',
              borderColor: 'divider',
              overflowX: 'auto',
              fontSize: '0.8125rem',
              fontFamily: 'monospace',
              lineHeight: 1.6,
              whiteSpace: 'pre',
            }}>
            {snippet}
          </Box>
        </Box>
      </Stack>
    </Drawer>
  );
}
