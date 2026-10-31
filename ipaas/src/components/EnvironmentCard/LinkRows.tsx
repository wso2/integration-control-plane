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
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@wso2/oxygen-ui';
import { Unlink } from '@wso2/oxygen-ui-icons-react';
import { useDeleteResourceLink } from '../../hooks/useConfiguration';
import type { ResourceLink } from '../../types/configuration';
import { linkRows } from '../../utils/resourceLinks';

interface LinkRowsProps {
  projectId: string;
  componentId: string;
  env: string;
  links: ResourceLink[];
}

const boxSx = { mb: 1.5, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 } as const;
const rowSx = { py: 0.75, borderTop: '1px solid', borderColor: 'divider' } as const;

/** The integration's links as this environment gets them, each with Unlink. */
export function LinkRows({ projectId, componentId, env, links }: LinkRowsProps) {
  const unlink = useDeleteResourceLink();
  const [target, setTarget] = useState<string | null>(null);
  const rows = linkRows(links, env);
  if (rows.length === 0) return null;
  const noValues = rows.some((r) => r.notes.includes(`no values in ${env}`));

  return (
    <Box sx={boxSx}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
        Linked resources
      </Typography>
      {noValues && (
        <Typography variant="caption" color="warning.main" sx={{ display: 'block', mb: 0.5 }}>
          Add the missing values on WSO2 Cloud; {env} restarts with them by itself.
        </Typography>
      )}
      {rows.map((r) => (
        <Stack key={r.resourceType} direction="row" alignItems="center" gap={1} sx={rowSx}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2">{r.resourceType}</Typography>
            <Typography variant="caption" color="text.secondary">
              {r.notes.join(' · ')}
            </Typography>
          </Box>
          {r.canUnlink && (
            <Button size="small" variant="outlined" color="error" aria-label={`Unlink ${r.resourceType}`} startIcon={<Unlink size={14} />} disabled={unlink.isPending} onClick={() => setTarget(r.resourceType)}>
              Unlink
            </Button>
          )}
        </Stack>
      ))}
      {unlink.isError && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {unlink.error instanceof Error ? unlink.error.message : 'Failed to unlink the resource'}
        </Alert>
      )}
      <Dialog open={!!target} onClose={() => setTarget(null)}>
        <DialogTitle>Unlink {target}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Development drops {target} now; other environments keep its values until a release without it runs there. Unlinking doesn&apos;t revoke access: to cut it off, change the credentials in the resource on WSO2 Cloud.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTarget(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            startIcon={unlink.isPending ? <CircularProgress size={14} /> : undefined}
            disabled={unlink.isPending}
            onClick={() => target && unlink.mutate({ projectId, componentId, resourceType: target }, { onSettled: () => setTarget(null) })}>
            Unlink
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
