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

import { Box, Button, Chip, Menu, MenuItem, Stack, Typography } from '@wso2/oxygen-ui';
import { ArrowRight, Plus } from '@wso2/oxygen-ui-icons-react';
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import type { EnvTemplate } from '../../types/deploymentPipeline';
import PipelineEnvNode from './PipelineEnvNode';

interface PromotionChainBuilderProps {
  /** All org environment templates available to add. */
  envTemplates: EnvTemplate[];
  /** The ordered promotion chain (env[0] → env[1] → …). */
  value: EnvTemplate[];
  onChange: (envs: EnvTemplate[]) => void;
  disabled?: boolean;
}

/**
 * Editor for a linear promotion chain. Environments appear as boxes joined by
 * arrows; the trailing "Add environment" button reveals the remaining templates
 * and appends the chosen one — so the chain grows step by step. Fully controlled.
 */
export default function PromotionChainBuilder({ envTemplates, value, onChange, disabled }: PromotionChainBuilderProps): ReactNode {
  const available = useMemo(() => envTemplates.filter((t) => !value.some((v) => v.id === t.id)), [envTemplates, value]);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const addEnv = (env: EnvTemplate) => {
    onChange([...value, env]);
    setAnchor(null);
  };
  const removeAt = (index: number) => onChange(value.filter((_, i) => i !== index));

  return (
    <Stack gap={1}>
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'action.hover', p: 4 }}>
        <Stack direction="row" alignItems="center" gap={1.5} flexWrap="wrap">
          {value.map((env, index) => (
            <Fragment key={env.id}>
              {index > 0 && <ArrowRight size={18} style={{ opacity: 0.4, flexShrink: 0 }} />}
              <PipelineEnvNode name={env.env_name} region={env.region} critical={env.critical} onRemove={() => removeAt(index)} disabled={disabled} />
            </Fragment>
          ))}

          {available.length > 0 && (
            <>
              {value.length > 0 && <ArrowRight size={18} style={{ opacity: 0.4, flexShrink: 0 }} />}
              <Button variant="outlined" startIcon={<Plus size={16} />} disabled={disabled} onClick={(e) => setAnchor(e.currentTarget)} sx={{ borderStyle: 'dashed', textTransform: 'none', minHeight: 56, px: 2 }}>
                Add environment
              </Button>
              <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
                {available.map((t) => (
                  <MenuItem key={t.id} onClick={() => addEnv(t)}>
                    <Stack direction="row" alignItems="center" gap={1}>
                      {t.env_name}
                      {t.critical && <Chip label="Critical" size="small" color="error" variant="outlined" sx={{ height: 18, fontSize: '0.6rem' }} />}
                    </Stack>
                  </MenuItem>
                ))}
              </Menu>
            </>
          )}
        </Stack>
      </Box>
      <Typography variant="caption" color="text.secondary">
        Add environments in the order they should be promoted.
      </Typography>
    </Stack>
  );
}
