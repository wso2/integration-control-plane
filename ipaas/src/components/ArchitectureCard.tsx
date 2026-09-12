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

import { Card, CardContent, CircularProgress, Collapse, IconButton, Stack, Typography } from '@wso2/oxygen-ui';
import { ChevronDown, ChevronUp, GitBranch } from '@wso2/oxygen-ui-icons-react';
import { CellDiagram, DiagramLayer } from '@wso2/cell-diagram';
import type { Project as DiagramProject } from '@wso2/cell-diagram';
import { memo, useMemo, useState } from 'react';
import type { Component } from '../types/component';
import { buildProjectModel } from './Observability/diagramUtils';
import type { JSX } from 'react';

const EMPTY_MENU: never[] = [];

const CellDiagramPreview = memo(function CellDiagramPreview({ project }: { project: DiagramProject }) {
  return <CellDiagram project={project} componentMenu={EMPTY_MENU} defaultDiagramLayer={DiagramLayer.ARCHITECTURE} previewMode />;
});

export default function ArchitectureCard({ projectId, components, isLoading }: { projectId: string; components: Component[]; isLoading: boolean }): JSX.Element {
  const project = useMemo(() => buildProjectModel(projectId, components), [projectId, components]);
  const [expanded, setExpanded] = useState(false);

  return (
    <Card variant="outlined">
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Stack direction="row" alignItems="center" sx={{ mb: expanded ? 1.5 : 0, cursor: 'pointer' }} onClick={() => setExpanded((prev) => !prev)}>
          <GitBranch size={20} aria-hidden="true" />
          <Typography variant="h6" component="h2" sx={{ fontWeight: 600, ml: 1, flex: 1 }}>
            Architecture Diagram
          </Typography>
          <IconButton size="small" aria-label={expanded ? 'Collapse architecture diagram' : 'Expand architecture diagram'} aria-expanded={expanded}>
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </IconButton>
        </Stack>

        <Collapse in={expanded} unmountOnExit>
          <div style={{ width: '100%', height: 250, overflow: 'hidden', cursor: 'default' }}>
          {isLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <CircularProgress size={32} color="primary" />
            </div>
          ) : components.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <Typography variant="body2" color="text.secondary">
                No integrations found
              </Typography>
            </div>
          ) : (
              <CellDiagramPreview project={project} />
            )}
          </div>
        </Collapse>
      </CardContent>
    </Card>
  );
}
