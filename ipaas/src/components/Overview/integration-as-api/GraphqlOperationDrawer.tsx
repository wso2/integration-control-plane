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

import { Box, Stack, Typography } from '@wso2/oxygen-ui';
import { useState, type ReactNode } from 'react';
import OperationHeader from '../_shared/bodies/OperationHeader';
import type { OperationTileColors } from '../_shared/bodies/OperationTile';
import type { GraphqlAttrNode, GraphqlField } from '../../../types/graphql';
import { GRAPHQL_BORDERED_BOX_SX, GRAPHQL_KEY_SX, GRAPHQL_TYPE_SX, graphqlAttributeTreeSx } from './graphql.styles';

function AttributeTree({ nodes, nested = false }: { nodes: GraphqlAttrNode[]; nested?: boolean }): ReactNode {
  return (
    <Stack gap={0.5} sx={graphqlAttributeTreeSx(nested)}>
      {nodes.map((node) => (
        <Box key={node.name}>
          <Stack direction="row" gap={0.5} alignItems="baseline">
            <Typography variant="body2" sx={GRAPHQL_KEY_SX}>
              {node.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              :
            </Typography>
            <Typography variant="body2" sx={GRAPHQL_TYPE_SX}>
              {node.type}
            </Typography>
          </Stack>
          {node.children && node.children.length > 0 && <AttributeTree nodes={node.children} nested />}
        </Box>
      ))}
    </Stack>
  );
}

/** Drawer body for one GraphQL field: header, description, parameters (with input-type drill-down), and response attributes. */
export default function GraphqlOperationDrawer({ operationName, field, colors }: { operationName: string; field: GraphqlField; colors: OperationTileColors }): ReactNode {
  const [expandedParam, setExpandedParam] = useState<string | null>(null);

  return (
    <Stack gap={2.5}>
      <OperationHeader badgeLabel={operationName} label={field.name} colors={colors} description={field.description || undefined} />

      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Parameters
        </Typography>
        {field.params.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No parameters available.
          </Typography>
        ) : (
          <Stack gap={1}>
            {field.params.map((param) => {
              const expandable = param.attributes.length > 0;
              const isExpanded = expandedParam === param.name;
              return (
                <Box key={param.name} sx={GRAPHQL_BORDERED_BOX_SX}>
                  <Stack
                    direction="row"
                    gap={0.5}
                    alignItems="baseline"
                    role={expandable ? 'button' : undefined}
                    tabIndex={expandable ? 0 : undefined}
                    onClick={expandable ? () => setExpandedParam(isExpanded ? null : param.name) : undefined}
                    onKeyDown={
                      expandable
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setExpandedParam(isExpanded ? null : param.name);
                            }
                          }
                        : undefined
                    }
                    sx={{ cursor: expandable ? 'pointer' : 'default' }}>
                    <Typography variant="body2" sx={GRAPHQL_KEY_SX}>
                      {param.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      :
                    </Typography>
                    <Typography variant="body2" sx={GRAPHQL_TYPE_SX}>
                      {param.type}
                    </Typography>
                  </Stack>
                  {expandable && isExpanded && (
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                        Include the following parameters
                      </Typography>
                      <AttributeTree nodes={param.attributes} nested />
                    </Box>
                  )}
                </Box>
              );
            })}
          </Stack>
        )}
      </Box>

      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Response attributes
        </Typography>
        <Box sx={GRAPHQL_BORDERED_BOX_SX}>
          {field.responseAttributes.length > 0 ? (
            <AttributeTree nodes={field.responseAttributes} />
          ) : (
            <Typography variant="body2" sx={GRAPHQL_TYPE_SX}>
              {field.responseType}
            </Typography>
          )}
        </Box>
      </Box>
    </Stack>
  );
}
