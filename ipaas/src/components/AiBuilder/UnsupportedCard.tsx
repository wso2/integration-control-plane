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

import { Box, Button, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import type { UnsupportedResponse } from '../../types/aiBuilder';
import { ResponseCard } from './ResponseCard';
import { renderBold } from './renderBold';

export function UnsupportedCard({ response, onTryAgain }: { response: UnsupportedResponse; onTryAgain: () => void }): JSX.Element {
  return (
    <ResponseCard
      actions={
        <Button variant="contained" color="primary" size="small" onClick={onTryAgain}>
          Try again
        </Button>
      }>
      <Typography variant="body2" sx={{ mb: 1.5 }}>
        {response.message && renderBold(response.message)}
      </Typography>
      {response.unsupportedServices && response.unsupportedServices.length > 0 && (
        <Box sx={{ mb: 1.5 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
            Unsupported services:
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {response.unsupportedServices.map((service) => (
              <Typography key={service} variant="caption" sx={{ px: 1, py: 0.5, bgcolor: 'action.hover', borderRadius: 1 }}>
                {service}
              </Typography>
            ))}
          </Box>
        </Box>
      )}
    </ResponseCard>
  );
}
