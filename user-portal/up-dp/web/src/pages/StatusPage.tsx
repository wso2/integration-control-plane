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
import { TriangleAlert } from '@wso2/oxygen-ui-icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from '../i18n';
import Logo from '../components/Logo';

/** A full-page message outside the shell: a session that would not start, or one that ended. */
export default function StatusPage({ title, description, actions }: { title: string; description: ReactNode; actions?: ReactNode }) {
  return (
    <Stack alignItems="center" justifyContent="center" gap={2} sx={{ minHeight: '100vh', px: 3, textAlign: 'center', bgcolor: 'background.default' }}>
      <Box sx={{ mb: 2 }}>
        <Logo />
      </Box>
      <Box sx={{ color: 'warning.main' }}>
        <TriangleAlert size={40} strokeWidth={1.5} />
      </Box>
      <Typography variant="h5" component="h1">
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 520 }}>
        {description}
      </Typography>
      {actions && (
        <Stack direction="row" gap={1.5} sx={{ mt: 1 }}>
          {actions}
        </Stack>
      )}
    </Stack>
  );
}

/** The page while a session starts or ends: only the background, since most end in a redirect within moments. */
export function Splash() {
  const { t } = useTranslation();
  return <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }} aria-busy="true" aria-label={t('shell.signingIn')} />;
}
