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

import { Alert, Box, Button, Stack, Typography } from '@wso2/oxygen-ui';
import { Database, Plus } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';

interface NoDatabaseServersBannerProps {
  createAllowed: boolean;
  upgradeRequired: boolean;
  /** Headline copy — differs between the Databases and Vector Databases pages. */
  headline: string;
  /** Body copy shown when nothing has been created yet — differs per page. */
  body: string;
  onCreate: () => void;
}

/**
 * Empty state for the Databases page — a centered marketing banner. Mirrors Devant's
 * NoCloudStorageServicesBanner (generic DB icon in place of the engine logos).
 */
export default function NoDatabaseServersBanner({ createAllowed, upgradeRequired, headline, body, onCreate }: NoDatabaseServersBannerProps): JSX.Element {
  return (
    <Stack alignItems="center" textAlign="center" sx={{ maxWidth: 720, mx: 'auto', pb: 6 }}>
      <Box sx={{ width: 96, height: 96, borderRadius: '50%', bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3, color: 'text.secondary' }}>
        <Database size={44} />
      </Box>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: upgradeRequired ? 2 : 1 }}>
        {headline}
      </Typography>
      {upgradeRequired ? (
        <Alert severity="warning" sx={{ textAlign: 'left' }}>
          Please upgrade your WSO2 Integration Platform subscription to create more database services.
        </Alert>
      ) : (
        <Typography variant="body2" color="text.secondary">
          {body}
        </Typography>
      )}
      {createAllowed && (
        <Button variant="contained" startIcon={<Plus size={20} />} onClick={onCreate} sx={{ mt: 3 }}>
          Create
        </Button>
      )}
    </Stack>
  );
}
