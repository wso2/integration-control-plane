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

import type { JSX } from 'react';
import { Activity, AlertTriangle, Clock, Gauge, Globe, Layers, Timer, XCircle, Zap } from '@wso2/oxygen-ui-icons-react';

/**
 * Icon + accent color for every StatCard KPI rendered across the three insights
 * views (project, api, automation). Kept apart from the pure-data insights
 * constants so those stay importable by non-React modules (utils, tests).
 */
export const KPI_ICONS: Record<string, { icon: JSX.Element; color: 'primary' | 'error' | 'info' | 'warning' | 'success' | 'secondary' }> = {
  activeIntegrations: { icon: <Layers size={24} />, color: 'primary' },
  totalInvocations: { icon: <Zap size={24} />, color: 'info' },
  successRate: { icon: <Gauge size={24} />, color: 'success' },
  errors: { icon: <AlertTriangle size={24} />, color: 'error' },
  traffic: { icon: <Globe size={24} />, color: 'primary' },
  executions: { icon: <Zap size={24} />, color: 'info' },
  errorRequests: { icon: <AlertTriangle size={24} />, color: 'error' },
  failedExecutions: { icon: <XCircle size={24} />, color: 'error' },
  total: { icon: <Zap size={24} />, color: 'primary' },
  failed: { icon: <XCircle size={24} />, color: 'error' },
  errorRate: { icon: <AlertTriangle size={24} />, color: 'error' },
  avgDuration: { icon: <Clock size={24} />, color: 'info' },
  p95Duration: { icon: <Timer size={24} />, color: 'info' },
  latency: { icon: <Activity size={24} />, color: 'info' },
  errorCount: { icon: <XCircle size={24} />, color: 'error' },
};
