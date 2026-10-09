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

import { ButtonBase, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import type { QueryData } from '../../../types/copilot';

interface CopilotSampleQueryCardProps {
  queryData: QueryData;
  onExecuteClick: (query: string) => void;
  disabled: boolean;
}

export default function CopilotSampleQueryCard({ queryData, onExecuteClick, disabled }: CopilotSampleQueryCardProps): JSX.Element {
  const { query, description } = queryData;

  return (
    <ButtonBase
      onClick={() => onExecuteClick(query)}
      disabled={disabled}
      sx={{
        border: '1px solid',
        borderColor: 'primary.main',
        borderRadius: 1,
        p: 1.5,
        alignItems: 'flex-start',
        opacity: disabled ? 0.5 : 1,
        width: 'fit-content',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        textAlign: 'left',
        transition: 'border-color 0.15s, background-color 0.15s',
        '&:hover:not(.Mui-disabled)': {
          borderColor: 'primary.main',
          backgroundColor: 'action.hover',
        },
      }}>
      <Typography variant="body2" fontWeight={500} gutterBottom>
        {query}
      </Typography>
      {description && (
        <Typography variant="caption" color="text.secondary">
          {description}
        </Typography>
      )}
    </ButtonBase>
  );
}
