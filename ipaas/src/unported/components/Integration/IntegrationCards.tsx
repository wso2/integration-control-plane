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

import { Box, Button, Card, Chip, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import IntegratorIcon from '../../../assets/icons/IntegratorIcon';

const INTEGRATOR_DOWNLOAD_URL = 'https://wso2.com/products/downloads/?product=wso2integrator';

function CardIcon() {
  return <IntegratorIcon width={48} height={48} style={{ color: '#e05c1b', flexShrink: 0 }} />;
}

interface StepItemProps {
  number: number;
  children: React.ReactNode;
}

function StepItem({ number, children }: StepItemProps) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
      <Box
        sx={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          bgcolor: 'action.hover',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          mt: 0.1,
        }}>
        <Typography variant="caption" sx={{ fontWeight: 600, lineHeight: 1 }}>
          {number}
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
        {children}
      </Typography>
    </Box>
  );
}

interface CloudEditorCardProps {
  disabled?: boolean;
  onOpenInCloud: () => void;
}

export function CloudEditorCard({ disabled, onOpenInCloud }: CloudEditorCardProps): JSX.Element {
  return (
    <Card variant="outlined" sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <CardIcon />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="h4" sx={{ fontWeight: 600 }}>
            Cloud Editor
          </Typography>
          <Chip label="Beta" size="small" variant="outlined" sx={{ borderRadius: 1, height: 20, fontSize: '0.7rem' }} />
        </Box>
      </Box>

      <Typography variant="body2" sx={{ fontWeight: 500 }}>
        Begin developing your integrations directly in the cloud editor.
      </Typography>

      <Button variant="contained" color="primary" fullWidth onClick={onOpenInCloud} disabled={disabled} startIcon={<IntegratorIcon width={18} height={18} style={{ color: 'currentColor' }} />}>
        Start Developing in Cloud
      </Button>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <StepItem number={1}>Open WSO2 Integration Platform&apos;s browser-based editor to start developing your integration.</StepItem>
        <StepItem number={2}>Click &apos;Save and Deploy&apos; to push your code to the remote repository, and deploy your integration.</StepItem>
        <StepItem number={3}>Test your integration and promote it to production.</StepItem>
      </Box>
    </Card>
  );
}

interface IntegratorIDECardProps {
  onOpenInIntegrator: () => void;
}

export function IntegratorIDECard({ onOpenInIntegrator }: IntegratorIDECardProps): JSX.Element {
  return (
    <Card variant="outlined" sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <CardIcon />
        <Typography variant="h4" sx={{ fontWeight: 600 }}>
          WSO2 Integrator IDE
        </Typography>
      </Box>

      <Typography variant="body2" sx={{ fontWeight: 500 }}>
        Use WSO2 Integrator locally and push to cloud.
      </Typography>

      <Button variant="outlined" color="primary" fullWidth onClick={onOpenInIntegrator} startIcon={<IntegratorIcon width={18} height={18} style={{ color: '#e05c1b' }} />}>
        Develop in WSO2 Integrator
      </Button>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <StepItem number={1}>
          <Box component="span">
            Don&apos;t have WSO2 Integrator?
            <br />
            <Typography component="a" href={INTEGRATOR_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer" variant="body2" color="primary" sx={{ textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
              Get WSO2 Integrator
            </Typography>
          </Box>
        </StepItem>
        <StepItem number={2}>Edit the integration. Switch seamlessly between pro-code and low-code modes.</StepItem>
        <StepItem number={3}>Click &apos;Deploy to WSO2 Cloud&apos; from the extension. It will push to your remote repository and deploy to WSO2 Integration Platform.</StepItem>
        <StepItem number={4}>Test your integration in WSO2 Integration Platform and promote it to production.</StepItem>
      </Box>
    </Card>
  );
}
