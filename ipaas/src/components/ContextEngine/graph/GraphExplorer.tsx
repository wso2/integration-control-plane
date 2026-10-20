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

import { Alert, Autocomplete, Box, Button, ButtonBase, CircularProgress, MenuItem, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import { ArrowRight, Search, Waypoints, X } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useState, type JSX } from 'react';
import { useContextGraph } from '../../../hooks/useContextEngine';
import { useAskedQuestions } from '../../../hooks/contextQuestions';
import { cosmosBuffers, exploreModel, KEY_DEGREE, labelled, litLinkColors, neighbourhood, relationTags, searchNodes, shortLabel, type ExploreDetail, type ExploreFilter, type LinkTag } from '../../../utils/contextGraph';
import CosmosCanvas from './CosmosCanvas';
import EntityPanel, { EntityChip } from './EntityPanel';
import { useGraphTheme } from './graphTheme';
import { GRAPH_HEIGHT, legendDotSx, legendSx, nodeLabelSx, panelLabelSx, panelSx } from './graphStyles';
import { mutedSx } from '../styles';
import type { ContextEngineDetail } from '../../../types/contextEngine';

/** Entities the overview asks the engine for; the most mentioned come first. */
export const GRAPH_ENTITY_LIMIT = 300;
/** How many names a document's panel lists before folding the rest. */
const NAMES_SHOWN = 40;
const NO_TAGS: LinkTag[] = [];

interface GraphExplorerProps {
  engine: ContextEngineDetail;
  orgHandle: string;
  /** Graph key to select on arrival, from a deep link. */
  initialKey: string | null;
  onExplain: (queryId: string) => void;
  onSelectKey: (key: string | null) => void;
}

/**
 * The Graph tab's explore view: the entities the engine's records name, the
 * records naming them and their relationships, drawn by the force simulation.
 * Search, kind and source filters narrow it; clicking a node lights its
 * neighbourhood and opens it in the inspector. Everything shown passed the
 * engine's access check for this reader.
 */
