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
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@wso2/oxygen-ui';
import { Unlink } from '@wso2/oxygen-ui-icons-react';
import { useCreateResourceLink, useDeleteResourceLink, useLastUnlinkAt, useResourceLinkSuggestions } from '../../hooks/useConfiguration';
import type { ResourceLink } from '../../types/configuration';
import { linkOffers, linkSuggestionRows } from '../../utils/linkSuggestions';
import { linkRows } from '../../utils/resourceLinks';
import { LinkOutcome } from './LinkOutcome';
import { OfferRow } from './OfferRow';
import { ResourceRow } from './ResourceRow';

interface LinkRowsProps {
  projectId: string;
  componentId: string;
  env: string;
  open: boolean;
  links: ResourceLink[];
}

const boxSx = { mb: 1.5, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 } as const;

/**
 * The integration's resources, once each: its links as this environment gets them, with Unlink, then the resources
 * its imports call for. A suggestion for a linked resource is that row's action.
 */
export function LinkRows({ projectId, componentId, env, open, links }: LinkRowsProps) {
  const { data: suggestions = [] } = useResourceLinkSuggestions(projectId, componentId, undefined, open);
  const unlink = useDeleteResourceLink();
  const create = useCreateResourceLink();
  const lastUnlinkAt = useLastUnlinkAt(componentId);
  const [target, setTarget] = useState<string | null>(null);
  const rows = linkRows(links, env);
  const offers = linkOffers(linkSuggestionRows(suggestions, links, ['Link', 'Link through']));
  const offerOnly = offers.filter((o) => !rows.some((r) => r.resourceType === o.resourceType));
  // An unlink since makes the line about the link stale.
  const outcome = create.data && create.submittedAt > lastUnlinkAt && <LinkOutcome write={create.data} changed={!!create.variables.changed} />;
  if (rows.length === 0 && offerOnly.length === 0) return outcome || null;
  const noValues = rows.some((r) => r.noValues);
  const offerRow = (o: (typeof offers)[number], link?: (typeof rows)[number]) => (
    <OfferRow
      key={o.resourceType}
      offer={o}
      link={link}
      busy={create.isPending}
      pending={create.isPending && create.variables?.resourceType === o.resourceType}
      onLink={(connection) => create.mutate({ projectId, componentId, resourceType: o.resourceType, connection, changed: false })}
    />
  );

  return (
    <>
      {outcome}
      <Box sx={boxSx}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Resources
        </Typography>
        {noValues && (
          <Typography variant="caption" color="warning.main" sx={{ display: 'block', mb: 0.5 }}>
            Add the missing values on WSO2 Cloud.
          </Typography>
        )}
        {rows.map((r) => {
          const offer = offers.find((o) => o.resourceType === r.resourceType);
          return offer ? (
            offerRow(offer, r)
          ) : (
            <ResourceRow
              key={r.resourceType}
              name={r.name}
              package={r.package}
              connection={r.connection}
              notes={r.notes}
              label={r.unlinked ? 'Unlinked in next release' : undefined}
              action={
                r.canUnlink && (
                  <Button size="small" variant="outlined" color="error" aria-label={`Unlink ${r.resourceType}`} startIcon={<Unlink size={14} />} disabled={unlink.isPending} onClick={() => setTarget(r.resourceType)}>
                    Unlink
                  </Button>
                )
              }
            />
          );
        })}
        {offerOnly.map((o) => offerRow(o))}
        {create.isError && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {create.error instanceof Error ? create.error.message : 'Failed to link the resource'}
          </Alert>
        )}
        {unlink.isError && (
          <Alert
            severity="error"
            sx={{ mt: 1 }}
            action={
              <Button size="small" color="inherit" onClick={() => unlink.mutate(unlink.variables)}>
                Try again
              </Button>
            }>
            {unlink.error instanceof Error ? unlink.error.message : 'Failed to unlink the resource'}
          </Alert>
        )}
        <Dialog open={!!target} onClose={() => setTarget(null)}>
          <DialogTitle>Unlink {rows.find((r) => r.resourceType === target)?.name ?? target}</DialogTitle>
          <DialogContent>
            <Typography variant="body2">{links.find((l) => l.resourceType === target)?.namesFromWso2Cloud ? 'The link set on WSO2 Cloud stays.' : 'To revoke access, also change the credentials on WSO2 Cloud.'}</Typography>
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
    </>
  );
}
