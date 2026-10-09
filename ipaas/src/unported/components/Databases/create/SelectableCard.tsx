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

import { Box, Card, CardActionArea, ColorSchemeImage, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';

interface SelectableCardProps {
  title: string;
  description?: string;
  /** Optional logo (full URL). */
  logo?: string;
  /** Optional dark-mode variant of `logo` — for logos (e.g. monochrome brand marks) that need a different color per theme. */
  logoDark?: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

/** An outlined, clickable card for choosing a database type / cloud provider / region. */
export default function SelectableCard({ title, description, logo, logoDark, selected, disabled, onSelect }: SelectableCardProps): JSX.Element {
  return (
    <Card variant="outlined" sx={{ height: '100%', borderColor: selected ? 'primary.main' : 'divider', borderWidth: selected ? 2 : 1, opacity: disabled ? 0.5 : 1 }}>
      <CardActionArea disabled={disabled} onClick={onSelect} sx={{ height: '100%', p: 2, alignItems: 'flex-start', justifyContent: 'flex-start' }}>
        {logo && logoDark ? <ColorSchemeImage src={{ light: logo, dark: logoDark }} alt="" height={28} sx={{ mb: 1, display: 'block' }} /> : logo && <Box component="img" src={logo} alt="" sx={{ height: 28, mb: 1, display: 'block' }} />}
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: description ? 0.5 : 0 }}>
          {title}
        </Typography>
        {description && (
          <Typography variant="caption" color="text.secondary">
            {description}
          </Typography>
        )}
      </CardActionArea>
    </Card>
  );
}
