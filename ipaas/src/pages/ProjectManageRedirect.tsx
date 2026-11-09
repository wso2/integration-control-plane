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

import { useEffect, type JSX } from 'react';
import { Button, CircularProgress, PageContent, Stack, Typography } from '@wso2/oxygen-ui';
import type { ProjectScope } from '../nav';
import { cloudConsoleProjectManageUrl } from '../paths';

const waitingSx = { py: 8 } as const;

/** Projects are edited in the WSO2 Cloud console; the old in-console edit URL forwards there. */
export default function ProjectManageRedirect({ project }: ProjectScope): JSX.Element {
  const url = cloudConsoleProjectManageUrl(project);
  useEffect(() => window.location.replace(url), [url]);
  return (
    <PageContent fullWidth>
      <Stack alignItems="center" spacing={2} sx={waitingSx}>
        <CircularProgress size={24} />
        <Typography>Opening the WSO2 Cloud console…</Typography>
        <Button variant="outlined" href={url}>
          Open project settings
        </Button>
      </Stack>
    </PageContent>
  );
}
