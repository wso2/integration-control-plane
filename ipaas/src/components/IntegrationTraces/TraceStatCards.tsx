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

import { Box, StatCard } from '@wso2/oxygen-ui';
import { Layers, Server, TriangleAlert, Waypoints } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { formatCount, formatPercent } from '../../utils/integrationTraces';
import type { TraceStats } from '../../types/integrationTraces';
import * as styles from './IntegrationTraces.styles';

interface TraceStatCardsProps {
  stats: TraceStats;
  /** Services seen in the sampled spans (the newest traces only); undefined while they load. */
  services: number | undefined;
}

export default function TraceStatCards({ stats, services }: TraceStatCardsProps): JSX.Element {
  return (
    <Box sx={styles.kpiGrid}>
      <StatCard label="Total traces" value={formatCount(stats.traces, stats.lowerBound)} icon={<Waypoints size={20} />} iconColor="primary" />
      <StatCard label="Error traces" value={`${formatCount(stats.errorTraces, stats.lowerBound)} (${formatPercent(stats.errorRate)})`} icon={<TriangleAlert size={20} />} iconColor="error" />
      <StatCard label="Spans" value={formatCount(stats.spans, stats.lowerBound)} icon={<Layers size={20} />} iconColor="info" />
      <StatCard label="Services (sampled)" value={services === undefined ? '—' : services} icon={<Server size={20} />} iconColor="secondary" />
    </Box>
  );
}
