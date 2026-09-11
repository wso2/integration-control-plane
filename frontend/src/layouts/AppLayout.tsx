/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com).
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

import {
  AppShell,
  Badge,
  Box,
  Button,
  ColorSchemeToggle,
  ComplexSelect,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Footer,
  FormControlLabel,
  formatRelativeTime,
  Header,
  IconButton,
  InputAdornment,
  MenuItem,
  NotificationPanel,
  Popover,
  Sidebar,
  Switch,
  TextField,
  Tooltip,
  Typography,
  UserMenu,
  useAppShell,
} from '@wso2/oxygen-ui';
import { useRef, useState } from 'react';
import type { JSX } from 'react';
import { useNavigate, Outlet, NavLink } from 'react-router';
import Logo from '../components/Logo';
import { BarChart3, Bell, Building, ChevronDown, ChevronRight, FlaskConical, Layers, LayoutDashboard, LogOut, Plus, ScrollText, Search, Server, Shield, Sliders, User as UserIcon, UserCheck, Workflow, X } from '@wso2/oxygen-ui-icons-react';
import { useProjectByHandler, useProjects, useComponents, useAllEnvironments } from '../api/queries';
import { useMultiEnvRuntimeStatusSubscription } from '../api/subscriptions';
import { useNotificationPreferences } from '../hooks/useNotificationPreferences';
import { useScope, useResource, resourceUrl, broaden, narrow, newProjectUrl, newComponentUrl, sidebarItems, hasProject, hasComponent, type Resource } from '../nav';
import { useNotificationsContext } from '../contexts/NotificationsContext';
import { LayoutProvider } from '../contexts/LayoutContext';
import { cookiePolicyUrl, loginUrl, orgUrl, privacyPolicyUrl, profileUrl } from '../paths';
import { useAuth } from '../auth/AuthContext';
import { useAccessControl } from '../contexts/AccessControlContext';
import { ALL_USER_MGT_PERMISSIONS, Permissions } from '../constants/permissions';
import { isWorkflowIntegration } from '../constants/integrationTypes';
import { getIcpVersion } from '../config/api';

const SIDEBAR_ICONS: Record<Resource, JSX.Element> = {
  overview: <LayoutDashboard size={20} />,
  workflows: <Workflow size={20} />,
  tasks: <UserCheck size={20} />,
  test: <FlaskConical size={20} />,
  logs: <ScrollText size={20} />,
  loggers: <Sliders size={20} />,
  metrics: <BarChart3 size={20} />,
  runtimes: <Server size={20} />,
  environments: <Layers size={20} />,
  'access-control': <Shield size={20} />,
};

const SIDEBAR_CATEGORIES: { label: string; resources: Resource[] }[] = [
  { label: '', resources: ['overview', 'test', 'runtimes'] },
  { label: 'Manage', resources: ['workflows', 'tasks'] },
  { label: 'Observability', resources: ['logs', 'loggers', 'metrics'] },
  { label: 'Infrastructure', resources: ['environments'] },
  { label: 'Management', resources: ['access-control'] },
];

