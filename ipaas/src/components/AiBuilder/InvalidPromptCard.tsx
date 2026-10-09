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

import { Button, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import type { InvalidPromptResponse } from '../../types/aiBuilder';
import { ResponseCard } from './ResponseCard';
import { renderBold } from './renderBold';

interface InvalidPromptCardProps {
  response: InvalidPromptResponse;
  onGoBack: () => void;
}

export function InvalidPromptCard({ response, onGoBack }: InvalidPromptCardProps): JSX.Element {
  return (
    <ResponseCard
      actions={
        <Button variant="contained" color="primary" size="small" onClick={onGoBack}>
          Try Again
        </Button>
      }>
      <Typography variant="body2" sx={{ mb: 2 }}>
        {response.message && renderBold(response.message)}
      </Typography>
    </ResponseCard>
  );
}
