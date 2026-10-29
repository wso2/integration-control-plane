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
import { conflictLink, conflictsOn, cosmosBuffers, entityConflicts, exploreModel, kindSlots, labelled, linkIndex, linkKey, linkSelection, litLinkColors, neighbourhood, relationLink, relationOf, relationTags, sameRelation, searchLabel, searchNodes, shortLabel, type ExploreFilter, type LinkTag, type Selection } from '../../../utils/contextGraph';
import CosmosCanvas from './CosmosCanvas';
import EntityPanel, { EntityChip } from './EntityPanel';
import { ConflictPanel, RelationPanel, type ConflictView, type LinkEnd, type LinkRecord, type RelationView } from './LinkPanel';
import { useGraphTheme } from './graphTheme';
import { canvasNoteSx, GRAPH_HEIGHT, legendDotSx, legendSx, nodeLabelSx, panelLabelSx, panelSx } from './graphStyles';
import { mutedSx } from '../styles';
import type { ContextEngineDetail, ContextGraphConflict, ContextGraphRelation } from '../../../types/contextEngine';

/** Entities the overview asks the engine for; the most mentioned come first. */
export const GRAPH_ENTITY_LIMIT = 1000;
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
 * The Graph tab's explore view: every entity the engine's records name, the
 * records naming them and their relationships, drawn by the force simulation
 * with each document's entities grouped around it. Search, kind and source
 * filters narrow it; clicking a node lights its neighbourhood and opens it in
 * the inspector, and clicking the label on a line selects that relationship,
 * or, on a "contradicts" label, the whole conflict. Everything shown passed
 * the engine's access check for this reader.
 */
