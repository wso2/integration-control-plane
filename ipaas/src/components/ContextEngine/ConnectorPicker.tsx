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

import { Box, Button, Chip, ColorSchemeImage, Tooltip, Typography } from '@wso2/oxygen-ui';
import { CheckCircle } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState, type JSX } from 'react';
import { CATALOG_CONNECTORS, contextLogoUrl, isConnectorEnabled, SOURCE_CATEGORIES } from '../../constants/contextEngine';
import { connectorCountsByCategory, filterConnectors } from '../../utils/contextEngine';
import SearchField from '../SearchField';
import { sourceTypeIcon } from './SourceMark';
import { catalogChipsSx, catalogSectionSx, connectorCardSx, connectorGridSx, connectorLogoSx, connectorSectionHeaderSx } from './styles';
import type { SourceCategory, SourceConnector } from '../../types/contextEngine';

/** Coming-soon connectors shown before "Show all" when nothing is searched or filtered. */
const COMING_SOON_PREVIEW = 6;

interface ConnectorPickerProps {
  /** How many sources of each connector id have been added. */
  addedCounts: Record<string, number>;
  onPick: (connectorId: string) => void;
}

type CategoryFilter = SourceCategory | 'all';

function ConnectorLogo({ connector }: { connector: SourceConnector }): JSX.Element {
  return (
    <Box sx={connectorLogoSx}>
      {connector.logo ? <ColorSchemeImage src={{ light: contextLogoUrl(connector.logo), dark: contextLogoUrl(connector.logoDark ?? connector.logo) }} alt="" height={40} sx={{ display: 'block' }} /> : sourceTypeIcon(connector.id, 32)}
    </Box>
  );
}

/** A live connector: opens its form. Shows a check once added; a single-instance connector cannot be added twice. */
function AvailableCard({ connector, added, onPick }: { connector: SourceConnector; added: number; onPick: () => void }): JSX.Element {
  const locked = !!connector.single && added > 0;
  const label = locked ? `${connector.name}, already added` : added > 0 ? `Add another ${connector.name} source, ${added} added` : `Add ${connector.name} source`;
  // Clicking an added card adds another source of that type; edit an existing one from its row above.
  const card = (
    <Box component="button" type="button" onClick={onPick} disabled={locked} aria-label={label} sx={connectorCardSx({ added: added > 0, interactive: !locked })}>
      {added > 0 && (
        <Box sx={{ position: 'absolute', top: 8, right: 8, color: 'primary.main', display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {added > 1 && (
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              {added}
            </Typography>
          )}
          <CheckCircle size={16} />
        </Box>
      )}
      <ConnectorLogo connector={connector} />
      <Typography variant="body2" fontWeight={600} textAlign="center" sx={{ lineHeight: 1.2 }}>
        {connector.name}
      </Typography>
    </Box>
  );
  return added > 0 && !locked ? (
    <Tooltip title={`Add another ${connector.name} source`} placement="top">
      {card}
    </Tooltip>
  ) : (
    card
  );
}

/** An upcoming connector: dimmed like a disabled card and not interactive. The "Coming soon" section heading names its state, so the card carries no badge. */
function ComingSoonCard({ connector }: { connector: SourceConnector }): JSX.Element {
  return (
    <Box aria-disabled="true" sx={{ ...connectorCardSx({ added: false, interactive: false }), '& > *': { opacity: 0.5 } }}>
      <ConnectorLogo connector={connector} />
      <Typography variant="body2" fontWeight={600} textAlign="center" sx={{ lineHeight: 1.2 }}>
        {connector.name}
      </Typography>
    </Box>
  );
}

/**
 * The Choose Sources catalog, laid out like the prebuilt-integration picker:
 * search, category filter, the live connectors, then the upcoming ones.
 * Picking a live connector opens its form; upcoming ones are shown, not picked.
 */
export default function ConnectorPicker({ addedCounts, onPick }: ConnectorPickerProps): JSX.Element {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);

  const counts = useMemo(() => connectorCountsByCategory(CATALOG_CONNECTORS), []);
  const results = useMemo(() => filterConnectors(CATALOG_CONNECTORS, query, category), [query, category]);
  const available = results.filter((c) => isConnectorEnabled(c.id));
  // Popular upcoming connectors lead the preview; the rest follow A–Z.
  const upcoming = results.filter((c) => !isConnectorEnabled(c.id)).sort((a, b) => Number(!!b.popular) - Number(!!a.popular));
  const filtering = query.trim() !== '' || category !== 'all';
  const upcomingShown = filtering || showAllUpcoming ? upcoming : upcoming.slice(0, COMING_SOON_PREVIEW);
  const upcomingHidden = upcoming.length - upcomingShown.length;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <SearchField value={query} onChange={setQuery} placeholder="Search connectors" fullWidth />

      <Box sx={catalogChipsSx} role="group" aria-label="Filter by category">
        <Chip label="All" clickable variant={category === 'all' ? 'filled' : 'outlined'} color={category === 'all' ? 'primary' : 'default'} onClick={() => setCategory('all')} />
        {SOURCE_CATEGORIES.filter((c) => (counts[c.id] ?? 0) > 0).map((c) => (
          <Chip key={c.id} label={c.label} clickable variant={category === c.id ? 'filled' : 'outlined'} color={category === c.id ? 'primary' : 'default'} onClick={() => setCategory(c.id)} />
        ))}
      </Box>

      {results.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No connectors match “{query.trim()}”.
        </Typography>
      ) : (
        <>
          {available.length > 0 && (
            <Box component="section" aria-labelledby="available-connectors">
              <Typography id="available-connectors" component="h3" sx={{ ...catalogSectionSx, ...connectorSectionHeaderSx }}>
                Available now · {available.length}
              </Typography>
              <Box sx={connectorGridSx}>
                {available.map((c) => (
                  <AvailableCard key={c.id} connector={c} added={addedCounts[c.id] ?? 0} onPick={() => onPick(c.id)} />
                ))}
              </Box>
            </Box>
          )}

          {upcoming.length > 0 && (
            <Box component="section" aria-labelledby="upcoming-connectors">
              <Typography id="upcoming-connectors" component="h3" sx={{ ...catalogSectionSx, ...connectorSectionHeaderSx }}>
                Coming soon · {upcoming.length}
              </Typography>
              <Box sx={connectorGridSx}>
                {upcomingShown.map((c) => (
                  <ComingSoonCard key={c.id} connector={c} />
                ))}
              </Box>
              {!filtering && (upcomingHidden > 0 || showAllUpcoming) && (
                <Button size="small" onClick={() => setShowAllUpcoming((v) => !v)} aria-expanded={showAllUpcoming} sx={{ mt: 1.5, ml: '-5px' }}>
                  {showAllUpcoming ? 'Show fewer' : `Show all ${upcoming.length}`}
                </Button>
              )}
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
