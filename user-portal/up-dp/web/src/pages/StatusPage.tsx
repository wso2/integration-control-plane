/*
 * Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com). All Rights Reserved.
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein is strictly forbidden, unless permitted by WSO2 in accordance with
 * the WSO2 Commercial License available at http://wso2.com/licenses.
 * For specific language governing the permissions and limitations under
 * this license, please see the license as well as any agreement you've
 * entered into with WSO2 governing the purchase of this software and any
 * associated services.
 */

import { Box, Stack, Typography } from '@wso2/oxygen-ui';
import { TriangleAlert } from '@wso2/oxygen-ui-icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
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
