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

import { Avatar, Button, ButtonGroup, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Network } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { useOrgUuid } from '../../../hooks/useOrgUuid';

/** Organization identity header (avatar + name + Copy ID / Copy Handle), shown atop Access Control. */
export default function OrgInfoHeader({ orgHandler }: { orgHandler: string }): JSX.Element {
  const orgUuid = useOrgUuid();
  const [copied, setCopied] = useState<'id' | 'handle' | null>(null);

  const copy = (value: string, which: 'id' | 'handle') =>
    navigator.clipboard.writeText(value).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    });

  return (
    <Stack direction="row" alignItems="center" gap={2} sx={{ mb: 3 }}>
      <Avatar sx={{ width: 72, height: 72, bgcolor: 'action.hover', color: 'primary.main' }}>
        <Network size={36} />
      </Avatar>
      <Typography variant="h6" sx={{ fontWeight: 600 }}>
        {orgHandler}
      </Typography>
      <ButtonGroup variant="outlined" size="small" sx={{ '& .MuiButton-root': { textTransform: 'none', fontSize: '0.7rem', py: 0.25 } }}>
        <Tooltip title={copied === 'id' ? 'Copied' : ''}>
          <span>
            <Button onClick={() => orgUuid && copy(orgUuid, 'id')} disabled={!orgUuid}>
              Copy ID
            </Button>
          </span>
        </Tooltip>
        <Tooltip title={copied === 'handle' ? 'Copied' : ''}>
          <Button onClick={() => copy(orgHandler, 'handle')}>Copy handle</Button>
        </Tooltip>
      </ButtonGroup>
    </Stack>
  );
}
