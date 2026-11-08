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

import { AppShell, Box, Button, ColorSchemeToggle, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Footer, Header, Sidebar, UserMenu, useAppShell } from '@wso2/oxygen-ui';
import { Bot, CalendarClock, LayoutDashboard, ListChecks, LogOut, Workflow } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../i18n';
import { NavLink, Outlet, matchPath, useLocation, useNavigate } from 'react-router';
import { useAuth, VIEW_SCOPES } from '../auth';
import Logo from '../components/Logo';
import ProfileHeader from '../components/ProfileHeader';
import { usePortalConfig } from '../config/portalConfig';
import { useAllIntegrations, useIntegration } from '../hooks/useIntegrations';
import { useWorkItems } from '../hooks/useTasks';
import { kindUrl, overviewUrl, tasksUrl } from '../paths';
import type { IntegrationKind } from '../types/portal';

type NavId = 'overview' | 'agents' | 'automations' | 'workflows' | 'tasks';

const NAV_URLS: Record<NavId, string> = {
  overview: overviewUrl(),
  agents: kindUrl('aiAgent'),
  automations: kindUrl('automation'),
  workflows: kindUrl('workflow'),
  tasks: tasksUrl(),
};

const KIND_NAV: Record<IntegrationKind, NavId> = { aiAgent: 'agents', automation: 'automations', workflow: 'workflows' };

const COLLAPSED_KEY = 'user-portal:sidebar-collapsed';
const acrylicSx = { backgroundColor: 'background.acrylic', backdropFilter: 'blur(3px)' } as const;

function storedCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

