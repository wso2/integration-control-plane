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

import { Alert, Box, Skeleton, Stack } from '@wso2/oxygen-ui';
import { CellDiagram, DiagramLayer } from '@wso2/cell-diagram';
import type { MoreVertMenuItem } from '@wso2/cell-diagram';
import { memo, useMemo, type JSX } from 'react';
import { buildProjectModel } from '../../../components/Observability/diagramUtils';
import { applyObservability } from '../../../components/Observability/diagramUtils';
import type { Component } from '../../../types/component';
import type { ProjectMetricsModel } from '../../../types/observability';

interface ProjectMetricsDiagramProps {
  projectId: string;
  components: Component[];
  model: ProjectMetricsModel | null;
  isLoading: boolean;
  /** "Observe" menu action on a component node. */
  onObserve: (componentId: string) => void;
}

const DiagramView = memo(function DiagramView({ project, menu }: { project: ReturnType<typeof buildProjectModel>; menu: MoreVertMenuItem[] }) {
  return <CellDiagram project={project} componentMenu={menu} defaultDiagramLayer={DiagramLayer.OBSERVABILITY} modelVersion="v2" />;
});

/** Project architecture diagram with the observability layer active — per-edge
 * request/error/latency data from `/metrics/project/http` overlaid on the same
 * cell-diagram model the project home's ArchitectureCard builds. */
export default function ProjectMetricsDiagram({ projectId, components, model, isLoading, onObserve }: ProjectMetricsDiagramProps): JSX.Element {
  const project = useMemo(() => applyObservability(buildProjectModel(projectId, components), model, components), [projectId, components, model]);
  const menu = useMemo<MoreVertMenuItem[]>(() => [{ label: 'Observe', callback: (id) => onObserve(id) }], [onObserve]);
  const hasTraffic = (model?.linkList?.length ?? 0) > 0;

  if (isLoading) return <Skeleton variant="rounded" height={560} />;

  return (
    <Stack gap={1.5}>
      {!hasTraffic && <Alert severity="info">No requests were sent or received by integration(s) during this time range.</Alert>}
      <Box sx={{ height: 560, border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden', '& > *': { height: '100%' } }}>
        <DiagramView project={project} menu={menu} />
      </Box>
    </Stack>
  );
}
