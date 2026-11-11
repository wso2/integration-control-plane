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

import { Alert, Autocomplete, Box, Button, ButtonBase, Checkbox, Chip, CircularProgress, MenuItem, Popover, Stack, TextField, Tooltip, Typography } from '@wso2/oxygen-ui';
import { ChevronDown, /* ArrowRight, */ Filter, Info, Search, /* Waypoints, */ X } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { useContextGraph } from '../../../hooks/useContextEngine';
import { isOpaqueRecordId } from '../../../utils/contextEngine';
// import { useAskedQuestions } from '../../../hooks/contextQuestions';
import {
  conflictLink,
  cosmosBuffers,
  entityConflicts,
  exploreModel,
  kindSlots,
  labelled,
  linkIndex,
  linkKey,
  linkSelection,
  litLinkColors,
  mergeRelationTags,
  neighbourhood,
  relationTags,
  searchLabel,
  searchNodes,
  shortLabel,
  type ExploreFilter,
  type LinkTag,
  type Selection,
} from '../../../utils/contextGraph';
import CosmosCanvas from './CosmosCanvas';
import EntityPanel, { EntityChip } from './EntityPanel';
import { LinkDetails } from './LinkPanel';
import { useGraphTheme } from './graphTheme';
import { canvasNoteSx, GRAPH_HEIGHT, legendDotSx, legendSx, nodeLabelSx, panelLabelSx, panelSx, selectRowSx } from './graphStyles';
import { mutedSx } from '../styles';
import type { ContextEngineDetail } from '../../../types/contextEngine';

/** Entities the overview asks the engine for; the most mentioned come first. */
export const GRAPH_ENTITY_LIMIT = 10000;
/** How many names a document's panel lists before folding the rest. */
const NAMES_SHOWN = 40;
const NO_TAGS: LinkTag[] = [];
/** The type filter's key for documents, and for entities whose kind has no colour of its own. */
const DOCUMENT_TYPE = '\u0000document';
const OTHER_TYPE = '\u0000other';
/** How many types the filter row shows as chips, the ones with the most entities; the rest sit under More. */
const TYPES_SHOWN = 6;
/** How many entities the empty panel suggests as a place to start. */
const START_ENTITIES = 5;

interface GraphExplorerProps {
  engine: ContextEngineDetail;
  orgHandle: string;
  /** Graph key to select on arrival, from a deep link. */
  initialKey: string | null;
  onExplain: (queryId: string) => void;
  onSelectKey: (key: string | null) => void;
}

/**
 * The Graph tab's explore view: every entity the engine's records name, the
 * records naming them and their relationships, drawn by the force simulation
 * with each document's entities grouped around it. Search, kind and source
 * filters narrow it; clicking a node lights its neighbourhood and opens it in
 * the inspector, and clicking the label on a line selects that relationship,
 * or, on a "contradicts" label, the whole conflict. Everything shown passed
 * the engine's access check for this reader.
 */
