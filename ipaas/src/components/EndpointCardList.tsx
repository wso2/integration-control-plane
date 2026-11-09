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
  /** The endpoints Agent Manager's AI gateway fronts, by id, each with its public proxy URL (see `useAiGatewayUrls`). */
  aiGatewayUrls?: Record<string, string>;
  /**
   * Which endpoints the AI gateway fronts is still being read. Edit and API settings wait for it: offered
   * for an endpoint that turns out to be on the AI gateway, they would only be refused.
   */
  aiGatewayPending?: boolean;
}

/**
 * An environment's endpoint cards. Visibility and API settings (CORS, rate limiting) are edited
 * only in the entry environment and reach later environments by promotion, which carries the
 * source's visibility with it, so elsewhere the cards offer neither and say where to go instead.
 * An endpoint on the AI gateway has neither in any environment: it is public through the gateway.
 */
export function EndpointCardList({ endpoints, projectId, envId, onEdit, onSettings, aiGatewayUrls = {}, aiGatewayPending = false }: EndpointCardListProps): JSX.Element {
  const { isEntry, loading, entryEnvironmentName } = useEntryEnvironment(projectId, envId);
  const allOnAiGateway = endpoints.length > 0 && endpoints.every((ep) => ep.id in aiGatewayUrls);
  return (
    <Box>
      {endpoints.map((ep, idx) => (
        <EndpointCard
          key={ep.id}
          ep={ep}
          defaultExpanded={idx === 0}
          readOnly={!isEntry || !onEdit || aiGatewayPending}
          onEdit={isEntry && !aiGatewayPending ? onEdit : undefined}
          onSettings={isEntry && !aiGatewayPending ? onSettings : undefined}
          aiGatewayUrl={aiGatewayUrls[ep.id]}
          urlsPending={aiGatewayPending && !(ep.id in aiGatewayUrls)}
        />
      ))}
      {!isEntry && !loading && !aiGatewayPending && !allOnAiGateway && (onEdit || onSettings) && (
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
          Visibility and API settings are managed in {entryEnvironmentName}. Promote to apply them here.
        </Typography>
      )}
    </Box>
  );
}