/** The signed-in shell, laid out as the integration console's: header, sidebar, page, footer. */
export default function AppLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const config = usePortalConfig();
  const { user, signOut, hasScope } = useAuth();
  const canView = (kind: IntegrationKind) => hasScope(VIEW_SCOPES[kind]);
  const { data: workflows = [] } = useAllIntegrations('workflow', canView('workflow'));
  const { items: waiting } = useWorkItems(workflows);
  const openId = matchPath('/integrations/:id/*', pathname)?.params.id;
  const { data: openIntegration } = useIntegration(openId);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  // useAppShell keys an effect off this object's identity, so it must stay the same object.
  const shellOptions = useMemo(() => ({ initialCollapsed: storedCollapsed() }), []);
  const { state: shell, actions } = useAppShell(shellOptions);

  const active = useMemo<NavId>(() => {
    if (openId) return openIntegration ? KIND_NAV[openIntegration.kind] : 'overview';
    return (Object.keys(NAV_URLS) as NavId[]).find((nav) => nav !== 'overview' && pathname.startsWith(NAV_URLS[nav])) ?? 'overview';
  }, [pathname, openId, openIntegration]);

  useEffect(() => {
    document.title = t('shell.documentTitle', { portal: config.portalName, product: config.productName });
  }, [t, config.portalName, config.productName]);

  const orgName = config.orgName || config.orgHandle;

  return (
    <AppShell>
      <AppShell.Navbar>
        <Header>
          <Header.Toggle
            collapsed={shell.sidebarCollapsed}
            onToggle={() => {
              try {
                window.localStorage.setItem(COLLAPSED_KEY, String(!shell.sidebarCollapsed));
              } catch {
                // Storage may be blocked; the choice then lasts for this visit.
              }
              actions.toggleSidebar();
            }}
          />
          <Header.Brand>
            <Header.BrandLogo>
              <NavLink to={overviewUrl()} aria-label={t('shell.nav.overview')} style={{ display: 'flex', alignItems: 'center' }}>
                <Logo />
              </NavLink>
            </Header.BrandLogo>
            <Header.BrandTitle>{config.portalName}</Header.BrandTitle>
          </Header.Brand>
          <Header.Spacer />
          <Header.Actions>
            <ColorSchemeToggle />
            <UserMenu>
              <UserMenu.Trigger name={user.displayName} avatar={user.picture ?? user.initials} />
              <ProfileHeader name={user.displayName} email={user.email} initials={user.initials} picture={user.picture} roles={user.roles} org={orgName} />
              <UserMenu.Logout icon={<LogOut size={18} />} label={t('common.actions.signOut')} onClick={() => setConfirmSignOut(true)} />
            </UserMenu>
          </Header.Actions>
        </Header>
      </AppShell.Navbar>

      <AppShell.Sidebar>
        <Sidebar collapsed={shell.sidebarCollapsed} activeItem={active} expandedMenus={shell.expandedMenus} onSelect={(id: string) => navigate(NAV_URLS[id as NavId] ?? overviewUrl())} onToggleExpand={actions.toggleMenu} sx={acrylicSx}>
          <Sidebar.Nav>
            <Sidebar.Category>
              <Sidebar.Item id="overview">
                <Sidebar.ItemIcon>
                  <LayoutDashboard size={20} />
                </Sidebar.ItemIcon>
                <Sidebar.ItemLabel>{t('shell.nav.overview')}</Sidebar.ItemLabel>
              </Sidebar.Item>
              {canView('workflow') && (
                <Sidebar.Item id="tasks">
                  <Sidebar.ItemIcon>
                    <ListChecks size={20} />
                  </Sidebar.ItemIcon>
                  <Sidebar.ItemLabel>{t('shell.nav.tasks')}</Sidebar.ItemLabel>
                  {waiting.length > 0 && <Sidebar.ItemBadge color="primary">{waiting.length}</Sidebar.ItemBadge>}
                </Sidebar.Item>
              )}
            </Sidebar.Category>
            <Sidebar.Category>
              <Sidebar.CategoryLabel>{t('shell.nav.integrations')}</Sidebar.CategoryLabel>
              {canView('aiAgent') && (
                <Sidebar.Item id="agents">
                  <Sidebar.ItemIcon>
                    <Bot size={20} />
                  </Sidebar.ItemIcon>
                  <Sidebar.ItemLabel>{t('common.kind.aiAgent', { count: 2 })}</Sidebar.ItemLabel>
                </Sidebar.Item>
              )}
              {canView('automation') && (
                <Sidebar.Item id="automations">
                  <Sidebar.ItemIcon>
                    <CalendarClock size={20} />
                  </Sidebar.ItemIcon>
                  <Sidebar.ItemLabel>{t('common.kind.automation', { count: 2 })}</Sidebar.ItemLabel>
                </Sidebar.Item>
              )}
              {canView('workflow') && (
                <Sidebar.Item id="workflows">
                  <Sidebar.ItemIcon>
                    <Workflow size={20} />
                  </Sidebar.ItemIcon>
                  <Sidebar.ItemLabel>{t('common.kind.workflow', { count: 2 })}</Sidebar.ItemLabel>
                </Sidebar.Item>
              )}
            </Sidebar.Category>
          </Sidebar.Nav>
        </Sidebar>
      </AppShell.Sidebar>

      <AppShell.Main>
        {/* Pinned to the content area, so no page can widen the viewport. */}
        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', overflow: 'hidden' }}>
          <Box sx={{ flex: 1, minWidth: 0, height: '100%', overflowY: 'auto' }}>
            <Outlet />
          </Box>
        </Box>
      </AppShell.Main>

      <AppShell.Footer>
        <Footer sx={acrylicSx}>
          {config.links.support && (
            <Footer.Link href={config.links.support} target="_blank" rel="noopener noreferrer">
              {t('shell.footer.support')}
            </Footer.Link>
          )}
          {config.links.terms && (
            <Footer.Link href={config.links.terms} target="_blank" rel="noopener noreferrer">
              {t('shell.footer.terms')}
            </Footer.Link>
          )}
          {config.links.privacy && (
            <Footer.Link href={config.links.privacy} target="_blank" rel="noopener noreferrer">
              {t('shell.footer.privacy')}
            </Footer.Link>
          )}
          <Footer.Copyright>{t('shell.footer.copyright', { year: new Date().getFullYear() })}</Footer.Copyright>
        </Footer>
      </AppShell.Footer>

      <AppShell.NotificationPanel>
        <Dialog open={confirmSignOut} onClose={() => setConfirmSignOut(false)} maxWidth="sm" fullWidth>
          <DialogTitle>{t('common.actions.signOut')}</DialogTitle>
          <DialogContent>
            <DialogContentText>{t('shell.signOutDialog.message')}</DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmSignOut(false)}>{t('common.actions.cancel')}</Button>
            <Button variant="contained" onClick={() => void signOut()}>
              {t('common.actions.signOut')}
            </Button>
          </DialogActions>
        </Dialog>
      </AppShell.NotificationPanel>
    </AppShell>
  );
}
