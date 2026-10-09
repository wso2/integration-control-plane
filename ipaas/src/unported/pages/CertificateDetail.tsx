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

import { Alert, Box, Button, Chip, CircularProgress, PageContent, PageTitle, Stack, Tab, Tabs, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { useParams } from 'react-router';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useConfigGroup } from '../hooks/useConfigGroups';
import { certificateValidity, certificateTypeLabel, formatCertificateDate } from '../utils/certificates';
import { orgCertificatesUrl } from '../../paths';
import type { OrgScope } from '../../nav';
import CertificateUsageView from '../components/Certificates/CertificateUsageView';

export default function CertificateDetail(scope: OrgScope): JSX.Element {
  const navigate = useAppNavigate();
  const { certificateId = '' } = useParams();
  const [tab, setTab] = useState<'metadata' | 'usage'>('metadata');

  const { data: group, isLoading, isError } = useConfigGroup(certificateId);

  if (isLoading) {
    return (
      <PageContent>
        <CircularProgress sx={{ display: 'block', mx: 'auto', py: 8 }} />
      </PageContent>
    );
  }

  if (isError || !group) {
    return (
      <PageContent>
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => navigate(orgCertificatesUrl(scope.org))}>
              Back
            </Button>
          }>
          Couldn&apos;t load this certificate.
        </Alert>
      </PageContent>
    );
  }

  const name = group.groupDisplayName ?? group.groupName;
  const v = certificateValidity(group.properties?.notAfter);
  const p = group.properties ?? {};

  return (
    <PageContent>
      <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate(orgCertificatesUrl(scope.org))} sx={{ mb: 2 }}>
        Certificates
      </Button>

      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={2} sx={{ mb: 3 }}>
        <Stack gap={1}>
          <PageTitle sx={{ mb: 0 }}>
            <PageTitle.Header>{name}</PageTitle.Header>
          </PageTitle>
          {group.description && (
            <Typography variant="body2" color="text.secondary">
              {group.description}
            </Typography>
          )}
        </Stack>
        <Stack direction="row" gap={1}>
          <Chip size="small" variant="outlined" label={v.label} color={v.color} />
          <Chip size="small" variant="outlined" label={certificateTypeLabel(group.properties?.certificateType)} />
        </Stack>
      </Stack>

      <Tabs value={tab} onChange={(_, v) => setTab(v as 'metadata' | 'usage')} sx={{ borderBottom: '1px solid', borderColor: 'divider', mb: 3 }}>
        <Tab label="Metadata" value="metadata" />
        <Tab label="Usage" value="usage" />
      </Tabs>

      {tab === 'metadata' ? (
        <Stack gap={3}>
          {/* Issued To */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
              Issued To
            </Typography>
            <Stack gap={1}>
              <Stack direction="row" gap={3}>
                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 200 }}>
                  Common Name (CN)
                </Typography>
                <Typography variant="body2">
                  {p.subjectCN || p.subject ? (
                    <>{p.subjectCN || p.subject}</>
                  ) : (
                    <Typography variant="body2" component="span" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                      Not part of certificate
                    </Typography>
                  )}
                </Typography>
              </Stack>
              <Stack direction="row" gap={3}>
                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 200 }}>
                  Organization (O)
                </Typography>
                <Typography variant="body2">
                  {p.subjectO ? (
                    <>{p.subjectO}</>
                  ) : (
                    <Typography variant="body2" component="span" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                      Not part of certificate
                    </Typography>
                  )}
                </Typography>
              </Stack>
              <Stack direction="row" gap={3}>
                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 200 }}>
                  Organizational Unit (OU)
                </Typography>
                <Typography variant="body2">
                  {p.subjectOU ? (
                    <>{p.subjectOU}</>
                  ) : (
                    <Typography variant="body2" component="span" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                      Not part of certificate
                    </Typography>
                  )}
                </Typography>
              </Stack>
            </Stack>
          </Box>

          {/* Issued By */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
              Issued By
            </Typography>
            <Stack gap={1}>
              <Stack direction="row" gap={3}>
                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 200 }}>
                  Common Name (CN)
                </Typography>
                <Typography variant="body2">
                  {p.issuerCN || p.issuer ? (
                    <>{p.issuerCN || p.issuer}</>
                  ) : (
                    <Typography variant="body2" component="span" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                      Not part of certificate
                    </Typography>
                  )}
                </Typography>
              </Stack>
              <Stack direction="row" gap={3}>
                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 200 }}>
                  Organization (O)
                </Typography>
                <Typography variant="body2">
                  {p.issuerO ? (
                    <>{p.issuerO}</>
                  ) : (
                    <Typography variant="body2" component="span" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                      Not part of certificate
                    </Typography>
                  )}
                </Typography>
              </Stack>
              <Stack direction="row" gap={3}>
                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 200 }}>
                  Organizational Unit (OU)
                </Typography>
                <Typography variant="body2">
                  {p.issuerOU ? (
                    <>{p.issuerOU}</>
                  ) : (
                    <Typography variant="body2" component="span" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                      Not part of certificate
                    </Typography>
                  )}
                </Typography>
              </Stack>
            </Stack>
          </Box>

          {/* Validity Period */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
              Validity Period
            </Typography>
            <Stack gap={1}>
              <Stack direction="row" gap={3}>
                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 200 }}>
                  Issued On
                </Typography>
                <Typography variant="body2">
                  {formatCertificateDate(p.notBefore) ? (
                    <>{formatCertificateDate(p.notBefore)}</>
                  ) : (
                    <Typography variant="body2" component="span" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                      Not part of certificate
                    </Typography>
                  )}
                </Typography>
              </Stack>
              <Stack direction="row" gap={3}>
                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 200 }}>
                  Expires On
                </Typography>
                <Typography variant="body2">
                  {formatCertificateDate(p.notAfter) ? (
                    <>{formatCertificateDate(p.notAfter)}</>
                  ) : (
                    <Typography variant="body2" component="span" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                      Not part of certificate
                    </Typography>
                  )}
                </Typography>
              </Stack>
            </Stack>
          </Box>

          {/* Fingerprints */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
              Fingerprints
            </Typography>
            <Stack gap={1}>
              <Stack direction="row" gap={3}>
                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 200 }}>
                  SHA-1
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {p.sha1 ? (
                    <>{p.sha1}</>
                  ) : (
                    <Typography variant="body2" component="span" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                      Not part of certificate
                    </Typography>
                  )}
                </Typography>
              </Stack>
              <Stack direction="row" gap={3}>
                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 200 }}>
                  SHA-256
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {p.sha256 ? (
                    <>{p.sha256}</>
                  ) : (
                    <Typography variant="body2" component="span" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                      Not part of certificate
                    </Typography>
                  )}
                </Typography>
              </Stack>
              <Stack direction="row" gap={3}>
                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 200 }}>
                  Signature Algorithm
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {p.sigAlgName ? (
                    <>{p.sigAlgName}</>
                  ) : (
                    <Typography variant="body2" component="span" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                      Not part of certificate
                    </Typography>
                  )}
                </Typography>
              </Stack>
            </Stack>
          </Box>
        </Stack>
      ) : (
        <CertificateUsageView certificateId={certificateId} active={tab === 'usage'} />
      )}
    </PageContent>
  );
}
