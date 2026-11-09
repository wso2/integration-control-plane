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

import { Box, Tooltip, Typography, useTheme } from '@wso2/oxygen-ui';
import { ChevronDown, ChevronRight, GitBranch, Info, RefreshCw, Repeat, ShieldCheck } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import type { InstanceGraph, ModelGraphNode, StepExecution } from '../model/workflowFlow';
import { stepStatusChipColor, stepStatusPaletteColor } from '../shared/workflowStepStatus';
import { iconForType, type IconComponent } from './graphVisuals';
import UmlActivityDiagram from './UmlActivityDiagram';
import * as styles from './FlowRail.styles';

/**
 * The flow rail: the workflow as written, rendered the way it is written: a left-aligned list, one
 * element per row, nesting as indentation, keywords lowercase, `else` on the same level as its
 * `if`, exactly like reading the source.
 *
 * The rail needs the workflow's *structure*: the descriptor's when the engine serves one, or the
 * steps the run executed when it does not. With neither, this renders nothing and the caller shows
 * `flowUnavailable`'s explanation instead.
 */

interface TreeNode {
  node: ModelGraphNode;
  arms: { name: string; children: TreeNode[] }[];
}

/** The nodes (already in source order) as a tree, arms in first-appearance order. */
function buildTree(nodes: ModelGraphNode[]): TreeNode[] {
  const known = new Set(nodes.map((n) => n.stepId));
  const byId = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];
  nodes.forEach((node) => {
    const tree: TreeNode = { node, arms: [] };
    byId.set(node.stepId, tree);
    const parent = node.parent && known.has(node.parent) ? byId.get(node.parent) : undefined;
    if (!parent) {
      roots.push(tree);
      return;
    }
    const armName = node.branch ?? '';
    let arm = parent.arms.find((a) => a.name === armName);
    if (!arm) {
      arm = { name: armName, children: [] };
      parent.arms.push(arm);
    }
    arm.children.push(tree);
  });
  return roots;
}

const CONTAINER_KINDS = new Set(['BRANCH', 'LOOP', 'TRY']);
const MARK_KINDS = new Set(['CODE', 'EXIT']);
const GLYPH_SIZE = 12;

/** The construct as written (`if`, `while`, `foreach`, `match`, `do`) from the ordinal id. */
const constructOf = (node: ModelGraphNode): string => node.stepId.split('#')[0];

const CONSTRUCT_ICONS: Record<string, IconComponent> = {
  if: GitBranch,
  match: GitBranch,
  while: RefreshCw,
  foreach: Repeat,
  do: ShieldCheck,
};

/** Lowercase, keyword-first, like the source: `if req.priority == "express"`. */
function containerTitle(node: ModelGraphNode, prefix = ''): string {
  return `${prefix}${constructOf(node)}${node.label ? ` ${node.label}` : ''}`;
}

/** Indent is unbounded, so it rides a CSS variable rather than a style per depth. */
function indentStyle(depth: number): CSSProperties {
  return { ['--wf-indent' as string]: `${4 + depth * 12}px` };
}

const onEnter = (action: () => void) => (event: { key: string }) => {
  if (event.key === 'Enter') action();
};

interface KeywordRowProps {
  depth: number;
  icon?: IconComponent;
  text: string;
  title?: string;
  /** Present only on rows that can collapse; undefined renders a plain keyword row. */
  collapsed?: boolean;
  onToggle?: () => void;
  /** Aggregate colour of what a collapsed row hides, so folding never hides an outcome. */
  collapsedStatusColor?: string;
  /** Nothing under this keyword ran: render it quiet, so unexecuted structure stops shouting. */
  muted?: boolean;
}

function KeywordRow({ depth, icon: Icon, text, title, collapsed, onToggle, collapsedStatusColor, muted = false }: KeywordRowProps): ReactElement {
  const toggleable = onToggle !== undefined;
  return (
    <Box
      sx={styles.keywordRow(toggleable)}
      style={indentStyle(depth)}
      role={toggleable ? 'button' : undefined}
      tabIndex={toggleable ? 0 : undefined}
      aria-expanded={toggleable ? !collapsed : undefined}
      onClick={onToggle}
      onKeyDown={onToggle ? onEnter(onToggle) : undefined}>
      {toggleable && <Box sx={styles.glyph}>{collapsed ? <ChevronRight size={GLYPH_SIZE} /> : <ChevronDown size={GLYPH_SIZE} />}</Box>}
      {Icon && (
        <Box sx={styles.glyph}>
          <Icon size={GLYPH_SIZE} />
        </Box>
      )}
      <Typography variant="caption" sx={styles.keywordText(muted)} title={title ?? text}>
        {text}
      </Typography>
      {collapsed && collapsedStatusColor && (
        <Tooltip title="Steps inside ran; expand to see them">
          <Box sx={styles.aggregateDot} style={{ backgroundColor: collapsedStatusColor }} />
        </Tooltip>
      )}
    </Box>
  );
}

