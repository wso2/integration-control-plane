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

import { Alert } from '@wso2/oxygen-ui';
import { useCreateResourceLink, useLastUnlinkAt, useResourceLinkSuggestions } from '../../hooks/useConfiguration';
import type { ResourceLink } from '../../types/configuration';
import { type LinkSuggestionAction, linkOffers, linkSuggestionRows } from '../../utils/linkSuggestions';
import { LinkOutcome } from './LinkOutcome';
import { OfferRow } from './OfferRow';

interface LinkSuggestionsProps {
  projectId: string;
  componentId: string;
  open: boolean;
  links: ResourceLink[];
  /** The build whose suggestions to offer; the latest when absent. */
  build?: string;
  /** What the rows may offer to do. */
  actions: LinkSuggestionAction[];
  /** Offer rows only for these resources. */
  only?: string[];
}

/** Resources a build's imports call for, one row per resource, for a box of another's. */
export function LinkSuggestions({ projectId, componentId, open, links, build, actions, only }: LinkSuggestionsProps) {
  const { data: suggestions = [] } = useResourceLinkSuggestions(projectId, componentId, build, open);
  const create = useCreateResourceLink();
  const lastUnlinkAt = useLastUnlinkAt(componentId);

  const offers = linkOffers(linkSuggestionRows(suggestions, links, actions)).filter((o) => !only || only.includes(o.resourceType));
  // An unlink since makes the line about the link stale.
  const outcome = create.data && create.submittedAt > lastUnlinkAt && <LinkOutcome write={create.data} changed={!!create.variables.changed} />;

  return (
    <>
      {outcome}
      {offers.map((o) => (
        <OfferRow
          key={o.resourceType}
          offer={o}
          busy={create.isPending}
          pending={create.isPending && create.variables?.resourceType === o.resourceType}
          onLink={(connection) => create.mutate({ projectId, componentId, resourceType: o.resourceType, connection, changed: o.action === 'Change link' })}
        />
      ))}
      {create.isError && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {create.error instanceof Error ? create.error.message : 'Failed to link the resource'}
        </Alert>
      )}
    </>
  );
}