export default function GraphExplorer({ engine, orgHandle, initialKey, onExplain, onSelectKey }: GraphExplorerProps): JSX.Element {
  const { colors, palette } = useGraphTheme();
  const graph = useContextGraph(engine.id, GRAPH_ENTITY_LIMIT);
  const [filter, setFilter] = useState<ExploreFilter>({ records: true, entities: true, detail: 'key' });
  const [selectedKey, setSelectedKey] = useState<string | null>(initialKey);
  const [hovered, setHovered] = useState<number | null>(null);
  const sourcesById = useMemo(() => new Map(engine.sources.map((s) => [s.id, s])), [engine.sources]);
  const data = graph.data ?? null;
  const model = useMemo(() => (data ? exploreModel(data, filter) : null), [data, filter]);
  const buffers = useMemo(() => (model ? cosmosBuffers(model, palette) : null), [model, palette]);
  const selectedIndex = selectedKey && model ? (model.index.get(selectedKey) ?? null) : null;
  const selection = useMemo(() => (model && selectedIndex !== null ? neighbourhood(model, selectedIndex) : null), [model, selectedIndex]);
  const linkColors = useMemo(() => (model && selection ? litLinkColors(model, palette, selection, palette.lit) : null), [model, palette, selection]);
  // The selected node's relationships, written on their links.
  const linkTags = useMemo(() => (model && selection ? relationTags(model, selection) : NO_TAGS), [model, selection]);
  const answered = useAskedQuestions(engine.id).filter((q) => q.mode === 'answer' && q.outcome === 'answered');
  const [explain, setExplain] = useState('');

  useEffect(() => setSelectedKey(initialKey), [initialKey]);

  // With a node selected, only its neighbourhood is labelled, so the relationships on its links have room.
  const labels = useMemo(() => (model ? labelled(model, selection, selectedIndex, hovered, selection ? 0 : 12) : []), [model, selection, selectedIndex, hovered]);

  const select = (index: number | null) => {
    const key = index === null || !model ? null : model.nodes[index].key;
    setSelectedKey(key);
    onSelectKey(key);
  };
  const selectEntityByName = (name: string) => {
    const entity = data?.entities.find((e) => e.name.toLowerCase() === name.toLowerCase());
    if (!entity || !model) return;
    const index = model.index.get(entity.id);
    if (index !== undefined) select(index);
  };

  if (graph.isLoading) {
    return (
      <Stack alignItems="center" justifyContent="center" gap={1.5} sx={{ height: GRAPH_HEIGHT }}>
        <CircularProgress size={22} />
        <Typography variant="body2" sx={mutedSx}>
          Reading the graph you can see…
        </Typography>
      </Stack>
    );
  }
  if (graph.isError) {
    return <Alert severity="error">Couldn’t read the engine’s graph. Please try again.</Alert>;
  }
  if (!data || !model || !buffers) {
    return (
      <Alert severity="info">
        This engine doesn’t serve its graph yet. You can still see how an answer was derived: open one from the Playground with <strong>How this answer was derived</strong>.
      </Alert>
    );
  }

  const selected = selectedIndex !== null ? model.nodes[selectedIndex] : null;
  const counts = { records: data.records.length, entities: data.entities.length };
  const drawn = { entities: model.nodes.filter((n) => n.kind === 'entity').length, relations: model.links.filter((l) => l.kind === 'relates').length };
  const sourceIds = [...new Set(data.records.map((r) => r.sourceId))];

  return (
    <Box>
      <Stack direction="row" flexWrap="wrap" alignItems="center" justifyContent="space-between" gap={1.5}>
        <Stack direction="row" flexWrap="wrap" alignItems="center" gap={1.25}>
          <Autocomplete
            size="small"
            sx={{ width: 300 }}
            options={model.nodes.map((_, i) => i)}
            filterOptions={(_options, state) => searchNodes(model, state.inputValue, 10)}
            getOptionLabel={(i) => model.nodes[i]?.label ?? ''}
            groupBy={(i) => (model.nodes[i]?.kind === 'entity' ? 'Entities' : 'Documents')}
            onChange={(_e, i) => {
              if (i !== null && i !== undefined) select(i);
            }}
            renderInput={(params) => (
              <TextField {...params} placeholder="Find a document or entity…" inputProps={{ ...params.inputProps, 'aria-label': 'Find in graph' }} InputProps={{ ...params.InputProps, startAdornment: <Search size={16} aria-hidden /> }} />
            )}
            noOptionsText="Nothing by that name"
          />
          <Stack direction="row" gap={0.75} role="group" aria-label="Show">
            <KindToggle label="Documents" count={counts.records} on={filter.records} dot={legendDotSx(colors.record, true)} onClick={() => setFilter((f) => ({ ...f, records: !f.records }))} />
            <KindToggle label="Entities" count={drawn.entities} on={filter.entities} dot={legendDotSx(colors.entity)} onClick={() => setFilter((f) => ({ ...f, entities: !f.entities }))} />
          </Stack>
          <TextField
            select
            size="small"
            label="Detail"
            value={filter.detail}
            onChange={(e) => setFilter((f) => ({ ...f, detail: e.target.value as ExploreDetail }))}
            sx={{ minWidth: 150 }}
            helperText={null}
            slotProps={{ htmlInput: { 'aria-label': 'Detail' } }}>
            <MenuItem value="key">Key entities</MenuItem>
            <MenuItem value="all">All entities</MenuItem>
          </TextField>
          {sourceIds.length > 1 && (
            <TextField select size="small" label="Source" value={filter.sourceId ?? ''} onChange={(e) => setFilter((f) => ({ ...f, sourceId: e.target.value || undefined }))} sx={{ minWidth: 180 }}>
              <MenuItem value="">All sources</MenuItem>
              {sourceIds.map((id) => (
                <MenuItem key={id} value={id}>
                  {sourcesById.get(id)?.name ?? id}
                </MenuItem>
              ))}
            </TextField>
          )}
        </Stack>
        <Typography variant="caption" sx={mutedSx}>
          Built while indexing · {drawn.entities} of {counts.entities}
          {data.truncated ? '+' : ''} entities · {drawn.relations} relationships
          {filter.detail === 'key' && filter.entities ? ` · key entities are named more than once or linked ${KEY_DEGREE}+ ways` : ''}
        </Typography>
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) 330px' }, gap: 3, mt: 2, alignItems: 'start' }}>
        <CosmosCanvas
          buffers={buffers}
          linkColors={linkColors}
          linkTags={linkTags}
          selection={selection}
          focused={selectedIndex}
          frame={selection?.points ?? null}
          labels={labels}
          renderLabel={(i) => {
            const node = model.nodes[i];
            const lit = !!selection?.points.includes(i);
            return (
              <Box sx={nodeLabelSx(i === selectedIndex, lit && node.kind === 'entity')} title={node.label}>
                {shortLabel(node.label)}
              </Box>
            );
          }}
          onSelect={select}
          onHover={setHovered}
          accent={colors.accent}
          height={GRAPH_HEIGHT}
          ariaLabel={`The knowledge graph: ${counts.records} documents and ${counts.entities} entities you can see`}>
          <Box sx={legendSx}>
            <Stack direction="row" alignItems="center" gap={0.75}>
              <Box sx={legendDotSx(colors.record, true)} />
              Document
            </Stack>
            <Stack direction="row" alignItems="center" gap={0.75}>
              <Box sx={legendDotSx(colors.entity)} />
              Entity
            </Stack>
            <span>Drag to pan · scroll to zoom · click a node</span>
          </Box>
        </CosmosCanvas>

        <Stack gap={1.75}>
          {selected?.kind === 'entity' ? (
            <EntityPanel engineId={engine.id} orgHandle={orgHandle} name={selected.label} sources={engine.sources} onSelectEntity={selectEntityByName} onClose={() => select(null)} />
          ) : selected?.kind === 'record' ? (
            <RecordPanel
              label={selected.label}
              sourceName={sourcesById.get(data.records.find((r) => r.id === selected.key)?.sourceId ?? '')?.name}
              entities={data.mentions
                .filter((m) => m.recordNodeId === selected.key)
                .map((m) => data.entities.find((e) => e.id === m.entityId)?.name)
                .filter((n): n is string => !!n)}
              onSelectEntity={selectEntityByName}
              onClose={() => select(null)}
            />
          ) : (
            <Box component="section" sx={panelSx(false)}>
              <Typography variant="subtitle2" component="h2" sx={{ fontWeight: 600 }}>
                Click a node
              </Typography>
              <Typography variant="body2" sx={{ ...mutedSx, lineHeight: 1.55 }}>
                Documents are the items your sources delivered. Entities are what the language model found in them while building the graph, and the lines between entities are the relationships it found. You see only what you may read.
              </Typography>
              <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 2, rowGap: 0.5, m: 0, fontSize: 13 }}>
                <Box component="dt" sx={mutedSx}>
                  Documents
                </Box>
                <Box component="dd" sx={{ m: 0, fontWeight: 500 }}>
                  {counts.records}
                </Box>
                <Box component="dt" sx={mutedSx}>
                  Entities
                </Box>
                <Box component="dd" sx={{ m: 0, fontWeight: 500 }}>
                  {counts.entities}
                  {data.truncated ? '+' : ''}
                  {drawn.entities < counts.entities ? ` (${drawn.entities} drawn)` : ''}
                </Box>
                <Box component="dt" sx={mutedSx}>
                  Relationships
                </Box>
                <Box component="dd" sx={{ m: 0, fontWeight: 500 }}>
                  {data.relations.length}
                  {drawn.relations < data.relations.length ? ` (${drawn.relations} drawn)` : ''}
                </Box>
              </Box>
            </Box>
          )}

          <Box component="section" sx={{ ...panelSx(false), borderColor: 'primary.light', bgcolor: 'action.hover' }}>
            <Stack direction="row" alignItems="center" gap={1}>
              <Waypoints size={18} aria-hidden />
              <Typography variant="subtitle2" component="h2" sx={{ fontWeight: 600 }}>
                Explain an answer
              </Typography>
            </Stack>
            {answered.length ? (
              <>
                <Typography variant="body2" sx={{ ...mutedSx, lineHeight: 1.5 }}>
                  Pick one of your recent questions to see how its answer was derived.
                </Typography>
                <TextField select size="small" label="Question" value={explain || answered[0].queryId} onChange={(e) => setExplain(e.target.value)}>
                  {answered.map((q) => (
                    <MenuItem key={q.queryId} value={q.queryId} sx={{ whiteSpace: 'normal' }}>
                      {q.question}
                    </MenuItem>
                  ))}
                </TextField>
                <Button variant="contained" endIcon={<ArrowRight size={16} />} onClick={() => onExplain(explain || answered[0].queryId)}>
                  Show derivation
                </Button>
              </>
            ) : (
              <Typography variant="body2" sx={{ ...mutedSx, lineHeight: 1.5 }}>
                Ask a question in Answer mode in the Playground, then come back to see how its answer was derived from this graph.
              </Typography>
            )}
          </Box>
        </Stack>
      </Box>
    </Box>
  );
}