export default function AppLayout(): JSX.Element {
  const navigate = useNavigate();
  const scope = useScope();
  const resource = useResource();

  const { username, displayName, logout } = useAuth();
  const { hasAnyPermission } = useAccessControl();

  const { state: shell, actions } = useAppShell({ initialCollapsed: true });
  const [tabIndex, setTabIndex] = useState(0);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const orgCardRef = useRef<HTMLDivElement>(null);
  const projectCardRef = useRef<HTMLDivElement>(null);
  const integrationCardRef = useRef<HTMLDivElement>(null);
  const [projectMenuAnchor, setProjectMenuAnchor] = useState<HTMLElement | null>(null);
  const [projectMenuDir, setProjectMenuDir] = useState<'right' | 'below'>('right');
  const [projectSearch, setProjectSearch] = useState('');
  const [componentMenuAnchor, setComponentMenuAnchor] = useState<HTMLElement | null>(null);
  const [componentMenuDir, setComponentMenuDir] = useState<'right' | 'below'>('right');
  const [componentSearch, setComponentSearch] = useState('');

  const { notifications, actions: notifActions, unreadCount, unreadNotifications } = useNotificationsContext();
  const alertNotifications = notifications.filter((n) => n.type === 'warning' || n.type === 'error');

  const { data: allEnvironments = [], isLoading: envsLoading, isError: envsError } = useAllEnvironments();
  console.log('[AppLayout] environments:', allEnvironments.length, 'loading:', envsLoading, 'error:', envsError);
  const { runtimeStatusEnabled, setRuntimeStatusEnabled } = useNotificationPreferences();
  useMultiEnvRuntimeStatusSubscription(
    allEnvironments.map((e) => e.id),
    runtimeStatusEnabled,
  );
  const getFilteredNotifications = () => {
    if (tabIndex === 1) return unreadNotifications;
    if (tabIndex === 2) return alertNotifications;
    return notifications;
  };

  const { data: project } = useProjectByHandler(hasProject(scope) ? scope.project : '');
  const projectId = project?.id ?? '';
  const { data: projects = [] } = useProjects();
  const { data: components = [] } = useComponents(scope.org, projectId);

  // Find component UUID for permission checks
  const currentComponent = hasComponent(scope) ? components.find((c) => c.handler === scope.component) : undefined;
  const componentId = currentComponent?.id;

  const canAccessResource = (targetScope: Parameters<typeof hasProject>[0], target: Resource, targetProjectId: string | undefined = projectId || undefined, targetComponentId: string | undefined = componentId): Resource => {
    switch (target) {
      case 'overview':
        return 'overview';
      case 'workflows':
      case 'tasks':
        // Only workflow integrations have these views; at project level they always apply.
        return !hasComponent(targetScope) || isWorkflowIntegration(components.find((c) => c.id === targetComponentId)?.displayType) ? target : 'overview';
      case 'test':
        // Only integrations that expose a service have anything to test.
        return isWorkflowIntegration(components.find((c) => c.id === targetComponentId)?.displayType) ? 'overview' : 'test';
      case 'access-control': {
        const perms: string[] = [...ALL_USER_MGT_PERMISSIONS];
        if (hasProject(targetScope)) perms.push(Permissions.PROJECT_EDIT, Permissions.PROJECT_MANAGE);
        if (hasComponent(targetScope)) perms.push(Permissions.INTEGRATION_EDIT, Permissions.INTEGRATION_MANAGE);
        return hasAnyPermission(perms, targetProjectId, targetComponentId) ? 'access-control' : 'overview';
      }
      case 'logs':
        return 'logs';
      case 'loggers':
        return 'loggers';
      case 'metrics':
        return 'metrics';
      case 'runtimes':
        return 'runtimes';
      case 'environments':
        return 'environments';
    }
  };

  const accessControlPerms: string[] = [...ALL_USER_MGT_PERMISSIONS];
  if (hasProject(scope)) {
    accessControlPerms.push(Permissions.PROJECT_EDIT, Permissions.PROJECT_MANAGE);
  }
  if (hasComponent(scope)) {
    accessControlPerms.push(Permissions.INTEGRATION_EDIT, Permissions.INTEGRATION_MANAGE);
  }
  const canSeeAccessControl = hasAnyPermission(accessControlPerms, projectId || undefined, componentId);
  // Two integration-level entries depend on the integration's type, and each stays hidden until
  // `currentComponent` resolves — the same way access control waits on its permissions — so neither is
  // offered and then withdrawn once the type is known.
  //
  // Workflows applies only to a workflow integration. Project level is unaffected: a project's
  // workflow data is namespace-wide, not tied to one integration.
  const showWorkflows = !hasComponent(scope) || isWorkflowIntegration(currentComponent?.displayType);
  // The Test Console drives a service's packed OpenAPI definition, so it applies to every type except
  // workflow, which exposes workflows rather than services.
  const showTest = !!currentComponent && !isWorkflowIntegration(currentComponent.displayType);
  const items = sidebarItems(scope, resource)
    .filter((item) => item.resource !== 'access-control' || canSeeAccessControl)
    .filter((item) => (item.resource !== 'workflows' && item.resource !== 'tasks') || showWorkflows)
    .filter((item) => item.resource !== 'test' || showTest);

  return (
    <AppShell>
      <AppShell.Navbar>
        <Header>
          <Header.Toggle collapsed={shell.sidebarCollapsed} onToggle={actions.toggleSidebar} />
          <Header.Brand>
            <Header.BrandLogo>
              <NavLink to={orgUrl(scope.org)} style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
                <Logo />
              </NavLink>
            </Header.BrandLogo>
          </Header.Brand>
          <Header.Switchers showDivider={false}>
            <Box
              ref={orgCardRef}
              role="button"
              tabIndex={0}
              sx={{ display: 'inline-flex', alignSelf: 'center', cursor: 'pointer' }}
              onClick={() => navigate(orgUrl(scope.org))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate(orgUrl(scope.org));
                }
              }}>
              <ComplexSelect
                value={scope.org}
                open={false}
                onChange={() => {}}
                onOpen={() => {}}
                size="small"
                sx={{ minWidth: 180 }}
                IconComponent={() => null}
                SelectDisplayProps={{ 'aria-label': 'Select organization' }}
                renderValue={() => (
                  <>
                    <ComplexSelect.MenuItem.Icon>
                      <Building />
                    </ComplexSelect.MenuItem.Icon>
                    <ComplexSelect.MenuItem.Text primary="Default Organization" secondary="Organization" />
                  </>
                )}
                label="Organizations">
                <ComplexSelect.MenuItem value="default">
                  <ComplexSelect.MenuItem.Icon>
                    <Building />
                  </ComplexSelect.MenuItem.Icon>
                  <ComplexSelect.MenuItem.Text primary="Default Organization" secondary="Organization" />
                </ComplexSelect.MenuItem>
              </ComplexSelect>
            </Box>
            {!hasProject(scope) && !projectMenuAnchor && (
              <Tooltip title="Select project">
                <IconButton
                  size="small"
                  onClick={() => {
                    setProjectMenuDir('right');
                    setProjectMenuAnchor(orgCardRef.current);
                  }}>
                  <ChevronRight size={18} />
                </IconButton>
              </Tooltip>
            )}
            <Popover
              anchorEl={projectMenuAnchor}
              open={Boolean(projectMenuAnchor)}
              onClose={() => {
                setProjectMenuAnchor(null);
                setProjectSearch('');
              }}
              anchorOrigin={projectMenuDir === 'right' ? { vertical: 'top', horizontal: 'right' } : { vertical: 'bottom', horizontal: 'left' }}
              transformOrigin={{ vertical: 'top', horizontal: 'left' }}
              marginThreshold={projectMenuDir === 'right' ? 0 : undefined}
              PaperProps={{ sx: { width: 260, ...(projectMenuDir === 'right' ? { ml: 1 } : { mt: 0.5 }) } }}>
              <Box sx={{ px: 2, pt: 1.5, pb: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Project
                </Typography>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="Search"
                  autoFocus
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <Search size={16} />
                      </InputAdornment>
                    ),
                  }}
                />
              </Box>
              <Button
                variant="text"
                size="small"
                startIcon={<Plus size={16} />}
                fullWidth
                sx={{ justifyContent: 'flex-start', px: 2, py: 1 }}
                onClick={() => {
                  setProjectMenuAnchor(null);
                  setProjectSearch('');
                  navigate(newProjectUrl({ org: scope.org }));
                }}>
                Create Project
              </Button>
              <Divider />
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 2, pt: 1, pb: 0.5 }}>
                All Projects
              </Typography>
              {projects.filter((p) => !projectSearch.trim() || p.name.toLowerCase().includes(projectSearch.trim().toLowerCase())).length === 0 ? (
                <MenuItem disabled>No projects found</MenuItem>
              ) : (
                projects
                  .filter((p) => !projectSearch.trim() || p.name.toLowerCase().includes(projectSearch.trim().toLowerCase()))
                  .map((p) => (
                    <MenuItem
                      key={p.id}
                      selected={hasProject(scope) && scope.project === p.handler}
                      onClick={() => {
                        setProjectMenuAnchor(null);
                        setProjectSearch('');
                        const newScope = narrow({ level: 'organizations', org: scope.org }, p.handler);
                        const target = resource ?? 'overview';
                        navigate(resourceUrl(newScope, canAccessResource(newScope, target, p.id, undefined)));
                      }}>
                      {p.name}
                    </MenuItem>
                  ))
              )}
            </Popover>
            {hasProject(scope) && (
              <>
                <Box
                  ref={projectCardRef}
                  role="button"
                  tabIndex={0}
                  sx={{ position: 'relative', display: 'inline-flex', cursor: 'pointer' }}
                  onClick={() => navigate(resourceUrl({ level: 'projects' as const, org: scope.org, project: scope.project }, 'overview'))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigate(resourceUrl({ level: 'projects' as const, org: scope.org, project: scope.project }, 'overview'));
                    }
                  }}>
                  <ComplexSelect
                    value={scope.project}
                    open={false}
                    onChange={() => {}}
                    onOpen={() => {}}
                    size="small"
                    sx={{ minWidth: 160 }}
                    IconComponent={({ ownerState: _ownerState, ...props }) => (
                      <span
                        {...props}
                        role="button"
                        tabIndex={0}
                        style={{ position: 'absolute', top: 'auto', bottom: '0', right: '6px', display: 'flex', pointerEvents: 'all', cursor: 'pointer' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setProjectMenuDir('below');
                          setProjectMenuAnchor(projectCardRef.current);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            setProjectMenuDir('below');
                            setProjectMenuAnchor(projectCardRef.current);
                          }
                        }}>
                        <ChevronDown size={18} />
                      </span>
                    )}
                    SelectDisplayProps={{ 'aria-label': 'Select project' }}
                    renderValue={() => <ComplexSelect.MenuItem.Text primary={project?.name ?? scope.project} secondary="Project" />}
                    label="Projects">
                    {projects.map((p) => (
                      <ComplexSelect.MenuItem key={p.handler} value={p.handler}>
                        <ComplexSelect.MenuItem.Text primary={p.name} secondary={p.description} />
                      </ComplexSelect.MenuItem>
                    ))}
                  </ComplexSelect>
                  <IconButton
                    size="small"
                    aria-label="Clear project"
                    sx={{ position: 'absolute', top: '3px', right: '3px' }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      const orgScope = { level: 'organizations' as const, org: scope.org };
                      const target = resource ?? 'overview';
                      navigate(resourceUrl(orgScope, canAccessResource(orgScope, target)));
                    }}>
                    <X size={16} />
                  </IconButton>
                </Box>
                {!hasComponent(scope) && !componentMenuAnchor && (
                  <Tooltip title="Select integration">
                    <IconButton
                      size="small"
                      onClick={() => {
                        setComponentMenuDir('right');
                        setComponentMenuAnchor(projectCardRef.current);
                      }}>
                      <ChevronRight size={18} />
                    </IconButton>
                  </Tooltip>
                )}
                <Popover
                  anchorEl={componentMenuAnchor}
                  open={Boolean(componentMenuAnchor)}
                  onClose={() => {
                    setComponentMenuAnchor(null);
                    setComponentSearch('');
                  }}
                  anchorOrigin={componentMenuDir === 'right' ? { vertical: 'top', horizontal: 'right' } : { vertical: 'bottom', horizontal: 'left' }}
                  transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                  marginThreshold={componentMenuDir === 'right' ? 0 : undefined}
                  PaperProps={{ sx: { width: 260, ...(componentMenuDir === 'right' ? { ml: 1 } : { mt: 0.5 }) } }}>
                  <Box sx={{ px: 2, pt: 1.5, pb: 1 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                      Integration
                    </Typography>
                    <TextField
                      size="small"
                      fullWidth
                      placeholder="Search"
                      autoFocus
                      value={componentSearch}
                      onChange={(e) => setComponentSearch(e.target.value)}
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <Search size={16} />
                          </InputAdornment>
                        ),
                      }}
                    />
                  </Box>
                  <Button
                    variant="text"
                    size="small"
                    startIcon={<Plus size={16} />}
                    fullWidth
                    sx={{ justifyContent: 'flex-start', px: 2, py: 1 }}
                    onClick={() => {
                      setComponentMenuAnchor(null);
                      setComponentSearch('');
                      navigate(newComponentUrl({ org: scope.org, project: scope.project }));
                    }}>
                    Create Integration
                  </Button>
                  <Divider />
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 2, pt: 1, pb: 0.5 }}>
                    All Integrations
                  </Typography>
                  {components.filter((c) => !componentSearch.trim() || c.displayName.toLowerCase().includes(componentSearch.trim().toLowerCase())).length === 0 ? (
                    <MenuItem disabled>No integrations found</MenuItem>
                  ) : (
                    components
                      .filter((c) => !componentSearch.trim() || c.displayName.toLowerCase().includes(componentSearch.trim().toLowerCase()))
                      .map((c) => (
                        <MenuItem
                          key={c.id}
                          selected={hasComponent(scope) && scope.component === c.handler}
                          onClick={() => {
                            setComponentMenuAnchor(null);
                            setComponentSearch('');
                            const newScope = narrow({ level: 'projects', org: scope.org, project: scope.project }, c.handler);
                            const target = resource ?? 'overview';
                            navigate(resourceUrl(newScope, canAccessResource(newScope, target, projectId, c.id)));
                          }}>
                          {c.displayName}
                        </MenuItem>
                      ))
                  )}
                </Popover>
              </>
            )}
            {hasComponent(scope) && (
              <Box
                ref={integrationCardRef}
                role="button"
                tabIndex={0}
                sx={{ position: 'relative', display: 'inline-flex', cursor: 'pointer' }}
                onClick={() => navigate(resourceUrl(scope, 'overview'))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(resourceUrl(scope, 'overview'));
                  }
                }}>
                <ComplexSelect
                  value={scope.component}
                  open={false}
                  onChange={() => {}}
                  onOpen={() => {}}
                  size="small"
                  sx={{ minWidth: 160 }}
                  IconComponent={({ ownerState: _ownerState, ...props }) => (
                    <span
                      {...props}
                      role="button"
                      tabIndex={0}
                      style={{ position: 'absolute', top: 'auto', bottom: '0', right: '6px', display: 'flex', pointerEvents: 'all', cursor: 'pointer' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setComponentMenuDir('below');
                        setComponentMenuAnchor(integrationCardRef.current);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          setComponentMenuDir('below');
                          setComponentMenuAnchor(integrationCardRef.current);
                        }
                      }}>
                      <ChevronDown size={18} />
                    </span>
                  )}
                  SelectDisplayProps={{ 'aria-label': 'Select integration' }}
                  renderValue={() => <ComplexSelect.MenuItem.Text primary={scope.component} secondary="Integration" />}
                  label="Integrations">
                  {components.map((c) => (
                    <ComplexSelect.MenuItem key={c.id} value={c.handler}>
                      <ComplexSelect.MenuItem.Text primary={c.displayName} secondary={c.componentType === 'BI' ? 'Default' : c.componentType} />
                    </ComplexSelect.MenuItem>
                  ))}
                </ComplexSelect>
                <IconButton
                  size="small"
                  aria-label="Clear integration"
                  sx={{ position: 'absolute', top: '3px', right: '3px' }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    const projectScope = broaden(scope)!;
                    const target = resource ?? 'overview';
                    navigate(resourceUrl(projectScope, canAccessResource(projectScope, target)));
                  }}>
                  <X size={16} />
                </IconButton>
              </Box>
            )}
          </Header.Switchers>
          <Header.Spacer />
          <Header.Actions>
            <ColorSchemeToggle />
            <Tooltip title="Notifications">
              <IconButton onClick={actions.toggleNotificationPanel} size="small" sx={{ color: 'text.secondary' }}>
                <Badge badgeContent={unreadCount ?? 0} color="error" max={99} invisible={(unreadCount ?? 0) === 0}>
                  <Bell size={20} />
                </Badge>
              </IconButton>
            </Tooltip>
            <Divider orientation="vertical" flexItem sx={{ mx: 1, display: { xs: 'none', sm: 'block' } }} />
            {/* display:contents wrapper: gives E2E tests a stable hook without affecting layout */}
            <Box data-testid="user-menu" sx={{ display: 'contents' }}>
              <UserMenu>
                <UserMenu.Trigger name={displayName || username || 'User'} />
                <UserMenu.Header name={displayName || username || 'User'} email={username} role="Admin" />
                <UserMenu.Item icon={<UserIcon size={18} />} label="Profile" onClick={() => navigate(profileUrl())} />
                <UserMenu.Divider />
                <UserMenu.Logout icon={<LogOut size={18} />} label="Sign Out" onClick={() => setConfirmDialogOpen(true)} />
              </UserMenu>
            </Box>
          </Header.Actions>
        </Header>
      </AppShell.Navbar>

      <AppShell.Sidebar>
        <Sidebar
          collapsed={shell.sidebarCollapsed}
          activeItem={resource ?? 'overview'}
          expandedMenus={shell.expandedMenus}
          onSelect={(id) => {
            if (id === 'expand') {
              actions.toggleSidebar();
            } else {
              const item = items.find((i) => i.resource === id);
              if (item) navigate(item.url);
            }
          }}
          onToggleExpand={actions.toggleMenu}
          sx={{ backgroundColor: 'background.acrylic', backdropFilter: 'blur(3px)' }}>
          <Sidebar.Nav>
            {SIDEBAR_CATEGORIES.map(({ label, resources }) => {
              const catItems = items.filter((item) => resources.includes(item.resource));
              if (catItems.length === 0) return null;
              return (
                <Sidebar.Category key={label || 'main'}>
                  {label && <Sidebar.CategoryLabel>{label}</Sidebar.CategoryLabel>}
                  {catItems.map((item) => (
                    <Sidebar.Item key={item.resource} id={item.resource}>
                      <Sidebar.ItemIcon>{SIDEBAR_ICONS[item.resource]}</Sidebar.ItemIcon>
                      <Sidebar.ItemLabel>{item.label}</Sidebar.ItemLabel>
                    </Sidebar.Item>
                  ))}
                </Sidebar.Category>
              );
            })}
          </Sidebar.Nav>

          <Sidebar.Footer sx={{ py: 0 }}>
            <Sidebar.Category sx={{ mb: 0 }}>
              <Sidebar.Item id="expand" sx={{ minHeight: 0, py: '15px' }}>
                <Sidebar.ItemIcon>
                  <ChevronRight size={20} style={{ transform: shell.sidebarCollapsed ? 'none' : 'rotate(180deg)' }} />
                </Sidebar.ItemIcon>
                <Sidebar.ItemLabel>{shell.sidebarCollapsed ? 'Expand' : 'Collapse'}</Sidebar.ItemLabel>
              </Sidebar.Item>
            </Sidebar.Category>
          </Sidebar.Footer>
        </Sidebar>
      </AppShell.Sidebar>

      <AppShell.Main>
        <LayoutProvider value={{ sidebarWidth: shell.sidebarCollapsed ? shell.sidebarCollapsedWidth : shell.sidebarWidth }}>
          <Outlet />
        </LayoutProvider>
      </AppShell.Main>

      <AppShell.Footer>
        <Footer>
          <Footer.Link
            href={privacyPolicyUrl()}
            onClick={(e) => {
              if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.defaultPrevented) {
                e.preventDefault();
                navigate(privacyPolicyUrl());
              }
            }}>
            Privacy Policy
          </Footer.Link>
          <Footer.Link
            href={cookiePolicyUrl()}
            onClick={(e) => {
              if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.defaultPrevented) {
                e.preventDefault();
                navigate(cookiePolicyUrl());
              }
            }}>
            Cookie Policy
          </Footer.Link>
          <Footer.Link href="https://wso2.com/support" target="_blank" rel="noreferrer">
            Support
          </Footer.Link>
          {getIcpVersion() && <Footer.Version>v{getIcpVersion()}</Footer.Version>}
          <Footer.Copyright>&copy; {new Date().getFullYear()}, WSO2 LLC.</Footer.Copyright>
        </Footer>
      </AppShell.Footer>

      <AppShell.NotificationPanel>
        <NotificationPanel open={shell.notificationPanelOpen} onClose={actions.toggleNotificationPanel}>
          <NotificationPanel.Header>
            <NotificationPanel.HeaderIcon>
              <Bell size={20} />
            </NotificationPanel.HeaderIcon>
            <NotificationPanel.HeaderTitle>Notifications</NotificationPanel.HeaderTitle>
            {unreadCount > 0 && <NotificationPanel.HeaderBadge>{unreadCount}</NotificationPanel.HeaderBadge>}
            <NotificationPanel.HeaderClose />
          </NotificationPanel.Header>
          <NotificationPanel.Tabs
            tabs={[
              { label: 'All', count: notifications.length },
              {
                label: 'Unread',
                count: unreadNotifications.length,
                color: 'primary',
              },
              {
                label: 'Alerts',
                count: alertNotifications.length,
                color: 'warning',
              },
            ]}
            value={tabIndex}
            onChange={setTabIndex}
          />
          {notifications.length > 0 && <NotificationPanel.Actions hasUnread={unreadNotifications.length > 0} onMarkAllRead={notifActions.markAllRead} onClearAll={notifActions.clearAll} />}
          {getFilteredNotifications().length === 0 ? (
            <NotificationPanel.EmptyState />
          ) : (
            <NotificationPanel.List>
              {getFilteredNotifications().map((notification) => (
                <NotificationPanel.Item key={notification.id} id={notification.id} type={notification.type ?? 'info'} read={notification.read} onMarkRead={notifActions.markRead} onDismiss={notifActions.dismiss}>
                  <NotificationPanel.ItemAvatar>{notification.avatar}</NotificationPanel.ItemAvatar>
                  <NotificationPanel.ItemTitle>{notification.title}</NotificationPanel.ItemTitle>
                  <NotificationPanel.ItemMessage>{notification.message}</NotificationPanel.ItemMessage>
                  <NotificationPanel.ItemTimestamp>{formatRelativeTime(notification.timestamp)}</NotificationPanel.ItemTimestamp>
                  {notification.actionLabel && <NotificationPanel.ItemAction>{notification.actionLabel}</NotificationPanel.ItemAction>}
                </NotificationPanel.Item>
              ))}
            </NotificationPanel.List>
          )}
          <Divider />
          <Box sx={{ px: 2, py: 1.5 }}>
            <FormControlLabel control={<Switch size="small" checked={runtimeStatusEnabled} onChange={(e) => setRuntimeStatusEnabled(e.target.checked)} />} label={<Typography variant="caption">Runtime &amp; log level alerts</Typography>} />
          </Box>
        </NotificationPanel>

        {/* Confirm Dialog - managed locally */}
        <Dialog open={confirmDialogOpen} onClose={() => setConfirmDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Sign Out</DialogTitle>
          <DialogContent>
            <DialogContentText>Are you sure you want to sign out of your account?</DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmDialogOpen(false)}>Cancel</Button>
            <Button
              variant="contained"
              onClick={async () => {
                await logout();
                navigate(loginUrl());
                setConfirmDialogOpen(false);
              }}>
              Sign Out
            </Button>
          </DialogActions>
        </Dialog>
      </AppShell.NotificationPanel>
    </AppShell>
  );
}