export default function GraphExplorer({ engine, orgHandle, initialKey, /* onExplain, */ onSelectKey }: GraphExplorerProps): JSX.Element {
  const { colors, palette } = useGraphTheme();
  const [filter, setFilter] = useState<ExploreFilter>({ records: true, entities: true, detail: 'all' });
  // With a source chosen, the engine is asked for that source alone, so its names fill the slots
  // instead of sharing them with every other source; the browser-side filter then has nothing to hide.
  const graph = useContextGraph(engine.id, GRAPH_ENTITY_LIMIT, true, filter.sourceId);
  const [selectedKey, setSelectedKey] = useState<string | null>(initialKey);
  const [hovered, setHovered] = useState<number | null>(null);
  const sourcesById = useMemo(() => new Map(engine.sources.map((s) => [s.id, s])), [engine.sources]);
  const data = graph.data ?? null;
  // The kinds with a colour of their own, from the whole graph served, so a kind keeps its colour whatever the filters show.
  const slots = useMemo(() => (data ? kindSlots(data) : new Map<string, number>()), [data]);
  // The types picked in "Filter by type": none picked draws every type.
  const [types, setTypes] = useState<Set<string>>(() => new Set());
  // Every kind the engine extracted is a type of its own; entities with none share one.
  const typeOf = useMemo(() => (kind: string | undefined) => kind ?? OTHER_TYPE, []);
  const drawFilter = useMemo<ExploreFilter>(() => {
    if (!types.size) return filter;
    return { ...filter, records: types.has(DOCUMENT_TYPE), entities: [...types].some((t) => t !== DOCUMENT_TYPE), includeKind: (kind) => types.has(typeOf(kind)) };
  }, [filter, types, typeOf]);
  // A record id that is only a storage key (a Drive file id, say) is drawn as its source's name.
  const model = useMemo(() => (data ? exploreModel(data, drawFilter, (r) => (isOpaqueRecordId(r.recordId) ? (sourcesById.get(r.sourceId)?.name ?? r.recordId) : r.recordId)) : null), [data, drawFilter, sourcesById]);
  const buffers = useMemo(() => (model ? cosmosBuffers(model, palette, { slots }) : null), [model, palette, slots]);
  // The key names a link, when it is one the model draws, or else a node.
  const selectedLink = selectedKey && model ? linkIndex(model, selectedKey) : undefined;
  const selectedIndex = selectedKey && model && selectedLink === undefined ? (model.index.get(selectedKey) ?? null) : null;
  const picked = useMemo(() => (model && data && selectedLink !== undefined ? linkSelection(model, data, selectedLink) : null), [model, data, selectedLink]);
  const selection = useMemo<Selection | null>(() => picked ?? (model && selectedIndex !== null ? neighbourhood(model, selectedIndex) : null), [picked, model, selectedIndex]);
  const linkColors = useMemo(() => (model && selection ? litLinkColors(model, palette, selection, palette.lit) : null), [model, palette, selection]);
  // The selected link's label, or a selected node's relationships, written on their links.
  // A selected node's tags fold the relationships it shares with several entities into one counted tag.
  const linkTags = useMemo(() => {
    if (picked) return picked.tags;
    if (!model || !selection) return NO_TAGS;
    const tags = relationTags(model, selection);
    return selectedIndex !== null ? mergeRelationTags(model, tags, selectedIndex) : tags;
  }, [picked, model, selection, selectedIndex]);
  // Explain an answer, hidden for now.
  // const answered = useAskedQuestions(engine.id).filter((q) => q.mode === 'answer' && q.outcome === 'answered');
  // const [explain, setExplain] = useState('');

  useEffect(() => setSelectedKey(initialKey), [initialKey]);

  // Escape releases the selection and shows the whole graph again. The search box keeps Escape while its list is open.
  useEffect(() => {
    if (!selectedKey) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      setSelectedKey(null);
      onSelectKey(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedKey, onSelectKey]);

  // With a node selected, only its neighbourhood is labelled, so the relationships on its links have room.
  const labels = useMemo(() => (model ? labelled(model, selection, selectedIndex, hovered, selection ? 0 : 12) : []), [model, selection, selectedIndex, hovered]);

  const select = (index: number | null) => {
    const key = index === null || !model ? null : model.nodes[index].key;
    setSelectedKey(key);
    onSelectKey(key);
  };
  // A relationship or a conflict line; a document line has no key and stays as it is.
  const selectLink = (link: number) => {
    const key = model ? linkKey(model, link) : undefined;
    if (!key) return;
    setSelectedKey(key);
    onSelectKey(key);
  };
  const selectEntityByName = (name: string, kind?: string) => {
    if (!data || !model) return;
    const named = data.entities.filter((e) => e.name.toLowerCase() === name.toLowerCase());
    // An entity is its name and its kind: with a kind, that one; without, or when none has it, the first of the name.
    const entity = (kind ? named.find((e) => e.kind === kind) : undefined) ?? named[0];
    if (!entity) return;
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
    return <Alert severity="info">Graph view isn’t available for this engine.</Alert>;
  }
  // The engine serves its graph, but there is nothing in it: no record is indexed yet, or every record was
  // deleted. The canvas is not mounted for it, since it has nothing to draw and no point to fit the camera to.
  if (data.entities.length === 0 && data.records.length === 0) {
    return <Alert severity="info">The graph is empty. It fills as records are indexed: add a source or upload files, then come back.</Alert>;
  }

  const selected = selectedIndex !== null ? model.nodes[selectedIndex] : null;
  const counts = { records: data.records.length, entities: data.entities.length };
  const drawn = { entities: model.nodes.filter((n) => n.kind === 'entity').length, relations: model.links.filter((l) => l.kind === 'relates').length };
  // Every registered source, not only those in the current read: a filtered read holds one.
  const sourceIds = engine.sources.map((s) => s.id);
  // The colour a kind is drawn in, when it has one of its own.
  const kindColor = (kind?: string): string | undefined => (kind !== undefined && slots.has(kind) ? colors.kinds[slots.get(kind) as number] : undefined);
  const typeCounts = new Map<string, number>();
  for (const e of data.entities) typeCounts.set(typeOf(e.kind), (typeCounts.get(typeOf(e.kind)) ?? 0) + 1);
  // Every type with entities, the most first, with the document as one more; kinds past the coloured ones are drawn grey.
  const typeList = [
    ...[...typeCounts.entries()].map(([key, count]) => ({ key, label: key === OTHER_TYPE ? 'No type' : key.charAt(0).toUpperCase() + key.slice(1), color: (key !== OTHER_TYPE && kindColor(key)) || colors.entity, square: false, count })),
    { key: DOCUMENT_TYPE, label: 'Document', color: colors.record, square: true, count: counts.records },
  ]
    .filter((t) => t.count > 0)
    // On a tie, a type with a colour of its own comes first.
    .sort((a, b) => b.count - a.count || Number(!slots.has(a.key)) - Number(!slots.has(b.key)) || a.label.localeCompare(b.label));
  // The chips: the types with the most entities, and any type picked from More, so a pick stays in view.
  const chipTypes = typeList.filter((t, i) => i < TYPES_SHOWN || types.has(t.key));
  const moreTypes = typeList.slice(TYPES_SHOWN);
  const toggleType = (key: string) =>
    setTypes((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const filtered = types.size > 0 || !!filter.sourceId;
  const clearFilter = () => {
    setTypes(new Set());
    setFilter((f) => ({ ...f, sourceId: undefined }));
  };
  const showAll = () => select(null);
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const connected = selection && selectedIndex !== null ? selection.points.filter((p) => p !== selectedIndex && model.nodes[p]?.kind === 'entity').length : 0;
  // The best-connected entities drawn, as a place to start when nothing is selected.
  const degree = new Map<number, number>();
  for (const l of model.links) {
    if (l.kind !== 'relates') continue;
    degree.set(l.source, (degree.get(l.source) ?? 0) + 1);
    degree.set(l.target, (degree.get(l.target) ?? 0) + 1);
  }
  const startWith = [...degree.entries()]
    .filter(([i]) => model.nodes[i]?.kind === 'entity')
    .sort((a, b) => b[1] - a[1])
    .slice(0, START_ENTITIES);
  const firstConflict = data.conflicts.findIndex((c) => conflictLink(model, c) !== undefined);
  const selectedEntity = selected?.kind === 'entity' ? data.entities.find((e) => e.id === selected.key) : undefined;
  const selectConflict = (index: number) => {
    const at = data.conflicts[index] ? conflictLink(model, data.conflicts[index]) : undefined;
    if (at !== undefined) selectLink(at);
  };

  return (
    <Box>
      <Stack direction="row" flexWrap="wrap" alignItems="center" justifyContent="space-between" gap={1.5}>
        <Stack direction="row" flexWrap="wrap" alignItems="center" gap={1.25}>
          <Autocomplete
            size="small"
            sx={{ width: 300 }}
            options={model.nodes.map((_, i) => i)}
            // Follows the selection, so the box empties when it is released.
            value={selectedIndex}
            filterOptions={(_options, state) => searchNodes(model, state.inputValue, 10)}
            // An entity is listed with its kind in brackets, so two of one name can be told apart.
            getOptionLabel={(i) => (model.nodes[i] ? searchLabel(model.nodes[i]) : '')}
            groupBy={(i) => (model.nodes[i]?.kind === 'entity' ? 'Entities' : 'Documents')}
            renderOption={(props, i) => {
              const { key, ...rest } = props as typeof props & { key?: string };
              const node = model.nodes[i];
              return (
                <li key={key ?? node.key} {...rest}>
                  <Box aria-hidden sx={{ ...legendDotSx(node.kind === 'entity' ? (kindColor(node.entityKind) ?? colors.entity) : colors.record, node.kind === 'record'), mr: 1 }} />
                  {searchLabel(node)}
                </li>
              );
            }}
            onChange={(_e, i) => {
              if (i !== null && i !== undefined) select(i);
            }}
            renderInput={(params) => (
              <TextField {...params} placeholder="Find a document or entity…" inputProps={{ ...params.inputProps, 'aria-label': 'Find in graph' }} InputProps={{ ...params.InputProps, startAdornment: <Search size={16} aria-hidden /> }} />
            )}
            noOptionsText="Nothing by that name"
          />
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
        <Stack direction="row" alignItems="center" gap={0.5} sx={{ fontSize: 13, color: 'text.secondary' }} role="status">
          {selected ? (
            <>
              <span>
                {selected.label} and {plural(connected, 'connected entity', 'connected entities')}
              </span>
              <span aria-hidden>·</span>
              <Button size="small" variant="text" onClick={showAll} sx={{ minWidth: 0, px: 0.5 }}>
                Show all
              </Button>
            </>
          ) : selectedLink !== undefined ? (
            <>
              <span>One relationship selected</span>
              <span aria-hidden>·</span>
              <Button size="small" variant="text" onClick={showAll} sx={{ minWidth: 0, px: 0.5 }}>
                Show all
              </Button>
            </>
          ) : filtered ? (
            <>
              <span>
                Showing {drawn.entities} of {counts.entities}
                {data.truncated ? '+' : ''} entities
              </span>
              <span aria-hidden>·</span>
              <Button size="small" variant="text" onClick={clearFilter} sx={{ minWidth: 0, px: 0.5 }}>
                Clear filter
              </Button>
            </>
          ) : (
            <>
              <span>
                {counts.entities}
                {data.truncated ? '+' : ''} entities · {plural(drawn.relations, 'relationship', 'relationships')} · from {plural(counts.records, 'document', 'documents')}
              </span>
              {data.truncated && (
                <Tooltip title="Large graphs are trimmed to the most mentioned entities. Search, or filter by type or source, to see others.">
                  <Box component="span" tabIndex={0} aria-label="Why the graph is trimmed" sx={{ display: 'inline-flex', color: 'text.secondary' }}>
                    <Info size={14} />
                  </Box>
                </Tooltip>
              )}
            </>
          )}
        </Stack>
      </Stack>

      <Stack direction="row" flexWrap="wrap" alignItems="center" gap={1} sx={{ mt: 1.5 }} role="group" aria-label="Filter by type">
        <Stack direction="row" alignItems="center" gap={0.75} sx={{ fontSize: 13, color: 'text.secondary', mr: 0.25 }}>
          <Filter size={14} aria-hidden />
          Filter by type:
        </Stack>
        {chipTypes.map((t) => (
          <TypeToggle key={t.key} label={t.label} count={t.count} color={t.color} square={t.square} on={types.has(t.key)} dimmed={types.size > 0 && !types.has(t.key)} onClick={() => toggleType(t.key)} />
        ))}
        {moreTypes.length > 0 && <MoreTypes items={moreTypes} picked={types} onToggle={toggleType} />}
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) 330px' }, gap: 3, mt: 2, alignItems: 'start' }}>
        <CosmosCanvas
          buffers={buffers}
          layoutKey={engine.id}
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
              <ButtonBase onClick={() => select(i)} aria-label={`Select ${node.label}`} title={node.label} sx={nodeLabelSx(i === selectedIndex, lit && node.kind === 'entity')}>
                {shortLabel(node.label)}
              </ButtonBase>
            );
          }}
          onSelect={select}
          onSelectLink={selectLink}
          onHover={setHovered}
          accent={colors.accent}
          height={GRAPH_HEIGHT}
          ariaLabel={`The knowledge graph: ${counts.records} documents and ${counts.entities} entities you can see`}>
          {model.nodes.length === 0 && (
            <Box sx={canvasNoteSx}>
              <Typography variant="body2" sx={{ ...mutedSx, textAlign: 'center', maxWidth: 380, bgcolor: 'background.paper', borderRadius: 1, px: 2, py: 1.25, border: '1px solid', borderColor: 'divider' }}>
                {counts.records || counts.entities ? 'Nothing matches this filter. Clear it to see the whole graph.' : 'Nothing to show yet.'}
              </Typography>
            </Box>
          )}
          <Box sx={{ ...legendSx, position: 'absolute', left: 12, bottom: 12, right: 64, width: 'fit-content', pointerEvents: 'none' }}>
            {data.conflicts.length > 0 && (
              <Stack direction="row" alignItems="center" gap={0.75}>
                <Box aria-hidden sx={{ width: 14, height: 3, borderRadius: 1, bgcolor: colors.conflict, flexShrink: 0 }} />
                Conflict
              </Stack>
            )}
            <Stack direction="row" alignItems="center" gap={0.75}>
              <Box component="span" aria-hidden sx={{ fontSize: 14, lineHeight: 1 }}>
                →
              </Box>
              Arrows point at the object
            </Stack>
            <span>{selection ? 'Drag to pan · scroll to zoom · Esc to show the whole graph' : 'Drag to pan · scroll to zoom · click a node or a label'}</span>
          </Box>
        </CosmosCanvas>

        {/* As tall as the canvas on wide screens: a short panel fills it, a long one scrolls inside it. */}
        <Stack gap={1.75} sx={{ height: { lg: GRAPH_HEIGHT }, overflowY: { lg: 'auto' }, '& > *': { flexShrink: 0 }, '& > :last-child': { flexGrow: 1 } }}>
          {selectedLink !== undefined ? (
            <LinkDetails
              engineId={engine.id}
              orgHandle={orgHandle}
              model={model}
              graph={data}
              link={selectedLink}
              sourceName={(id) => sourcesById.get(id)?.name}
              onSelectEntity={selectEntityByName}
              onSelectRecord={(id) => {
                const at = model.index.get(id);
                if (at !== undefined) select(at);
              }}
              onSelectLink={selectLink}
              onClose={() => select(null)}
            />
          ) : selected?.kind === 'entity' ? (
            <EntityPanel
              engineId={engine.id}
              orgHandle={orgHandle}
              name={selected.label}
              // The node is one entity of this name; its kind picks that one on the engine.
              kind={selectedEntity?.kind}
              kindColor={kindColor(selectedEntity?.kind) ?? colors.entity}
              conflicts={entityConflicts(data, selected.key, model)}
              sources={engine.sources}
              onSelectEntity={selectEntityByName}
              onSelectConflict={selectConflict}
              onClose={() => select(null)}
            />
          ) : selected?.kind === 'record' ? (
            <RecordPanel
              label={selected.label}
              sourceName={sourcesById.get(data.records.find((r) => r.id === selected.key)?.sourceId ?? '')?.name}
              entities={data.mentions
                .filter((m) => m.recordNodeId === selected.key)
                .flatMap((m) => {
                  const e = data.entities.find((entity) => entity.id === m.entityId);
                  return e ? [{ name: e.name, kind: e.kind }] : [];
                })}
              onSelectEntity={selectEntityByName}
              onClose={() => select(null)}
            />
          ) : (
            <Box component="section" aria-label="Start exploring" sx={panelSx(false)}>
              <Box>
                <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600 }}>
                  Start exploring
                </Typography>
                <Typography variant="body2" sx={{ ...mutedSx, lineHeight: 1.5, mt: 0.25 }}>
                  Select a node on the graph, or start with a well-connected entity.
                </Typography>
              </Box>
              {startWith.length > 0 && (
                <Box>
                  <Stack direction="row" justifyContent="space-between" sx={panelLabelSx}>
                    <span>Most connected</span>
                    <span>Links</span>
                  </Stack>
                  <Stack component="ul" sx={{ listStyle: 'none', m: 0, mt: 0.5, p: 0 }}>
                    {startWith.map(([i, links]) => {
                      const node = model.nodes[i];
                      return (
                        <Box component="li" key={node.key}>
                          <ButtonBase
                            onClick={() => select(i)}
                            aria-label={`Select ${node.label}, ${plural(links, 'link', 'links')}`}
                            sx={{ ...selectRowSx, display: 'flex', alignItems: 'center', gap: 1, border: 'none', px: 1, py: 0.75, mx: -1, width: 'calc(100% + 16px)', '&:hover': { bgcolor: 'action.hover' } }}>
                            <Box aria-hidden sx={legendDotSx(kindColor(node.entityKind) ?? colors.entity)} />
                            <Box component="span" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={node.label}>
                              {node.label}
                            </Box>
                            <Box component="span" sx={{ ...mutedSx, fontSize: 12 }}>
                              {links}
                            </Box>
                          </ButtonBase>
                        </Box>
                      );
                    })}
                  </Stack>
                </Box>
              )}
              {firstConflict >= 0 && (
                <Box sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 1.5 }}>
                  <Stack direction="row" alignItems="center" gap={1}>
                    <Box aria-hidden sx={{ width: 14, height: 3, borderRadius: 1, bgcolor: colors.conflict, flexShrink: 0 }} />
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {plural(data.conflicts.length, 'conflict', 'conflicts')}
                    </Typography>
                  </Stack>
                  <Typography variant="caption" sx={{ ...mutedSx, display: 'block', mt: 0.25 }}>
                    Sources disagree on these facts.
                  </Typography>
                  <Button size="small" variant="text" onClick={() => selectConflict(firstConflict)} sx={{ mt: 0.5, px: 0.5, minWidth: 0 }}>
                    Review conflicts
                  </Button>
                </Box>
              )}
              <Typography variant="caption" sx={mutedSx}>
                Built automatically from your sources while they’re indexed.
              </Typography>
            </Box>
          )}

          {/* Explain an answer, hidden for now.
          <Box component="section" sx={{ ...panelSx(false), borderColor: 'primary.light', bgcolor: 'action.hover' }}>
            <Stack direction="row" alignItems="center" gap={1}>
              <Waypoints size={18} aria-hidden />
              <Typography variant="subtitle2" component="h2" sx={{ fontWeight: 600 }}>
                Explain an answer
              </Typography>
            </Stack>
            {answered.length ? (
              <>
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
                Ask a question in Answer mode to explain it here.
              </Typography>
            )}
          </Box>
          */}
        </Stack>
      </Box>
    </Box>
  );
}