function KindToggle({ label, count, on, dot, onClick }: { label: string; count: number; on: boolean; dot: object; onClick: () => void }): JSX.Element {
  return (
    <ButtonBase
      aria-pressed={on}
      onClick={onClick}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        height: 32,
        px: 1.25,
        borderRadius: 16,
        border: '1px solid',
        borderColor: on ? 'text.secondary' : 'divider',
        bgcolor: on ? 'background.paper' : 'transparent',
        fontSize: 13,
        color: on ? 'text.primary' : 'text.secondary',
      }}>
      <Box aria-hidden sx={{ ...dot, opacity: on ? 1 : 0.35 }} />
      {label}
      <Box component="span" sx={mutedSx}>
        {count}
      </Box>
    </ButtonBase>
  );
}

function RecordPanel({ label, sourceName, entities, onSelectEntity, onClose }: { label: string; sourceName?: string; entities: string[]; onSelectEntity: (name: string) => void; onClose: () => void }): JSX.Element {
  const [allNames, setAllNames] = useState(false);
  const shown = allNames ? entities : entities.slice(0, NAMES_SHOWN);
  return (
    <Box component="aside" aria-label={`Document ${label}`} sx={panelSx(true)}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
        <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600, minWidth: 0 }} noWrap title={label}>
          {label}
        </Typography>
        <ButtonBase aria-label="Release the selection" onClick={onClose} sx={{ width: 28, height: 28, borderRadius: '50%' }}>
          <X size={15} />
        </ButtonBase>
      </Stack>
      <Typography variant="caption" sx={mutedSx}>
        Document{sourceName ? ` · ${sourceName}` : ''}
      </Typography>
      <Box>
        <Typography sx={panelLabelSx}>Names</Typography>
        <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mt: 0.75 }}>
          {entities.length ? (
            shown.map((name) => <EntityChip key={name} name={name} onSelect={onSelectEntity} />)
          ) : (
            <Typography variant="body2" sx={mutedSx}>
              No entities found in it.
            </Typography>
          )}
        </Stack>
        {entities.length > NAMES_SHOWN && (
          <Button size="small" variant="text" onClick={() => setAllNames((v) => !v)} sx={{ mt: 0.75, px: 0.5, minWidth: 0 }}>
            {allNames ? 'Show fewer' : `Show all ${entities.length} names`}
          </Button>
        )}
      </Box>
    </Box>
  );
}
