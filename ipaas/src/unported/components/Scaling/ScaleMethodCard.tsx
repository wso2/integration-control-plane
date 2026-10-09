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

import { Card, CardActionArea, CardContent, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';

interface ScaleMethodCardProps {
  title: string;
  description: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

export default function ScaleMethodCard({ title, description, selected, disabled, onSelect }: ScaleMethodCardProps): JSX.Element {
  return (
    <Card
      variant="outlined"
      sx={{
        flex: 1,
        minWidth: 280,
        maxWidth: 420,
        border: '2px solid',
        borderColor: selected ? 'primary.main' : 'divider',
        bgcolor: selected ? 'primary.50' : 'background.paper',
        opacity: disabled ? 0.55 : 1,
        transition: 'border-color 0.15s, background-color 0.15s',
        '&:hover': disabled ? undefined : { borderColor: 'primary.main' },
      }}>
      <CardActionArea disabled={disabled} aria-pressed={selected} onClick={onSelect} sx={{ height: '100%' }}>
        <CardContent>
          <Typography variant="body1" sx={{ fontWeight: 600, mb: 0.5, color: selected ? 'primary.main' : 'text.primary' }}>
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {description}
          </Typography>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