interface StepRowProps {
  node: ModelGraphNode;
  exec: StepExecution | undefined;
  depth: number;
  selected: boolean;
  isCurrent: boolean;
  onSelect: () => void;
  rowRef: (el: HTMLDivElement | null) => void;
}

function StepRow({ node, exec, depth, selected, isCurrent, onSelect, rowRef }: StepRowProps): ReactElement {
  const theme = useTheme();
  const { palette } = theme.vars ?? theme;
  const ran = exec !== undefined;
  const statusColor = ran ? stepStatusPaletteColor(theme, stepStatusChipColor(exec.status ?? '')) : palette.text.disabled;
  const Icon = iconForType(node.kind);
  const title = node.target ?? node.stepId;
  // Failed at some point, but the latest execution succeeded: a retry or a review decision. Worth
  // a mark, or the green here would quietly erase a failure the history still shows.
  const recovered = ran && exec.failure !== undefined && (exec.status ?? '').toUpperCase() === 'COMPLETED';

  return (
    <Box
      ref={rowRef}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={onEnter(onSelect)}
      sx={styles.stepRow(selected)}
      style={{ ...indentStyle(depth), borderColor: ran ? statusColor : palette.divider, borderLeftColor: ran ? statusColor : 'transparent' }}>
      <Box sx={styles.glyph} style={{ color: statusColor }}>
        <Icon size={13} />
      </Box>
      <Typography variant="body2" sx={styles.stepLabel(ran)} title={ran ? `${title} · ${node.stepId} · ${exec.status ?? ''}` : `${title} · ${node.stepId} · not executed`}>
        {title}
      </Typography>
      {recovered && (
        <Tooltip title="Failed earlier in this run; the latest execution succeeded">
          <Box sx={styles.recoveredIcon}>
            <Info size={GLYPH_SIZE} />
          </Box>
        </Tooltip>
      )}
      {isCurrent && (
        <Tooltip title="Last executed step (approximate)">
          <Box sx={styles.aggregateDot} style={{ backgroundColor: statusColor }} />
        </Tooltip>
      )}
      {exec && exec.count > 1 && (
        <Typography variant="caption" sx={styles.countBadge} style={{ color: statusColor }}>
          ×{exec.count}
        </Typography>
      )}
    </Box>
  );
}

export interface FlowRailProps {
  data: InstanceGraph;
  selectedStepId: string | null;
  currentStepId: string | null;
  onSelect: (stepId: string | null) => void;
  /** `chart` boxes each row, one item per row; `uml` draws the same run as an activity diagram. */
  variant?: 'chart' | 'uml';
}

