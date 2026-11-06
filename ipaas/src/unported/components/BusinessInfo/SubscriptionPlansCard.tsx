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

import { Box, Button, Card, CardContent, Divider, Skeleton, Stack, Typography } from '@wso2/oxygen-ui';
import { ListChecks } from '@wso2/oxygen-ui-icons-react';
import { useState } from 'react';
import type { ApimApiInfo } from '../../../types/apim';
import type { ThrottlingPolicy } from '../../../types/marketplace';
import { useThrottlingPolicies } from '../../../hooks/useMarketplace';
import ActivatePlansDialog from './ActivatePlansDialog';

const PLAN_COLORS: Record<string, { bg: string; text: string }> = {
  bronze: { bg: '#fbe9e7', text: '#bf360c' },
  silver: { bg: '#eceff1', text: '#37474f' },
  gold: { bg: '#fff8e1', text: '#f57f17' },
  unlimited: { bg: '#fce4ec', text: '#880e4f' },
};

const PLAN_ORDER = ['bronze', 'silver', 'gold', 'unlimited'];

function planSortIndex(name: string): number {
  const idx = PLAN_ORDER.indexOf(name.toLowerCase());
  return idx === -1 ? PLAN_ORDER.length : idx;
}

function planStyle(name: string) {
  return PLAN_COLORS[name.toLowerCase()] ?? { bg: '#f5f5f5', text: '#424242' };
}

function formatQuota(policy: ThrottlingPolicy): string {
  if (policy.requestCount === -1) return 'N/A';
  return `${policy.requestCount} / ${policy.timeUnit ?? 'min'}`;
}

interface Props {
  activePolicies?: string[];
  apimId?: string | null;
  apimApiInfo?: ApimApiInfo | null;
}

export default function SubscriptionPlansCard({ activePolicies = [], apimId, apimApiInfo }: Props) {
  const { data: policies = [], isLoading } = useThrottlingPolicies();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <Card sx={{ display: 'flex', flexDirection: 'column' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, pt: 2, pb: 1 }}>
          <Typography variant="h6" component="h3">
            Subscription Plans
          </Typography>
          {apimId && apimApiInfo && (
            <Button variant="outlined" size="small" startIcon={<ListChecks size={14} />} onClick={() => setDialogOpen(true)}>
              Activate Plans
            </Button>
          )}
        </Stack>
        <Divider />
        <CardContent sx={{ flexGrow: 1, pb: (theme) => `${theme.spacing(2)} !important` }}>
          {isLoading ? (
            <Stack direction="row" gap={1} sx={{ mt: 0.5 }}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} variant="rounded" height={56} sx={{ flex: 1 }} />
              ))}
            </Stack>
          ) : policies.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
              No subscription plans available.
            </Typography>
          ) : (
            <Stack direction="row" gap={1} sx={{ mt: 0.5 }}>
              {[...policies]
                .sort((a, b) => planSortIndex(a.name) - planSortIndex(b.name))
                .map((policy) => {
                  const { bg, text } = planStyle(policy.name);
                  const isActive = activePolicies.length === 0 || activePolicies.includes(policy.name);
                  return (
                    <Box
                      key={policy.name}
                      sx={{
                        flex: 1,
                        bgcolor: bg,
                        color: text,
                        borderRadius: 1,
                        px: 1,
                        py: 1,
                        textAlign: 'center',
                        opacity: isActive ? 1 : 0.4,
                      }}>
                      <Typography variant="body2" fontWeight={700} sx={{ color: 'inherit' }}>
                        {policy.name}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'inherit' }}>
                        {formatQuota(policy)}
                      </Typography>
                    </Box>
                  );
                })}
            </Stack>
          )}
        </CardContent>
      </Card>

      {apimId && apimApiInfo && <ActivatePlansDialog open={dialogOpen} onClose={() => setDialogOpen(false)} apimId={apimId} apimApiInfo={apimApiInfo} />}
    </>
  );
}