/** "More" at the end of the type chips: the rest of the types in a searchable list, each picked with a checkbox. */
function MoreTypes({ items, picked, onToggle }: { items: { key: string; label: string; count: number; color: string; square: boolean }[]; picked: Set<string>; onToggle: (key: string) => void }): JSX.Element {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [query, setQuery] = useState('');
  // The popover takes focus when it opens; the search box takes it back once it has, so typing searches.
  const searchRef = useRef<HTMLInputElement | null>(null);
  const wanted = query.trim().toLowerCase();
  const shown = wanted ? items.filter((i) => i.label.toLowerCase().includes(wanted)) : items;
  const inMore = items.filter((i) => picked.has(i.key)).length;
  return (
    <>
      <Chip
        clickable
        variant="outlined"
        aria-haspopup="true"
        aria-expanded={!!anchor}
        onClick={(e) => setAnchor(e.currentTarget)}
        label={
          <Stack direction="row" alignItems="center" gap={0.5} component="span">
            More{' '}
            <Box component="span" sx={{ ...mutedSx, fontSize: 12 }}>
              {inMore ? `${inMore} of ${items.length}` : items.length}
            </Box>
            <ChevronDown size={14} aria-hidden />
          </Stack>
        }
        sx={{ fontSize: 13, borderColor: anchor || inMore ? 'primary.main' : 'divider', bgcolor: inMore ? 'action.selected' : 'background.paper' }}
      />
      <Popover open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} slotProps={{ paper: { sx: { width: 280, mt: 0.75 } }, transition: { onEntered: () => searchRef.current?.focus() } }}>
        <Box sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
          <TextField
            size="small"
            fullWidth
            inputRef={searchRef}
            placeholder="Search types"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            inputProps={{ 'aria-label': 'Search types' }}
            InputProps={{
              startAdornment: (
                <Box component="span" aria-hidden sx={{ display: 'flex', mr: 1, color: 'text.secondary' }}>
                  <Search size={16} />
                </Box>
              ),
            }}
          />
        </Box>
        <Box role="group" aria-label="More types" sx={{ maxHeight: 320, overflowY: 'auto', py: 0.5 }}>
          {shown.map((t) => (
            <ButtonBase
              key={t.key}
              role="checkbox"
              aria-checked={picked.has(t.key)}
              onClick={() => onToggle(t.key)}
              sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%', px: 1.5, py: 0.25, fontSize: 13, textAlign: 'left', '&:hover': { bgcolor: 'action.hover' } }}>
              <Checkbox size="small" checked={picked.has(t.key)} tabIndex={-1} disableRipple sx={{ p: 0.5 }} inputProps={{ 'aria-hidden': true }} />
              <Box aria-hidden sx={legendDotSx(t.color, t.square)} />
              <Box component="span" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.label}>
                {t.label}
              </Box>
              <Box component="span" sx={{ ...mutedSx, fontSize: 12 }}>
                {t.count}
              </Box>
            </ButtonBase>
          ))}
          {!shown.length && (
            <Typography variant="body2" sx={{ ...mutedSx, px: 1.5, py: 1 }}>
              No types match.
            </Typography>
          )}
        </Box>
      </Popover>
    </>
  );
}