export default function GraphExplorer({ engine, orgHandle, initialKey, onExplain, onSelectKey }: GraphExplorerProps): JSX.Element {
  const { colors, palette } = useGraphTheme();
  const graph = useContextGraph(engine.id, GRAPH_ENTITY_LIMIT);
  const [filter, setFilter] = useState<ExploreFilter>({ records: true, entities: true, detail: 'all' });
  const [selectedKey, setSelectedKey] = useState<string | null>(initialKey);
  const [hovered, setHovered] = useState<number | null>(null);
  const sourcesById = useMemo(() => new Map(engine.sources.map((s) => [s.id, s])), [engine.sources]);
  const data = graph.data ?? null;
  const model = useMemo(() => (data ? exploreModel(data, filter) : null), [data, filter]);
  // The kinds with a colour of their own, from the whole graph served, so a kind keeps its colour whatever the filters show.
  const slots = useMemo(() => (data ? kindSlots(data) : new Map<string, number>()), [data]);
  const buffers = useMemo(() => (model ? cosmosBuffers(model, palette, { slots }) : null), [model, palette, slots]);
  // The key names a link, when it is one the model draws, or else a node.
  const selectedLink = selectedKey && model ? linkIndex(model, selectedKey) : undefined;
  const selectedIndex = selectedKey && model && selectedLink === undefined ? (model.index.get(selectedKey) ?? null) : null;
  const picked = useMemo(() => (model && data && selectedLink !== undefined ? linkSelection(model, data, selectedLink) : null), [model, data, selectedLink]);
  const selection = useMemo<Selection | null>(() => picked ?? (model && selectedIndex !== null ? neighbourhood(model, selectedIndex) : null), [picked, model, selectedIndex]);
  const linkColors = useMemo(() => (model && selection ? litLinkColors(model, palette, selection, palette.lit) : null), [model, palette, selection]);
  // The selected link's label, or a selected node's relationships, written on their links.
  const linkTags = useMemo(() => (picked ? picked.tags : model && selection ? relationTags(model, selection) : NO_TAGS), [picked, model, selection]);
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
  // The legend: the kinds with a colour, in slot order, and a neutral entry when a drawn entity has another kind or none.
  const kindColor = (kind?: string): string | undefined => (kind !== undefined && slots.has(kind) ? colors.kinds[slots.get(kind) as number] : undefined);
  const kindLegend = [...slots.entries()].sort((a, b) => a[1] - b[1]).map(([kind, slot]) => ({ kind, label: kind.charAt(0).toUpperCase() + kind.slice(1), color: colors.kinds[slot] ?? colors.entity }));
  const otherEntities = model.nodes.some((n) => n.kind === 'entity' && kindColor(n.entityKind) === undefined);
  const selectedEntity = selected?.kind === 'entity' ? data.entities.find((e) => e.id === selected.key) : undefined;
  // The selected link, as the panels show it: its relationship from the graph served, or the conflicts on its line.
  const pickedLink = selectedLink !== undefined ? model.links[selectedLink] : null;
  const pickedRelation: ContextGraphRelation | undefined =
    pickedLink?.kind === 'relates' && selectedLink !== undefined ? (relationOf(model, data, selectedLink) ?? { subjectId: model.nodes[pickedLink.source].key, relation: pickedLink.label ?? '', objectId: model.nodes[pickedLink.target].key, recordNodeIds: [] }) : undefined;
  const end = (id: string): LinkEnd => {
    const entity = data.entities.find((e) => e.id === id);
    return entity ? { name: entity.name, ...(entity.kind ? { kind: entity.kind } : {}) } : { name: id };
  };
  const recordView = (id: string): LinkRecord => {
    const record = data.records.find((r) => r.id === id);
    return { id, label: record?.recordId ?? id, sourceName: record ? sourcesById.get(record.sourceId)?.name : undefined, drawn: model.index.has(id) };
  };
  const relationView = (relation: ContextGraphRelation): RelationView => ({ relation, subject: end(relation.subjectId), object: end(relation.objectId), records: relation.recordNodeIds.map(recordView), drawn: relationLink(model, relation) !== undefined });
  const conflictView = ({ index, conflict }: { index: number; conflict: ContextGraphConflict }): ConflictView => ({
    index,
    first: relationView(conflict.first),
    second: relationView(conflict.second),
    reason: conflict.reason,
    confidence: conflict.confidence,
    drawn: conflictLink(model, conflict) !== undefined,
  });
  const selectRelation = (relation: ContextGraphRelation) => {
    const at = relationLink(model, relation);
    if (at !== undefined) selectLink(at);
  };
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
          <Stack direction="row" gap={0.75} role="group" aria-label="Show">
            <KindToggle label="Documents" count={counts.records} on={filter.records} dot={legendDotSx(colors.record, true)} onClick={() => setFilter((f) => ({ ...f, records: !f.records }))} />
            <KindToggle label="Entities" count={drawn.entities} on={filter.entities} dot={legendDotSx(colors.entity)} onClick={() => setFilter((f) => ({ ...f, entities: !f.entities }))} />
          </Stack>
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
          onSelectLink={selectLink}
          onHover={setHovered}
          accent={colors.accent}
          height={GRAPH_HEIGHT}
          ariaLabel={`The knowledge graph: ${counts.records} documents and ${counts.entities} entities you can see`}>
          {model.nodes.length === 0 && (
            <Box sx={canvasNoteSx}>
              <Typography variant="body2" sx={{ ...mutedSx, textAlign: 'center', maxWidth: 380, bgcolor: 'background.paper', borderRadius: 1, px: 2, py: 1.25, border: '1px solid', borderColor: 'divider' }}>
                {counts.records || counts.entities ? 'Nothing matches these filters. Turn on documents or entities to see them.' : 'Nothing to show yet. The graph is built as documents are indexed, and shows only the ones you can see.'}
              </Typography>
            </Box>
          )}
          <Box sx={legendSx}>
            <Stack direction="row" alignItems="center" gap={0.75}>
              <Box sx={legendDotSx(colors.record, true)} />
              Document
            </Stack>
            {kindLegend.map(({ kind, label, color }) => (
              <Stack key={kind} direction="row" alignItems="center" gap={0.75}>
                <Box sx={legendDotSx(color)} />
                {label}
              </Stack>
            ))}
            {(otherEntities || kindLegend.length === 0) && (
              <Stack direction="row" alignItems="center" gap={0.75}>
                <Box sx={legendDotSx(colors.entity)} />
                {kindLegend.length ? 'Other entities' : 'Entity'}
              </Stack>
            )}
            {data.conflicts.length > 0 && (
              <Stack direction="row" alignItems="center" gap={0.75}>
                <Box aria-hidden sx={{ width: 14, height: 3, borderRadius: 1, bgcolor: colors.conflict, flexShrink: 0 }} />
                Conflict
              </Stack>
            )}
            <span>Drag to pan · scroll to zoom · click a node or a label</span>
          </Box>
        </CosmosCanvas>

        <Stack gap={1.75}>
          {pickedLink?.kind === 'conflicts' && selectedLink !== undefined ? (
            <ConflictPanel engineId={engine.id} orgHandle={orgHandle} conflicts={conflictsOn(model, data, selectedLink).map(conflictView)} onSelectEntity={selectEntityByName} onSelectRelation={selectRelation} onClose={() => select(null)} />
          ) : pickedRelation ? (
            <RelationPanel
              engineId={engine.id}
              orgHandle={orgHandle}
              view={relationView(pickedRelation)}
              conflicts={data.conflicts
                .map((conflict, index) => ({ index, conflict }))
                .filter(({ conflict }) => sameRelation(conflict.first, pickedRelation) || sameRelation(conflict.second, pickedRelation))
                .map(conflictView)}
              onSelectEntity={selectEntityByName}
              onSelectRecord={(id) => {
                const at = model.index.get(id);
                if (at !== undefined) select(at);
              }}
              onSelectConflict={selectConflict}
              onClose={() => select(null)}
            />
          ) : selected?.kind === 'entity' ? (
            <EntityPanel
              engineId={engine.id}
              orgHandle={orgHandle}
              name={selected.label}
              // The node is one entity of this name; its kind picks that one on the engine.
              kind={selectedEntity?.kind}
              kindColor={kindColor(selectedEntity?.kind)}
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
            <Box component="section" sx={panelSx(false)}>
              <Typography variant="subtitle2" component="h2" sx={{ fontWeight: 600 }}>
                Click a node
              </Typography>
              <Typography variant="body2" sx={{ ...mutedSx, lineHeight: 1.55 }}>
                Documents are the items your sources delivered. Entities are what the language model found in them while building the graph, and the lines between entities are the relationships it found. Click the label on a line to see that relationship; a red “contradicts” label is a conflict between two of them. You see only what you may read.
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
