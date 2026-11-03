/*
 * Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com). All Rights Reserved.
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein is strictly forbidden, unless permitted by WSO2 in accordance with
 * the WSO2 Commercial License available at http://wso2.com/licenses.
 * For specific language governing the permissions and limitations under
 * this license, please see the license as well as any agreement you've
 * entered into with WSO2 governing the purchase of this software and any
 * associated services.
 */

import { Box, Button, Typography } from '@wso2/oxygen-ui';
import type { ReactNode } from 'react';

interface EmptyListingProps {
  icon: ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}

export default function EmptyListing({ icon, title, description, actionLabel, onAction, compact }: EmptyListingProps) {
  return (
    <Box sx={{ textAlign: 'center', py: compact ? 4 : 8 }}>
      <Box sx={{ opacity: 0.3, mb: 2 }}>{icon}</Box>
      <Typography variant="h6" component="h2" gutterBottom>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: actionLabel ? 2 : 0 }}>
        {description}
      </Typography>
      {actionLabel && onAction && (
        <Button variant="outlined" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </Box>
  );
}