/** One type in "Filter by type": its colour, name and count. Picked types are outlined in the accent; while some are picked, the rest are dimmed with a hollow dot. */
function TypeToggle({ label, count, color, square, on, dimmed, onClick }: { label: string; count: number; color: string; square: boolean; on: boolean; dimmed: boolean; onClick: () => void }): JSX.Element {
  return (
    <Chip
      clickable
      variant="outlined"
      aria-pressed={on}
      onClick={onClick}
      icon={<Box aria-hidden sx={{ ...legendDotSx(color, square), ...(dimmed ? { bgcolor: 'transparent', border: '1.5px solid', borderColor: color, boxSizing: 'border-box' } : {}) }} />}
      label={
        <>
          {label}{' '}
          <Box component="span" sx={{ ...mutedSx, fontSize: 12 }}>
            {count}
          </Box>
        </>
      }
      sx={{
        fontSize: 13,
        borderColor: on ? 'primary.main' : 'divider',
        bgcolor: on ? 'action.selected' : 'background.paper',
        color: dimmed ? 'text.secondary' : 'text.primary',
        '& .MuiChip-icon': { ml: 1.25, mr: -0.25 },
      }}
    />
  );
}

/** An entity named in a document: its name and, when the graph knows one, its kind, which picks the right entity when a name is two. */
interface NamedEntity {
  name: string;
  kind?: string;
}

function RecordPanel({ label, sourceName, entities, onSelectEntity, onClose }: { label: string; sourceName?: string; entities: NamedEntity[]; onSelectEntity: (name: string, kind?: string) => void; onClose: () => void }): JSX.Element {
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
            shown.map((e) => <EntityChip key={`${e.name}|${e.kind ?? ''}`} name={e.name} kind={e.kind} onSelect={onSelectEntity} />)
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
