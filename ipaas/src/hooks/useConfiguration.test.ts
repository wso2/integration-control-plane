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
import { useCreateResourceLink, useDeleteResourceLink } from './useConfiguration';

const invalidateQueries = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-query', () => ({
  useMutation: (options: unknown) => options,
  useQuery: () => ({}),
  useQueryClient: () => ({ invalidateQueries }),
}));

type Mutation = { onSuccess: (data: unknown, vars: { projectId: string; componentId: string }) => void };

describe('link mutations', () => {
  it.each([
    ['link', useCreateResourceLink],
    ['unlink', useDeleteResourceLink],
  ])('%s refetches the suggestions', (_, hook) => {
    invalidateQueries.mockClear();
    (hook() as unknown as Mutation).onSuccess(undefined, { projectId: 'default', componentId: 'sfdemo' });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['resourceLinkSuggestions', 'default', 'sfdemo'] });
  });
});
