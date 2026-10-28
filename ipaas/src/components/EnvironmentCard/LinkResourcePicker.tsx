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

import { useState } from 'react';
import { Alert, Box, Button, CircularProgress, MenuItem, Stack, Typography } from '@wso2/oxygen-ui';
import { Link } from '@wso2/oxygen-ui-icons-react';
import TextField from '../common/TextField';
import { useCreateResourceLink, useResourceLinkOptions } from '../../hooks/useConfiguration';

interface LinkResourcePickerProps {
  projectId: string;
  componentId: string;
  open: boolean;
  linkedTypes: ReadonlySet<string>;
}

const boxSx = { mb: 1.5, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 } as const;

/**
 * Links a resource through one connection of the integration: the resource's keys reach the
 * connection's configurables in every environment. A stopgap until the console suggests the
 * resources an integration's imports call for.
 */
export function LinkResourcePicker({ projectId, componentId, open, linkedTypes }: LinkResourcePickerProps) {
  const { data: options = [] } = useResourceLinkOptions(projectId, componentId, open);
  const create = useCreateResourceLink();
  const [choice, setChoice] = useState('');

  const choices = options.filter((o) => !linkedTypes.has(o.resourceType)).flatMap((o) => o.connections.map((connection) => ({ resourceType: o.resourceType, label: o.displayName || o.resourceType, connection })));
  if (choices.length === 0) return null;
  const chosen = choices[Number(choice)];

  return (
    <Box sx={boxSx}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
        Link a resource
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        Its values reach the connection&apos;s configurables in every environment. Linking redeploys the integration.
      </Typography>
      <Stack direction="row" gap={1} alignItems="center">
        <TextField select fullWidth size="small" label="Resource and connection" value={choice} onChange={(e) => setChoice(e.target.value)}>
          {choices.map((c, i) => (
            <MenuItem key={`${c.resourceType} ${c.connection}`} value={String(i)}>
              {c.label} → {c.connection}
            </MenuItem>
          ))}
        </TextField>
        <Button
          variant="outlined"
          startIcon={create.isPending ? <CircularProgress size={14} /> : <Link size={14} />}
          disabled={!chosen || create.isPending}
          onClick={() => chosen && create.mutate({ projectId, componentId, resourceType: chosen.resourceType, connection: chosen.connection }, { onSuccess: () => setChoice('') })}>
          Link
        </Button>
      </Stack>
      {create.isError && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {create.error instanceof Error ? create.error.message : 'Failed to link the resource'}
        </Alert>
      )}
    </Box>
  );
}
