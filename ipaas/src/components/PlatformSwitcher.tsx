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

import { AppSwitcher, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography, type AppSwitcherAppItem } from '@wso2/oxygen-ui';
import { House, Settings } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { buildPlatformSwitcher, CURRENT_PLATFORM, type SwitcherLink } from '../config/platformSwitcher';
import { usePlatformAccess } from '../hooks/usePlatformAccess';
import { cloudConsoleBillingActionUrl, cloudConsoleHomeUrl, cloudConsoleOrganizationsUrl, cloudConsoleSubscriptionsUrl } from '../paths';
import { withBase } from '../utils/basePath';
import { PROMPT_FOR, type PlatformPromptKind } from '../utils/platformAccess';

const ICON_SIZE = 32;

// WSO2's pulse mark. currentColor takes the switcher's brand orange, faded on a coming-soon card.
function PulseIcon(): JSX.Element {
  return (
    <Box component="svg" sx={{ width: ICON_SIZE, height: ICON_SIZE }} viewBox="0 0 525.38 525.38" fill="none" aria-hidden>
      <path
        d="M293.19,358.72c-.22,0-.44,0-.66-.02-4.77-.29-8.83-3.58-10.09-8.19l-36.05-132.2-18.46,61.66c-1.41,4.71-5.75,7.95-10.67,7.95h-69.15c-6.15,0-11.14-4.99-11.14-11.14s4.99-11.14,11.14-11.14h60.86l27.26-91.03c1.42-4.72,5.75-7.95,10.67-7.95.04,0,.09,0,.14,0,4.97.06,9.3,3.41,10.61,8.21l37.62,137.94,16.3-40.22c1.7-4.21,5.79-6.96,10.33-6.96h55.4c6.15,0,11.14,4.99,11.14,11.14s-4.99,11.14-11.14,11.14h-47.9l-25.87,63.84c-1.71,4.22-5.81,6.96-10.32,6.96Z"
        fill="currentColor"
      />
      <path
        d="M262.69,458.58c-108.01,0-195.89-87.87-195.89-195.89s87.87-195.89,195.89-195.89,195.89,87.88,195.89,195.89-87.88,195.89-195.89,195.89ZM262.69,89.08c-95.72,0-173.6,77.88-173.6,173.61s77.88,173.6,173.6,173.6,173.6-77.88,173.6-173.6-77.88-173.61-173.6-173.61Z"
        fill="currentColor"
      />
    </Box>
  );
}

interface Prompt {
  kind: PlatformPromptKind;
  platform: SwitcherLink & { url: string; billingCode: string };
}

// On the shared origin the platforms read as one product: the same tab. Elsewhere, a new one.
const isSameOrigin = (url: string): boolean => {
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
};

function promptCopy({ kind, platform: { name } }: Prompt): { title: string; body: string; action: string } {
  switch (kind) {
    case 'start-trial':
      return {
        title: `Start your ${name} trial?`,
        body: `Your organization hasn't used ${name} yet. Opening it starts a free trial for your organization.`,
        action: 'Start trial',
      };
    case 'trial-ended':
      return {
        title: `Your ${name} trial has ended`,
        body: `${name} is unavailable because your organization's trial has ended. Contact support to extend the trial or discuss a plan.`,
        action: 'Contact support',
      };
    case 'unsubscribed':
      return {
        title: `You have unsubscribed from ${name}`,
        body: `Your organization's ${name} subscription was cancelled. Subscribe again to open it.`,
        action: 'Subscribe',
      };
    case 'suspended':
      return {
        title: `${name} is suspended`,
        body: `Your organization's ${name} subscription is suspended. Your subscription details say why.`,
        action: 'View subscription',
      };
  }
}

const sameTab = (url: string) => (isSameOrigin(url) ? { target: '_self' as const } : {});

// WSO2 Cloud itself, below the platforms, as in the Agent Platform console.
const manageLinks = () =>
  [
    { id: 'cloud-home', name: 'Cloud home', url: cloudConsoleHomeUrl(), icon: <House size={18} /> },
    { id: 'settings', name: 'Settings', url: cloudConsoleOrganizationsUrl(), icon: <Settings size={18} /> },
  ].map((link) => ({ ...link, ...sameTab(link.url) }));

const open = (url: string): void => {
  if (isSameOrigin(url)) window.location.assign(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
};

// The prompt's action: the platform itself for a trial, otherwise WSO2 Cloud's billing, as its own switcher does.
function promptTarget({ kind, platform }: Prompt): string {
  switch (kind) {
    case 'start-trial':
      return platform.url;
    case 'trial-ended':
      return cloudConsoleBillingActionUrl('extend-trial', platform.billingCode);
    // Renews the existing subscription instead of buying a second one.
    case 'unsubscribed':
      return cloudConsoleBillingActionUrl('change-plan', platform.billingCode);
    case 'suspended':
      return cloudConsoleSubscriptionsUrl();
  }
}

/**
 * WSO2 Cloud's nine-dot platform switcher, leading the header as in the WSO2 Cloud and Agent Platform consoles. A
 * platform the organization doesn't hold opens WSO2 Cloud's subscription dialog for it instead.
 */
export default function PlatformSwitcher(): JSX.Element {
  const links = buildPlatformSwitcher(window.API_CONFIG, withBase('/'));
  // The switcher is on every page; billing is asked only once it is opened.
  const [opened, setOpened] = useState(false);
  const { accessFor, isLoading } = usePlatformAccess(opened);
  // Kept on close so the dialog doesn't empty while fading out.
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  // Remounting closes the popover, which stays open after a card click.
  const [closeCount, setCloseCount] = useState(0);

  const apps: AppSwitcherAppItem[] = links.map((link) => {
    const { id, name, url, billingCode } = link;
    const app = { id, name, icon: <PulseIcon /> };
    const kind = url && billingCode && id !== CURRENT_PLATFORM ? PROMPT_FOR[accessFor(billingCode)] : undefined;
    if (url && billingCode && kind) {
      return {
        ...app,
        onClick: () => {
          setPrompt({ kind, platform: { ...link, url, billingCode } });
          setPromptOpen(true);
          setCloseCount((n) => n + 1);
        },
      };
    }
    // A URL-less card shows as coming soon.
    return { ...app, url, ...(url ? sameTab(url) : {}) };
  });

  const copy = prompt && promptCopy(prompt);

  return (
    <>
      <AppSwitcher key={closeCount} currentAppId={CURRENT_PLATFORM}>
        <AppSwitcher.Trigger label="Switch platforms" onClick={() => setOpened(true)} />
        {/* Loading until billing answers, so a click can't skip a dialog. */}
        <AppSwitcher.Section label="Categories" apps={apps} loading={isLoading} loadingCount={apps.length} />
        <AppSwitcher.Footer label="Manage" links={manageLinks()} columns={2} />
      </AppSwitcher>

      <Dialog open={promptOpen} onClose={() => setPromptOpen(false)} maxWidth="xs" fullWidth>
        {prompt && copy && (
          <>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogContent>
              <Typography variant="body2" color="text.secondary">
                {copy.body}
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setPromptOpen(false)}>{prompt.kind === 'start-trial' ? 'Cancel' : 'Close'}</Button>
              <Button
                variant="contained"
                onClick={() => {
                  setPromptOpen(false);
                  open(promptTarget(prompt));
                }}>
                {copy.action}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </>
  );
}
