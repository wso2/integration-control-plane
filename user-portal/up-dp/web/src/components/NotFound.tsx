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

import { Button, PageContent, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft } from '@wso2/oxygen-ui-icons-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

export default function NotFound({ message, backTo, backLabel }: { message: string; backTo: string; backLabel?: string }) {
  const { t } = useTranslation();
  return (
    <PageContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', minHeight: '100%', gap: 3 }}>
      <Typography variant="h6" component="h1">
        {message}
      </Typography>
      <Button variant="outlined" component={Link} to={backTo} startIcon={<ArrowLeft size={18} />}>
        {backLabel ?? t('common.actions.back')}
      </Button>
    </PageContent>
  );
}
