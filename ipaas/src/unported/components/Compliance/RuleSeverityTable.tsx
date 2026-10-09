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

import { Box, Collapse, IconButton, ListingTable, Stack, Typography } from '@wso2/oxygen-ui';
import { ChevronDown } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { EMPTY_RULE_GROUP_MESSAGES, RULE_SEVERITY_LABELS } from '../../constants/compliance';
import type { ComplianceRuleGroup, ComplianceRuleHit } from '../../../types/compliance';
import { formatRuleMessage } from '../../utils/compliance';
import ComplianceEmptyState from './ComplianceEmptyState';

interface RuleSeverityTableProps {
  group: ComplianceRuleGroup;
}

/** One severity tab's content: rules grouped per ruleset, violated rows expandable into their path details. */
export default function RuleSeverityTable({ group }: RuleSeverityTableProps): JSX.Element {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const isPassed = group.severity === 'passed';

  if (group.rules.length === 0) {
    return <ComplianceEmptyState message={EMPTY_RULE_GROUP_MESSAGES[group.severity]} />;
  }

  const byRuleset = new Map<string, ComplianceRuleHit[]>();
  for (const hit of group.rules) {
    const bucket = byRuleset.get(hit.rulesetName) ?? [];
    bucket.push(hit);
    byRuleset.set(hit.rulesetName, bucket);
  }

  return (
    <Stack spacing={2} sx={{ py: 1.5 }}>
      {[...byRuleset.entries()].map(([rulesetName, hits]) => (
        <Box key={rulesetName}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            {rulesetName}
          </Typography>
          <Box sx={{ overflowX: 'auto' }}>
            <ListingTable size="small">
              <ListingTable.Head>
                <ListingTable.Row>
                  <ListingTable.Cell>Rule</ListingTable.Cell>
                  <ListingTable.Cell>Issue</ListingTable.Cell>
                  <ListingTable.Cell>{isPassed ? 'Severity' : 'Paths'}</ListingTable.Cell>
                </ListingTable.Row>
              </ListingTable.Head>
              <ListingTable.Body>
                {hits.map(({ rule }) => {
                  const pathDetails = rule.pathDetails?.list ?? [];
                  const expandKey = `${rulesetName}-${rule.ruleId}`;
                  const isOpen = pathDetails.length > 0 && !!expanded[expandKey];
                  return [
                    <ListingTable.Row key={expandKey}>
                      <ListingTable.Cell>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          {pathDetails.length > 0 && (
                            <IconButton size="small" aria-label={`Expand rule ${rule.ruleName}`} onClick={() => setExpanded((prev) => ({ ...prev, [expandKey]: !prev[expandKey] }))}>
                              <ChevronDown size={16} style={{ transform: isOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }} />
                            </IconButton>
                          )}
                          <Typography variant="body2" noWrap>
                            {rule.ruleName}
                          </Typography>
                        </Stack>
                      </ListingTable.Cell>
                      <ListingTable.Cell>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 320 }}>
                          {formatRuleMessage(rule.message)}
                        </Typography>
                      </ListingTable.Cell>
                      <ListingTable.Cell>
                        {isPassed ? (
                          <Typography variant="body2">{RULE_SEVERITY_LABELS[rule.severity] ?? rule.severity}</Typography>
                        ) : (
                          <Typography variant="body2" noWrap sx={{ maxWidth: 320 }}>
                            {pathDetails.map((p) => p.path).join(', ')}
                          </Typography>
                        )}
                      </ListingTable.Cell>
                    </ListingTable.Row>,
                    pathDetails.length > 0 && (
                      <ListingTable.Row key={`${expandKey}-detail`}>
                        <ListingTable.Cell colSpan={3} sx={{ py: 0, border: isOpen ? undefined : 0 }}>
                          <Collapse in={isOpen} unmountOnExit>
                            <Stack spacing={1} sx={{ py: 1 }}>
                              {pathDetails.map((pathDetail, j) => (
                                <Box key={j}>
                                  <Typography variant="caption" component="div" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                                    {pathDetail.path}
                                  </Typography>
                                  <Typography variant="body2" color="text.secondary">
                                    {pathDetail.message}
                                  </Typography>
                                </Box>
                              ))}
                            </Stack>
                          </Collapse>
                        </ListingTable.Cell>
                      </ListingTable.Row>
                    ),
                  ];
                })}
              </ListingTable.Body>
            </ListingTable>
          </Box>
        </Box>
      ))}
    </Stack>
  );
}
