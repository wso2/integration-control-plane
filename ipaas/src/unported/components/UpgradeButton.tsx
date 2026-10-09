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

import { Box, Button, ButtonGroup, ClickAwayListener, Grow, MenuItem, MenuList, Paper, Popper, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { ChevronDown, ChevronUp } from '@wso2/oxygen-ui-icons-react';
import { useRef, useState, type JSX } from 'react';
import { useComponentLimits, useSubscriptions } from '../../hooks/useSubscription';
import { FREE_COMPONENT_LIMIT, PAID_SUBSCRIPTION_TYPE } from '../../constants/subscription';

interface UpgradeButtonProps {
  orgUuid: string;
}

type QuotaColor = 'primary' | 'warning' | 'error';

function QuotaTooltip({ used, color }: { used: number; color: QuotaColor }): JSX.Element {
  const dot = color === 'error' ? 'error.main' : color === 'warning' ? 'warning.main' : 'success.main';
  return (
    <Box sx={{ p: 0.5 }}>
      <Stack direction="row" alignItems="center" gap={1}>
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: dot }} />
        <Typography variant="caption">Free tier components in use</Typography>
      </Stack>
      <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.5 }}>
        {used}/{FREE_COMPONENT_LIMIT}
      </Typography>
    </Box>
  );
}

/**
 * Free-tier "Upgrade" button — links to the external billing console. Renders only
 * for orgs that aren't subscribed (once subscription + quota are known), and its
 * colour reflects how close the org is to the free component limit. When a SaaS
 * offer URL is configured it becomes a split-button with an Azure marketplace option.
 * Mirrors Devant's Header UpgradeButton.
 */
export default function UpgradeButton({ orgUuid }: UpgradeButtonProps): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  const enableBilling = !!window.API_CONFIG?.enableBillingFeature;
  const billingConsoleUrl = window.API_CONFIG?.billingConsoleUrl;
  const saasOfferUrl = window.API_CONFIG?.choreoSaasOfferUrl;

  // Don't fetch until billing can actually be shown — no config or no org means no requests.
  const canQuery = enableBilling && !!billingConsoleUrl && !!orgUuid;
  const { data: subscriptions, isLoading: subscriptionsLoading, isError: subscriptionsError } = useSubscriptions(orgUuid, canQuery);
  const { data: limits, isLoading: limitsLoading, isError: limitsError } = useComponentLimits(orgUuid, canQuery);

  const isSubscribed = (subscriptions?.list ?? []).some((s) => s.subscriptionType === PAID_SUBSCRIPTION_TYPE);
  const billable = limits?.billableComponentCount ?? 0;
  const warningThreshold = billable >= FREE_COMPONENT_LIMIT * 0.6;
  const fullQuotaThreshold = billable >= FREE_COMPONENT_LIMIT;

  // Show only for free-tier orgs, once state is known, and only if there's somewhere to
  // upgrade. On a failed subscription/limits fetch, hide rather than fabricate free-tier.
  if (!enableBilling || !billingConsoleUrl || !orgUuid || subscriptionsLoading || limitsLoading || subscriptionsError || limitsError || isSubscribed) return null;

  const color: QuotaColor = fullQuotaThreshold ? 'error' : warningThreshold ? 'warning' : 'primary';
  const openUpgrade = () => window.open(`${billingConsoleUrl}/cloud/devant/upgrade?orgId=${encodeURIComponent(orgUuid)}`, '_blank', 'noopener,noreferrer');
  const openAzure = () => {
    setOpen(false);
    if (saasOfferUrl) window.open(saasOfferUrl, '_blank', 'noopener,noreferrer');
  };

  const tooltip = <QuotaTooltip used={billable} color={color} />;

  if (!saasOfferUrl) {
    return (
      <Tooltip title={tooltip}>
        <Button variant="contained" color={color} size="small" onClick={openUpgrade} sx={{ ml: 0.5 }}>
          Upgrade
        </Button>
      </Tooltip>
    );
  }

  return (
    <>
      <Tooltip title={tooltip}>
        <ButtonGroup ref={anchorRef} variant="contained" color={color} size="small" sx={{ ml: 0.75 }}>
          <Button onClick={openUpgrade}>Upgrade</Button>
          <Button size="small" sx={{ px: 1 }} aria-label="More upgrade options" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((prev) => !prev)}>
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </Button>
        </ButtonGroup>
      </Tooltip>
      <Popper open={open} anchorEl={anchorRef.current} placement="bottom-end" transition disablePortal style={{ zIndex: 1300 }}>
        {({ TransitionProps }) => (
          <Grow {...TransitionProps}>
            <Paper elevation={3}>
              <ClickAwayListener onClickAway={() => setOpen(false)}>
                <MenuList dense sx={{ minWidth: 220 }}>
                  <MenuItem onClick={openAzure}>Upgrade via Azure marketplace</MenuItem>
                </MenuList>
              </ClickAwayListener>
            </Paper>
          </Grow>
        )}
      </Popper>
    </>
  );
}
