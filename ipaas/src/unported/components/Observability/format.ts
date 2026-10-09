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

import type { MetricsDatum } from '../../../types/observability';

/** Scale the given numeric series keys of every row (e.g. bytes → MB). */
export function scaleRows(rows: MetricsDatum[], keys: string[], divisor: number, decimals = 2): MetricsDatum[] {
  const factor = 10 ** decimals;
  return rows.map((row) => {
    const out: MetricsDatum = { ...row };
    keys.forEach((key) => {
      const value = row[key];
      if (typeof value === 'number') out[key] = Math.round((value / divisor) * factor) / factor;
    });
    return out;
  });
}

export const MB = 1024 * 1024;
