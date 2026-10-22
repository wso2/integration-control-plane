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

import { Box, Stack, Tooltip, Typography, useTheme } from '@wso2/oxygen-ui';
import { BadgeCheck, ChevronDown, ChevronRight, Diamond, GitBranch, Info, RefreshCw, Repeat, Shield, User, Wrench } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactElement, type ReactNode } from 'react';
import type { InstanceGraph, ModelGraphNode, StepExecution, StepReview } from '../../api/workflows';
import { diagramColors, iconForType, paletteColor, softPrimary, statusColorName } from './graphVisuals';
import { gateTooltip, isReviewPending, reviewsByTrigger, reviewToOpen, stepText, type GateKind } from './helpers';
import { isContainer, layoutFloorPlan, sequenceNodes, SIDE_GAP, SIDE_R, sideNodesOf, STEP_W, type PlacedArm, type PlacedNode, type StepSides } from './floorPlan';

interface TreeNode {
  node: ModelGraphNode;
  arms: { name: string; children: TreeNode[] }[];
}

// Input nodes are already in source order; arms come out in first-appearance order.
function buildTree(nodes: ModelGraphNode[]): TreeNode[] {
  const known = new Set(nodes.map((n) => n.stepId));
  const byId = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];
  for (const node of nodes) {
    const tree: TreeNode = { node, arms: [] };
    byId.set(node.stepId, tree);
    const parent = node.parent && known.has(node.parent) ? byId.get(node.parent) : undefined;
    if (!parent) {
      roots.push(tree);
      continue;
    }
    const armName = node.branch ?? '';
    let arm = parent.arms.find((a) => a.name === armName);
    if (!arm) {
      arm = { name: armName, children: [] };
      parent.arms.push(arm);
    }
    arm.children.push(tree);
  }
  return roots;
}

const CONTAINER_KINDS = new Set(['BRANCH', 'LOOP', 'TRY']);
const MARK_KINDS = new Set(['CODE', 'EXIT']);

// A stepId is `<construct>#<ordinal>`, so its prefix is the construct as written.
const constructOf = (node: ModelGraphNode): string => node.stepId.split('#')[0];

const CONSTRUCT_ICONS: Record<string, ComponentType<{ size?: number }>> = {
  if: Diamond,
  match: GitBranch,
  while: RefreshCw,
  foreach: Repeat,
  do: Shield,
};

function containerTitle(node: ModelGraphNode, prefix = ''): string {
  const construct = constructOf(node);
  return `${prefix}${construct}${node.label ? ` ${node.label}` : ''}`;
}

function KeywordRow({
  depth,
  icon: Icon,
  text,
  title,
  collapsed,
  onToggle,
  collapsedStatusColor,
  chart,
  muted,
}: {
  depth: number;
  icon?: ComponentType<{ size?: number }>;
  text: string;
  title?: string;
  collapsed?: boolean;
  onToggle?: () => void;
  collapsedStatusColor?: string;
  chart?: boolean;
  muted?: boolean;
}): ReactElement {
  const toggle = onToggle !== undefined;
  return (
    <Stack
      direction="row"
      alignItems="center"
      gap={0.5}
      role={toggle ? 'button' : undefined}
      tabIndex={toggle ? 0 : undefined}
      onClick={onToggle}
      onKeyDown={toggle ? (e) => (e.key === 'Enter' ? onToggle?.() : undefined) : undefined}
      sx={{
        pl: chart ? 0.75 : 1 + depth * 1.5,
        pr: 1,
        py: 0.4,
        color: 'text.secondary',
        minWidth: 0,
        cursor: toggle ? 'pointer' : 'default',
        borderRadius: 1,
        ...(chart && { border: '1px dashed', borderColor: 'divider', ml: 0.5 + depth * 1.5, pl: 0.75, my: 0.25, width: 'fit-content', maxWidth: '100%' }),
        '&:hover': toggle ? { bgcolor: (t) => softPrimary(t, 0.05) } : undefined,
      }}>
      {toggle && <Box sx={{ display: 'flex', flexShrink: 0 }}>{collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}</Box>}
      {Icon && (
        <Box sx={{ flexShrink: 0, display: 'flex' }}>
          <Icon size={12} />
        </Box>
      )}
      <Typography variant="caption" sx={{ fontWeight: muted ? 400 : 700, fontSize: 11.5, fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: muted ? 'text.disabled' : undefined }} title={title ?? text}>
        {text}
      </Typography>
      {collapsed && collapsedStatusColor && (
        <Tooltip title="Steps inside ran — expand to see them">
          <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: collapsedStatusColor, flexShrink: 0 }} />
        </Tooltip>
      )}
    </Stack>
  );
}

