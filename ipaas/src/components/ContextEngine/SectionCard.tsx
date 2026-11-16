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

import { Card, CardContent, Divider, Stack, Typography } from '@wso2/oxygen-ui';
import type { JSX, ReactNode } from 'react';

interface SectionCardProps {
  title: ReactNode;
  /** Shown at the right of the header, e.g. an Add or Edit action. */
  action?: ReactNode;
  id?: string;
  /** Stretch to the row height, for cards that sit side by side in a grid. */
  fill?: boolean;
  children: ReactNode;
}

/**
 * A titled card in the console's pattern (as on the integration-as-API Overview, e.g. Subscription Plans):
 * an h6 title with its action on one row, a divider, then the content.
 */
export default function SectionCard({ title, action, id, fill = false, children }: SectionCardProps): JSX.Element {
  return (
    <Card id={id} sx={{ display: 'flex', flexDirection: 'column', height: fill ? '100%' : 'auto' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} sx={{ px: 2, pt: 2, pb: 1, minHeight: 40 }}>
        <Typography variant="h6" component="h3">
          {title}
        </Typography>
        {action}
      </Stack>
      <Divider />
      <CardContent sx={{ flexGrow: 1, pb: (theme) => `${theme.spacing(2)} !important` }}>{children}</CardContent>
    </Card>
  );
}
