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

import { Box, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import type { EnvEndpoint } from '../types/component';
import { useEntryEnvironment } from '../hooks/useEntryEnvironment';
import { EndpointCard } from './EndpointCard';

interface EndpointCardListProps {
  endpoints: EnvEndpoint[];
  projectId: string;
  envId: string;
  onEdit?: (ep: EnvEndpoint) => void;
  onSettings?: (ep: EnvEndpoint) => void;
}

/**
 * An environment's endpoint cards. Visibility and API settings (CORS, rate limiting) are edited
 * only in the entry environment and reach later environments by promotion, which carries the
 * source's visibility with it, so elsewhere the cards offer neither and say where to go instead.
 */
export function EndpointCardList({ endpoints, projectId, envId, onEdit, onSettings }: EndpointCardListProps): JSX.Element {
  const { isEntry, entryEnvironmentName } = useEntryEnvironment(projectId, envId);
  return (
    <Box>
      {endpoints.map((ep, idx) => (
        <EndpointCard key={ep.id} ep={ep} defaultExpanded={idx === 0} readOnly={!isEntry || !onEdit} onEdit={isEntry ? onEdit : undefined} onSettings={isEntry ? onSettings : undefined} />
      ))}
      {!isEntry && (onEdit || onSettings) && (
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
          Visibility and API settings are managed in {entryEnvironmentName}. Promote to apply them here.
        </Typography>
      )}
    </Box>
  );
}
