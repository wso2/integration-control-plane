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

import { useTheme } from '@wso2/oxygen-ui';
import { useId, useMemo, type ReactElement, type ReactNode } from 'react';
import type { InstanceGraph, StepExecution } from '../model/workflowFlow';
import { stepStatusChipColor, stepStatusPaletteColor } from '../shared/workflowStepStatus';
import { isContainer, layoutFloorPlan, type PlacedArm, type PlacedNode } from './floorPlan';
import { diagramColors, softPrimary } from './graphVisuals';

/**
 * A balanced UML activity diagram: sibling arms sit side by side under their decision diamond and
 * merge below it, laid out by the recursive box-packing in `floorPlan.ts`. A workflow body is
 * single-threaded, so a single centre line is a faithful spine.
 *
 * It lives in its own file because it is a self-contained renderer. Every colour comes from
 * the theme's CSS variables, set through `style` (an SVG presentation attribute does not take a
 * `var()` everywhere), so the diagram follows the active colour scheme.
 */

/** The construct as written (`if`, `while`, `foreach`, `do`) from the ordinal step id. */
const constructOf = (stepId: string): string => stepId.split('#')[0];

/** A selected box outlines heavier; one that never ran is drawn thinner and dashed. */
function strokeWidthFor(selected: boolean, ran: boolean): number {
  if (selected) {
    return 1.75;
  }
  return ran ? 1.5 : 1;
}

function dashFor(dashed: boolean, ran: boolean): string | undefined {
  if (dashed) {
    return '3 3';
  }
  return ran ? undefined : '4 3';
}

const svgStyle = { display: 'block', margin: '0 auto' } as const;

interface UmlActivityDiagramProps {
  data: InstanceGraph;
  steps: Record<string, StepExecution>;
  selectedStepId: string | null;
  currentStepId: string | null;
  onSelect: (stepId: string | null) => void;
}

