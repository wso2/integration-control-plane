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

import { Box, Chip, Tooltip, Typography } from '@wso2/oxygen-ui';
import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const chipSx = {
  maxWidth: '100%',
  height: 20,
  boxSizing: 'border-box',
  fontSize: '0.6875rem',
  lineHeight: 1,
  color: 'text.secondary',
  bgcolor: 'transparent',
  border: 1,
  borderColor: 'divider',
  verticalAlign: 'middle',
  '& .MuiChip-labelSmall': { px: 0.75 },
} as const;

const rowSx = { display: 'flex', flexWrap: 'nowrap', alignItems: 'center', gap: 0.5 } as const;

/**
 * Renders the user's roles on a single line. Roles that don't fit are
 * collapsed into a "+N more" chip that lists them in a tooltip.
 */
export default function ProfileRoles({ roles }: { roles: string[] }) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(roles.length);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return undefined;

    const fit = () => {
      const gap = parseFloat(getComputedStyle(container).columnGap) || 0;
      const available = container.clientWidth;
      const nodes = Array.from(measure.children) as HTMLElement[];
      const moreWidth = nodes.pop()?.offsetWidth ?? 0;
      const widths = nodes.map((node) => node.offsetWidth);

      const total = widths.reduce((sum, width) => sum + width, 0);
      if (total + gap * (widths.length - 1) <= available) {
        setVisibleCount(widths.length);
        return;
      }

      let used = moreWidth;
      let count = 0;
      while (count < widths.length && used + gap + widths[count] <= available) {
        used += gap + widths[count];
        count += 1;
      }
      // Always show at least one role; it truncates with an ellipsis if needed.
      setVisibleCount(Math.max(count, 1));
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    return () => observer.disconnect();
  }, [roles]);

  const visibleRoles = roles.slice(0, visibleCount);
  const hiddenRoles = roles.slice(visibleCount);

  const renderMoreChip = (count: number) => <Chip size="small" sx={{ ...chipSx, cursor: 'default' }} label={t('shell.profile.moreRoles', { count })} />;

  return (
    <Box sx={{ position: 'relative', minWidth: 0, mt: 0.75 }}>
      <Box ref={measureRef} aria-hidden sx={{ ...rowSx, position: 'absolute', top: 0, left: 0, visibility: 'hidden', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
        {roles.map((role) => (
          <Chip key={role} label={role} size="small" sx={chipSx} />
        ))}
        {renderMoreChip(roles.length)}
      </Box>
      <Box ref={containerRef} data-testid="profile-roles" sx={{ ...rowSx, overflow: 'hidden', '& > *': { flexShrink: 0 }, '& > :first-of-type': { flexShrink: 1, minWidth: 0 } }}>
        {visibleRoles.map((role) => (
          <Chip key={role} label={role} title={role} size="small" sx={chipSx} />
        ))}
        {hiddenRoles.length > 0 && (
          <Tooltip
            placement="bottom-start"
            title={
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, maxHeight: 200, overflowY: 'auto' }}>
                {hiddenRoles.map((role) => (
                  <Typography key={role} variant="body2">
                    {role}
                  </Typography>
                ))}
              </Box>
            }>
            {renderMoreChip(hiddenRoles.length)}
          </Tooltip>
        )}
      </Box>
    </Box>
  );
}
