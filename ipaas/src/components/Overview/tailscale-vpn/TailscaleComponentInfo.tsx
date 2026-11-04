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

import { Avatar, Box, Button, Dialog, DialogContent, IconButton, Link, Stack, Typography } from '@wso2/oxygen-ui';
import { Lightbulb, X } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import type { ComponentDetail } from '../../../types/component';

const AUTH_KEY_URL = 'https://login.tailscale.com/admin/settings/keys';
const DOCS_URL = 'https://wso2.com/devant/docs/configure-vpn/configure-tailscale-vpn/';

/** The "How to set up Tailscale VPN" guide — shown inline as a modal (no external navigation). */
function HowToModal({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogContent sx={{ position: 'relative', pr: 5 }}>
        <IconButton size="small" onClick={onClose} aria-label="Close" sx={{ position: 'absolute', top: 8, right: 8 }}>
          <X size={18} />
        </IconButton>
        <Typography variant="h6" gutterBottom>
          Configure VPN with Tailscale on WSO2 Integration Platform
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          Use the prebuilt Tailscale VPN in WSO2 Integration Platform to securely connect your cloud data plane to private networks via Tailscale&rsquo;s peer-to-peer WireGuard network.
        </Typography>
        <Typography variant="subtitle1" gutterBottom>
          Steps
        </Typography>
        <Box component="ul" sx={{ pl: 3, m: 0, '& li': { mb: 1 }, '& code': { px: 0.5, py: 0.2, bgcolor: 'action.hover', borderRadius: 0.5, fontSize: '0.85em' } }}>
          <li>
            <Typography variant="body2" component="span">
              Generate a{' '}
              <Link href={AUTH_KEY_URL} target="_blank" rel="noopener noreferrer">
                Tailscale auth key ↗
              </Link>
              .
            </Typography>
          </li>
          <li>
            <Typography variant="body2" component="span">
              Add <strong>endpoint mappings</strong> in the proxy settings.
            </Typography>
            <Box component="ul" sx={{ pl: 3, mt: 1, '& li': { mb: 0.75 } }}>
              <li>
                <Typography variant="body2" component="span">
                  These mappings define how the <strong>Tailscale VPN in WSO2 Integration Platform forwards traffic.</strong> Each mapping specifies <strong>which incoming port on the proxy</strong> should be directed to a{' '}
                  <strong>specific device and port</strong> within your private Tailscale network.
                </Typography>
              </li>
              <li>
                <Typography variant="body2" component="span">
                  <strong>Endpoint name</strong> – label for the mapping (e.g., <code>Internal APIs</code>).
                </Typography>
              </li>
              <li>
                <Typography variant="body2" component="span">
                  <strong>Port</strong> – the port exposed on the Tailscale VPN (e.g., <code>8080</code>).
                </Typography>
              </li>
              <li>
                <Typography variant="body2" component="span">
                  <strong>Target IP</strong> – the private device&rsquo;s IP in your Tailscale network (e.g., <code>100.108.78.93</code>).
                </Typography>
              </li>
              <li>
                <Typography variant="body2" component="span">
                  <strong>Target port</strong> – the port on that device to forward traffic to (e.g., <code>8090</code>).
                </Typography>
              </li>
            </Box>
          </li>
          <li>
            <Typography variant="body2" component="span">
              Example: Requests to <code>8080</code> on the proxy → forwarded to <code>100.108.78.93:8090</code>.
            </Typography>
          </li>
          <li>
            <Typography variant="body2" component="span">
              Click <strong>Save &amp; deploy</strong>.
            </Typography>
          </li>
        </Box>
        <Typography variant="subtitle1" gutterBottom sx={{ mt: 2 }}>
          For more details
        </Typography>
        <Typography variant="body2">
          See the full guide:{' '}
          <Link href={DOCS_URL} target="_blank" rel="noopener noreferrer">
            WSO2 Integration Platform Tailscale VPN documentation ↗
          </Link>
        </Typography>
      </DialogContent>
    </Dialog>
  );
}

/** Tailscale proxy identity header: avatar + name + type + description + how-to guide. */
export default function TailscaleComponentInfo({ component }: { component: ComponentDetail }): JSX.Element {
  const [howToOpen, setHowToOpen] = useState(false);

  return (
    <>
      <Stack direction="row" alignItems="flex-start" gap={2} sx={{ mb: 3 }}>
        <Avatar sx={{ width: 56, height: 56, fontSize: 24, bgcolor: 'text.primary', color: 'background.paper' }}>{(component.displayName || component.handler || 'T').charAt(0).toUpperCase()}</Avatar>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            {component.displayName || component.handler}
          </Typography>
          <Typography variant="subtitle2" color="text.secondary">
            Tailscale VPN
          </Typography>
          {component.description && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {component.description}
            </Typography>
          )}
        </Box>
        <Button color="info" startIcon={<Lightbulb size={16} />} onClick={() => setHowToOpen(true)} sx={{ flexShrink: 0 }}>
          How to set up Tailscale VPN
        </Button>
      </Stack>
      <HowToModal open={howToOpen} onClose={() => setHowToOpen(false)} />
    </>
  );
}
