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

import { Box, Stack, Typography } from '@wso2/oxygen-ui';
import { Fragment, useMemo, type ReactNode } from 'react';
import type { EnvTemplate, PromotionTreeNode } from '../../types/deploymentPipeline';
import { flattenPromotionTree } from '../../utils/deploymentPipeline';
import PipelineEnvNode from './PipelineEnvNode';

interface PromotionPathProps {
  tree: PromotionTreeNode;
  /** Optional env templates used to enrich each box with its region + critical flag. */
  envTemplates?: EnvTemplate[];
}

/**
 * A promotion arrow: a rule into a solid head. Drawn inline rather than with an icon so the
 * head matches the line weight exactly — an icon glyph sits at its own optical size.
 */
function PromotionConnector(): ReactNode {
  return (
    <Box aria-hidden sx={{ flexShrink: 0, color: 'text.disabled', display: 'flex', alignItems: 'center', px: 0.5 }}>
      <svg width="34" height="10" viewBox="0 0 34 10" fill="none" aria-hidden>
        <path d="M0 5h26" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M26 1.5 33 5l-7 3.5z" fill="currentColor" />
      </svg>
    </Box>
  );
}

/** Read-only view of a pipeline's promotion order, as env boxes joined by arrows. */
export default function PromotionPath({ tree, envTemplates }: PromotionPathProps): ReactNode {
  const byId = useMemo(() => new Map((envTemplates ?? []).map((t) => [t.id, t])), [envTemplates]);
  const envs = flattenPromotionTree(tree);

  if (envs.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No environments
      </Typography>
    );
  }

  return (
    <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap" sx={{ py: 0.5 }}>
      {envs.map((env, index) => {
        const template = byId.get(env.envTemplateId);
        return (
          <Fragment key={`${env.envTemplateId}-${index}`}>
            {index > 0 && <PromotionConnector />}
            <PipelineEnvNode name={env.envName} region={template?.region} critical={template?.critical} />
          </Fragment>
        );
      })}
    </Stack>
  );
}
