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

import { Box, Button, Typography } from '@wso2/oxygen-ui';
import { Plus } from '@wso2/oxygen-ui-icons-react';
import type { ReactNode } from 'react';
import { useConsoleActionWhen } from '../hooks/useConsoleAnalytics';
import { ConsoleAction, type ConsoleActionDimensions } from '../services/telemetry/consoleActions';

type EmptyStateReport = ConsoleActionDimensions[typeof ConsoleAction.EmptyState];

interface EmptyListingProps {
  icon: ReactNode;
  title: string;
  description: string;
  showAction?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  /** Reports the empty state as a console action (friction.empty-state) when shown. */
  report?: EmptyStateReport;
}

function ReportEmptyState(report: EmptyStateReport): null {
  useConsoleActionWhen(true, ConsoleAction.EmptyState, report);
  return null;
}

export default function EmptyListing({ icon, title, description, showAction, actionLabel = 'Create', onAction, report }: EmptyListingProps) {
  return (
    <Box sx={{ textAlign: 'center', py: 8 }}>
      {report && <ReportEmptyState {...report} />}
      <Box sx={{ opacity: 0.3, mb: 2 }}>{icon}</Box>
      <Typography variant="h6" component="h2" gutterBottom>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {description}
      </Typography>
      {showAction && (
        <Button variant="contained" startIcon={<Plus size={20} />} onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </Box>
  );
}
