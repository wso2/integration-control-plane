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

import { Accordion, AccordionDetails, AccordionSummary, Chip, Stack, Typography } from '@wso2/oxygen-ui';
import { ChevronDown } from '@wso2/oxygen-ui-icons-react';
import type { ReactNode } from 'react';
import type { EnvTemplate, PromotionTreeNode } from '../../types/deploymentPipeline';
import PromotionPath from './PromotionPath';

interface PipelineAccordionCardProps {
  name: string;
  /** Shows the "Default" chip and expands the card on first render. */
  isDefault: boolean;
  tree: PromotionTreeNode;
  /** Env templates used to enrich each promotion box with its region + critical flag. */
  envTemplates?: EnvTemplate[];
  /** Right-aligned action controls (their click handlers must stop propagation). */
  actions: ReactNode;
}

/**
 * A pipeline as a collapsible card: name + Default chip + actions in the header,
 * the promotion path in the body. Shared by the org and project pipeline pages.
 */
export default function PipelineAccordionCard({ name, isDefault, tree, envTemplates, actions }: PipelineAccordionCardProps): ReactNode {
  return (
    <Accordion defaultExpanded={isDefault} disableGutters sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden', '&:before': { display: 'none' } }}>
      <AccordionSummary expandIcon={<ChevronDown size={18} />} sx={{ bgcolor: 'action.hover' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ width: '100%', pr: 1 }}>
          <Stack direction="row" alignItems="center" gap={1}>
            <Typography sx={{ fontWeight: 600 }}>{name}</Typography>
            {isDefault && <Chip label="Default" size="small" color="primary" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />}
          </Stack>
          <Stack direction="row" alignItems="center" gap={0.5}>
            {actions}
          </Stack>
        </Stack>
      </AccordionSummary>
      {/* MUI defaults this to 8px 16px 16px; even padding reads better around the chain. */}
      <AccordionDetails sx={{ p: 2 }}>
        <PromotionPath tree={tree} envTemplates={envTemplates} />
      </AccordionDetails>
    </Accordion>
  );
}
