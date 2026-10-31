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

import { Alert, Box, Button, Chip, CircularProgress, Stack, Typography } from '@wso2/oxygen-ui';
import { Link } from '@wso2/oxygen-ui-icons-react';
import { useCreateResourceLink, useResourceLinkSuggestions } from '../../hooks/useConfiguration';
import type { ResourceLink } from '../../types/configuration';
import { linkSuggestionRows } from '../../utils/linkSuggestions';
import { LinkOutcome } from './LinkOutcome';

interface LinkSuggestionsProps {
  projectId: string;
  componentId: string;
  open: boolean;
  links: ResourceLink[];
  /** The build whose suggestions to offer; the latest when absent. */
  build?: string;
}

const boxSx = { mb: 1.5, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 } as const;
const rowSx = { py: 0.75, borderTop: '1px solid', borderColor: 'divider' } as const;
const chipSx = { height: 18, fontSize: '0.65rem', borderRadius: 0.75 } as const;

/** Resources a build's imports call for, one row per resource and connection. */
export function LinkSuggestions({ projectId, componentId, open, links, build }: LinkSuggestionsProps) {
  const { data: suggestions = [] } = useResourceLinkSuggestions(projectId, componentId, build, open);
  const create = useCreateResourceLink();

  const rows = linkSuggestionRows(suggestions, links);
  const outcome = create.data && <LinkOutcome write={create.data} changed={!!create.variables.changed} />;
  if (rows.length === 0) return outcome || null;

  return (
    <>
      {outcome}
      <Box sx={boxSx}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Suggested resources
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          Resources for the connectors this integration imports. Linking one supplies its connection&apos;s configurables: development gets them with its current build, other environments when you promote to them.
        </Typography>
        {rows.map((r) => {
          const pending = create.isPending && create.variables?.resourceType === r.resourceType && create.variables.connection === r.connection;
          return (
            <Stack key={`${r.resourceType} ${r.connection}`} direction="row" alignItems="center" gap={1} sx={rowSx}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" alignItems="center" gap={0.75}>
                  <Typography variant="body2">{r.displayName || r.resourceType}</Typography>
                  <Chip label={r.package} size="small" variant="outlined" sx={chipSx} />
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                  {r.action === 'Link' ? r.connection : r.action === 'Change link' ? `${r.linkedConnection} → ${r.connection}` : `linked under its own key names → ${r.connection}`}
                </Typography>
              </Box>
              <Button
                size="small"
                variant="outlined"
                aria-label={`${r.action} ${r.resourceType} through ${r.connection}`}
                startIcon={pending ? <CircularProgress size={14} /> : <Link size={14} />}
                disabled={create.isPending}
                onClick={() => create.mutate({ projectId, componentId, resourceType: r.resourceType, connection: r.connection, changed: r.action !== 'Link' })}>
                {r.action}
              </Button>
            </Stack>
          );
        })}
        {create.isError && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {create.error instanceof Error ? create.error.message : 'Failed to link the resource'}
          </Alert>
        )}
      </Box>
    </>
  );
}
