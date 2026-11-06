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

import { Box, CircularProgress, IconButton, Tooltip, useTheme } from '@wso2/oxygen-ui';
import { RefreshCw } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useRef, useState, type JSX, type MouseEvent, type WheelEvent } from 'react';
import { buildClassDefs, ensureMermaidInit, extractDefinition, nextDiagramId, purgeMermaidOrphans, renderMermaidSvg, toMermaidSafeColor } from '../utils/mermaid';

interface IntegrationFlowChartProps {
  diagram: string;
}

export default function IntegrationFlowChart({ diagram }: IntegrationFlowChartProps): JSX.Element | null {
  const theme = useTheme();
  const [isRendered, setIsRendered] = useState(false);
  const [renderFailed, setRenderFailed] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const isPanning = useRef(false);
  const startPoint = useRef({ x: 0, y: 0 });
  const currentTransform = useRef({ x: 0, y: 0, scale: 1 });

  const colors = useMemo(
    () => ({
      primary: toMermaidSafeColor(theme.palette.primary.main, '#1976d2'),
      primaryLight: toMermaidSafeColor(theme.palette.primary.light, '#42a5f5'),
      grey: toMermaidSafeColor(theme.palette.grey?.[400], '#bdbdbd'),
    }),
    [theme],
  );

  useEffect(() => {
    let cancelled = false;
    setIsRendered(false);
    setRenderFailed(false);
    svgRef.current = null;

    const definition = extractDefinition(diagram);
    if (!definition) return;

    const fullDefinition = `${definition}\n${buildClassDefs(colors.primary, colors.primaryLight, colors.grey)}`;
    const id = nextDiagramId();

    ensureMermaidInit();

    const renderDiagram = async () => {
      if (!containerRef.current) return;
      try {
        const svg = await renderMermaidSvg(id, fullDefinition);

        if (cancelled) return;

        const tmp = document.createElement('div');
        tmp.innerHTML = svg;
        const svgElement = tmp.querySelector('svg');

        if (svgElement && containerRef.current) {
          Object.assign(svgElement.style, {
            maxWidth: '90%',
            maxHeight: '90%',
            width: 'auto',
            height: 'auto',
            display: 'block',
            cursor: 'grab',
            transformOrigin: 'center center',
            flexShrink: '0',
          });

          containerRef.current.innerHTML = '';
          containerRef.current.appendChild(svgElement);
          svgRef.current = svgElement;
          currentTransform.current = { x: 0, y: 0, scale: 1 };
          setIsRendered(true);
        }
      } catch (err) {
        purgeMermaidOrphans(id);
        if (!cancelled) {
          console.error('IntegrationFlowChart: mermaid render failed', err);
          setRenderFailed(true);
        }
      }
    };

    renderDiagram();

    return () => {
      cancelled = true;
      purgeMermaidOrphans(id);
    };
  }, [diagram, colors.primary, colors.primaryLight, colors.grey]);

  const applyTransform = () => {
    if (!svgRef.current) return;
    const { x, y, scale } = currentTransform.current;
    svgRef.current.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  };

  const handleMouseDown = (e: MouseEvent) => {
    if (!svgRef.current) return;
    isPanning.current = true;
    startPoint.current = { x: e.clientX, y: e.clientY };
    svgRef.current.style.cursor = 'grabbing';
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isPanning.current || !svgRef.current) return;
    currentTransform.current.x += e.clientX - startPoint.current.x;
    currentTransform.current.y += e.clientY - startPoint.current.y;
    startPoint.current = { x: e.clientX, y: e.clientY };
    applyTransform();
  };

  const handleMouseUp = () => {
    isPanning.current = false;
    if (svgRef.current) svgRef.current.style.cursor = 'grab';
  };

  const handleWheel = (e: WheelEvent) => {
    if (!svgRef.current) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    currentTransform.current.scale = Math.max(0.5, Math.min(3, currentTransform.current.scale * delta));
    applyTransform();
  };

  const handleReset = () => {
    if (!svgRef.current) return;
    currentTransform.current = { x: 0, y: 0, scale: 1 };
    svgRef.current.style.transform = '';
  };

  if (renderFailed) return null;

  return (
    <Box
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      sx={{
        position: 'relative',
        overflow: 'hidden',
        cursor: 'grab',
        width: '100%',
        height: '100%',
        userSelect: 'none',
      }}>
      {/* Loading overlay */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 5,
          pointerEvents: 'none',
          opacity: isRendered ? 0 : 1,
          transition: 'opacity 0.2s ease-in-out',
        }}>
        <CircularProgress size={28} />
      </Box>

      {isRendered && (
        <Tooltip title="Reset view" placement="left">
          <IconButton
            aria-label="Reset view"
            onClick={handleReset}
            size="small"
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              zIndex: 10,
              bgcolor: 'background.paper',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              '&:hover': { bgcolor: 'action.hover' },
            }}>
            <RefreshCw size={14} />
          </IconButton>
        </Tooltip>
      )}

      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          opacity: isRendered ? 1 : 0,
          transition: 'opacity 0.4s ease-in-out',
        }}
      />
    </Box>
  );
}
