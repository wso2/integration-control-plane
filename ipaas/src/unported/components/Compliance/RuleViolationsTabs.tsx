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

import { Box, Card, CardContent, InputAdornment, Skeleton, Stack, Tab, Tabs } from '@wso2/oxygen-ui';
import TextField from '../../../components/common/TextField';
import { AlertTriangle, CheckCircle2, Info, Search, XCircle } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState, type JSX } from 'react';
import type { RuleAdherenceResponse } from '../../../types/governance';
import type { RuleSeverityGroup } from '../../../types/compliance';
import { groupRulesBySeverity } from '../../utils/compliance';
import ComplianceErrorAlert from './ComplianceErrorAlert';
import RuleSeverityTable from './RuleSeverityTable';

interface RuleViolationsTabsProps {
  data?: RuleAdherenceResponse | null;
  isLoading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}

const TABS: { severity: RuleSeverityGroup; label: string; icon: typeof XCircle; color: string }[] = [
  { severity: 'error', label: 'Errors', icon: XCircle, color: 'error.main' },
  { severity: 'warn', label: 'Warnings', icon: AlertTriangle, color: 'warning.main' },
  { severity: 'info', label: 'Info', icon: Info, color: 'info.main' },
  { severity: 'passed', label: 'Passed', icon: CheckCircle2, color: 'success.main' },
];

/** Errors/Warnings/Info/Passed rule detail for one API version. */
export default function RuleViolationsTabs({ data, isLoading, error, onRetry }: RuleViolationsTabsProps): JSX.Element {
  const [search, setSearch] = useState('');
  const [tabIndex, setTabIndex] = useState(0);

  const groups = useMemo(() => groupRulesBySeverity(data?.list ?? [], search), [data, search]);

  if (isLoading) {
    return <Skeleton variant="rounded" height={320} />;
  }

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={1.5}>
          <TextField
            size="small"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            inputProps={{ 'aria-label': 'Search rule violations' }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={16} />
                </InputAdornment>
              ),
            }}
            sx={{ maxWidth: 260 }}
          />
          {error ? (
            <ComplianceErrorAlert message="Failed to load rule details." onRetry={onRetry} />
          ) : (
            <>
              <Tabs value={tabIndex} onChange={(_, idx) => setTabIndex(idx)}>
                {TABS.map((tab, idx) => {
                  const Icon = tab.icon;
                  return (
                    <Tab
                      key={tab.severity}
                      label={`${tab.label} (${groups[idx].rules.length})`}
                      iconPosition="start"
                      icon={
                        <Box component="span" sx={{ color: tab.color, display: 'inline-flex' }}>
                          <Icon size={15} />
                        </Box>
                      }
                    />
                  );
                })}
              </Tabs>
              {groups.map((group, idx) => (
                <Box key={group.severity} role="tabpanel" hidden={tabIndex !== idx}>
                  {tabIndex === idx && <RuleSeverityTable group={group} />}
                </Box>
              ))}
            </>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
