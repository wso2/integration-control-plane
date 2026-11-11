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
  Header,
  IconButton,
  SearchBar,
  MenuItem,
  Box,
  CircularProgress,
  Popover,
  Sidebar,
  Tooltip,
  TrialBadge,
  type Theme,
  type TrialBadgeUsage,
  Typography,
  UserMenu,
  useAppShell,
} from '@wso2/oxygen-ui';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { JSX } from 'react';
import { useNavigate, Outlet, NavLink, useLocation } from 'react-router';
import { useAppNavigate } from '../hooks/useAppNavigate';
import Logo from '../components/Logo';
import MarketingConsentDialog from '../components/MarketingConsentDialog';
import PlatformSwitcher from '../components/PlatformSwitcher';
import NotFound from '../components/NotFound';
import {
  Activity,
  BookOpen,
  Mic,
  Boxes,
  ChartColumn,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Database,
  FileLock,
  FlaskConical,
  Gauge,
  Hammer,
  HeartPulse,
  Box as BoxIcon,
  LayoutDashboard,
  LogOut,
  Logs,
  Maximize2,
  Plus,
  Rocket,
  Server,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Waypoints,
  Workflow,
  Wrench,
  X,
} from '@wso2/oxygen-ui-icons-react';
import { useProject, useProjectByHandler, useProjects } from '../hooks/useProjects';
import { useComponents } from '../hooks/useComponents';
import { useOrgComponentLimits, useOrgs } from '../hooks/useOrg';
import { useBillingOrg } from '../hooks/useBillingOrg';
import { useOrgUuid } from '../hooks/useOrgUuid';
import { FREE_COMPONENT_LIMIT } from '../constants/subscription';
import { trialLengthDays } from '../utils/billing';
import { isSupportedIntegration, GENERIC_SERVICE_TYPES } from '../constants/integrations';
import { BILLING_PRODUCT_CODE } from '../constants/subscription';
import { identifyIntegration } from '../utils/identifyIntegration';
import { isWorkflowIntegration } from '../utils/workflowIntegration';
import { hasIntegrationTraces } from '../utils/integrationTraces';
import { useAuth } from '../auth';
import { visibleComponentSettingsSections } from '../constants/componentSettingsSections';
import { useScope, broaden, narrow, newProjectUrl, newComponentUrl, hasProject, hasComponent, settingsCrossScopeUrl, resolveActiveNavId, parentGroupId, navUrl, overviewUrl, navScopeSwitchUrl, resolveResourceKey, componentKeepsPage, type Scope } from '../nav';
import { isSettingsSectionVisible, type SettingsSectionDef } from '../constants/orgSettingsSections';
import { trackEvent } from '../services/tracking/tracking';
import { cloudConsoleOrganizationsUrl, cloudConsoleSubscriptionsUrl, componentOverviewUrl, documentationUrl, loginUrl, orgHomeUrl, privacyPolicyUrl, projectsRedirectUrl, termsOfUseUrl } from '../paths';
import { formatDocumentTitle, pageTitleFor } from '../utils/documentTitle';
import { useAccessControl } from '../contexts/AccessControlContext';
import { useCan } from '../hooks/useCan';
import { Scopes } from '../constants/permissions';
import { useLeaveGuard } from '../contexts/UnsavedChangesContext';

// ComplexSelect is content-sized, and at org level there is no card beside the icon to stretch against.
import { useLoadedImage } from '../hooks/useLoadedImage';
import { withTrackParam } from '../hooks/useSelectedTrack';
import { DB_TRADEMARK_NOTICE } from '../constants/platformServices';
import { UUID_RE, userInitials } from '../utils/string';
import { configuredMoesifOrigin } from '../utils/moesif';
import { local } from '../utils/storage';
import { expandedMenusFrom } from '../utils/sidebar';

// The theme's paper is 78% opaque and relies on a backdrop blur, which the trial usage panel (inside the header's own
// blur) doesn't get, so the page showed through.
const trialPanelSx = (theme: Theme) => ({
  // The paper token at full opacity: white in light mode, midnight ink in dark.
  backgroundColor: `rgb(from ${(theme.vars ?? theme).palette.background.paper} r g b / 1)`,
  backdropFilter: 'none',
});

// Matches Agent Manager's level switcher arrow.
const nextScopeArrowSx = {
  p: 1,
  color: 'text.primary',
  border: 1,
  borderColor: 'divider',
  borderRadius: 0.5,
  '&:hover': { borderColor: 'text.primary' },
} as const;

