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

import { describe, expect, it, vi } from 'vitest';
import { buildClassDefs, ensureMermaidInit, extractDefinition, nextDiagramId, purgeMermaidOrphans, renderMermaidSvg, toMermaidSafeColor } from './mermaid';

// Mermaid sanitizes its SVG with DOMPurify, which (since 3.4.8) reads names through the
// Node.prototype.nodeName getter. Browsers return the node's name there; happy-dom returns '' and
// leaves the name to subclass getters, so every node is stripped. Defer to those getters, as a
// browser would, before DOMPurify captures the getter on import.
vi.hoisted(() => {
  const baseGetter = Object.getOwnPropertyDescriptor(Node.prototype, 'nodeName')?.get;
  Object.defineProperty(Node.prototype, 'nodeName', {
    configurable: true,
    get(this: Node) {
      for (let proto = Object.getPrototypeOf(this); proto && proto !== Node.prototype; proto = Object.getPrototypeOf(proto)) {
        const getter = Object.getOwnPropertyDescriptor(proto, 'nodeName')?.get;
        if (getter) return getter.call(this);
      }
      return baseGetter?.call(this);
    },
  });
});

describe('nextDiagramId', () => {
  it('returns an incrementing mermaid-chart id on each call', () => {
    const first = nextDiagramId();
    const second = nextDiagramId();
    expect(first).toMatch(/^mermaid-chart-\d+$/);
    expect(second).toMatch(/^mermaid-chart-\d+$/);
    expect(second).not.toBe(first);
  });
});

describe('ensureMermaidInit', () => {
  it('initializes without throwing and is idempotent across repeated calls', () => {
    expect(() => ensureMermaidInit()).not.toThrow();
    expect(() => ensureMermaidInit()).not.toThrow();
  });
});

describe('extractDefinition', () => {
  it('prepends flowchart TB when no diagram-type directive is found', () => {
    expect(extractDefinition('A-->B')).toBe('flowchart TB\nA-->B');
  });

  it('leaves a definition starting with a recognised keyword untouched', () => {
    expect(extractDefinition('graph TD\nA-->B')).toBe('graph TD\nA-->B');
  });

  it('strips a ```mermaid code fence', () => {
    expect(extractDefinition('```mermaid\ngraph TD\nA-->B\n```')).toBe('graph TD\nA-->B');
  });

  it('strips a ```mermaid code fence with trailing text on the opening line', () => {
    expect(extractDefinition('```mermaid title\ngraph TD\nA-->B\n```')).toBe('graph TD\nA-->B');
  });

  it('normalizes CRLF line endings', () => {
    expect(extractDefinition('graph TD\r\nA-->B')).toBe('graph TD\nA-->B');
  });

  it('trims surrounding whitespace', () => {
    expect(extractDefinition('  \n  graph TD\nA-->B  \n  ')).toBe('graph TD\nA-->B');
  });

  it('recognises pie, gantt and journey as valid diagram types', () => {
    expect(extractDefinition('pie title Pets\n"Dogs" : 50')).toBe('pie title Pets\n"Dogs" : 50');
    expect(extractDefinition('gantt\ntitle A Gantt Diagram')).toBe('gantt\ntitle A Gantt Diagram');
    expect(extractDefinition('journey\ntitle My journey')).toBe('journey\ntitle My journey');
  });

  it('recognises classDiagram as a valid diagram type', () => {
    expect(extractDefinition('classDiagram\nA --> B')).toBe('classDiagram\nA --> B');
  });
});

describe('toMermaidSafeColor', () => {
  it('returns the fallback when value is undefined', () => {
    expect(toMermaidSafeColor(undefined, '#000000')).toBe('#000000');
  });

  it('returns the fallback when value is an empty string', () => {
    expect(toMermaidSafeColor('', '#000000')).toBe('#000000');
  });

  it('returns the fallback when value is only whitespace', () => {
    expect(toMermaidSafeColor('   ', '#000000')).toBe('#000000');
  });

  it('returns a hex value as-is', () => {
    expect(toMermaidSafeColor('#ff00ff', '#000000')).toBe('#ff00ff');
  });

  it('converts an rgb() value to hex', () => {
    expect(toMermaidSafeColor('rgb(255, 0, 0)', '#000000')).toBe('#ff0000');
  });

  it('converts an rgba() value to hex, ignoring alpha', () => {
    expect(toMermaidSafeColor('rgba(0, 128, 255, 0.5)', '#000000')).toBe('#0080ff');
  });

  it('converts an rgb() value without spaces', () => {
    expect(toMermaidSafeColor('rgb(1,2,3)', '#000000')).toBe('#010203');
  });

  it('returns the fallback for unrecognised formats', () => {
    expect(toMermaidSafeColor('blue', '#000000')).toBe('#000000');
  });
});

describe('buildClassDefs', () => {
  it('builds the expected classDef block from the given colors', () => {
    expect(buildClassDefs('#111', '#222', '#333')).toBe(
      [
        'classDef startNode fill:#222,stroke:#111,stroke-width:0px,color:#fff',
        'classDef endNode fill:#222,stroke:#111,stroke-width:0px,color:#fff',
        'classDef inputNode fill:white,stroke:#333,stroke-width:1px,color:#000',
        'classDef processNode fill:white,stroke:#333,stroke-width:1px,color:#000',
        'classDef decisionNode fill:#FFF9E6,stroke:#FFA000,stroke-width:2px,color:#000',
      ].join('\n'),
    );
  });
});

describe('purgeMermaidOrphans', () => {
  it('removes elements matching d<id> and <id>', () => {
    const withPrefix = document.createElement('div');
    withPrefix.id = 'dchart-1';
    const withoutPrefix = document.createElement('div');
    withoutPrefix.id = 'chart-1';
    document.body.append(withPrefix, withoutPrefix);

    purgeMermaidOrphans('chart-1');

    expect(document.getElementById('dchart-1')).toBeNull();
    expect(document.getElementById('chart-1')).toBeNull();
  });

  it('removes hidden mermaid-chart- elements but keeps visible ones', () => {
    const hidden = document.createElement('div');
    hidden.id = 'mermaid-chart-hidden';
    hidden.style.visibility = 'hidden';
    const visible = document.createElement('div');
    visible.id = 'mermaid-chart-visible';
    visible.style.visibility = 'visible';
    document.body.append(hidden, visible);

    purgeMermaidOrphans('unrelated-id');

    expect(document.getElementById('mermaid-chart-hidden')).toBeNull();
    expect(document.getElementById('mermaid-chart-visible')).not.toBeNull();

    visible.remove();
  });

  it('does nothing when no matching elements exist', () => {
    expect(() => purgeMermaidOrphans('does-not-exist')).not.toThrow();
  });
});

describe('renderMermaidSvg', () => {
  it('renders a definition to an SVG string', async () => {
    ensureMermaidInit();
    const svg = await renderMermaidSvg('render-test-1', 'flowchart TB\nA-->B');
    expect(svg).toContain('<svg');
  });

  it('reuses the same render sandbox across calls', async () => {
    ensureMermaidInit();
    await renderMermaidSvg('render-test-2', 'flowchart TB\nA-->B');
    const sandboxesAfterFirst = document.querySelectorAll('#mermaid-render-sandbox').length;
    await renderMermaidSvg('render-test-3', 'flowchart TB\nC-->D');
    const sandboxesAfterSecond = document.querySelectorAll('#mermaid-render-sandbox').length;
    expect(sandboxesAfterFirst).toBe(1);
    expect(sandboxesAfterSecond).toBe(1);
  });
});