export default function UmlActivityDiagram({ data, steps, selectedStepId, currentStepId, onSelect }: UmlActivityDiagramProps): ReactElement | null {
  const theme = useTheme();
  // One arrowhead per diagram, named so two diagrams on a page do not share (or break) one.
  const arrowId = `wf-uml-arrow-${useId().replace(/:/g, '')}`;
  const c = diagramColors(theme);
  const { graph } = data;
  const plan = useMemo(() => (graph && graph.nodes && graph.nodes.length > 0 ? layoutFloorPlan(graph) : null), [graph]);
  if (!plan) {
    return null;
  }

  const line = c.textDisabled;
  const colorFor = (status?: string) => stepStatusPaletteColor(theme, stepStatusChipColor(status ?? ''));

  const armHasExecution = (arm: PlacedArm): boolean => arm.children.some((child) => steps[child.node.stepId] !== undefined || child.arms.some(armHasExecution));

  const shapes: ReactNode[] = [];
  const wires: ReactNode[] = [];
  let wireKey = 0;

  const wire = (d: string, dashed?: boolean) => {
    wireKey += 1;
    wires.push(<path key={`w${wireKey}`} d={d} fill="none" style={{ stroke: line }} strokeWidth={1} strokeDasharray={dashed ? '3 3' : undefined} markerEnd={`url(#${arrowId})`} />);
  };

  const elbow = (x1: number, y1: number, x2: number, y2: number, guard?: string, dashed?: boolean) => {
    const midY = y1 + Math.max(5, (y2 - y1) / 2);
    wireKey += 1;
    wires.push(
      <g key={`w${wireKey}`}>
        <path d={x1 === x2 ? `M ${x1} ${y1} L ${x2} ${y2}` : `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`} fill="none" style={{ stroke: line }} strokeWidth={1} strokeDasharray={dashed ? '3 3' : undefined} markerEnd={`url(#${arrowId})`} />
        {guard && (
          <text x={x2 + 5} y={y2 - 3} style={{ fill: c.textSecondary }} fontSize={8.5} fontFamily="monospace">
            {guard}
          </text>
        )}
      </g>,
    );
  };

  /** Draws one node; returns the x of its flow line and whether flow continues past it. */
  const draw = (box: PlacedNode): { x: number; flows: boolean } => {
    const { node } = box;
    const kind = node.kind.toUpperCase();
    const cx = box.x + box.w / 2;

    if (!isContainer(kind)) {
      const exec = steps[node.stepId];
      const ran = exec !== undefined;
      const statusColor = ran ? colorFor(exec.status) : c.divider;
      if (kind === 'EXIT') {
        shapes.push(
          <g key={node.stepId}>
            <circle cx={cx} cy={box.y + box.h / 2} r={6} fill="none" style={{ stroke: line }} strokeWidth={1.25} />
            <circle cx={cx} cy={box.y + box.h / 2} r={3} style={{ fill: line }} />
            <text x={cx + 10} y={box.y + box.h / 2 + 3.5} style={{ fill: c.textDisabled }} fontSize={9.5} fontStyle="italic">
              exit
            </text>
          </g>,
        );
        return { x: cx, flows: false };
      }
      const dashed = kind === 'CODE';
      const text = dashed ? 'data processing' : (node.target ?? node.stepId);
      const selected = selectedStepId === node.stepId;
      const isCurrent = currentStepId === node.stepId;
      const clickable = !dashed;
      const maxChars = Math.floor((box.w - 20) / 6);
      const toggle = () => onSelect(selected ? null : node.stepId);
      shapes.push(
        <g
          key={node.stepId}
          role={clickable ? 'button' : undefined}
          tabIndex={clickable ? 0 : undefined}
          aria-pressed={clickable ? selected : undefined}
          onClick={clickable ? toggle : undefined}
          onKeyDown={clickable ? (event) => event.key === 'Enter' && toggle() : undefined}
          style={{ cursor: clickable ? 'pointer' : 'default' }}>
          <title>{dashed ? (node.label ?? 'data processing') : ran ? `${text} · ${node.stepId} · ${exec.status ?? ''}` : `${text} · ${node.stepId} · not executed`}</title>
          <rect
            x={box.x + 4}
            y={box.y + 6}
            width={box.w - 8}
            height={box.h - 12}
            rx={(box.h - 12) / 2}
            style={{ fill: selected ? softPrimary(theme, 0.12) : c.paper, stroke: selected ? c.primary : statusColor }}
            strokeWidth={strokeWidthFor(selected, ran)}
            strokeDasharray={dashFor(dashed, ran)}
          />
          {isCurrent && <circle cx={box.x + box.w - 14} cy={box.y + box.h / 2} r={3} style={{ fill: statusColor }} />}
          <text x={cx} y={box.y + box.h / 2 + 3.5} style={{ fill: ran ? c.textPrimary : c.textDisabled }} fontSize={10.5} fontWeight={ran ? 600 : 400} fontStyle={dashed ? 'italic' : undefined} textAnchor="middle">
            {text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text}
          </text>
          {exec && exec.count > 1 && (
            <text x={box.x + box.w - 10} y={box.y + 14} style={{ fill: statusColor }} fontSize={8.5} fontWeight={700} textAnchor="end">
              ×{exec.count}
            </text>
          )}
        </g>,
      );
      return { x: cx, flows: true };
    }

    // A container: arms side by side, flow merging below.
    const construct = constructOf(node.stepId);
    const isLoop = kind === 'LOOP';
    const isTry = kind === 'TRY';
    const ranInside = box.arms.some((arm) => armHasExecution(arm));
    const headingStyle = { fill: ranInside ? c.textSecondary : c.textDisabled };
    const dy = box.y + 12;
    if (isTry) {
      shapes.push(
        <text key={node.stepId} x={cx} y={dy + 3.5} style={headingStyle} fontSize={9.5} fontWeight={ranInside ? 700 : 400} fontFamily="monospace" textAnchor="middle">
          do
        </text>,
      );
    } else {
      const title = `${construct}${node.label ? ` ${node.label}` : ''}`;
      shapes.push(
        <g key={node.stepId}>
          <path d={`M ${cx} ${dy - 8} L ${cx + 8} ${dy} L ${cx} ${dy + 8} L ${cx - 8} ${dy} Z`} style={{ fill: c.paper, stroke: line }} strokeWidth={1.25} />
          <text x={cx + 12} y={dy + 3.5} style={headingStyle} fontSize={9.5} fontWeight={ranInside ? 700 : 400} fontFamily="monospace">
            {title.length > 24 ? `${title.slice(0, 23)}…` : title}
          </text>
        </g>,
      );
    }

    const mergeY = box.y + box.h - 4;
    let hasElse = false;
    let anyFlow = false;
    box.arms.forEach((arm) => {
      if (arm.name === 'else') {
        hasElse = true;
      }
      const isHandler = isTry && arm.name === 'onFail';
      const guard = isTry ? (isHandler && '[on fail]') || undefined : `[${arm.name || 'body'}]`;
      if (arm.children.length === 0) {
        return;
      }
      const first = arm.children[0];
      elbow(cx, dy + 8, first.x + first.w / 2, first.y + 6, guard, isHandler);
      let tail: { drawn: { x: number; flows: boolean }; box: PlacedNode } | null = null;
      arm.children.forEach((child) => {
        const drawn = draw(child);
        if (tail && tail.drawn.flows) {
          elbow(tail.drawn.x, tail.box.y + tail.box.h - 6, drawn.x, child.y + 6);
        }
        tail = { drawn, box: child };
      });
      // The arm's tail: back to the loop head, or down to the merge.
      const last = tail as { drawn: { x: number; flows: boolean }; box: PlacedNode } | null;
      if (last && last.drawn.flows) {
        if (isLoop) {
          const gx = box.x + 2;
          const midY = last.box.y + last.box.h / 2;
          wire(`M ${last.drawn.x - (last.box.w - 8) / 2} ${midY} L ${gx} ${midY} L ${gx} ${dy} L ${cx - 9} ${dy}`, true);
        } else {
          elbow(last.drawn.x, last.box.y + last.box.h - 6, cx, mergeY);
          anyFlow = true;
        }
      }
    });
    // The skip path: a loop may run zero times; a branch without an else may not be entered. A do
    // block has no skip: its body always runs.
    if (isLoop || (!hasElse && !isTry)) {
      wire(`M ${cx - 8} ${dy} L ${box.x - 2} ${dy} L ${box.x - 2} ${mergeY} L ${cx - 2} ${mergeY}`);
      anyFlow = true;
    }
    return { x: cx, flows: anyFlow || isLoop };
  };

  // The top-level sequence, bracketed by the UML start and end dots on the centre line.
  let prevX = plan.axis;
  let prevBottom = plan.start.y + 14;
  shapes.push(<circle key="start" cx={plan.axis} cy={plan.start.y + 7} r={6} style={{ fill: c.textPrimary }} />);
  let flowing = true;
  plan.nodes.forEach((box) => {
    const drawn = draw(box);
    if (flowing) {
      elbow(prevX, prevBottom, drawn.x, box.y + 6);
    }
    prevX = drawn.x;
    prevBottom = box.y + box.h - 6;
    flowing = drawn.flows;
  });
  if (flowing) {
    elbow(prevX, prevBottom, plan.axis, plan.end.y);
  }
  shapes.push(
    <g key="end">
      <circle cx={plan.axis} cy={plan.end.y + 7} r={7} fill="none" style={{ stroke: c.textPrimary }} strokeWidth={1.25} />
      <circle cx={plan.axis} cy={plan.end.y + 7} r={4} style={{ fill: c.textPrimary }} />
    </g>,
  );

  return (
    <svg width={plan.width} height={plan.height} viewBox={`0 0 ${plan.width} ${plan.height}`} role="img" aria-label="Workflow activity diagram" style={svgStyle}>
      <defs>
        <marker id={arrowId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" style={{ fill: line }} />
        </marker>
      </defs>
      {wires}
      {shapes}
    </svg>
  );
}
