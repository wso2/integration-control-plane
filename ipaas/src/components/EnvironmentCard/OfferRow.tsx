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
import { Button, CircularProgress, MenuItem, TextField } from '@wso2/oxygen-ui';
import { Link } from '@wso2/oxygen-ui-icons-react';
import type { LinkOffer } from '../../utils/linkSuggestions';
import type { LinkRow } from '../../utils/resourceLinks';
import { ResourceRow } from './ResourceRow';

interface OfferRowProps {
  offer: LinkOffer;
  /** The resource's link, when it has one: the offer is its action. */
  link?: LinkRow;
  busy: boolean;
  pending: boolean;
  onLink: (connection: string) => void;
}

/** A suggested resource, on its link's row when it has one, with a choice of connection where there are several. */
export function OfferRow({ offer, link, busy, pending, onLink }: OfferRowProps) {
  const [picked, setPicked] = useState(offer.connections[0]);
  const connection = offer.connections.includes(picked) ? picked : offer.connections[0];
  const label = offer.action === 'Change link' ? 'Change link' : 'Link';
  const target =
    offer.connections.length > 1 ? (
      <TextField select size="small" value={connection} onChange={(e) => setPicked(e.target.value)} inputProps={{ 'aria-label': `Connection for ${offer.resourceType}` }}>
        {offer.connections.map((c) => (
          <MenuItem key={c} value={c}>
            {c}
          </MenuItem>
        ))}
      </TextField>
    ) : (
      connection
    );

  return (
    <ResourceRow
      name={offer.displayName || link?.name || offer.resourceType}
      package={offer.package || link?.package}
      connection={
        offer.linkedConnection ? (
          <>
            {offer.linkedConnection} → {target}
          </>
        ) : (
          target
        )
      }
      notes={link?.notes}
      label={link?.unlinked ? 'Unlinked in next release' : undefined}
      action={
        <Button size="small" variant="outlined" aria-label={`${label} ${offer.resourceType} through ${connection}`} startIcon={pending ? <CircularProgress size={14} /> : <Link size={14} />} disabled={busy} onClick={() => onLink(connection)}>
          {label}
        </Button>
      }
    />
  );
}