export default function FlowRail({ data, selectedStepId, currentStepId, onSelect, variant = 'chart' }: FlowRailProps): ReactElement | null {
  const theme = useTheme();
  const { graph } = data;
  const tree = useMemo(() => (graph && graph.nodes ? buildTree(graph.nodes) : []), [graph]);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  // The reverse link: when the timeline names a step, bring its row into view.
  useEffect(() => {
    if (!selectedStepId) {
      return;
    }
    rowRefs.current.get(selectedStepId)?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [selectedStepId]);

  const steps = data.steps ?? {};

  if (tree.length === 0) {
    return null;
  }

  const toggle = (stepId: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });

  /** Worst outcome wins, so folding a group never hides a failure. */
  const aggregateStatusColor = (children: TreeNode[]): string | undefined => {
    const rank = (status: string): number => {
      if (['FAILED', 'TERMINATED', 'TIMED_OUT'].includes(status)) {
        return 3;
      }
      return status === 'RUNNING' ? 2 : 1;
    };
    let best: string | undefined;
    let bestRank = 0;
    const walk = (n: TreeNode) => {
      const exec = steps[n.node.stepId];
      if (exec) {
        const status = (exec.status ?? '').toUpperCase();
        const r = rank(status);
        if (r > bestRank) {
          bestRank = r;
          best = stepStatusPaletteColor(theme, stepStatusChipColor(status));
        }
      }
      n.arms.forEach((a) => a.children.forEach(walk));
    };
    children.forEach(walk);
    return best;
  };

  const renderNode = (t: TreeNode, depth: number): ReactNode => {
    const kind = t.node.kind.toUpperCase();
    if (MARK_KINDS.has(kind)) {
      return (
        <Typography key={t.node.stepId} variant="caption" sx={styles.markRow} style={indentStyle(depth)} title={t.node.label ?? undefined}>
          {kind === 'EXIT' ? '↩ exit' : 'data processing'}
        </Typography>
      );
    }
    if (CONTAINER_KINDS.has(kind)) {
      return renderContainer(t, depth);
    }
    return (
      <StepRow
        key={t.node.stepId}
        node={t.node}
        exec={steps[t.node.stepId]}
        depth={depth}
        selected={selectedStepId === t.node.stepId}
        isCurrent={currentStepId === t.node.stepId}
        onSelect={() => onSelect(selectedStepId === t.node.stepId ? null : t.node.stepId)}
        rowRef={(el) => {
          if (el) {
            rowRefs.current.set(t.node.stepId, el);
          } else {
            rowRefs.current.delete(t.node.stepId);
          }
        }}
      />
    );
  };

  /** One foldable group: a keyword row and the children it hides when collapsed. */
  function foldableGroup(key: string, children: TreeNode[], childDepth: number, keyword: (folded: boolean) => ReactNode): ReactNode {
    const folded = collapsed.has(key);
    return (
      <Box key={key}>
        {keyword(folded)}
        {!folded && children.map((child) => renderNode(child, childDepth))}
      </Box>
    );
  }

  /** A named arm (`else`, `on fail`, a match clause) as a foldable keyword row over its children. */
  function armGroup(key: string, children: TreeNode[], keywordDepth: number, childDepth: number, text: string, icon?: IconComponent): ReactNode {
    const ranColor = aggregateStatusColor(children);
    return foldableGroup(key, children, childDepth, (folded) => <KeywordRow depth={keywordDepth} icon={icon} text={text} collapsed={folded} onToggle={() => toggle(key)} collapsedStatusColor={folded ? ranColor : undefined} muted={ranColor === undefined} />);
  }

  /**
   * A container the way the source spells it: the keyword row, then each arm by its own rule.
   * `then`/`body`/`do` children sit directly under the keyword, because the arm name adds nothing
   * a reader of code expects to see; `else if` collapses onto one row.
   */
  function renderContainer(t: TreeNode, depth: number, prefix = ''): ReactNode {
    const Icon = CONSTRUCT_ICONS[constructOf(t.node)] ?? GitBranch;
    const isCollapsed = collapsed.has(t.node.stepId);
    const ranColor = aggregateStatusColor(t.arms.flatMap((a) => a.children));
    const rows: ReactNode[] = [
      <KeywordRow
        key={t.node.stepId}
        depth={depth}
        icon={Icon}
        text={containerTitle(t.node, prefix)}
        title={`${containerTitle(t.node, prefix)} · ${t.node.stepId}`}
        collapsed={isCollapsed}
        onToggle={() => toggle(t.node.stepId)}
        collapsedStatusColor={isCollapsed ? ranColor : undefined}
        muted={ranColor === undefined}
      />,
    ];
    if (isCollapsed) {
      return <Box key={`c-${t.node.stepId}${prefix}`}>{rows}</Box>;
    }
    t.arms.forEach((arm) => {
      if (['then', 'body', 'do', ''].includes(arm.name)) {
        rows.push(arm.children.map((child) => renderNode(child, depth + 1)));
        return;
      }
      if (arm.name === 'else') {
        const only = arm.children.length === 1 ? arm.children[0] : null;
        if (only && only.node.kind.toUpperCase() === 'BRANCH' && constructOf(only.node) === 'if') {
          rows.push(renderContainer(only, depth, 'else '));
          return;
        }
        rows.push(armGroup(`${t.node.stepId}/else`, arm.children, depth, depth + 1, 'else'));
        return;
      }
      if (arm.name === 'onFail') {
        rows.push(armGroup(`${t.node.stepId}/onFail`, arm.children, depth, depth + 1, 'on fail', ShieldCheck));
        return;
      }
      // A match clause's patterns, or any arm name this rail does not know: a case label.
      rows.push(armGroup(`${t.node.stepId}/${arm.name}`, arm.children, depth + 1, depth + 2, arm.name));
    });
    return <Box key={`c-${t.node.stepId}${prefix}`}>{rows}</Box>;
  }

  if (variant === 'uml') {
    return (
      <Box sx={styles.umlScroll}>
        <UmlActivityDiagram data={data} steps={steps} selectedStepId={selectedStepId} currentStepId={currentStepId} onSelect={onSelect} />
      </Box>
    );
  }

  const terminusRow = (label: string, filled: boolean): ReactNode => (
    <Box sx={styles.terminusRow}>
      <Box sx={styles.terminusDot(filled)} />
      <Typography variant="caption" sx={styles.terminusLabel}>
        {label}
      </Typography>
    </Box>
  );

  return (
    <Box sx={styles.root}>
      {terminusRow(data.workflowType, true)}
      {tree.map((t) => renderNode(t, 0))}
      {terminusRow('end', false)}
    </Box>
  );
}
