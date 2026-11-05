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
import { useMemo } from 'react';
import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';
import '../../../swagger-ui-overrides.scss';
import { getHttpMethodColors } from '../../../utils/httpMethods';
import OperationTile from '../_shared/bodies/OperationTile';
import OperationHeader from '../_shared/bodies/OperationHeader';

const VALID_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'trace'];

// Hide most SwaggerUI chrome — keep only parameters, request body, responses
const HidePlugin = () => ({
  components: {
    TryItOutButton: () => null,
    AuthorizeBtn: () => null,
    AuthorizeBtnContainer: () => null,
    AuthorizeOperationBtn: () => null,
    Models: () => null,
    ModelWrapper: () => null,
    InfoContainer: () => null,
    Info: () => null,
    Servers: () => null,
    ServersContainer: () => null,
    SchemesContainer: () => null,
    Execute: () => null,
    OperationSummary: () => null,
    OperationSummaryMethod: () => null,
    OperationSummaryPath: () => null,
  },
});

export interface SwaggerDocument {
  paths?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
}

interface Operation {
  method: string;
  path: string;
}

const tileColors = (method: string) => {
  const { badgeBg, cardBg } = getHttpMethodColors(method);
  return { badgeBg, cardBg };
};

/**
 * Drawer body for a single operation: the shared {@link OperationHeader} (method
 * badge + path) followed by the SwaggerUI view for just that operation. Computed
 * lazily — only rendered while the tile's drawer is open.
 */
function OperationDetailContent({ method, path, swagger }: { method: string; path: string; swagger: SwaggerDocument }) {
  const filteredSpec = useMemo(() => {
    const pathItem = swagger.paths?.[path];
    if (!pathItem) return null;
    const op = pathItem[method.toLowerCase()];
    if (!op) return null;
    const pathEntry: Record<string, unknown> = { [method.toLowerCase()]: op };
    if (pathItem.parameters) pathEntry.parameters = pathItem.parameters;
    return { ...swagger, paths: { [path]: pathEntry } };
  }, [swagger, method, path]);

  return (
    <>
      <OperationHeader badgeLabel={method} label={path} colors={tileColors(method)} />
      {filteredSpec ? (
        <SwaggerUI spec={filteredSpec} plugins={[HidePlugin]} docExpansion="full" />
      ) : (
        <Typography variant="body2" color="text.secondary">
          No operation details available.
        </Typography>
      )}
    </>
  );
}

interface SwaggerOperationsListProps {
  swagger: SwaggerDocument;
}

export default function SwaggerOperationsList({ swagger }: SwaggerOperationsListProps) {
  const operations = useMemo<Operation[]>(() => {
    if (!swagger?.paths) return [];
    const ops: Operation[] = [];
    Object.entries(swagger.paths).forEach(([path, methods]) => {
      if (methods && typeof methods === 'object') {
        Object.keys(methods).forEach((method) => {
          if (VALID_METHODS.includes(method.toLowerCase())) {
            ops.push({ method: method.toUpperCase(), path });
          }
        });
      }
    });
    return ops.sort((a, b) => (a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path)));
  }, [swagger]);

  if (operations.length === 0) return null;

  return (
    <Box sx={{ mt: 1.5 }}>
      {operations.map((op) => (
        <OperationTile key={`${op.method}-${op.path}`} badgeLabel={op.method} label={op.path} colors={tileColors(op.method)} drawerContent={<OperationDetailContent method={op.method} path={op.path} swagger={swagger} />} drawerWidth={720} />
      ))}
    </Box>
  );
}
