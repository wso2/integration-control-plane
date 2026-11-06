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

import { Box, Button, Card, Chip, Grid, PageContent, Stack, Typography } from '@wso2/oxygen-ui';
import { ChevronRight } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import ballerinaIcon from '../assets/icons/packageRegistries/ballerina.svg';
import BallerinaCentralPanel from '../components/Settings/PackageRegistries/BallerinaCentralPanel';
import OrgSettingsTabs from '../components/Settings/OrgConfigureTabs';
import { BALLERINA_CENTRAL_ID, PACKAGE_REGISTRIES } from '../constants/packageRegistries';
import { useBallerinaCentralToken } from '../hooks/useBallerinaCentralToken';
import type { PackageRegistryCatalogEntry } from '../types/packageRegistries';
import type { OrgScope } from '../nav';

const SERVICE_ICONS: Record<PackageRegistryCatalogEntry['iconType'], string> = {
  ballerina: ballerinaIcon,
};

type View = { kind: 'list' } | { kind: 'ballerina-central' };

export default function OrgPackageRegistries(_scope: OrgScope): JSX.Element {
  const { data: tokenStatus } = useBallerinaCentralToken();
  const [view, setView] = useState<View>({ kind: 'list' });

  return (
    <PageContent fullWidth>
      <OrgSettingsTabs active="package-registries" />

      {view.kind === 'ballerina-central' ? (
        <BallerinaCentralPanel onBack={() => setView({ kind: 'list' })} />
      ) : (
        <>
          <Grid container spacing={3}>
            {PACKAGE_REGISTRIES.map((service) => {
              // Unknown when the role can't read the token, so no chip then.
              const connected = service.id === BALLERINA_CENTRAL_ID ? tokenStatus?.configured : false;

              return (
                <Grid key={service.id} size={{ xs: 12, sm: 6, md: 4 }}>
                  <Card sx={{ height: '100%', borderRadius: 2, p: 3 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
                      <Box component="img" src={SERVICE_ICONS[service.iconType]} alt={service.name} sx={{ width: 48, height: 48, flexShrink: 0, objectFit: 'contain' }} />
                      {connected !== undefined && <Chip size="small" variant="outlined" color={connected ? 'success' : 'default'} label={connected ? 'Connected' : 'Not connected'} />}
                    </Stack>
                    <Typography variant="body1" sx={{ fontWeight: 700, mb: 0.5 }}>
                      {service.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
                      {service.description}
                    </Typography>
                    <Button variant="contained" endIcon={<ChevronRight size={16} />} onClick={() => setView({ kind: 'ballerina-central' })}>
                      Connect
                    </Button>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </>
      )}
    </PageContent>
  );
}
