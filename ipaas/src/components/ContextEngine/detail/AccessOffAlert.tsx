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

import { Alert } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import type { ContextEngineAccess } from '../../../types/contextEngine';

const NAMES: Record<keyof ContextEngineAccess, string> = { api: 'API', mcp: 'MCP' };

/** Says a surface is off; its switch is in the tab's header. */
export default function AccessOffAlert({ surface }: { surface: keyof ContextEngineAccess }): JSX.Element {
  return (
    <Alert severity="warning" variant="outlined" sx={{ mb: 3 }}>
      {NAMES[surface]} access is off. Clients get a 403.
    </Alert>
  );
}
