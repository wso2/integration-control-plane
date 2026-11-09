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

import { IconButton, MenuItem, Select, Tooltip } from '@wso2/oxygen-ui';
import { Download } from '@wso2/oxygen-ui-icons-react';
import EndpointPanelLayout from './EndpointPanelLayout';
import type { EnvEndpoint } from '../../../types/component';
import { aiGatewayUrlRows, trimEndpointName, envCardUrlRows } from '../../../utils/endpoints';
import EndpointUrlRows from './EndpointUrlRows';
import { decodeBase64Spec, specFileType } from '../../../utils/openApiSpec';

interface EndpointUrlsPanelProps {
  endpoints: EnvEndpoint[];
  selectedIdx: number;
  onSelect: (idx: number) => void;
  /**
   * For an externally-exposed endpoint managed on the API Platform gateway, the enforcing gateway
   * invoke URL for the currently selected endpoint. When set, the "Public" row shows this (labelled
   * "API Gateway") instead of the component's raw OpenChoreo external URL. Opt-in: only the
   * integration-as-api env card passes it; other component types leave it undefined (unchanged).
   */
  externalUrlOverride?: string;
  /** For an MCP server on Agent Manager's AI gateway, its proxy URL, shown as the Public URL; '' before the proxy has one. */
  aiGatewayUrl?: string;
}

/**
 * Per-environment endpoint URLs panel: endpoint selector, the visibility-scoped
 * invoke URLs (with copy), and the API-spec download. Shared by the env-card
 * bodies of integration-as-api and ai-agent
 */
export default function EndpointUrlsPanel({ endpoints, selectedIdx, onSelect, externalUrlOverride, aiGatewayUrl }: EndpointUrlsPanelProps) {
  // Clamp a stale/out-of-bounds selection (e.g. the endpoint list shrank) to a
  // valid index so the panel stays visible and the selector stays consistent,
  // instead of silently rendering nothing.
  const safeIdx = selectedIdx >= 0 && selectedIdx < endpoints.length ? selectedIdx : 0;
  const ep = endpoints[safeIdx];
  if (!ep) return null;

  // An exposed external endpoint lists the enforcing API Platform gateway URL as its Public URL, not the open raw route.
  const urlOptions = aiGatewayUrl !== undefined ? aiGatewayUrlRows(aiGatewayUrl) : envCardUrlRows(ep, externalUrlOverride);

  // The spec arrives with the endpoint list, base64 in the apimRevisionId slot (see api/deployments.ts).
  const inlineSpec = decodeBase64Spec(ep.apimRevisionId);
  const canDownload = !!inlineSpec;

  const handleDownload = async () => {
    try {
      const content = inlineSpec;
      if (!content) return;
      const { extension, mimeType } = specFileType(content);
      const blob = new Blob([content], { type: mimeType });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${trimEndpointName(ep.displayName) || 'api'}-spec.${extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    } catch {
      // silently ignore
    }
  };

  return (
    <EndpointPanelLayout
      select={
        <Select size="small" value={safeIdx} onChange={(e) => onSelect(Number(e.target.value))} disabled={endpoints.length <= 1} sx={{ fontSize: '13px', width: '100%' }}>
          {endpoints.map((e, i) => (
            <MenuItem key={e.id} value={i} sx={{ fontSize: '13px' }}>
              {trimEndpointName(e.displayName)}
            </MenuItem>
          ))}
        </Select>
      }
      urls={aiGatewayUrl !== undefined ? <EndpointUrlRows options={urlOptions} gatewayUrl={aiGatewayUrl} gatewayName="AI gateway" /> : <EndpointUrlRows options={urlOptions} gatewayUrl={externalUrlOverride} />}
      download={
        <Tooltip title={canDownload ? 'Download API specification' : 'No API specification published for this endpoint'}>
          <span>
            <IconButton aria-label="Download API specification" size="small" disabled={!canDownload} onClick={() => void handleDownload()}>
              <Download size={16} />
            </IconButton>
          </span>
        </Tooltip>
      }
    />
  );
}