// Enter or Space opens a gate, as on any button; Space would otherwise scroll the rail.
function activateOnKey(e: { key: string; preventDefault: () => void }, open: (() => void) | undefined): void {
  if (!open || (e.key !== 'Enter' && e.key !== ' ')) return;
  e.preventDefault();
  open();
}

// Both gates are a person's decision, marked by what it decides: a seal for an approval, a wrench for a failed step's retry.
const GATE_MARKS: Record<GateKind, ComponentType<{ size?: number; x?: number; y?: number; color?: string; strokeWidth?: number }>> = { approval: BadgeCheck, review: Wrench };

function GateGlyph({ kind }: { kind: GateKind }): ReactElement {
  const Mark = GATE_MARKS[kind];
  return (
    <Box sx={{ position: 'relative', display: 'flex' }}>
      <User size={13} />
      <Box sx={{ position: 'absolute', right: -5, bottom: -4, display: 'flex', p: '1px', borderRadius: '50%', bgcolor: 'background.paper' }}>
        <Mark size={8} />
      </Box>
    </Box>
  );
}

// A gate on a step, as a circle beside it: faded until it is raised in this run, clickable once it has been.
function GateNode({ kind, reviews, onOpenReview }: { kind: GateKind; reviews: StepReview[]; onOpenReview?: (taskId: string) => void }): ReactElement {
  const ran = reviews.length > 0;
  const pending = reviews.some(isReviewPending);
  const target = reviewToOpen(reviews);
  const open = target?.taskId && onOpenReview ? () => onOpenReview(target.taskId as string) : undefined;
  const color = pending ? 'warning.main' : ran ? 'text.secondary' : 'text.disabled';
  return (
    <Stack direction="row" alignItems="center" sx={{ flexShrink: 0 }}>
      <Box sx={{ width: 10, borderTop: '1px dashed', borderColor: 'divider' }} />
      <Tooltip title={gateTooltip(kind, reviews, open !== undefined)}>
        <Box
          role={open ? 'button' : undefined}
          tabIndex={open ? 0 : undefined}
          aria-label={kind}
          onClick={open}
          onKeyDown={(e) => activateOnKey(e, open)}
          sx={{
            position: 'relative',
            width: 26,
            height: 26,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: ran ? '1.5px solid' : '1px dashed',
            borderColor: pending ? 'warning.main' : ran ? 'text.secondary' : 'divider',
            bgcolor: 'background.paper',
            color,
            cursor: open ? 'pointer' : 'default',
            '&:hover': open ? { bgcolor: (t) => softPrimary(t, 0.08) } : undefined,
          }}>
          <GateGlyph kind={kind} />
          {reviews.length > 1 && (
            <Typography variant="caption" sx={{ position: 'absolute', top: -7, right: -9, fontWeight: 700, fontSize: 9.5, lineHeight: 1, px: 0.4, py: 0.2, borderRadius: 1, bgcolor: 'background.paper', color }}>
              {reviews.length}
            </Typography>
          )}
        </Box>
      </Tooltip>
    </Stack>
  );
}

