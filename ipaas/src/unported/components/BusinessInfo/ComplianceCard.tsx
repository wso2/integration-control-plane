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

import { Box, Card, CardContent, Divider, Skeleton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { ShieldOff } from '@wso2/oxygen-ui-icons-react';
import { useMemo } from 'react';
import { useRuleAdherence } from '../../../hooks/useMarketplace';

interface Props {
  projectId: string;
  componentId: string;
  apimId: string | null;
}

export default function ComplianceCard({ projectId, componentId, apimId }: Props) {
  const { data: ruleDetails, isLoading } = useRuleAdherence(projectId, componentId, apimId);

  const { adheredPct, violatedPct, hasPolicies } = useMemo(() => {
    if (!ruleDetails?.list?.length) return { adheredPct: 0, violatedPct: 0, hasPolicies: false };

    let totalCount = 0;
    let totalAdhered = 0;

    for (const ruleset of ruleDetails.list) {
      const errors = ruleset.violatedRules.list.filter((r) => r.severity === 'error').length;
      const warnings = ruleset.violatedRules.list.filter((r) => r.severity === 'warn').length;
      const adhered = ruleset.adheredRules?.list.length ?? 0;
      totalCount += errors + warnings + adhered;
      totalAdhered += adhered;
    }

    if (totalCount === 0) return { adheredPct: 0, violatedPct: 0, hasPolicies: false };

    const adheredPct = (totalAdhered / totalCount) * 100;
    return { adheredPct, violatedPct: 100 - adheredPct, hasPolicies: true };
  }, [ruleDetails]);

  return (
    <Card sx={{ display: 'flex', flexDirection: 'column' }}>
      <Stack direction="row" alignItems="center" sx={{ px: 2, pt: 2, pb: 1 }}>
        <Typography variant="h6" component="h3">
          Compliance Summary
        </Typography>
      </Stack>
      <Divider />
      <CardContent sx={{ flexGrow: 1, pb: (theme) => `${theme.spacing(2)} !important` }}>
        {isLoading ? (
          <Box sx={{ mt: 1 }}>
            <Skeleton variant="rounded" height={10} />
            <Stack direction="row" gap={2} sx={{ mt: 1.5 }}>
              <Skeleton variant="text" width={90} />
              <Skeleton variant="text" width={90} />
            </Stack>
          </Box>
        ) : !hasPolicies ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 2, gap: 1 }}>
            <ShieldOff size={32} style={{ opacity: 0.3 }} />
            <Typography variant="body2" color="text.secondary">
              No Policies Applied.
            </Typography>
          </Box>
        ) : (
          <Box sx={{ mt: 1 }}>
            {/* Stacked horizontal bar */}
            <Box sx={{ display: 'flex', height: 10, borderRadius: 1, overflow: 'hidden', bgcolor: 'divider' }}>
              <Tooltip title={`Adhered: ${adheredPct.toFixed(1)}%`}>
                <Box role="img" aria-label={`Adhered: ${adheredPct.toFixed(1)}%`} sx={{ width: `${adheredPct}%`, bgcolor: '#36b475', transition: 'width 0.4s' }} />
              </Tooltip>
              <Tooltip title={`Violated: ${violatedPct.toFixed(1)}%`}>
                <Box role="img" aria-label={`Violated: ${violatedPct.toFixed(1)}%`} sx={{ width: `${violatedPct}%`, bgcolor: '#e0e0e0', transition: 'width 0.4s' }} />
              </Tooltip>
            </Box>

            {/* Legend */}
            <Stack direction="row" gap={2} sx={{ mt: 1.5 }}>
              <Stack direction="row" alignItems="center" gap={0.75}>
                <Box sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: '#36b475', flexShrink: 0 }} />
                <Typography variant="caption">Adhered: {adheredPct.toFixed(1)}%</Typography>
              </Stack>
              <Stack direction="row" alignItems="center" gap={0.75}>
                <Box sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: '#e0e0e0', flexShrink: 0 }} />
                <Typography variant="caption">Violated: {violatedPct.toFixed(1)}%</Typography>
              </Stack>
            </Stack>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