export default function AppLayout(): JSX.Element {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const scope = useScope();

  const { username, displayName, pictureUrl, logout, userId, orgHandle: sessionOrg } = useAuth();
  const userName = displayName || username || 'User';
  // Oxygen falls back to one letter when a picture fails, so it only gets the picture once it has loaded.
  const loadedPicture = useLoadedImage(pictureUrl);
  const userAvatar = loadedPicture ?? userInitials(userName);
  const { hasAnyPermission } = useAccessControl();
  const can = useCan();
  const canReadLogs = can(Scopes.LOG_READ);
  const canReadIntegrations = can(Scopes.INTEGRATION_READ);
  const apiInsightsEnabled = configuredMoesifOrigin() !== null;

  // Billing trial indicator shown in the header.
  const { org: billingOrg } = useBillingOrg(BILLING_PRODUCT_CODE);
  const billingTrial = billingOrg?.subscription?.status === 'trial' ? billingOrg.subscription.trial : null;
  const trialEndLabel = billingTrial?.trial_end ? `Trial ends ${new Date(billingTrial.trial_end).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : undefined;
  const orgUuid = useOrgUuid();
  const billingUpgradesConfigured = !!window.API_CONFIG?.enableBillingFeature && !!window.API_CONFIG?.billingConsoleUrl;
  const { data: componentLimits } = useOrgComponentLimits(billingTrial ? (orgUuid ?? '') : '');
  // Shown only where billing upgrades are configured; its Upgrade button links to the subscriptions page, as the badge does.
  const trialUsage: TrialBadgeUsage | undefined =
    componentLimits && billingUpgradesConfigured
      ? { title: 'Integrations', items: [{ key: 'integrations', label: 'Integrations', count: componentLimits.billableComponentCount, limit: FREE_COMPONENT_LIMIT }], footerText: null, upgradeHref: cloudConsoleSubscriptionsUrl() }
      : undefined;

  // useAppShell's internal mobile-collapse effect keys off this options object's identity —
  // a fresh literal here re-triggers it (and its setState) on every render, which on a
  // sub-'md'-breakpoint viewport becomes an infinite render loop.
  const appShellOptions = useMemo(() => ({ initialCollapsed: local.get('sidebar:collapsed') === 'true' }), []);
  const { state: shell, actions } = useAppShell(appShellOptions);

  const handleToggleSidebar = () => {
    local.set('sidebar:collapsed', String(!shell.sidebarCollapsed));
    actions.toggleSidebar();
  };

  const activeNavId = useMemo(() => resolveActiveNavId(pathname, scope), [pathname, scope]);

  useEffect(() => {
    document.title = formatDocumentTitle(pageTitleFor(activeNavId));
  }, [activeNavId]);

  // Groups start expanded, so only the ones the user closed are tracked.
  const [collapsedMenus, setCollapsedMenus] = useState<ReadonlySet<string>>(() => new Set());
  const expandedMenus = useMemo(() => expandedMenusFrom(collapsedMenus), [collapsedMenus]);
  const toggleMenu = (id: string) =>
    setCollapsedMenus((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  // Navigating to a child reopens its group if the user had closed it.
  useEffect(() => {
    const parent = parentGroupId(scope, activeNavId);
    if (parent) setCollapsedMenus((prev) => (prev.has(parent) ? new Set([...prev].filter((id) => id !== parent)) : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNavId]);

  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const orgCardRef = useRef<HTMLDivElement>(null);
  const projectCardRef = useRef<HTMLDivElement>(null);
  const integrationCardRef = useRef<HTMLDivElement>(null);
  const [projectMenuAnchor, setProjectMenuAnchor] = useState<HTMLElement | null>(null);
  const [projectMenuDir, setProjectMenuDir] = useState<'right' | 'below'>('right');
  const [projectSearch, setProjectSearch] = useState('');
  const projectSearchRef = useRef<HTMLInputElement>(null);
  const [componentMenuAnchor, setComponentMenuAnchor] = useState<HTMLElement | null>(null);
  const [componentMenuDir, setComponentMenuDir] = useState<'right' | 'below'>('right');
  const [componentSearch, setComponentSearch] = useState('');
  const componentSearchRef = useRef<HTMLInputElement>(null);
  const { data: orgsData = [] } = useOrgs();
  // The handle stays in the URL; the header shows the org's display name when the token carries one.
  const orgDisplayName = orgsData.find((o) => o.handle === scope.org)?.name || scope.org;

  const projectParam = hasProject(scope) ? scope.project : '';
  const isProjectUuid = UUID_RE.test(projectParam);
  const { data: projectByHandler } = useProjectByHandler(!isProjectUuid ? projectParam : '');
  const { data: projectById } = useProject(isProjectUuid ? projectParam : '');
  const { data: projects = [] } = useProjects();
  const projectFromList = !isProjectUuid && projectParam ? (projects.find((p) => p.handler === projectParam) ?? null) : null;
  // The lookup above still needs the finalizing project so the one you are viewing resolves.
  const selectableProjects = projects.filter((p) => !p.deleting);
  const project = isProjectUuid ? projectById : (projectByHandler ?? projectFromList);
  const projectId = project?.id ?? '';
  const { data: allComponents = [] } = useComponents(scope.org, projectId);
  const components = allComponents.filter((c) => isSupportedIntegration(c.displayType, c.componentSubType ?? null, c.buildpackType));

  // Helper to get project display name with fallback to projects list
  const getProjectDisplayName = () => {
    if (project?.name) return project.name;
    // Fallback: search in projects list by handler or id
    if (hasProject(scope)) {
      const foundProject = projects.find((p) => p.handler === scope.project || p.id === scope.project || String(p.id) === scope.project);
      if (foundProject?.name) return foundProject.name;
      return isProjectUuid ? 'Loading...' : scope.project;
    }
    return '';
  };

  // Helper to get component display name with fallback to components list
  const getComponentDisplayName = () => {
    if (currentComponent?.displayName) return currentComponent.displayName;
    // Search all components (not just filtered/supported types) so unsupported types still show their display name
    if (hasComponent(scope)) {
      const foundComponent = allComponents.find((c) => c.handler === scope.component || c.id === scope.component || String(c.id) === scope.component);
      if (foundComponent?.displayName) return foundComponent.displayName;
      const isUuid = UUID_RE.test(scope.component);
      return isUuid ? 'Loading...' : scope.component;
    }
    return '';
  };

  // The session is scoped to the org chosen at sign-in and can't be switched, so a link to any
  // other org shows "no access" with a way back to the user's own org.
  const orgAccessDenied = !!scope.org && scope.org !== sessionOrg;

  // Persist last visited project so post-login can navigate back to it
  useEffect(() => {
    if (userId && hasProject(scope) && !orgAccessDenied) {
      local.set(`last_project:${userId}`, JSON.stringify({ org: scope.org, project: scope.project }));
    }
  }, [userId, scope, orgAccessDenied]);

  // Find component UUID for permission checks
  const currentComponent = hasComponent(scope) ? components.find((c) => c.handler === scope.component) : undefined;
  const componentId = currentComponent?.id;

  /**
   * When switching scope from a Settings page, returns the equivalent Settings
   * URL in the target scope (same section if available, else that scope's first
   * section), or `null` if the current page isn't Settings — letting the caller
   * fall back to its normal resource routing.
   */
  const settingsSwitchUrl = (targetScope: Scope, targetProjectId: string | undefined = projectId || undefined, targetComponentId: string | undefined = componentId): string | null => {
    const canSee = (s: SettingsSectionDef) => isSettingsSectionVisible(s, (perms) => hasAnyPermission(perms, targetProjectId, targetComponentId));
    return settingsCrossScopeUrl(pathname, scope, targetScope, canSee);
  };

  const navigateTo = useAppNavigate();
  const guardNavigation = useLeaveGuard();

  // The URL now moves only once the destination's code is in, so the highlight
  // would lag the click by the whole download. Mark the clicked item at once and
  // let the resolved id take over when the route commits.
  const [pendingNavId, setPendingNavId] = useState<string | null>(null);
  useEffect(() => setPendingNavId(null), [pathname]);

  const handleNavSelect = (id: string) => {
    const url = navUrl(scope, id);
    if (!url) return;
    // Highlights only once the user agrees to leave a dirty form, so "Stay on page" keeps the current item.
    guardNavigation(() => {
      setPendingNavId(id);
      navigateTo(scope.level === 'components' ? withTrackParam(url, search) : url);
    });
  };

  return (
    <AppShell>
      <AppShell.Navbar>
        {/* Static by default, so the trial usage panel (rendered inside it) would sit under the page. */}
        <Header sx={{ position: 'relative', zIndex: 'appBar' }}>
          {/* Platforms lead the bar, as in the WSO2 Cloud console; the sidebar collapses from its own foot. */}
          <PlatformSwitcher />
          <Header.Brand>
            <Header.BrandLogo>
              <NavLink to={orgHomeUrl(scope.org)} onClick={() => trackEvent('navbar-home')} style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
                <Logo />
              </NavLink>
            </Header.BrandLogo>
          </Header.Brand>
          <Header.Switchers showDivider={false}>
            {/* Matches the Project/Integration cards. */}
            <Box
              ref={orgCardRef}
              role="button"
              tabIndex={0}
              sx={{ position: 'relative', display: 'inline-flex', alignSelf: 'center', cursor: 'pointer', ml: 1 }}
              onClick={() => navigateTo(orgHomeUrl(scope.org))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigateTo(orgHomeUrl(scope.org));
                }
              }}>
              <ComplexSelect
                value={scope.org}
                open={false}
                onChange={() => {}}
                onOpen={() => {}}
                size="small"
                sx={{ minWidth: 180, maxWidth: 220, '& .MuiListItemText-root': { minWidth: 0, overflow: 'hidden' } }}
                IconComponent={() => null}
                SelectDisplayProps={{ 'aria-label': 'Select organization' }}
                renderValue={() => <ComplexSelect.MenuItem.Text primary={orgDisplayName} secondary="Organization" primaryTypographyProps={{ noWrap: true, title: orgDisplayName }} />}
                label="Organization">
                <ComplexSelect.MenuItem value={scope.org}>
                  <ComplexSelect.MenuItem.Text primary={orgDisplayName} secondary="Organization" primaryTypographyProps={{ noWrap: true, title: orgDisplayName }} />
                </ComplexSelect.MenuItem>
              </ComplexSelect>
            </Box>
            {!hasProject(scope) && !projectMenuAnchor && (
              <Tooltip title="Select project">
                <IconButton
                  aria-label="Select project"
                  size="small"
                  sx={nextScopeArrowSx}
                  onClick={() => {
                    setProjectMenuDir('right');
                    setProjectMenuAnchor(orgCardRef.current);
                  }}>
                  <ChevronRight size={20} />
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
              TransitionProps={{ onEntered: () => projectSearchRef.current?.focus() }}
              PaperProps={{ sx: { width: 260, ...(projectMenuDir === 'right' ? { ml: 1 } : { mt: 0.5 }) } }}>
              <Box sx={{ px: 2, pt: 1.5, pb: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Project
                </Typography>
                <SearchBar size="small" fullWidth placeholder="Search projects" inputRef={projectSearchRef} value={projectSearch} onChange={(e) => setProjectSearch(e.target.value)} />
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
                  navigateTo(newProjectUrl({ org: scope.org }));
                }}>
                Create project
              </Button>
              <Divider />
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 2, pt: 1, pb: 0.5 }}>
                All projects
              </Typography>
              {selectableProjects.filter((p) => !projectSearch.trim() || p.name.toLowerCase().includes(projectSearch.trim().toLowerCase())).length === 0 ? (
                <MenuItem disabled>No projects found</MenuItem>
              ) : (
                selectableProjects
                  .filter((p) => !projectSearch.trim() || p.name.toLowerCase().includes(projectSearch.trim().toLowerCase()))
                  .map((p) => (
                    <MenuItem
                      key={p.id}
                      selected={hasProject(scope) && (scope.project === p.handler || scope.project === p.id)}
                      onClick={() => {
                        trackEvent('navbar-project-dropdown-existing');
                        setProjectMenuAnchor(null);
                        setProjectSearch('');
                        const newScope = narrow({ level: 'organizations', org: scope.org }, p.handler);
                        // Settings sections are a section-aware sub-matrix; everything else preserves its resource key.
                        const settingsUrl = settingsSwitchUrl(newScope, p.id, undefined);
                        navigateTo(settingsUrl ?? navScopeSwitchUrl(pathname, scope, newScope));
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
                  onClick={() => {
                    const ps = { level: 'projects' as const, org: scope.org, project: scope.project };
                    navigateTo(hasComponent(scope) ? navScopeSwitchUrl(pathname, scope, ps) : overviewUrl(ps));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      const ps = { level: 'projects' as const, org: scope.org, project: scope.project };
                      navigateTo(hasComponent(scope) ? navScopeSwitchUrl(pathname, scope, ps) : overviewUrl(ps));
                    }
                  }}>
                  <ComplexSelect
                    value={project?.handler ?? scope.project}
                    open={false}
                    onChange={() => {}}
                    onOpen={() => {}}
                    size="small"
                    sx={{ minWidth: 160, maxWidth: 220, '& .MuiListItemText-root': { minWidth: 0, overflow: 'hidden' } }}
                    IconComponent={({ ownerState: _ownerState, ...props }) => (
                      <span
                        {...props}
                        role="button"
                        tabIndex={0}
                        aria-label="Change project"
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
                    renderValue={() => <ComplexSelect.MenuItem.Text primary={getProjectDisplayName()} secondary="Project" primaryTypographyProps={{ noWrap: true, title: getProjectDisplayName() }} />}
                    label="Project">
                    {/* Hidden items ensure renderValue always fires — ComplexSelect skips renderValue when value matches a visible item,
                        so all items are hidden. The dropdown is handled by the Popover, not ComplexSelect's own open state. */}
                    <ComplexSelect.MenuItem key="__project_placeholder__" value={scope.project} sx={{ display: 'none' }}>
                      <ComplexSelect.MenuItem.Text primary={getProjectDisplayName()} secondary="Project" primaryTypographyProps={{ noWrap: true, title: getProjectDisplayName() }} />
                    </ComplexSelect.MenuItem>
                    {selectableProjects.map((p) => (
                      <ComplexSelect.MenuItem key={p.handler} value={p.handler} sx={{ display: 'none' }}>
                        <ComplexSelect.MenuItem.Text primary={p.name} secondary={p.description} primaryTypographyProps={{ noWrap: true, title: p.name }} />
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
                      const settingsUrl = settingsSwitchUrl(orgScope, undefined, undefined);
                      navigateTo(settingsUrl ?? navScopeSwitchUrl(pathname, scope, orgScope));
                    }}>
                    <X size={16} />
                  </IconButton>
                </Box>
                {!hasComponent(scope) && !componentMenuAnchor && (
                  <Tooltip title="Select integration">
                    <IconButton
                      aria-label="Select integration"
                      size="small"
                      sx={nextScopeArrowSx}
                      onClick={() => {
                        setComponentMenuDir('right');
                        setComponentMenuAnchor(projectCardRef.current);
                      }}>
                      <ChevronRight size={20} />
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
                  TransitionProps={{ onEntered: () => componentSearchRef.current?.focus() }}
                  PaperProps={{ sx: { width: 260, ...(componentMenuDir === 'right' ? { ml: 1 } : { mt: 0.5 }) } }}>
                  <Box sx={{ px: 2, pt: 1.5, pb: 1 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                      Integration
                    </Typography>
                    <SearchBar size="small" fullWidth placeholder="Search integrations" inputRef={componentSearchRef} value={componentSearch} onChange={(e) => setComponentSearch(e.target.value)} />
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
                      navigateTo(newComponentUrl({ org: scope.org, project: scope.project }));
                    }}>
                    Create integration
                  </Button>
                  <Divider />
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 2, pt: 1, pb: 0.5 }}>
                    All integrations
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
                            // A generic-only tab (Lifecycle, API Info, Plans, …) can't survive a switch to a non-generic integration,
                            // nor a workflow-only one (Workflows, Human Tasks) a switch to an integration that runs no workflows.
                            const currentKey = resolveResourceKey(pathname, scope);
                            const target = { isGenericService: GENERIC_SERVICE_TYPES.has(c.displayType), isWorkflow: isWorkflowIntegration(c) };
                            if (!componentKeepsPage(currentKey, target)) {
                              navigateTo(componentOverviewUrl(scope.org, scope.project, c.handler));
                              return;
                            }
                            navigateTo(navScopeSwitchUrl(pathname, scope, newScope));
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
                onClick={() => navigateTo(withTrackParam(overviewUrl(scope), search))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigateTo(withTrackParam(overviewUrl(scope), search));
                  }
                }}>
                <ComplexSelect
                  value={scope.component}
                  open={false}
                  onChange={() => {}}
                  onOpen={() => {}}
                  size="small"
                  sx={{ minWidth: 160, maxWidth: 220, '& .MuiListItemText-root': { minWidth: 0, overflow: 'hidden' } }}
                  IconComponent={({ ownerState: _ownerState, ...props }) => (
                    <span
                      {...props}
                      role="button"
                      tabIndex={0}
                      aria-label="Change integration"
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
                  renderValue={() => <ComplexSelect.MenuItem.Text primary={getComponentDisplayName()} secondary="Integration" primaryTypographyProps={{ noWrap: true, title: getComponentDisplayName() }} />}
                  label="Integration">
                  {/* Fallback keeps the value valid while components are loading */}
                  {!components.some((c) => c.handler === scope.component) && (
                    <ComplexSelect.MenuItem key="__current" value={scope.component} sx={{ display: 'none' }}>
                      <ComplexSelect.MenuItem.Text primary={getComponentDisplayName()} secondary="Integration" primaryTypographyProps={{ noWrap: true, title: getComponentDisplayName() }} />
                    </ComplexSelect.MenuItem>
                  )}
                  {components.map((c) => (
                    <ComplexSelect.MenuItem key={c.id} value={c.handler}>
                      <ComplexSelect.MenuItem.Text primary={c.displayName} secondary={c.displayType} primaryTypographyProps={{ noWrap: true, title: c.displayName }} />
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
                    const settingsUrl = settingsSwitchUrl(projectScope, projectId || undefined, undefined);
                    navigateTo(settingsUrl ?? navScopeSwitchUrl(pathname, scope, projectScope));
                  }}>
                  <X size={16} />
                </IconButton>
              </Box>
            )}
          </Header.Switchers>
          <Header.Spacer />
          <Header.Actions>
            {billingTrial && (
              // TrialBadge forwards no ref for a MUI Tooltip, so the end date rides on the native title. Its usage panel
              // renders inside this Box (no portal), so its card is made opaque here.
              <Box sx={(theme) => ({ display: 'contents', '& .MuiPopper-root .MuiCard-root': trialPanelSx(theme) })}>
                <TrialBadge daysLeft={billingTrial.days_remaining} totalDays={trialLengthDays(billingOrg)} upgradeHref={cloudConsoleSubscriptionsUrl()} usage={trialUsage} title={trialEndLabel} />
              </Box>
            )}
            {/* A plain link: the WSO2 Cloud console serves this path, not this console's router. */}
            <Tooltip title="Organization settings">
              <IconButton component="a" href={cloudConsoleOrganizationsUrl()} aria-label="Organization settings" sx={{ color: 'text.secondary' }}>
                <Settings />
              </IconButton>
            </Tooltip>
            <ColorSchemeToggle />
            <UserMenu>
              <UserMenu.Trigger name={userName} avatar={userAvatar} />
              <UserMenu.Header name={userName} email={username} role="Admin" avatar={userAvatar} />
              <UserMenu.Divider />
              <UserMenu.Logout icon={<LogOut size={18} />} label="Sign out" onClick={() => setConfirmDialogOpen(true)} />
            </UserMenu>
          </Header.Actions>
        </Header>
      </AppShell.Navbar>

      <AppShell.Sidebar>
        <Sidebar
          collapsed={shell.sidebarCollapsed}
          activeItem={pendingNavId ?? activeNavId}
          expandedMenus={expandedMenus}
          onSelect={handleNavSelect}
          onToggleExpand={toggleMenu}
          sx={{
            backgroundColor: 'background.acrylic',
            backdropFilter: 'blur(3px)',
          }}>
          <Sidebar.Nav>
            {!hasProject(scope)
              ? /* Org-level nav */
                [
                  <Sidebar.Category key="org-overview">
                    <Sidebar.Item id="org-overview">
                      <Sidebar.ItemIcon>
                        <LayoutDashboard size={20} />
                      </Sidebar.ItemIcon>
                      <Sidebar.ItemLabel>Overview</Sidebar.ItemLabel>
                    </Sidebar.Item>
                    <Sidebar.Item id="org-projects">
                      <Sidebar.ItemIcon>
                        <BoxIcon size={20} />
                      </Sidebar.ItemIcon>
                      <Sidebar.ItemLabel>Projects</Sidebar.ItemLabel>
                    </Sidebar.Item>
                  </Sidebar.Category>,

                  <Sidebar.Category key="org-main">
                    <Sidebar.Item id="build">
                      <Sidebar.ItemIcon>
                        <Hammer size={20} />
                      </Sidebar.ItemIcon>
                      <Sidebar.ItemLabel>Build</Sidebar.ItemLabel>
                    </Sidebar.Item>

                    <Sidebar.Item id="org-deploy">
                      <Sidebar.ItemIcon>
                        <Rocket size={20} />
                      </Sidebar.ItemIcon>
                      <Sidebar.ItemLabel>Deploy</Sidebar.ItemLabel>
                    </Sidebar.Item>

                    <Sidebar.Item id="org-test">
                      <Sidebar.ItemIcon>
                        <FlaskConical size={20} />
                      </Sidebar.ItemIcon>
                      <Sidebar.ItemLabel>Test</Sidebar.ItemLabel>
                    </Sidebar.Item>

                    {apiInsightsEnabled && (
                      <Sidebar.Item id="org-insights">
                        <Sidebar.ItemIcon>
                          <ChartColumn size={20} />
                        </Sidebar.ItemIcon>
                        <Sidebar.ItemLabel>API Insights</Sidebar.ItemLabel>
                      </Sidebar.Item>
                    )}

                    <Sidebar.Item id="org-observability">
                      <Sidebar.ItemIcon>
                        <Activity size={20} />
                      </Sidebar.ItemIcon>
                      <Sidebar.ItemLabel>Observe</Sidebar.ItemLabel>
                      <Sidebar.Item id="org-logs">
                        <Sidebar.ItemIcon>
                          <Logs size={20} />
                        </Sidebar.ItemIcon>
                        <Sidebar.ItemLabel>Runtime logs</Sidebar.ItemLabel>
                      </Sidebar.Item>
                      <Sidebar.Item id="org-metrics">
                        <Sidebar.ItemIcon>
                          <Gauge size={20} />
                        </Sidebar.ItemIcon>
                        <Sidebar.ItemLabel>Metrics</Sidebar.ItemLabel>
                      </Sidebar.Item>
                    </Sidebar.Item>
                  </Sidebar.Category>,

                  <Sidebar.Category key="org-ai">
                    <Sidebar.Item id="org-ai-services">
                      <Sidebar.ItemIcon>
                        <Sparkles size={20} />
                      </Sidebar.ItemIcon>
                      <Sidebar.ItemLabel>AI Services</Sidebar.ItemLabel>
                      {canReadIntegrations && (
                        <Sidebar.Item id="org-knowledge-bases">
                          <Sidebar.ItemIcon>
                            <BookOpen size={20} />
                          </Sidebar.ItemIcon>
                          <Sidebar.ItemLabel>Knowledge Bases</Sidebar.ItemLabel>
                        </Sidebar.Item>
                      )}
                      {canReadIntegrations && (
                        <Sidebar.Item id="org-voice-agents">
                          <Sidebar.ItemIcon>
                            <Mic size={20} />
                          </Sidebar.ItemIcon>
                          <Sidebar.ItemLabel>Voice agents</Sidebar.ItemLabel>
                        </Sidebar.Item>
                      )}
                    </Sidebar.Item>
                  </Sidebar.Category>,

                  <Sidebar.Category key="org-infra">
                    {/* Managed services integrations connect to: databases today, caches and brokers to come. */}
                    {canReadIntegrations && (
                      <Sidebar.Item id="org-platform-services">
                        <Sidebar.ItemIcon>
                          <Database size={20} />
                        </Sidebar.ItemIcon>
                        <Sidebar.ItemLabel>Platform Services</Sidebar.ItemLabel>
                      </Sidebar.Item>
                    )}
                    {/* Configure carries Package Registries and the User Portal. */}
                    <Sidebar.Item id="org-settings">
                      <Sidebar.ItemIcon>
                        <SlidersHorizontal size={20} />
                      </Sidebar.ItemIcon>
                      <Sidebar.ItemLabel>Configure</Sidebar.ItemLabel>
                    </Sidebar.Item>
                  </Sidebar.Category>,
                ]
              : hasComponent(scope)
                ? (() => {
                    const isGenericService = GENERIC_SERVICE_TYPES.has(currentComponent?.displayType ?? '');
                    // External CI is a paid, Bring-Your-Own-Image-only feature.
                    const integrationType = identifyIntegration(currentComponent?.displayType ?? '', currentComponent?.componentSubType ?? null).type;
                    const runtimeLogsType = ['file-integration', 'event-integration'].includes(integrationType);
                    const aiAgentType = integrationType === 'ai-agent';
                    const voiceAgentType = integrationType === 'voice-agent';
                    // A workflow integration's runs and the human tasks they wait on.
                    const workflowType = integrationType === 'workflow';
                    // MCP (server + proxy): a single Test tab → the MCP playground
                    // (@wso2-org/mcp-playground). No Console/API-Chat sub-items.
                    const mcpType = integrationType === 'mcp-server' || integrationType === 'mcp-proxy';
                    // Settings shows only when the integration has a section the user can open.
                    const hasSettings =
                      !!currentComponent &&
                      visibleComponentSettingsSections(identifyIntegration(currentComponent.displayType ?? '', currentComponent.componentSubType ?? null), (perms) => hasAnyPermission(perms, projectId || undefined, componentId)).length > 0;
                    return [
                      <Sidebar.Category key="int-overview">
                        <Sidebar.Item id="overview">
                          <Sidebar.ItemIcon>
                            <LayoutDashboard size={20} />
                          </Sidebar.ItemIcon>
                          <Sidebar.ItemLabel>Overview</Sidebar.ItemLabel>
                        </Sidebar.Item>
                      </Sidebar.Category>,

                      <Sidebar.Category key="int-main">
                        <Sidebar.Item id="build">
                          <Sidebar.ItemIcon>
                            <Hammer size={20} />
                          </Sidebar.ItemIcon>
                          <Sidebar.ItemLabel>Build</Sidebar.ItemLabel>
                        </Sidebar.Item>

                        <Sidebar.Item id="deploy">
                          <Sidebar.ItemIcon>
                            <Rocket size={20} />
                          </Sidebar.ItemIcon>
                          <Sidebar.ItemLabel>Deploy</Sidebar.ItemLabel>
                        </Sidebar.Item>

                        {aiAgentType ? (
                          <Sidebar.Item id="agent-chat">
                            <Sidebar.ItemIcon>
                              <FlaskConical size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>Test</Sidebar.ItemLabel>
                          </Sidebar.Item>
                        ) : voiceAgentType ? (
                          <Sidebar.Item id="voice-agent">
                            <Sidebar.ItemIcon>
                              <FlaskConical size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>Test</Sidebar.ItemLabel>
                          </Sidebar.Item>
                        ) : workflowType ? null : mcpType || !isGenericService || runtimeLogsType ? (
                          <Sidebar.Item id="test">
                            <Sidebar.ItemIcon>
                              <FlaskConical size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>Test</Sidebar.ItemLabel>
                          </Sidebar.Item>
                        ) : (
                          <Sidebar.Item id="test">
                            <Sidebar.ItemIcon>
                              <FlaskConical size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>Test</Sidebar.ItemLabel>
                          </Sidebar.Item>
                        )}

                        <Sidebar.Item id="observability">
                          <Sidebar.ItemIcon>
                            <Activity size={20} />
                          </Sidebar.ItemIcon>
                          <Sidebar.ItemLabel>Observe</Sidebar.ItemLabel>
                          <Sidebar.Item id="logs">
                            <Sidebar.ItemIcon>
                              <Logs size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>Runtime logs</Sidebar.ItemLabel>
                          </Sidebar.Item>
                          <Sidebar.Item id="metrics">
                            <Sidebar.ItemIcon>
                              <Gauge size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>Metrics</Sidebar.ItemLabel>
                          </Sidebar.Item>
                          {/* Agents and Ballerina integrations are instrumented; no other integration has traces to show. */}
                          {canReadLogs && (aiAgentType || (!!currentComponent && hasIntegrationTraces(currentComponent))) && (
                            <Sidebar.Item id="traces">
                              <Sidebar.ItemIcon>
                                <Waypoints size={20} />
                              </Sidebar.ItemIcon>
                              <Sidebar.ItemLabel>Traces</Sidebar.ItemLabel>
                            </Sidebar.Item>
                          )}
                        </Sidebar.Item>

                        <Sidebar.Item id="operate">
                          <Sidebar.ItemIcon>
                            <Wrench size={20} />
                          </Sidebar.ItemIcon>
                          <Sidebar.ItemLabel>Operate</Sidebar.ItemLabel>
                          {workflowType && (
                            <Sidebar.Item id="workflows">
                              <Sidebar.ItemIcon>
                                <Workflow size={20} />
                              </Sidebar.ItemIcon>
                              <Sidebar.ItemLabel>Workflows</Sidebar.ItemLabel>
                            </Sidebar.Item>
                          )}
                          {workflowType && (
                            <Sidebar.Item id="human-tasks">
                              <Sidebar.ItemIcon>
                                <ClipboardCheck size={20} />
                              </Sidebar.ItemIcon>
                              <Sidebar.ItemLabel>Human Tasks</Sidebar.ItemLabel>
                            </Sidebar.Item>
                          )}
                          <Sidebar.Item id="runtime">
                            <Sidebar.ItemIcon>
                              <Server size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>Runtime</Sidebar.ItemLabel>
                          </Sidebar.Item>
                          <Sidebar.Item id="containers">
                            <Sidebar.ItemIcon>
                              <Boxes size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>Containers</Sidebar.ItemLabel>
                          </Sidebar.Item>
                          <Sidebar.Item id="configs-secrets">
                            <Sidebar.ItemIcon>
                              <FileLock size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>Configs &amp; secrets</Sidebar.ItemLabel>
                          </Sidebar.Item>
                          {isGenericService && (
                            <Sidebar.Item id="health-checks">
                              <Sidebar.ItemIcon>
                                <HeartPulse size={20} />
                              </Sidebar.ItemIcon>
                              <Sidebar.ItemLabel>Health checks</Sidebar.ItemLabel>
                            </Sidebar.Item>
                          )}
                          {isGenericService && (
                            <Sidebar.Item id="scaling">
                              <Sidebar.ItemIcon>
                                <Maximize2 size={20} />
                              </Sidebar.ItemIcon>
                              <Sidebar.ItemLabel>Scaling</Sidebar.ItemLabel>
                            </Sidebar.Item>
                          )}
                        </Sidebar.Item>
                      </Sidebar.Category>,

                      <Sidebar.Category key="int-infra">
                        {/* Managed services integrations connect to: databases today, caches and brokers to come. */}
                        {canReadIntegrations && (
                          <Sidebar.Item id="org-platform-services">
                            <Sidebar.ItemIcon>
                              <Database size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>Platform Services</Sidebar.ItemLabel>
                          </Sidebar.Item>
                        )}
                        {hasSettings && (
                          <Sidebar.Item id="component-settings">
                            <Sidebar.ItemIcon>
                              <SlidersHorizontal size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>Configure</Sidebar.ItemLabel>
                          </Sidebar.Item>
                        )}
                      </Sidebar.Category>,
                    ];
                  })()
                : /* Project-level nav */
                  [
                    <Sidebar.Category key="proj-overview">
                      <Sidebar.Item id="proj-overview">
                        <Sidebar.ItemIcon>
                          <LayoutDashboard size={20} />
                        </Sidebar.ItemIcon>
                        <Sidebar.ItemLabel>Overview</Sidebar.ItemLabel>
                      </Sidebar.Item>
                    </Sidebar.Category>,

                    <Sidebar.Category key="proj-main">
                      <Sidebar.Item id="proj-build">
                        <Sidebar.ItemIcon>
                          <Hammer size={20} />
                        </Sidebar.ItemIcon>
                        <Sidebar.ItemLabel>Build</Sidebar.ItemLabel>
                      </Sidebar.Item>

                      <Sidebar.Item id="proj-deploy">
                        <Sidebar.ItemIcon>
                          <Rocket size={20} />
                        </Sidebar.ItemIcon>
                        <Sidebar.ItemLabel>Deploy</Sidebar.ItemLabel>
                      </Sidebar.Item>

                      <Sidebar.Item id="proj-test">
                        <Sidebar.ItemIcon>
                          <FlaskConical size={20} />
                        </Sidebar.ItemIcon>
                        <Sidebar.ItemLabel>Test</Sidebar.ItemLabel>
                      </Sidebar.Item>

                      <Sidebar.Item id="proj-observability">
                        <Sidebar.ItemIcon>
                          <Activity size={20} />
                        </Sidebar.ItemIcon>
                        <Sidebar.ItemLabel>Observe</Sidebar.ItemLabel>
                        <Sidebar.Item id="proj-logs">
                          <Sidebar.ItemIcon>
                            <Logs size={20} />
                          </Sidebar.ItemIcon>
                          <Sidebar.ItemLabel>Runtime logs</Sidebar.ItemLabel>
                        </Sidebar.Item>
                        <Sidebar.Item id="proj-metrics">
                          <Sidebar.ItemIcon>
                            <Gauge size={20} />
                          </Sidebar.ItemIcon>
                          <Sidebar.ItemLabel>Metrics</Sidebar.ItemLabel>
                        </Sidebar.Item>
                      </Sidebar.Item>
                    </Sidebar.Category>,

                    <Sidebar.Category key="proj-infra">
                      {/* Managed services integrations connect to: databases today, caches and brokers to come. */}
                      {canReadIntegrations && (
                        <Sidebar.Item id="org-platform-services">
                          <Sidebar.ItemIcon>
                            <Database size={20} />
                          </Sidebar.ItemIcon>
                          <Sidebar.ItemLabel>Platform Services</Sidebar.ItemLabel>
                        </Sidebar.Item>
                      )}
                    </Sidebar.Category>,
                  ]}
          </Sidebar.Nav>
          <Sidebar.Footer>
            <Sidebar.CollapseToggle onToggle={handleToggleSidebar} />
          </Sidebar.Footer>
        </Sidebar>
      </AppShell.Sidebar>

      <AppShell.Main>
        {/* Navigation progress: a GitHub-style line under the navbar. The page
            underneath stays interactive until the new route is ready to commit. */}
        {/* position:absolute;inset:0 anchors this box to the Box35 wrapper inside
            <main>, which gets position:relative via the CSS rule in index.css.
            This hard-caps the flex wrapper to the exact pixel bounds of the
            available content area, preventing any page content from overflowing
            the viewport regardless of how wide the page content is. */}
        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', overflow: 'hidden' }}>
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              height: '100%',
              overflowY: 'auto',
              overflowX: 'auto',
            }}>
            {orgAccessDenied ? (
              <NotFound message={`You don't have access to "${scope.org}". Ask an admin for an invite.`} backTo={orgHomeUrl(sessionOrg)} backLabel="Back to your organization" />
            ) : (
              <Suspense
                fallback={
                  <Box sx={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                    <CircularProgress color="primary" />
                  </Box>
                }>
                <Outlet />
              </Suspense>
            )}
          </Box>
        </Box>
      </AppShell.Main>

      <AppShell.Footer>
        {activeNavId === 'org-platform-services' && (
          <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', fontStyle: 'italic', color: 'text.disabled', px: 2, pb: 1 }}>
            {DB_TRADEMARK_NOTICE}
          </Typography>
        )}
        {/* Matches the sidebar's surface rather than sitting as a white band under it. */}
        <Footer sx={{ backgroundColor: 'background.acrylic', backdropFilter: 'blur(3px)' }}>
          <Footer.Link href={documentationUrl()} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent('navbar-documentation')}>
            Documentation
          </Footer.Link>
          <Footer.Link href="https://discord.com/invite/wso2" target="_blank" rel="noopener noreferrer">
            Support
          </Footer.Link>
          <Footer.Link href={termsOfUseUrl()} target="_blank" rel="noopener noreferrer">
            Terms of Use
          </Footer.Link>
          <Footer.Link href={privacyPolicyUrl()} target="_blank" rel="noopener noreferrer">
            Privacy Policy
          </Footer.Link>
          <Footer.Copyright>&copy; {new Date().getFullYear()}, WSO2 LLC.</Footer.Copyright>
        </Footer>
      </AppShell.Footer>

      {/* Notifications removed console-wide; this slot is kept as the mount point for
          the app-level modals below. */}
      <AppShell.NotificationPanel>
        {/* Confirm Dialog - managed locally */}
        <Dialog open={confirmDialogOpen} onClose={() => setConfirmDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Sign out</DialogTitle>
          <DialogContent>
            <DialogContentText>Are you sure you want to sign out of your account?</DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button variant="outlined" color="inherit" onClick={() => setConfirmDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={async () => {
                trackEvent('navbar-user-logout');
                await logout();
                navigate(loginUrl());
                setConfirmDialogOpen(false);
              }}>
              Sign out
            </Button>
          </DialogActions>
        </Dialog>
        {/* Not over the Terms of Use dialog on the projects redirect: that one comes first, and modals never stack. */}
        {pathname !== projectsRedirectUrl(scope.org) && <MarketingConsentDialog />}
      </AppShell.NotificationPanel>
    </AppShell>
  );
}
