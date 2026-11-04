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

import { Button, PageContent, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft } from '@wso2/oxygen-ui-icons-react';
import { Link } from 'react-router';

interface NotFoundProps {
  message: string;
  backTo: string;
  backLabel?: string;
}

export default function NotFound({ message, backTo, backLabel = 'Back' }: NotFoundProps) {
  return (
    <PageContent fullWidth component="main" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', minHeight: '100%', gap: 3 }}>
      <Typography variant="h6" component="h1">
        {message}
      </Typography>
      <Button variant="outlined" component={Link} to={backTo} startIcon={<ArrowLeft size={18} />}>
        {backLabel}
      </Button>
    </PageContent>
  );
}