function StepRow({
  node,
  exec,
  depth,
  selected,
  isCurrent,
  onSelect,
  rowRef,
  chart = false,
}: {
  node: ModelGraphNode;
  exec: StepExecution | undefined;
  depth: number;
  selected: boolean;
  isCurrent: boolean;
  onSelect: () => void;
  rowRef: (el: HTMLDivElement | null) => void;
  chart?: boolean;
}): ReactElement {
  const theme = useTheme();
  const c = diagramColors(theme);
  const ran = exec !== undefined;
  const statusColor = ran ? paletteColor(theme, statusColorName(exec.status)) : c.textDisabled;
  const Icon = iconForType(node.kind);
  const title = stepText(node);
  // Failed at some point but the latest execution succeeded — a retry or a review decision.
  const recovered = ran && exec.failure !== undefined && (exec.status ?? '').toUpperCase() === 'COMPLETED';
  return (
    <Box
      ref={rowRef}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => (e.key === 'Enter' ? onSelect() : undefined)}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        pl: chart ? 0.75 : 1 + depth * 1.5,
        pr: 1,
        py: 0.5,
        cursor: 'pointer',
        borderRadius: 1,
        borderLeft: '3px solid',
        borderLeftColor: ran ? statusColor : 'transparent',
        ...(chart && {
          border: '1px solid',
          borderColor: ran ? statusColor : 'divider',
          borderLeft: '3px solid',
          bgcolor: 'background.paper',
          ml: 0.5 + depth * 1.5,
          pl: 0.75,
          my: 0.25,
          width: 'fit-content',
          maxWidth: '100%',
          minWidth: 140,
        }),
        bgcolor: selected ? (t) => softPrimary(t, 0.12) : 'transparent',
        outline: selected ? '1px solid' : 'none',
        outlineColor: 'primary.main',
        '&:hover': { bgcolor: (t) => softPrimary(t, 0.06) },
        color: ran ? 'text.primary' : 'text.disabled',
      }}>
      <Box sx={{ color: statusColor, display: 'flex', flexShrink: 0 }}>
        <Icon size={13} />
      </Box>
      <Typography
        variant="body2"
        sx={{ fontWeight: ran ? 600 : 400, fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: 1 }}
        title={`${title} · ${node.stepId}${ran ? ` · ${exec.status ?? ''}` : ' · not executed'}`}>
        {title}
      </Typography>
      {recovered && (
        <Tooltip title="Failed earlier in this run; the latest execution succeeded">
          <Box sx={{ color: 'warning.main', display: 'flex', flexShrink: 0 }}>
            <Info size={12} />
          </Box>
        </Tooltip>
      )}
      {isCurrent && (
        <Tooltip title="Last executed step (approximate)">
          <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: statusColor, flexShrink: 0 }} />
        </Tooltip>
      )}
      {exec && exec.count > 1 && (
        <Typography variant="caption" sx={{ color: statusColor, fontWeight: 700, fontSize: 10.5, flexShrink: 0 }}>
          ×{exec.count}
        </Typography>
      )}
    </Box>
  );
}

