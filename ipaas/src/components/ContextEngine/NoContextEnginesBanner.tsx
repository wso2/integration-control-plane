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

import { Box, Button, Grid, Stack, Typography } from '@wso2/oxygen-ui';
import { Braces, Plug, Plus, ShieldCheck, Waypoints } from '@wso2/oxygen-ui-icons-react';
import type { JSX, ReactNode } from 'react';

const featureSx = {
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 1,
  p: 2,
  height: '100%',
  display: 'flex',
  gap: 1.5,
  alignItems: 'flex-start',
} as const;

const featureIconSx = { color: 'primary.main', mt: 0.25, flexShrink: 0 } as const;

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }): JSX.Element {
  return (
    <Box sx={featureSx}>
      <Box sx={featureIconSx}>{icon}</Box>
      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {text}
        </Typography>
      </Box>
    </Box>
  );
}

/** Empty-state hero for the Context Engines page, in the style of the other org admin banners. */
export default function NoContextEnginesBanner({ onCreate }: { onCreate: () => void }): JSX.Element {
  return (
    <Stack gap={4} sx={{ pb: 6, maxWidth: 960 }}>
      <Stack gap={1.5} sx={{ maxWidth: 560 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Give your integrations grounded context
        </Typography>
        <Typography variant="body2" color="text.secondary">
          A Context Engine builds a governed knowledge graph from the sources you choose. Selected roles can ask it questions in natural language, and you can publish it as an API or an MCP server for your agents.
        </Typography>
        <Box>
          <Button variant="contained" startIcon={<Plus size={20} />} onClick={onCreate} sx={{ mt: 1 }}>
            Create Context Engine
          </Button>
        </Box>
      </Stack>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Feature icon={<Waypoints size={20} />} title="Choose sources" text="Drive, S3, SharePoint, Confluence, GitHub, websites or uploads." />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Feature icon={<ShieldCheck size={20} />} title="Grant access" text="Pick the org roles that may query; evidence is access-checked on every read." />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Feature icon={<Braces size={20} />} title="Expose as API" text="Ask questions over REST with source-linked evidence." />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Feature icon={<Plug size={20} />} title="Expose as MCP" text="Let agents call query, evidence and explain tools." />
        </Grid>
      </Grid>
    </Stack>
  );
}
