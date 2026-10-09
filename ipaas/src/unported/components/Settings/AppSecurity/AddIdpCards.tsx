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

import { Box, Button, Stack, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import IdpLogo from './IdpLogo';
import { IDP_TYPE_LABEL } from './idpTypes';

const TYPES = ['Asgardeo', 'Microsoft', 'Custom'];
const SUBTITLE: Record<string, string> = { Microsoft: 'Azure AD' };

/** The identity-provider type picker shown when adding a new IdP. */
export default function AddIdpCards({ onSelect, onBack }: { onSelect: (type: string) => void; onBack: () => void }): JSX.Element {
  return (
    <>
      <Button startIcon={<ArrowLeft size={16} />} onClick={onBack} sx={{ textTransform: 'none', mb: 1 }}>
        Back to Identity Providers list
      </Button>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Any of the below providers can be configured to authenticate your WSO2 Integration Platform APIs
      </Typography>
      <Stack direction="row" gap={2} flexWrap="wrap">
        {TYPES.map((type) => (
          <Box
            key={type}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(type)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(type);
              }
            }}
            sx={{
              width: 220,
              height: 170,
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1.5,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              cursor: 'pointer',
              transition: 'border-color 0.15s, box-shadow 0.15s',
              '&:hover': { borderColor: 'primary.main', boxShadow: 1 },
            }}>
            <IdpLogo type={type} height={56} variant="icon" />
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {IDP_TYPE_LABEL[type]}
              </Typography>
              {SUBTITLE[type] && (
                <Typography variant="caption" color="text.secondary">
                  ({SUBTITLE[type]})
                </Typography>
              )}
            </Box>
          </Box>
        ))}
      </Stack>
    </>
  );
}
