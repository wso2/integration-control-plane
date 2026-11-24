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

// Lays out a workflow's published structure as nested boxes: one box per control-flow block, with its steps inside.

import type { ModelGraph, ModelGraphNode } from '../../api/workflows';

// ── Geometry (px) ──
export const STEP_W = 148;
export const STEP_H = 40;
export const V_GAP = 18;
export const ARM_GAP = 14;
// Container padding: the top leaves room for the decision diamond, the bottom for the merge.
export const PAD_X = 10;
export const PAD_TOP = 34;
export const PAD_BOTTOM = 16;
export const ARM_LABEL_H = 18;
// An arm with no steps in it still needs a slot, or the block collapses and reads as if it had one arm.
export const EMPTY_ARM_W = 72;
export const EMPTY_ARM_H = 20;
export const PILL_W = 84;
export const PILL_H = 24;
export const CANVAS_PAD = 14;
// Gates are circles beside their step: an approval left of it (before the run), a review right of it (on failure).
// The step stays centred, so a gated step keeps room on both sides.
export const SIDE_R = 11;
export const SIDE_GAP = 14;
const SIDE_W = SIDE_GAP + SIDE_R * 2;

// Kinds that contain other nodes. Everything else is a step and draws as a single box.
const CONTAINER_KINDS = new Set(['BRANCH', 'LOOP', 'TRY']);
export const isContainer = (kind: string): boolean => CONTAINER_KINDS.has(kind.toUpperCase());

export interface PlacedArm {
  name: string;
  children: PlacedNode[];
  x: number;
  y: number;
  w: number;
  h: number;
  empty: boolean;
}

export interface PlacedNode {
  node: ModelGraphNode;
  x: number;
  y: number;
  w: number;
  h: number;
  arms: PlacedArm[];
  // The gates hanging off this step, drawn beside it.
  sides?: StepSides;
}

export interface FloorPlan {
  nodes: PlacedNode[];
  width: number;
  height: number;
  start: { x: number; y: number };
  end: { x: number; y: number };
  // Centre line every top-level box is aligned to, which the Start/End pills sit on too.
  axis: number;
}

interface Measured {
  node: ModelGraphNode;
  sides?: StepSides;
  w: number;
  h: number;
  arms: MeasuredArm[];
}

interface MeasuredArm {
  name: string;
  children: Measured[];
  w: number;
  h: number;
}

// The gates on one step: an approval a person gives before it runs, and the review raised when it fails.
export interface StepSides {
  approval?: ModelGraphNode;
  review?: ModelGraphNode;
}

// A side edge runs from the step to its gate, labelled with when the gate applies; it never places the gate in the sequence.
const SIDE_EDGES: Record<string, keyof StepSides> = { 'before run': 'approval', 'on failure': 'review' };

const sideSlotOf = (when: string | undefined): keyof StepSides | undefined => (when !== undefined ? SIDE_EDGES[when] : undefined);

// Step id → the gates hanging off it. A node some sequence edge also reaches is a step, never a gate.
export function sideNodesOf(graph: ModelGraph): Map<string, StepSides> {
  const byId = new Map((graph.nodes ?? []).map((n) => [n.stepId, n]));
  const sequenced = new Set((graph.edges ?? []).filter((e) => !sideSlotOf(e.when)).map((e) => e.to));
  const sides = new Map<string, StepSides>();
  for (const e of graph.edges ?? []) {
    const slot = sideSlotOf(e.when);
    const gate = slot && !sequenced.has(e.to) ? byId.get(e.to) : undefined;
    if (slot && gate) sides.set(e.from, { ...sides.get(e.from), [slot]: gate });
  }
  return sides;
}

// The nodes drawn in sequence. A gate hangs off the step it guards and is drawn beside that step instead.
export function sequenceNodes(graph: ModelGraph): ModelGraphNode[] {
  const gates = new Set([...sideNodesOf(graph).values()].flatMap((g) => [g.approval?.stepId, g.review?.stepId]));
  return (graph.nodes ?? []).filter((n) => n.kind.toUpperCase() !== 'REVIEW' && !gates.has(n.stepId));
}

function groupByParent(nodes: ModelGraphNode[]): { roots: ModelGraphNode[]; armsOf: Map<string, Map<string, ModelGraphNode[]>> } {
  const known = new Set(nodes.map((n) => n.stepId));
  const roots: ModelGraphNode[] = [];
  const armsOf = new Map<string, Map<string, ModelGraphNode[]>>();

  for (const n of nodes) {
    const parent = n.parent;
    if (!parent || !known.has(parent)) {
      roots.push(n);
      continue;
    }
    // The compiler always names arms; the `?? ''` fallback only guards a malformed descriptor.
    const arm = n.branch ?? '';
    let byArm = armsOf.get(parent);
    if (!byArm) {
      byArm = new Map();
      armsOf.set(parent, byArm);
    }
    const list = byArm.get(arm);
    if (list) list.push(n);
    else byArm.set(arm, [n]);
  }
  return { roots, armsOf };
}

