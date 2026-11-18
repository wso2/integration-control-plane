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

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRemovalNotice } from './useRemovalNotice';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Item {
  id: string;
  name: string;
  deleting?: boolean;
}

let root: Root;
let host: HTMLDivElement;
let track: (id: string, label: string, acceptedAt: number) => void = () => undefined;
const onRemoved = vi.fn();

function Harness({ items, listedAt }: { items: Item[] | undefined; listedAt: number }): null {
  track = useRemovalNotice('org', items, (i) => i.name, onRemoved, listedAt);
  return null;
}

const show = (items: Item[] | undefined, listedAt = 0) => act(() => root.render(<Harness items={items} listedAt={listedAt} />));

beforeEach(() => {
  host = document.createElement('div');
  root = createRoot(host);
  onRemoved.mockReset();
});

afterEach(() => act(() => root.unmount()));

describe('useRemovalNotice', () => {
  it('confirms an entry once it goes from deleting to absent', () => {
    show([{ id: 'a', name: 'Alpha', deleting: true }]);
    expect(onRemoved).not.toHaveBeenCalled();
    show([]);
    expect(onRemoved).toHaveBeenCalledWith('Alpha');
  });

  it('confirms a tracked delete only from a list read after it was accepted', () => {
    show([], 100);
    act(() => track('a', 'Alpha', 200));
    expect(onRemoved).not.toHaveBeenCalled();
    show([{ id: 'a', name: 'Alpha' }], 300);
    expect(onRemoved).not.toHaveBeenCalled();
    show([], 400);
    expect(onRemoved).toHaveBeenCalledTimes(1);
    expect(onRemoved).toHaveBeenCalledWith('Alpha');
  });

  it('confirms a tracked delete at once when the list was already read again without it', () => {
    show([], 500);
    act(() => track('a', 'Alpha', 200));
    expect(onRemoved).toHaveBeenCalledWith('Alpha');
  });
});
