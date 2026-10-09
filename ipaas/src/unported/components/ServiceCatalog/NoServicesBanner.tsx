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
import { Plus } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';

interface NoServicesBannerProps {
  title: string;
  description: string;
  /** Illustration path (under the app base URL). */
  bannerSrc: string;
  ctaLabel?: string;
  onCreate: () => void;
}

/** Empty-state hero for a service-catalog list (GenAI / Third Party). Mirrors Devant's NoServiceBanner. */
export default function NoServicesBanner({ title, description, bannerSrc, ctaLabel = 'Register Service', onCreate }: NoServicesBannerProps): JSX.Element {
  return (
    <Stack direction={{ xs: 'column', md: 'row' }} alignItems="center" justifyContent="space-between" gap={5} sx={{ pb: 6 }}>
      <Stack gap={1.5} sx={{ maxWidth: 520, flexShrink: 0 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {description}
        </Typography>
        <Box>
          <Button variant="contained" startIcon={<Plus size={20} />} onClick={onCreate} sx={{ mt: 1 }}>
            {ctaLabel}
          </Button>
        </Box>
      </Stack>
      <Box component="img" src={bannerSrc} alt="" sx={{ width: '100%', maxWidth: 720, height: 'auto' }} />
    </Stack>
  );
}