// Arm order comes from the container's outgoing edges: the compiler emits them in the order it walked the arms.
function armOrder(containerId: string, graph: ModelGraph, byArm: Map<string, ModelGraphNode[]>): string[] {
  const order: string[] = [];
  for (const e of graph.edges ?? []) {
    if (e.from !== containerId || !e.when) continue;
    // 'repeat' is the loop's back edge, not an arm.
    if (e.when === 'repeat') continue;
    if (!order.includes(e.when)) order.push(e.when);
  }
  for (const name of byArm.keys()) if (!order.includes(name)) order.push(name);
  return order;
}

type Sides = Map<string, StepSides>;

function measureSequence(nodes: ModelGraphNode[], graph: ModelGraph, armsOf: Map<string, Map<string, ModelGraphNode[]>>, sides: Sides, depth: number): { children: Measured[]; w: number; h: number } {
  const children = nodes.map((n) => measure(n, graph, armsOf, sides, depth));
  const w = children.reduce((max, c) => Math.max(max, c.w), 0);
  const h = children.reduce((sum, c) => sum + c.h, 0) + Math.max(0, children.length - 1) * V_GAP;
  return { children, w, h };
}

function measure(node: ModelGraphNode, graph: ModelGraph, armsOf: Map<string, Map<string, ModelGraphNode[]>>, sides: Sides, depth: number): Measured {
  if (!isContainer(node.kind) || depth > 24) {
    // The depth cap is a cycle guard: parent links that form a loop would otherwise recurse forever.
    const gates = sides.get(node.stepId);
    return { node, sides: gates, w: gates ? STEP_W + SIDE_W * 2 : STEP_W, h: STEP_H, arms: [] };
  }

  const byArm = armsOf.get(node.stepId) ?? new Map<string, ModelGraphNode[]>();
  const names = armOrder(node.stepId, graph, byArm);
  const arms: MeasuredArm[] = names.map((name) => {
    const seq = measureSequence(byArm.get(name) ?? [], graph, armsOf, sides, depth + 1);
    const empty = (byArm.get(name) ?? []).length === 0;
    return {
      name,
      children: seq.children,
      w: empty ? EMPTY_ARM_W : seq.w,
      h: ARM_LABEL_H + (empty ? EMPTY_ARM_H : seq.h),
    };
  });

  const innerW = arms.reduce((sum, a) => sum + a.w, 0) + Math.max(0, arms.length - 1) * ARM_GAP;
  const innerH = arms.reduce((max, a) => Math.max(max, a.h), 0);
  return {
    node,
    w: Math.max(innerW + PAD_X * 2, STEP_W),
    h: PAD_TOP + innerH + PAD_BOTTOM,
    arms: arms.map((a) => ({ ...a })),
  };
}

function place(measured: Measured, x: number, y: number): PlacedNode {
  const placed: PlacedNode = { node: measured.node, sides: measured.sides, x, y, w: measured.w, h: measured.h, arms: [] };
  if (measured.arms.length === 0) return placed;

  const innerW = measured.arms.reduce((sum, a) => sum + a.w, 0) + Math.max(0, measured.arms.length - 1) * ARM_GAP;
  let armX = x + (measured.w - innerW) / 2;
  const armY = y + PAD_TOP;

  for (const arm of measured.arms) {
    const childrenPlaced: PlacedNode[] = [];
    let childY = armY + ARM_LABEL_H;
    for (const child of arm.children) {
      childrenPlaced.push(place(child, armX + (arm.w - child.w) / 2, childY));
      childY += child.h + V_GAP;
    }
    placed.arms.push({ name: arm.name, children: childrenPlaced, x: armX, y: armY, w: arm.w, h: arm.h, empty: arm.children.length === 0 });
    armX += arm.w + ARM_GAP;
  }
  return placed;
}

export function layoutFloorPlan(graph: ModelGraph): FloorPlan {
  const nodes = sequenceNodes(graph);
  const { roots, armsOf } = groupByParent(nodes);
  const top = measureSequence(roots, graph, armsOf, sideNodesOf(graph), 0);

  const contentW = Math.max(top.w, PILL_W);
  const width = contentW + CANVAS_PAD * 2;
  const axis = CANVAS_PAD + contentW / 2;

  let y = CANVAS_PAD;
  const start = { x: axis - PILL_W / 2, y };
  y += PILL_H + V_GAP;

  const placed: PlacedNode[] = [];
  for (const m of top.children) {
    placed.push(place(m, axis - m.w / 2, y));
    y += m.h + V_GAP;
  }

  const end = { x: axis - PILL_W / 2, y };
  const height = y + PILL_H + CANVAS_PAD;
  return { nodes: placed, width, height, start, end, axis };
}
