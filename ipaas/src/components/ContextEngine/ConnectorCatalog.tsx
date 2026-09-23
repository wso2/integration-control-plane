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

import { Box, Button, Chip, InputAdornment, TextField, Typography } from '@wso2/oxygen-ui';
import { Search } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { CATALOG_PAGE_SIZE, contextLogoUrl, POPULAR_CONNECTORS, SOURCE_CATEGORIES, SOURCE_CONNECTORS } from '../../constants/contextEngine';
import { connectorCountsByCategory, filterConnectors } from '../../utils/contextEngine';
import SelectableCard from '../Databases/create/SelectableCard';
import { sourceTypeIcon } from './SourceMark';
import { catalogChipsSx, catalogGridSx, catalogSectionSx, catalogSentinelSx } from './styles';
import type { SourceCategory, SourceConnector } from '../../types/contextEngine';

interface ConnectorCatalogProps {
  /** Connector ids already added — single-instance connectors among them cannot be added again. */
  addedIds: string[];
  onPick: (connectorId: string) => void;
}

type CategoryFilter = SourceCategory | 'all';

function ConnectorTile({ connector, disabled, onPick }: { connector: SourceConnector; disabled: boolean; onPick: () => void }): JSX.Element {
  return (
    <SelectableCard
      title={connector.name}
      description={disabled ? 'Already added' : connector.description}
      logo={connector.logo ? contextLogoUrl(connector.logo) : undefined}
      icon={sourceTypeIcon(connector.id, 24)}
      selected={false}
      disabled={disabled}
      onSelect={onPick}
    />
  );
}

/**
 * Browse the connector catalog: search, category filter, a Popular row and an
 * A–Z grid that loads a page at a time as it scrolls into view. Scales to
 * hundreds of connectors because the page height never depends on the catalog.
 */
export default function ConnectorCatalog({ addedIds, onPick }: ConnectorCatalogProps): JSX.Element {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [visible, setVisible] = useState(CATALOG_PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const counts = useMemo(() => connectorCountsByCategory(SOURCE_CONNECTORS), []);
  const results = useMemo(() => filterConnectors(SOURCE_CONNECTORS, query, category), [query, category]);
  const showPopular = query.trim() === '' && category === 'all';
  const shown = results.slice(0, visible);
  const remaining = results.length - shown.length;
  const added = new Set(addedIds);
  const isDisabled = (c: SourceConnector) => !!c.single && added.has(c.id);

  const changeQuery = (next: string) => {
    setQuery(next);
    setVisible(CATALOG_PAGE_SIZE);
  };
  const changeCategory = (next: CategoryFilter) => {
    setCategory(next);
    setVisible(CATALOG_PAGE_SIZE);
  };

  // The next page loads when the sentinel scrolls into view; the button below it is the manual fallback.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || remaining <= 0) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setVisible((v) => v + CATALOG_PAGE_SIZE);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [remaining]);

  return (
    <>
      <TextField
        autoFocus
        fullWidth
        size="small"
        value={query}
        placeholder={`Search ${SOURCE_CONNECTORS.length} connectors…`}
        onChange={(e) => changeQuery(e.target.value)}
        slotProps={{
          htmlInput: { 'aria-label': 'Search connectors' },
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <Search size={18} />
              </InputAdornment>
            ),
          },
        }}
      />

      <Box sx={catalogChipsSx} role="group" aria-label="Filter by category">
        <Chip label={`All ${SOURCE_CONNECTORS.length}`} clickable variant={category === 'all' ? 'filled' : 'outlined'} color={category === 'all' ? 'primary' : 'default'} onClick={() => changeCategory('all')} />
        {SOURCE_CATEGORIES.map((c) => (
          <Chip key={c.id} label={`${c.label} ${counts[c.id] ?? 0}`} clickable variant={category === c.id ? 'filled' : 'outlined'} color={category === c.id ? 'primary' : 'default'} onClick={() => changeCategory(c.id)} />
        ))}
      </Box>

      {showPopular && (
        <>
          <Typography component="p" sx={catalogSectionSx}>
            Popular
          </Typography>
          <Box sx={catalogGridSx}>
            {POPULAR_CONNECTORS.map((c) => (
              <ConnectorTile key={c.id} connector={c} disabled={isDisabled(c)} onPick={() => onPick(c.id)} />
            ))}
          </Box>
        </>
      )}

      <Typography component="p" sx={catalogSectionSx}>
        {showPopular ? 'All connectors · A–Z' : `${results.length} connector${results.length === 1 ? '' : 's'}`}
      </Typography>

      {results.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No connectors match “{query.trim()}”. Try another name, or pick a category.
        </Typography>
      ) : (
        <Box sx={catalogGridSx}>
          {shown.map((c) => (
            <ConnectorTile key={c.id} connector={c} disabled={isDisabled(c)} onPick={() => onPick(c.id)} />
          ))}
        </Box>
      )}

      {remaining > 0 && (
        <Box ref={sentinelRef} sx={catalogSentinelSx}>
          <Button size="small" onClick={() => setVisible((v) => v + CATALOG_PAGE_SIZE)}>
            Show {Math.min(remaining, CATALOG_PAGE_SIZE)} more
          </Button>
          <Typography variant="caption" color="text.secondary">
            {shown.length} of {results.length} shown
          </Typography>
        </Box>
      )}
    </>
  );
}