export default function FlowRail({
  data,
  selectedStepId,
  currentStepId,
  onSelect,
  onOpenReview,
  variant = 'chart',
}: {
  data: InstanceGraph;
  selectedStepId: string | null;
  currentStepId: string | null;
  onSelect: (stepId: string | null) => void;
  onOpenReview?: (taskId: string) => void;
  variant?: 'chart' | 'uml';
}): ReactElement | null {
  const theme = useTheme();
  const graph = data.graph;
  const tree = useMemo(() => (graph && graph.nodes ? buildTree(sequenceNodes(graph)) : []), [graph]);
  const sides = useMemo(() => (graph ? sideNodesOf(graph) : new Map<string, StepSides>()), [graph]);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const chart = true; // rows are always boxed now; 'uml' swaps the whole renderer below

  useEffect(() => {
    if (!selectedStepId) return;
    rowRefs.current.get(selectedStepId)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedStepId]);

  if (tree.length === 0) return null;
  const steps = data.steps ?? {};

  const toggle = (stepId: string) =>
    setCollapsed((cur) => {
      const next = new Set(cur);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });

  // Aggregate status of everything under these nodes: the worst outcome wins.
  const aggregateStatusColor = (children: TreeNode[]): string | undefined => {
    let best: string | undefined;
    const rank = (status: string): number => (['FAILED', 'TERMINATED', 'TIMED_OUT'].includes(status) ? 3 : status === 'RUNNING' ? 2 : 1);
    let bestRank = 0;
    const walk = (n: TreeNode) => {
      const exec = steps[n.node.stepId];
      if (exec) {
        const status = (exec.status ?? '').toUpperCase();
        const r = rank(status);
        if (r > bestRank) {
          bestRank = r;
          best = paletteColor(theme, statusColorName(status));
        }
      }
      n.arms.forEach((a) => a.children.forEach(walk));
    };
    children.forEach(walk);
    return best;
  };

  const foldableGroup = (key: string, children: TreeNode[], childDepth: number, keyword: (folded: boolean) => ReactNode): ReactNode => {
    const folded = collapsed.has(key);
    return (
      <Box key={key}>
        {keyword(folded)}
        {!folded && children.map((child) => renderNode(child, childDepth))}
      </Box>
    );
  };

  // Rows are indented by depth, so here both gates follow the step, in the order they happen.
  const renderStep = (t: TreeNode, depth: number): ReactNode => {
    const row = renderStepRow(t, depth);
    const gates = sides.get(t.node.stepId);
    if (!gates) return row;
    const { approvals, failures } = reviewsByTrigger(steps[t.node.stepId]?.reviews ?? []);
    return (
      <Stack key={t.node.stepId} direction="row" alignItems="center" sx={{ minWidth: 0 }}>
        {row}
        {gates.approval && <GateNode kind="approval" reviews={approvals} onOpenReview={onOpenReview} />}
        {gates.review && <GateNode kind="review" reviews={failures} onOpenReview={onOpenReview} />}
      </Stack>
    );
  };

  const renderStepRow = (t: TreeNode, depth: number): ReactNode => (
    <StepRow
      key={t.node.stepId}
      node={t.node}
      exec={steps[t.node.stepId]}
      depth={depth}
      selected={selectedStepId === t.node.stepId}
      isCurrent={currentStepId === t.node.stepId}
      onSelect={() => onSelect(selectedStepId === t.node.stepId ? null : t.node.stepId)}
      chart={chart}
      rowRef={(el) => {
        if (el) rowRefs.current.set(t.node.stepId, el);
        else rowRefs.current.delete(t.node.stepId);
      }}
    />
  );

  const renderContainer = (t: TreeNode, depth: number, prefix = ''): ReactNode => {
    const Icon = CONSTRUCT_ICONS[constructOf(t.node)] ?? Diamond;
    const isCollapsed = collapsed.has(t.node.stepId);
    const ranInside = aggregateStatusColor(t.arms.flatMap((a) => a.children)) !== undefined;
    const rows: ReactNode[] = [
      <KeywordRow
        key={t.node.stepId}
        depth={depth}
        icon={Icon}
        text={containerTitle(t.node, prefix)}
        title={`${containerTitle(t.node, prefix)} · ${t.node.stepId}`}
        collapsed={isCollapsed}
        onToggle={() => toggle(t.node.stepId)}
        collapsedStatusColor={isCollapsed ? aggregateStatusColor(t.arms.flatMap((a) => a.children)) : undefined}
        chart={chart}
        muted={!ranInside}
      />,
    ];
    if (isCollapsed) {
      return <Box key={`c-${t.node.stepId}${prefix}`}>{rows}</Box>;
    }
    for (const arm of t.arms) {
      if (arm.name === 'then' || arm.name === 'body' || arm.name === 'do' || arm.name === '') {
        rows.push(arm.children.map((child) => renderNode(child, depth + 1)));
      } else if (arm.name === 'else') {
        const only = arm.children.length === 1 ? arm.children[0] : null;
        if (only && only.node.kind.toUpperCase() === 'BRANCH' && constructOf(only.node) === 'if') {
          rows.push(renderContainer(only, depth, 'else '));
        } else {
          const key = `${t.node.stepId}/else`;
          rows.push(
            foldableGroup(key, arm.children, depth + 1, (folded) => (
              <KeywordRow depth={depth} text="else" chart={chart} collapsed={folded} onToggle={() => toggle(key)} collapsedStatusColor={folded ? aggregateStatusColor(arm.children) : undefined} muted={aggregateStatusColor(arm.children) === undefined} />
            )),
          );
        }
      } else if (arm.name === 'onFail') {
        const key = `${t.node.stepId}/onFail`;
        rows.push(
          foldableGroup(key, arm.children, depth + 1, (folded) => (
            <KeywordRow
              depth={depth}
              icon={Shield}
              text="on fail"
              chart={chart}
              collapsed={folded}
              onToggle={() => toggle(key)}
              collapsedStatusColor={folded ? aggregateStatusColor(arm.children) : undefined}
              muted={aggregateStatusColor(arm.children) === undefined}
            />
          )),
        );
      } else {
        // A match clause's patterns, or any arm name this rail does not know, render as a case label.
        const key = `${t.node.stepId}/${arm.name}`;
        rows.push(
          foldableGroup(key, arm.children, depth + 2, (folded) => (
            <KeywordRow depth={depth + 1} text={arm.name} chart={chart} collapsed={folded} onToggle={() => toggle(key)} collapsedStatusColor={folded ? aggregateStatusColor(arm.children) : undefined} muted={aggregateStatusColor(arm.children) === undefined} />
          )),
        );
      }
    }
    return <Box key={`c-${t.node.stepId}${prefix}`}>{rows}</Box>;
  };

  const renderNode = (t: TreeNode, depth: number): ReactNode => {
    const kind = t.node.kind.toUpperCase();
    if (MARK_KINDS.has(kind)) {
      const label = kind === 'EXIT' ? `↩ ${(t.node as { mode?: string }).mode ?? 'exit'}` : 'data processing';
      return (
        <Typography
          key={t.node.stepId}
          variant="caption"
          title={t.node.label ?? undefined}
          sx={{ display: 'block', pl: 1 + depth * 1.5 + 2.5, py: 0.25, color: 'text.disabled', fontStyle: 'italic', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {label}
        </Typography>
      );
    }
    if (CONTAINER_KINDS.has(kind)) {
      return renderContainer(t, depth);
    }
    return renderStep(t, depth);
  };

  if (variant === 'uml') {
    return (
      <Box sx={{ overflow: 'auto', height: '100%', py: 1, px: 0.5 }}>
        <UmlActivityDiagram data={data} steps={steps} selectedStepId={selectedStepId} currentStepId={currentStepId} onSelect={onSelect} onOpenReview={onOpenReview} />
      </Box>
    );
  }

  const terminusRow = (label: string, filled: boolean): ReactNode => (
    <Stack direction="row" alignItems="center" gap={0.75} sx={{ pl: 1, py: 0.5, color: 'text.secondary', minWidth: 0 }}>
      <Box sx={{ width: 11, height: 11, borderRadius: '50%', flexShrink: 0, ...(filled ? { bgcolor: 'text.primary' } : { border: '2px solid', borderColor: 'text.primary' }) }} />
      <Typography variant="caption" sx={{ fontWeight: 700, fontSize: 11, fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </Typography>
    </Stack>
  );

  return (
    <Stack sx={{ overflow: 'auto', height: '100%', py: 1, px: 0.5 }}>
      {terminusRow(data.workflowType, true)}
      {tree.map((t) => renderNode(t, 0))}
      {terminusRow('end', false)}
    </Stack>
  );
}

// ── UML activity diagram ──────────────────── ──

// Sibling arms sit side by side under their decision diamond and merge below, laid out by layoutFloorPlan.
function UmlActivityDiagram({
  data,
  steps,
  selectedStepId,
  currentStepId,
  onSelect,
  onOpenReview,
}: {
  data: InstanceGraph;
  steps: Record<string, StepExecution>;
  selectedStepId: string | null;
  currentStepId: string | null;
  onSelect: (stepId: string | null) => void;
  onOpenReview?: (taskId: string) => void;
}): ReactElement | null {
  const theme = useTheme();
  const c = diagramColors(theme);
  const graph = data.graph;
  const plan = useMemo(() => (graph && graph.nodes && graph.nodes.length > 0 ? layoutFloorPlan(graph) : null), [graph]);
  if (!plan) return null;

  const line = c.textDisabled;
  const armHasExecution = (arm: PlacedArm): boolean => arm.children.some((child) => steps[child.node.stepId] !== undefined || child.arms.some(armHasExecution));
  const shapes: ReactNode[] = [];
  const wires: ReactNode[] = [];
  let wireKey = 0;

  // A merge bends just above its target, so it runs down its own arm's column rather than past the steps of another arm.
  const elbow = (x1: number, y1: number, x2: number, y2: number, guard?: string, dashed?: boolean, merge?: boolean) => {
    const midY = merge ? Math.max(y1 + 5, y2 - 6) : y1 + Math.max(5, (y2 - y1) / 2);
    wires.push(
      <g key={`w${wireKey++}`}>
        <path d={x1 === x2 ? `M ${x1} ${y1} L ${x2} ${y2}` : `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`} fill="none" stroke={line} strokeWidth={1} strokeDasharray={dashed ? '3 3' : undefined} markerEnd="url(#uml2-arrow)" />
        {guard && (
          <text x={x2 + 5} y={y2 - 3} fill={c.textSecondary} fontSize={8.5} fontFamily="monospace">
            {guard}
          </text>
        )}
      </g>,
    );
  };

  // A gate on a step, as a circle joined to the step's edge by a dashed line: an approval left of it, a review right of it.
  const umlGate = (kind: GateKind, stepId: string, reviews: StepReview[], edgeX: number, y: number): ReactNode => {
    const dir = kind === 'approval' ? -1 : 1;
    const ran = reviews.length > 0;
    const color = reviews.some(isReviewPending) ? paletteColor(theme, 'warning') : ran ? c.textSecondary : c.textDisabled;
    const target = reviewToOpen(reviews);
    const open = target?.taskId && onOpenReview ? () => onOpenReview(target.taskId as string) : undefined;
    const sx = edgeX + dir * (SIDE_GAP + SIDE_R);
    const Mark = GATE_MARKS[kind];
    return (
      <g key={`${stepId}#${kind}`} role={open ? 'button' : undefined} tabIndex={open ? 0 : undefined} aria-label={kind} onClick={open} onKeyDown={(e) => activateOnKey(e, open)} style={{ cursor: open ? 'pointer' : 'default' }}>
        <title>{gateTooltip(kind, reviews, open !== undefined)}</title>
        <line x1={edgeX} y1={y} x2={sx - dir * SIDE_R} y2={y} stroke={line} strokeWidth={1} strokeDasharray="3 3" />
        <circle cx={sx} cy={y} r={SIDE_R + 4} fill="transparent" />
        <circle cx={sx} cy={y} r={SIDE_R} fill={c.paper} stroke={ran ? color : c.divider} strokeWidth={ran ? 1.5 : 1} strokeDasharray={ran ? undefined : '3 2'} />
        <User x={sx - 6} y={y - 6.5} size={12} color={color} />
        <circle cx={sx + 4.5} cy={y + 4} r={4} fill={c.paper} />
        <Mark x={sx + 1.5} y={y + 1} size={6.5} color={color} strokeWidth={2.5} />
        {reviews.length > 1 && (
          <text x={sx + SIDE_R - 1} y={y - SIDE_R + 1} fill={color} stroke={c.paper} strokeWidth={3} paintOrder="stroke" fontSize={9} fontWeight={700}>
            {reviews.length}
          </text>
        )}
      </g>
    );
  };

  // Draws one node; returns the x of its flow line and whether flow continues past it.
  const draw = (box: PlacedNode): { x: number; flows: boolean } => {
    const node = box.node;
    const kind = node.kind.toUpperCase();
    const cx = box.x + box.w / 2;

    if (!isContainer(kind)) {
      const exec = steps[node.stepId];
      const ran = exec !== undefined;
      const statusColor = ran ? paletteColor(theme, statusColorName(exec.status)) : c.divider;
      if (kind === 'EXIT') {
        shapes.push(
          <g key={node.stepId}>
            <circle cx={cx} cy={box.y + box.h / 2} r={6} fill="none" stroke={line} strokeWidth={1.25} />
            <circle cx={cx} cy={box.y + box.h / 2} r={3} fill={line} />
            <text x={cx + 10} y={box.y + box.h / 2 + 3.5} fill={c.textDisabled} fontSize={9.5} fontStyle="italic">
              {(node as { mode?: string }).mode ?? 'exit'}
            </text>
          </g>,
        );
        return { x: cx, flows: false };
      }
      const dashed = kind === 'CODE';
      const text = dashed ? 'data processing' : stepText(node);
      const stepX = cx - STEP_W / 2;
      const maxChars = Math.floor((STEP_W - 20) / 6);
      const selected = selectedStepId === node.stepId;
      const isCurrent = currentStepId === node.stepId;
      const clickable = !dashed;
      shapes.push(
        <g
          key={node.stepId}
          role={clickable ? 'button' : undefined}
          tabIndex={clickable ? 0 : undefined}
          onClick={clickable ? () => onSelect(selected ? null : node.stepId) : undefined}
          onKeyDown={clickable ? (e) => ((e as unknown as { key: string }).key === 'Enter' ? onSelect(selected ? null : node.stepId) : undefined) : undefined}
          style={{ cursor: clickable ? 'pointer' : 'default' }}>
          <title>{dashed ? (node.label ?? 'data processing') : `${text} · ${node.stepId}${ran ? ` · ${exec.status ?? ''}` : ' · not executed'}`}</title>
          <rect
            x={stepX + 4}
            y={box.y + 6}
            width={STEP_W - 8}
            height={box.h - 12}
            rx={(box.h - 12) / 2}
            fill={selected ? softPrimary(theme, 0.12) : c.paper}
            stroke={selected ? c.primary : statusColor}
            strokeWidth={selected ? 1.75 : ran ? 1.5 : 1}
            strokeDasharray={dashed ? '3 3' : ran ? undefined : '4 3'}
          />
          {isCurrent && <circle cx={stepX + STEP_W - 14} cy={box.y + box.h / 2} r={3} fill={statusColor} />}
          <text x={cx} y={box.y + box.h / 2 + 3.5} fill={ran ? c.textPrimary : c.textDisabled} fontSize={10.5} fontWeight={ran ? 600 : 400} fontStyle={dashed ? 'italic' : undefined} textAnchor="middle">
            {text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text}
          </text>
          {exec && exec.count > 1 && (
            <text x={stepX + STEP_W - 10} y={box.y + 14} fill={statusColor} fontSize={8.5} fontWeight={700} textAnchor="end">
              ×{exec.count}
            </text>
          )}
        </g>,
      );
      if (box.sides) {
        const { approvals, failures } = reviewsByTrigger(exec?.reviews ?? []);
        const midY = box.y + box.h / 2;
        if (box.sides.approval) shapes.push(umlGate('approval', node.stepId, approvals, stepX + 4, midY));
        if (box.sides.review) shapes.push(umlGate('review', node.stepId, failures, stepX + STEP_W - 4, midY));
      }
      return { x: cx, flows: true };
    }

    const construct = constructOf(node);
    const isLoop = kind === 'LOOP';
    const isTry = kind === 'TRY';
    const ranInside = box.arms.some((arm) => armHasExecution(arm));
    const dy = box.y + 12;
    if (isTry) {
      shapes.push(
        <text key={node.stepId} x={cx} y={dy + 3.5} fill={ranInside ? c.textSecondary : c.textDisabled} fontSize={9.5} fontWeight={ranInside ? 700 : 400} fontFamily="monospace" textAnchor="middle">
          do
        </text>,
      );
    } else {
      shapes.push(
        <g key={node.stepId}>
          <path d={`M ${cx} ${dy - 8} L ${cx + 8} ${dy} L ${cx} ${dy + 8} L ${cx - 8} ${dy} Z`} fill={c.paper} stroke={line} strokeWidth={1.25} />
          <text x={cx + 12} y={dy + 3.5} fill={ranInside ? c.textSecondary : c.textDisabled} fontSize={9.5} fontWeight={ranInside ? 700 : 400} fontFamily="monospace">
            {(() => {
              const t = `${construct}${node.label ? ` ${node.label}` : ''}`;
              return t.length > 24 ? `${t.slice(0, 23)}…` : t;
            })()}
          </text>
        </g>,
      );
    }

    const mergeY = box.y + box.h - 4;
    let hasElse = false;
    let anyFlow = false;
    for (const arm of box.arms) {
      if (arm.name === 'else') hasElse = true;
      const isHandler = isTry && arm.name === 'onFail';
      const guard = isTry ? (isHandler ? '[on fail]' : undefined) : `[${arm.name || 'body'}]`;
      if (arm.children.length === 0) continue;
      const first = arm.children[0];
      elbow(cx, dy + 8, first.x + first.w / 2, first.y + 6, guard, isHandler);
      let prev: { x: number; flows: boolean } | null = null;
      let prevBox: PlacedNode | null = null;
      for (const child of arm.children) {
        const drawn = draw(child);
        if (prev && prevBox && prev.flows) {
          elbow(prev.x, prevBox.y + prevBox.h - 6, drawn.x, child.y + 6);
        }
        prev = drawn;
        prevBox = child;
      }
      if (prev && prevBox && prev.flows) {
        if (isLoop) {
          const gx = box.x + 2;
          wires.push(
            <path
              key={`w${wireKey++}`}
              d={`M ${prev.x - ((isContainer(prevBox.node.kind) ? prevBox.w : STEP_W) - 8) / 2} ${prevBox.y + prevBox.h / 2} L ${gx} ${prevBox.y + prevBox.h / 2} L ${gx} ${dy} L ${cx - 9} ${dy}`}
              fill="none"
              stroke={line}
              strokeWidth={1}
              strokeDasharray="3 3"
              markerEnd="url(#uml2-arrow)"
            />,
          );
        } else {
          elbow(prev.x, prevBox.y + prevBox.h - 6, cx, mergeY, undefined, undefined, true);
          anyFlow = true;
        }
      }
    }
    // Skip path: a loop may run zero times and an else-less branch may not be entered; a do block always runs.
    if (isLoop || (!hasElse && !isTry)) {
      wires.push(<path key={`w${wireKey++}`} d={`M ${cx - 8} ${dy} L ${box.x - 2} ${dy} L ${box.x - 2} ${mergeY} L ${cx - 2} ${mergeY}`} fill="none" stroke={line} strokeWidth={1} markerEnd="url(#uml2-arrow)" />);
      anyFlow = true;
    }
    return { x: cx, flows: anyFlow || isLoop };
  };

  let prevX = plan.axis;
  let prevBottom = plan.start.y + 14;
  shapes.push(<circle key="start" cx={plan.axis} cy={plan.start.y + 7} r={6} fill={c.textPrimary} />);
  let flowing = true;
  for (const box of plan.nodes) {
    const drawn = draw(box);
    if (flowing) {
      elbow(prevX, prevBottom, drawn.x, box.y + 6);
    }
    prevX = drawn.x;
    prevBottom = box.y + box.h - 6;
    flowing = drawn.flows;
  }
  if (flowing) {
    elbow(prevX, prevBottom, plan.axis, plan.end.y);
  }
  shapes.push(
    <g key="end">
      <circle cx={plan.axis} cy={plan.end.y + 7} r={7} fill="none" stroke={c.textPrimary} strokeWidth={1.25} />
      <circle cx={plan.axis} cy={plan.end.y + 7} r={4} fill={c.textPrimary} />
    </g>,
  );

  return (
    <svg width={plan.width} height={plan.height} viewBox={`0 0 ${plan.width} ${plan.height}`} role="img" aria-label="UML activity diagram" style={{ display: 'block', margin: '0 auto' }}>
      <defs>
        <marker id="uml2-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={line} />
        </marker>
      </defs>
      {wires}
      {shapes}
    </svg>
  );
}
