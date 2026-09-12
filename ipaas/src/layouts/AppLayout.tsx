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
  Chip,
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
  InputAdornment,
  MenuItem,
  Box,
  CircularProgress,
  Popover,
  Sidebar,
  TextField,
  Tooltip,
  Typography,
  UserMenu,
  useAppShell,
} from '@wso2/oxygen-ui';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { JSX } from 'react';
import { useNavigate, Outlet, NavLink, useLocation } from 'react-router';
import { useAppNavigate } from '../hooks/useAppNavigate';
import Logo from '../components/Logo';
import NotFound from '../components/NotFound';
import {
  Activity,
  Award,
  BarChart3,
  Bell,
  Boxes,
  Brain,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Cog,
  CreditCard,
  Cpu,
  Database,
  DatabaseZap,
  Diamond,
  Eye,
  FileText,
  FlaskConical,
  GitBranch,
  Hammer,
  HardDrive,
  HeartPulse,
  KeyRound,
  Layers,
  LayoutDashboard,
  Lightbulb,
  Link2,
  LogOut,
  Maximize2,
  MessageSquare,
  Building2,
  Network,
  Plus,
  Puzzle,
  Recycle,
  Rocket,
  ScanEye,
  Scale,
  ScrollText,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Truck,
  User as UserIcon,
  Workflow,
  X,
  Webhook,
} from '@wso2/oxygen-ui-icons-react';
import FeaturePreviewModal from '../components/FeaturePreview/FeaturePreviewModal';
import { useProject, useProjectByHandler, useProjects } from '../hooks/useProjects';
import { useComponents } from '../hooks/useComponents';
import { useFreshDefaultProject } from '../hooks/useFreshDefaultProject';
import { useOrgs } from '../hooks/useOrg';
import { useBillingOrg } from '../hooks/useBillingOrg';
import { isSupportedIntegration, isByoiComponent, GENERIC_SERVICE_TYPES } from '../constants/integrations';
import { useSubscriptions } from '../hooks/useSubscription';
import { isExternalCiEnabled } from '../hooks/useExternalCi';
import { PAID_SUBSCRIPTION_TYPE } from '../constants/subscription';
import { identifyIntegration } from '../utils/identifyIntegration';
import { useOrgPermissions } from '../hooks/useAuth';
import { switchOrgToken } from '../auth/tokenManager';
import {
  useScope,
  broaden,
  narrow,
  newProjectUrl,
  newComponentUrl,
  hasProject,
  hasComponent,
  settingsCrossScopeUrl,
  resolveActiveNavId,
  parentGroupId,
  navUrl,
  overviewUrl,
  navScopeSwitchUrl,
  resolveResourceKey,
  GENERIC_ONLY_COMPONENT_KEYS,
  type Scope,
} from '../nav';
import { isSettingsSectionVisible, type SettingsSectionDef } from '../constants/orgSettingsSections';
import { componentOverviewUrl, loginUrl, orgHomeUrl, privacyPolicyUrl, profileUrl, registerOrgUrl, termsOfUseUrl } from '../paths';
import { useAuth } from '../auth/AuthContext';
import { useAccessControl } from '../contexts/AccessControlContext';
import { CopilotProvider } from '../contexts/CopilotContext';
const CopilotDrawer = lazy(() => import('../components/AiCopilot/CopilotDrawer'));

// ComplexSelect is content-sized, and at org level there is no card beside the icon to stretch against.
const SWITCHER_CARD_HEIGHT = 50;
import CopilotButton from '../components/CopilotButton';
import UpgradeButton from '../components/UpgradeButton';
import { useOrgUuid } from '../hooks/useOrgUuid';
import { IS_WIP, IS_CLOUD } from '../features';
import { ALL_USER_MGT_PERMISSIONS, Permissions } from '../constants/permissions';
import { DB_TRADEMARK_NOTICE } from '../constants/platformServices';
import { UUID_RE } from '../utils/string';

function AppLayoutInner(): JSX.Element {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const scope = useScope();

  const queryClient = useQueryClient();
  const { username, displayName, pictureUrl, logout, userId, isOidcUser } = useAuth();
  const { hasAnyPermission, setOrgPermissions } = useAccessControl();

  // Cloud-only billing trial indicator. useBillingOrg is gated to IS_CLOUD, so
  // wip/icp return null here and the chip below is never rendered or bundled.
  const { org: billingOrg } = useBillingOrg('integration-platform');
  const billingTrial = billingOrg?.subscription?.status === 'trial' ? billingOrg.subscription.trial : null;
  const trialEndLabel = billingTrial?.trial_end ? `Trial ends ${new Date(billingTrial.trial_end).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : '';

  // useAppShell's internal mobile-collapse effect keys off this options object's identity —
  // a fresh literal here re-triggers it (and its setState) on every render, which on a
  // sub-'md'-breakpoint viewport becomes an infinite render loop.
  const appShellOptions = useMemo(() => ({ initialCollapsed: localStorage.getItem('sidebar:collapsed') !== 'false' }), []);
  const { state: shell, actions } = useAppShell(appShellOptions);

  const handleToggleSidebar = () => {
    localStorage.setItem('sidebar:collapsed', String(!shell.sidebarCollapsed));
    actions.toggleSidebar();
  };

  // Lets the user manually bring the sidebar back on an empty project via the hamburger toggle,
  // which stays visible even while hideSidebarForEmptyProject is auto-hiding the sidebar itself.
  // Scoped to the project id it was shown for, so switching to a different (also empty) project
  // doesn't inherit the override.
  const [manuallyShownProjectId, setManuallyShownProjectId] = useState<string | null>(null);

  const activeNavId = useMemo(() => resolveActiveNavId(pathname, scope), [pathname, scope]);

  // Auto-expand the parent group when navigating to a child nav item.
  useEffect(() => {
    const parent = parentGroupId(scope, activeNavId);
    if (parent && !shell.expandedMenus[parent]) {
      actions.toggleMenu(parent);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNavId]);

  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [featurePreviewOpen, setFeaturePreviewOpen] = useState(false);
  const orgUuid = useOrgUuid();
  const { data: subscriptions } = useSubscriptions(orgUuid ?? '');
  const isSubscribed = (subscriptions?.list ?? []).some((s) => s.subscriptionType === PAID_SUBSCRIPTION_TYPE);
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
  const [orgMenuAnchor, setOrgMenuAnchor] = useState<HTMLElement | null>(null);
  const [orgSearch, setOrgSearch] = useState('');
  const orgSearchRef = useRef<HTMLInputElement>(null);
  const { data: orgsData = [], isLoading: orgsLoading } = useOrgs();

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

  // Shared with Project.tsx's overview-header hiding, so both surfaces hide on exactly the same
  // one-shot "just landed here right after onboarding" signal and can't drift out of sync. This
  // only fires on that first landing — navigating elsewhere and back always shows the sidebar
  // again, even if the project is still empty, so it never vanishes on a repeat visit.
  const justProvisionedDefaultProject = useFreshDefaultProject();
  // Compared against projectParam (the route segment), not projectId — projectId is '' until the
  // project record resolves over the network, so a toggle click during that window would store ''
  // and then stop matching the instant projectId resolves, silently re-hiding the sidebar right
  // after the user revealed it. projectParam is stable and known synchronously from the URL.
  const hideSidebarForEmptyProject = activeNavId === 'proj-overview' && justProvisionedDefaultProject && manuallyShownProjectId !== projectParam;

  const handleHeaderToggle = () => {
    if (hideSidebarForEmptyProject) {
      setManuallyShownProjectId(projectParam);
      return;
    }
    handleToggleSidebar();
  };

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

  // Persist last visited project so post-login can navigate back to it
  useEffect(() => {
    if (userId && hasProject(scope)) {
      localStorage.setItem(`last_project:${userId}`, JSON.stringify({ org: scope.org, project: scope.project }));
    }
  }, [userId, scope]);

  const { data: orgPermsData, isError: isOrgPermsError } = useOrgPermissions(scope.org, userId, !isOidcUser);
  useEffect(() => {
    if (isOidcUser) {
      // OIDC users are authorized via Choreo STS — grant all ICP permissions locally
      setOrgPermissions(Object.values(Permissions));
    } else if (orgPermsData) {
      setOrgPermissions(orgPermsData.permissionNames);
    } else if (isOrgPermsError) {
      setOrgPermissions([]);
    }
  }, [isOidcUser, orgPermsData, isOrgPermsError, setOrgPermissions]);

  // Recover org numeric ID if it was not saved during OIDC callback (e.g. old sessions)
  const [, setOrgIdVersion] = useState(0);
  useEffect(() => {
    if (!isOidcUser || !userId || !scope.org || !orgsData.length) return;
    const match = orgsData.find((o) => o.handle === scope.org);
    if (match && match.numericId > 0 && window.API_CONFIG.asgardeoOrgNumericId !== match.numericId) {
      window.API_CONFIG.asgardeoOrgNumericId = match.numericId;
      localStorage.setItem('org_numeric_id', String(match.numericId));
      setOrgIdVersion((v) => v + 1); // trigger re-render so queries re-evaluate orgId()
    }
  }, [isOidcUser, userId, scope.org, orgsData]);

  // Re-scope auth to the URL's org when it differs from the currently active one — e.g. a
  // shared link to org A opened by someone whose stored token/org is still scoped to org B.
  // Without this, breadcrumbs (URL-driven `scope.org`) show org A while every org-scoped query
  // (useOrgUuid, orgId() in useProjects) keeps fetching org B's data.
  //
  // Two distinct failure shapes are both surfaced as "no access", since neither leaves us with
  // a validly-scoped token to render org A's data with:
  //  - `scope.org` isn't in this user's own org list at all (they were never a member).
  //  - it IS in their list, but the STS re-scope call itself failed (e.g. revoked mid-session).
  const orgSyncingRef = useRef<string | null>(null);
  // Aborts the in-flight exchange (if any) the moment a newer one starts, so a slow, now-stale
  // request can't resolve later and persist an older org's token over the one that's since won.
  const orgSyncAbortRef = useRef<AbortController | null>(null);
  const [orgAccessDeniedFor, setOrgAccessDeniedFor] = useState<string | null>(null);
  const [isSyncingOrgToken, setIsSyncingOrgToken] = useState(false);
  useEffect(() => {
    // Wait for the org list to actually settle before judging membership — `orgsData` defaults to
    // `[]` both while the query is still loading AND once it settles with a genuinely empty list,
    // so gating on `orgsData.length` alone would let a zero-org user's mismatch go undetected forever.
    if (!scope.org || orgsLoading) return;
    const activeOrgHandle = localStorage.getItem('org_handle');
    if (activeOrgHandle === scope.org || orgSyncingRef.current === scope.org) return;
    const match = orgsData.find((o) => o.handle === scope.org);
    if (!match) {
      setOrgAccessDeniedFor(scope.org);
      return;
    }
    orgSyncAbortRef.current?.abort();
    const abortController = new AbortController();
    orgSyncAbortRef.current = abortController;
    orgSyncingRef.current = scope.org;
    setIsSyncingOrgToken(true);
    switchOrgToken(scope.org, abortController.signal)
      .then(() => {
        if (abortController.signal.aborted) return; // superseded — a newer switch already committed
        if (match.numericId > 0) {
          window.API_CONFIG.asgardeoOrgNumericId = match.numericId;
          localStorage.setItem('org_numeric_id', String(match.numericId));
        }
        setOrgAccessDeniedFor(null);
        // invalidateQueries (not clear()) — components stay mounted here (no navigation follows,
        // we're already on the right URL), so clear() would nuke the cache out from under their
        // active subscriptions and leave them stuck loading. invalidateQueries refetches in place.
        queryClient.invalidateQueries();
        setOrgIdVersion((v) => v + 1);
      })
      .catch(() => {
        if (abortController.signal.aborted) return; // superseded, not a real failure — ignore
        orgSyncingRef.current = null;
        setOrgAccessDeniedFor(scope.org);
      })
      .finally(() => {
        if (!abortController.signal.aborted) setIsSyncingOrgToken(false);
      });
  }, [scope.org, orgsData, orgsLoading, queryClient]);
  const orgAccessDenied = orgAccessDeniedFor === scope.org;
  // Hold scoped content (rather than render it against a possibly-still-wrong-org token) until
  // membership is known and any resync above has finished — an unsettled org list or an in-flight
  // token exchange both mean we can't yet tell whether `scope.org` is the right, active org.
  const orgSyncUnresolved = !!scope.org && (orgsLoading || isSyncingOrgToken);
  // Where "back to your organizations" should land: the user's own first accessible org, or the
  // create-an-org flow if they don't have one yet (both come from the same unscoped org list).
  const alternativeOrg = orgsData.find((o) => o.handle !== scope.org);
  const ownOrgFallbackUrl = alternativeOrg ? orgHomeUrl(alternativeOrg.handle) : registerOrgUrl();

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

  const accessControlPerms: string[] = [...ALL_USER_MGT_PERMISSIONS];
  if (hasProject(scope)) {
    accessControlPerms.push(Permissions.PROJECT_EDIT, Permissions.PROJECT_MANAGE);
  }
  if (hasComponent(scope)) {
    accessControlPerms.push(Permissions.INTEGRATION_EDIT, Permissions.INTEGRATION_MANAGE);
  }
  const canSeeAccessControl = hasAnyPermission(accessControlPerms, projectId || undefined, componentId);

  const navigateTo = useAppNavigate();

  // The URL now moves only once the destination's code is in, so the highlight
  // would lag the click by the whole download. Mark the clicked item at once and
  // let the resolved id take over when the route commits.
  const [pendingNavId, setPendingNavId] = useState<string | null>(null);
  useEffect(() => setPendingNavId(null), [pathname]);

  const handleNavSelect = (id: string) => {
    const url = navUrl(scope, id);
    if (!url) return;
    setPendingNavId(id);
    navigateTo(url);
  };

  return (
    <AppShell>
      <AppShell.Navbar>
        <Header>
          <Header.Toggle collapsed={hideSidebarForEmptyProject || shell.sidebarCollapsed} onToggle={handleHeaderToggle} />
          <Header.Brand>
            <Header.BrandLogo>
              <NavLink to={orgHomeUrl(scope.org)} style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
                <Logo />
              </NavLink>
            </Header.BrandLogo>
          </Header.Brand>
          <Header.Switchers showDivider={false}>
            {/* A lone org has nothing to switch to, so it collapses to an icon that just links home. */}
            {orgsData.length === 1 ? (
              // The div carries the anchor ref — IconButton's own ref is typed to a button.
              <Box ref={orgCardRef} sx={{ display: 'inline-flex', alignSelf: 'center' }}>
                <Tooltip title={scope.org}>
                  <IconButton aria-label={`Organization: ${scope.org}`} onClick={() => navigateTo(orgHomeUrl(scope.org))} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, width: SWITCHER_CARD_HEIGHT, height: SWITCHER_CARD_HEIGHT }}>
                    <Building2 size={20} />
                  </IconButton>
                </Tooltip>
              </Box>
            ) : (
              <Box
                ref={orgCardRef}
                role="button"
                tabIndex={0}
                sx={{ position: 'relative', display: 'inline-flex', alignSelf: 'center', cursor: 'pointer' }}
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
                  IconComponent={
                    IS_CLOUD
                      ? () => null
                      : ({ ownerState: _ownerState, ...props }) => (
                          <span
                            {...props}
                            role="button"
                            tabIndex={0}
                            aria-label="Change organization"
                            style={{ position: 'absolute', top: 'auto', bottom: '0', right: '6px', display: 'flex', pointerEvents: 'all', cursor: 'pointer' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOrgMenuAnchor(orgCardRef.current);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                setOrgMenuAnchor(orgCardRef.current);
                              }
                            }}>
                            <ChevronDown size={18} />
                          </span>
                        )
                  }
                  SelectDisplayProps={{ 'aria-label': 'Select organization' }}
                  renderValue={() => <ComplexSelect.MenuItem.Text primary={scope.org} secondary="Organization" primaryTypographyProps={{ noWrap: true, title: scope.org }} />}
                  label="Organization">
                  <ComplexSelect.MenuItem value={scope.org}>
                    <ComplexSelect.MenuItem.Text primary={scope.org} secondary="Organization" primaryTypographyProps={{ noWrap: true, title: scope.org }} />
                  </ComplexSelect.MenuItem>
                </ComplexSelect>
              </Box>
            )}
            <Popover
              anchorEl={orgMenuAnchor}
              open={Boolean(orgMenuAnchor)}
              onClose={() => {
                setOrgMenuAnchor(null);
                setOrgSearch('');
              }}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
              transformOrigin={{ vertical: 'top', horizontal: 'left' }}
              TransitionProps={{ onEntered: () => orgSearchRef.current?.focus() }}
              PaperProps={{ sx: { width: 260, mt: 0.5 } }}>
              <Box sx={{ px: 2, pt: 1.5, pb: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Organization
                </Typography>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="Search"
                  inputRef={orgSearchRef}
                  value={orgSearch}
                  onChange={(e) => setOrgSearch(e.target.value)}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <Search size={16} />
                      </InputAdornment>
                    ),
                  }}
                />
              </Box>
              <Divider />
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 2, pt: 1, pb: 0.5 }}>
                All Organizations
              </Typography>
              {(orgsData.length > 0 ? orgsData : [{ handle: scope.org, numericId: 0 }])
                .filter((o) => !orgSearch.trim() || o.handle.toLowerCase().includes(orgSearch.trim().toLowerCase()))
                .map((o) => (
                  <MenuItem
                    key={o.handle}
                    selected={scope.org === o.handle}
                    onClick={() => {
                      setOrgMenuAnchor(null);
                      setOrgSearch('');
                      if (o.handle === scope.org) {
                        navigateTo(orgHomeUrl(o.handle));
                        return;
                      }
                      switchOrgToken(o.handle)
                        .then(() => {
                          if (o.numericId > 0) {
                            window.API_CONFIG.asgardeoOrgNumericId = o.numericId;
                            localStorage.setItem('org_numeric_id', String(o.numericId));
                          }
                          queryClient.clear();
                          navigateTo(orgHomeUrl(o.handle));
                        })
                        .catch(() => navigateTo(orgHomeUrl(o.handle)));
                    }}>
                    {o.handle}
                  </MenuItem>
                ))}
            </Popover>
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
              TransitionProps={{ onEntered: () => projectSearchRef.current?.focus() }}
              PaperProps={{ sx: { width: 260, ...(projectMenuDir === 'right' ? { ml: 1 } : { mt: 0.5 }) } }}>
              <Box sx={{ px: 2, pt: 1.5, pb: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Project
                </Typography>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="Search"
                  inputRef={projectSearchRef}
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
                  navigateTo(newProjectUrl({ org: scope.org }));
                }}>
                Create Project
              </Button>
              <Divider />
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 2, pt: 1, pb: 0.5 }}>
                All Projects
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
                  TransitionProps={{ onEntered: () => componentSearchRef.current?.focus() }}
                  PaperProps={{ sx: { width: 260, ...(componentMenuDir === 'right' ? { ml: 1 } : { mt: 0.5 }) } }}>
                  <Box sx={{ px: 2, pt: 1.5, pb: 1 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                      Integration
                    </Typography>
                    <TextField
                      size="small"
                      fullWidth
                      placeholder="Search"
                      inputRef={componentSearchRef}
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
                      navigateTo(newComponentUrl({ org: scope.org, project: scope.project }));
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
                            // A generic-only tab (Lifecycle, API Info, Plans, …) can't survive a switch to a non-generic integration.
                            const currentKey = resolveResourceKey(pathname, scope);
                            if (GENERIC_ONLY_COMPONENT_KEYS.has(currentKey) && !GENERIC_SERVICE_TYPES.has(c.displayType)) {
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
                onClick={() => navigateTo(overviewUrl(scope))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigateTo(overviewUrl(scope));
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
            {IS_CLOUD && billingTrial && (
              <Tooltip title={trialEndLabel}>
                <Chip label={`Trial · ${billingTrial.days_remaining} day${billingTrial.days_remaining === 1 ? '' : 's'} remaining`} color="warning" size="small" sx={{ fontWeight: 500, mr: 0.5 }} />
              </Tooltip>
            )}
            <ColorSchemeToggle />
            {IS_WIP && <CopilotButton />}
            {IS_WIP && <UpgradeButton orgUuid={orgUuid ?? ''} />}
            <Divider orientation="vertical" flexItem sx={{ mx: 1, display: { xs: 'none', sm: 'block' } }} />
            <UserMenu>
              <UserMenu.Trigger name={displayName || username || 'User'} avatar={pictureUrl} />
              <UserMenu.Header name={displayName || username || 'User'} email={username} role="Admin" avatar={pictureUrl} />
              <UserMenu.Item icon={<UserIcon size={18} />} label="Profile" onClick={() => navigateTo(profileUrl())} />
              <UserMenu.Item icon={<ScanEye size={18} />} label="Feature Preview" onClick={() => setFeaturePreviewOpen(true)} />
              <UserMenu.Divider />
              <UserMenu.Logout icon={<LogOut size={18} />} label="Sign Out" onClick={() => setConfirmDialogOpen(true)} />
            </UserMenu>
          </Header.Actions>
        </Header>
      </AppShell.Navbar>

      {!hideSidebarForEmptyProject && (
        <AppShell.Sidebar>
          <Sidebar
            collapsed={shell.sidebarCollapsed}
            activeItem={pendingNavId ?? activeNavId}
            expandedMenus={shell.expandedMenus}
            onSelect={handleNavSelect}
            onToggleExpand={actions.toggleMenu}
            sx={{
              backgroundColor: 'background.acrylic',
              backdropFilter: 'blur(3px)',
            }}>
            <Sidebar.Nav>
              {!hasProject(scope)
                ? /* Org-level nav */
                  [
                    <Sidebar.Category key="org-overview">
                      <Sidebar.Item id="overview">
                        <Sidebar.ItemIcon>
                          <LayoutDashboard size={20} />
                        </Sidebar.ItemIcon>
                        <Sidebar.ItemLabel>Overview</Sidebar.ItemLabel>
                      </Sidebar.Item>
                    </Sidebar.Category>,

                    <Sidebar.Category key="org-main">
                      {!IS_CLOUD && (
                        <Sidebar.Item id="org-develop">
                          <Sidebar.ItemIcon>
                            <Lightbulb size={20} />
                          </Sidebar.ItemIcon>
                          <Sidebar.ItemLabel>Develop</Sidebar.ItemLabel>
                        </Sidebar.Item>
                      )}

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

                      {!IS_CLOUD && (
                        <Sidebar.Item id="org-insights">
                          <Sidebar.ItemIcon>
                            <BarChart3 size={20} />
                          </Sidebar.ItemIcon>
                          <Sidebar.ItemLabel>Insights</Sidebar.ItemLabel>
                          <Sidebar.Item id="org-usage">
                            <Sidebar.ItemIcon>
                              <Activity size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>Usage</Sidebar.ItemLabel>
                          </Sidebar.Item>
                          <Sidebar.Item id="org-delivery">
                            <Sidebar.ItemIcon>
                              <Truck size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>Delivery</Sidebar.ItemLabel>
                          </Sidebar.Item>
                          <Sidebar.Item id="org-compliance">
                            <Sidebar.ItemIcon>
                              <ShieldCheck size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>Compliance</Sidebar.ItemLabel>
                          </Sidebar.Item>
                        </Sidebar.Item>
                      )}

                      <Sidebar.Item id="org-observability">
                        <Sidebar.ItemIcon>
                          <Eye size={20} />
                        </Sidebar.ItemIcon>
                        <Sidebar.ItemLabel>Observability</Sidebar.ItemLabel>
                        <Sidebar.Item id="org-logs">
                          <Sidebar.ItemIcon>
                            <ScrollText size={20} />
                          </Sidebar.ItemIcon>
                          <Sidebar.ItemLabel>Runtime Logs</Sidebar.ItemLabel>
                        </Sidebar.Item>
                        <Sidebar.Item id="org-metrics">
                          <Sidebar.ItemIcon>
                            <BarChart3 size={20} />
                          </Sidebar.ItemIcon>
                          <Sidebar.ItemLabel>Metrics</Sidebar.ItemLabel>
                        </Sidebar.Item>
                      </Sidebar.Item>

                      {!IS_CLOUD && (
                        <Sidebar.Item id="org-rag">
                          <Sidebar.ItemIcon>
                            <Brain size={20} />
                          </Sidebar.ItemIcon>
                          <Sidebar.ItemLabel>RAG</Sidebar.ItemLabel>
                          <Sidebar.Item id="org-scheduled-ingestion">
                            <Sidebar.ItemIcon>
                              <Clock size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>Scheduled Ingestion</Sidebar.ItemLabel>
                          </Sidebar.Item>
                          <Sidebar.Item id="org-service">
                            <Sidebar.ItemIcon>
                              <Cpu size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>Service</Sidebar.ItemLabel>
                          </Sidebar.Item>
                          <Sidebar.Item id="org-retrieval">
                            <Sidebar.ItemIcon>
                              <Diamond size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>Retrieval</Sidebar.ItemLabel>
                          </Sidebar.Item>
                        </Sidebar.Item>
                      )}
                    </Sidebar.Category>,

                    <Sidebar.Category key="org-infra">
                      {/* Cloud drops CD Pipelines/Data Planes/Environments entirely and pulls Settings
                      out to a standalone item below, so the whole Admin group has nothing left to show. */}
                      {!IS_CLOUD && (
                        <Sidebar.Item id="org-admin">
                          <Sidebar.ItemIcon>
                            <Settings2 size={20} />
                          </Sidebar.ItemIcon>
                          <Sidebar.ItemLabel>Infrastructure</Sidebar.ItemLabel>
                          <Sidebar.Item id="org-databases">
                            <Sidebar.ItemIcon>
                              <Database size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>Databases</Sidebar.ItemLabel>
                          </Sidebar.Item>
                          <Sidebar.Item id="org-vector-databases">
                            <Sidebar.ItemIcon>
                              <DatabaseZap size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>Vector Databases</Sidebar.ItemLabel>
                          </Sidebar.Item>
                          <Sidebar.Item id="org-message-brokers">
                            <Sidebar.ItemIcon>
                              <MessageSquare size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>Message Brokers</Sidebar.ItemLabel>
                          </Sidebar.Item>
                          <Sidebar.Item id="org-third-party">
                            <Sidebar.ItemIcon>
                              <Puzzle size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>Third Party Services</Sidebar.ItemLabel>
                          </Sidebar.Item>
                          <Sidebar.Item id="org-genai-services">
                            <Sidebar.ItemIcon>
                              <Sparkles size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>GenAI Services</Sidebar.ItemLabel>
                          </Sidebar.Item>
                          <Sidebar.Item id="org-config-groups">
                            <Sidebar.ItemIcon>
                              <SlidersHorizontal size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>Config Groups</Sidebar.ItemLabel>
                          </Sidebar.Item>
                          <Sidebar.Item id="org-governance">
                            <Sidebar.ItemIcon>
                              <Scale size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>Governance</Sidebar.ItemLabel>
                          </Sidebar.Item>
                          <Sidebar.Item id="org-cd-pipelines">
                            <Sidebar.ItemIcon>
                              <GitBranch size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>CD Pipelines</Sidebar.ItemLabel>
                          </Sidebar.Item>
                          <Sidebar.Item id="org-data-planes">
                            <Sidebar.ItemIcon>
                              <Network size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>Data Planes</Sidebar.ItemLabel>
                          </Sidebar.Item>
                          <Sidebar.Item id="org-environments">
                            <Sidebar.ItemIcon>
                              <Layers size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>Environments</Sidebar.ItemLabel>
                          </Sidebar.Item>
                          <Sidebar.Item id="org-audit-logs">
                            <Sidebar.ItemIcon>
                              <ClipboardList size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>Audit Logs</Sidebar.ItemLabel>
                          </Sidebar.Item>
                          <Sidebar.Item id="org-approvals">
                            <Sidebar.ItemIcon>
                              <ClipboardCheck size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>Approvals</Sidebar.ItemLabel>
                          </Sidebar.Item>
                          <Sidebar.Item id="org-certificates">
                            <Sidebar.ItemIcon>
                              <Award size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>Certificates</Sidebar.ItemLabel>
                          </Sidebar.Item>
                          {canSeeAccessControl && (
                            <Sidebar.Item id="org-settings">
                              <Sidebar.ItemIcon>
                                <Cog size={20} />
                              </Sidebar.ItemIcon>
                              <Sidebar.ItemLabel>Settings</Sidebar.ItemLabel>
                            </Sidebar.Item>
                          )}
                        </Sidebar.Item>
                      )}

                      {/* Cloud's Infrastructure group: environments come before the pipelines that promote across them. */}
                      {IS_CLOUD && (
                        <Sidebar.Item id="org-admin">
                          <Sidebar.ItemIcon>
                            <Settings2 size={20} />
                          </Sidebar.ItemIcon>
                          <Sidebar.ItemLabel>Infrastructure</Sidebar.ItemLabel>
                          <Sidebar.Item id="org-environments">
                            <Sidebar.ItemIcon>
                              <Layers size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>Environments</Sidebar.ItemLabel>
                          </Sidebar.Item>
                          <Sidebar.Item id="org-cd-pipelines">
                            <Sidebar.ItemIcon>
                              <GitBranch size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>Pipelines</Sidebar.ItemLabel>
                          </Sidebar.Item>
                        </Sidebar.Item>
                      )}

                      {/* Cloud has no Access Control, but Settings still carries Org Details + Package Registries. */}
                      {IS_CLOUD && (
                        <Sidebar.Item id="org-settings">
                          <Sidebar.ItemIcon>
                            <Cog size={20} />
                          </Sidebar.ItemIcon>
                          <Sidebar.ItemLabel>Settings</Sidebar.ItemLabel>
                        </Sidebar.Item>
                      )}
                    </Sidebar.Category>,
                  ]
                : hasComponent(scope)
                  ? (() => {
                      const isGenericService = GENERIC_SERVICE_TYPES.has(currentComponent?.displayType ?? '');
                      // External CI is a paid, Bring-Your-Own-Image-only feature.
                      const showExternalCI = isExternalCiEnabled() && isByoiComponent(currentComponent?.displayType ?? '') && isSubscribed;
                      const integrationType = identifyIntegration(currentComponent?.displayType ?? '', currentComponent?.componentSubType ?? null).type;
                      const runtimeLogsType = ['file-integration', 'event-integration'].includes(integrationType);
                      const aiAgentType = integrationType === 'ai-agent';
                      // MCP (server + proxy): a single Test tab → the MCP playground
                      // (@wso2-org/mcp-playground). No Console/API-Chat sub-items.
                      const mcpType = integrationType === 'mcp-server' || integrationType === 'mcp-proxy';
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
                          {!IS_CLOUD && (
                            <Sidebar.Item id="develop">
                              <Sidebar.ItemIcon>
                                <Lightbulb size={20} />
                              </Sidebar.ItemIcon>
                              <Sidebar.ItemLabel>Develop</Sidebar.ItemLabel>
                              <Sidebar.Item id="integration">
                                <Sidebar.ItemIcon>
                                  <Workflow size={20} />
                                </Sidebar.ItemIcon>
                                <Sidebar.ItemLabel>Integration</Sidebar.ItemLabel>
                              </Sidebar.Item>
                              {isGenericService && (
                                <Sidebar.Item id="api-info">
                                  <Sidebar.ItemIcon>
                                    <FileText size={20} />
                                  </Sidebar.ItemIcon>
                                  <Sidebar.ItemLabel>API Info</Sidebar.ItemLabel>
                                </Sidebar.Item>
                              )}
                              {isGenericService && (
                                <Sidebar.Item id="lifecycle">
                                  <Sidebar.ItemIcon>
                                    <Recycle size={20} />
                                  </Sidebar.ItemIcon>
                                  <Sidebar.ItemLabel>Lifecycle</Sidebar.ItemLabel>
                                </Sidebar.Item>
                              )}
                              {isGenericService && (
                                <Sidebar.Item id="documents">
                                  <Sidebar.ItemIcon>
                                    <FileText size={20} />
                                  </Sidebar.ItemIcon>
                                  <Sidebar.ItemLabel>Document</Sidebar.ItemLabel>
                                </Sidebar.Item>
                              )}
                              {isGenericService && (
                                <Sidebar.Item id="plans">
                                  <Sidebar.ItemIcon>
                                    <CreditCard size={20} />
                                  </Sidebar.ItemIcon>
                                  <Sidebar.ItemLabel>Plans</Sidebar.ItemLabel>
                                </Sidebar.Item>
                              )}
                            </Sidebar.Item>
                          )}

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
                          ) : mcpType || !isGenericService || runtimeLogsType ? (
                            <Sidebar.Item id="test">
                              <Sidebar.ItemIcon>
                                <FlaskConical size={20} />
                              </Sidebar.ItemIcon>
                              <Sidebar.ItemLabel>Test</Sidebar.ItemLabel>
                            </Sidebar.Item>
                          ) : IS_WIP ? (
                            <Sidebar.Item id="test">
                              <Sidebar.ItemIcon>
                                <FlaskConical size={20} />
                              </Sidebar.ItemIcon>
                              <Sidebar.ItemLabel>Test</Sidebar.ItemLabel>
                              <Sidebar.Item id="console">
                                <Sidebar.ItemIcon>
                                  <Terminal size={20} />
                                </Sidebar.ItemIcon>
                                <Sidebar.ItemLabel>Console</Sidebar.ItemLabel>
                              </Sidebar.Item>
                              <Sidebar.Item id="api-chat">
                                <Sidebar.ItemIcon>
                                  <MessageSquare size={20} />
                                </Sidebar.ItemIcon>
                                <Sidebar.ItemLabel>API Chat</Sidebar.ItemLabel>
                              </Sidebar.Item>
                            </Sidebar.Item>
                          ) : (
                            <Sidebar.Item id="test">
                              <Sidebar.ItemIcon>
                                <FlaskConical size={20} />
                              </Sidebar.ItemIcon>
                              <Sidebar.ItemLabel>Test</Sidebar.ItemLabel>
                            </Sidebar.Item>
                          )}

                          {!IS_CLOUD && (
                            <Sidebar.Item id="insights">
                              <Sidebar.ItemIcon>
                                <BarChart3 size={20} />
                              </Sidebar.ItemIcon>
                              <Sidebar.ItemLabel>Insights</Sidebar.ItemLabel>
                              <Sidebar.Item id="usage">
                                <Sidebar.ItemIcon>
                                  <Activity size={20} />
                                </Sidebar.ItemIcon>
                                <Sidebar.ItemLabel>Usage</Sidebar.ItemLabel>
                              </Sidebar.Item>
                              <Sidebar.Item id="delivery">
                                <Sidebar.ItemIcon>
                                  <Truck size={20} />
                                </Sidebar.ItemIcon>
                                <Sidebar.ItemLabel>Delivery</Sidebar.ItemLabel>
                              </Sidebar.Item>
                              <Sidebar.Item id="compliance">
                                <Sidebar.ItemIcon>
                                  <ShieldCheck size={20} />
                                </Sidebar.ItemIcon>
                                <Sidebar.ItemLabel>Compliance</Sidebar.ItemLabel>
                              </Sidebar.Item>
                            </Sidebar.Item>
                          )}

                          <Sidebar.Item id="observability">
                            <Sidebar.ItemIcon>
                              <Eye size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>Observability</Sidebar.ItemLabel>
                            {!IS_CLOUD && (
                              <Sidebar.Item id="alerts">
                                <Sidebar.ItemIcon>
                                  <Bell size={20} />
                                </Sidebar.ItemIcon>
                                <Sidebar.ItemLabel>Alerts</Sidebar.ItemLabel>
                              </Sidebar.Item>
                            )}
                            <Sidebar.Item id="logs">
                              <Sidebar.ItemIcon>
                                <ScrollText size={20} />
                              </Sidebar.ItemIcon>
                              <Sidebar.ItemLabel>Runtime Logs</Sidebar.ItemLabel>
                            </Sidebar.Item>
                            <Sidebar.Item id="metrics">
                              <Sidebar.ItemIcon>
                                <BarChart3 size={20} />
                              </Sidebar.ItemIcon>
                              <Sidebar.ItemLabel>Metrics</Sidebar.ItemLabel>
                            </Sidebar.Item>
                          </Sidebar.Item>
                        </Sidebar.Category>,

                        <Sidebar.Category key="int-infra">
                          <Sidebar.Item id="admin">
                            <Sidebar.ItemIcon>
                              <Settings2 size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>Infrastructure</Sidebar.ItemLabel>
                            {/* Neither page exists at integration level — these link up, and lead the group.
                              Rendered as separate children: a fragment hides them from the Sidebar's
                              child scan, which is what decides sub-item indentation. */}
                            {IS_CLOUD && (
                              <Sidebar.Item id="org-environments">
                                <Sidebar.ItemIcon>
                                  <Layers size={20} />
                                </Sidebar.ItemIcon>
                                <Sidebar.ItemLabel>Environments</Sidebar.ItemLabel>
                              </Sidebar.Item>
                            )}
                            {IS_CLOUD && (
                              <Sidebar.Item id="proj-cd-pipelines">
                                <Sidebar.ItemIcon>
                                  <GitBranch size={20} />
                                </Sidebar.ItemIcon>
                                <Sidebar.ItemLabel>Pipelines</Sidebar.ItemLabel>
                              </Sidebar.Item>
                            )}
                            {!IS_CLOUD && (
                              <Sidebar.Item id="connections">
                                <Sidebar.ItemIcon>
                                  <Link2 size={20} />
                                </Sidebar.ItemIcon>
                                <Sidebar.ItemLabel>Connections</Sidebar.ItemLabel>
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
                                <KeyRound size={20} />
                              </Sidebar.ItemIcon>
                              <Sidebar.ItemLabel>Configs &amp; Secrets</Sidebar.ItemLabel>
                            </Sidebar.Item>
                            {isGenericService && (
                              <Sidebar.Item id="health-checks">
                                <Sidebar.ItemIcon>
                                  <HeartPulse size={20} />
                                </Sidebar.ItemIcon>
                                <Sidebar.ItemLabel>Health Checks</Sidebar.ItemLabel>
                              </Sidebar.Item>
                            )}
                            {isGenericService && !IS_CLOUD && (
                              <Sidebar.Item id="scaling">
                                <Sidebar.ItemIcon>
                                  <Maximize2 size={20} />
                                </Sidebar.ItemIcon>
                                <Sidebar.ItemLabel>Scaling</Sidebar.ItemLabel>
                              </Sidebar.Item>
                            )}
                            {!IS_CLOUD && (
                              <Sidebar.Item id="storage">
                                <Sidebar.ItemIcon>
                                  <HardDrive size={20} />
                                </Sidebar.ItemIcon>
                                <Sidebar.ItemLabel>Storage</Sidebar.ItemLabel>
                              </Sidebar.Item>
                            )}
                            {showExternalCI && (
                              <Sidebar.Item id="external-ci">
                                <Sidebar.ItemIcon>
                                  <Webhook size={20} />
                                </Sidebar.ItemIcon>
                                <Sidebar.ItemLabel>External CI</Sidebar.ItemLabel>
                              </Sidebar.Item>
                            )}
                            {!IS_CLOUD && canSeeAccessControl && (
                              <Sidebar.Item id="component-settings">
                                <Sidebar.ItemIcon>
                                  <Cog size={20} />
                                </Sidebar.ItemIcon>
                                <Sidebar.ItemLabel>Settings</Sidebar.ItemLabel>
                              </Sidebar.Item>
                            )}
                          </Sidebar.Item>
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
                        {!IS_CLOUD && (
                          <Sidebar.Item id="proj-develop">
                            <Sidebar.ItemIcon>
                              <Lightbulb size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>Develop</Sidebar.ItemLabel>
                          </Sidebar.Item>
                        )}

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

                        {!IS_CLOUD && (
                          <Sidebar.Item id="proj-insights">
                            <Sidebar.ItemIcon>
                              <BarChart3 size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>Insights</Sidebar.ItemLabel>
                            <Sidebar.Item id="proj-usage">
                              <Sidebar.ItemIcon>
                                <Activity size={20} />
                              </Sidebar.ItemIcon>
                              <Sidebar.ItemLabel>Usage</Sidebar.ItemLabel>
                            </Sidebar.Item>
                            <Sidebar.Item id="proj-delivery">
                              <Sidebar.ItemIcon>
                                <Truck size={20} />
                              </Sidebar.ItemIcon>
                              <Sidebar.ItemLabel>Delivery</Sidebar.ItemLabel>
                            </Sidebar.Item>
                            <Sidebar.Item id="proj-compliance">
                              <Sidebar.ItemIcon>
                                <ShieldCheck size={20} />
                              </Sidebar.ItemIcon>
                              <Sidebar.ItemLabel>Compliance</Sidebar.ItemLabel>
                            </Sidebar.Item>
                          </Sidebar.Item>
                        )}

                        <Sidebar.Item id="proj-observability">
                          <Sidebar.ItemIcon>
                            <Eye size={20} />
                          </Sidebar.ItemIcon>
                          <Sidebar.ItemLabel>Observability</Sidebar.ItemLabel>
                          <Sidebar.Item id="proj-logs">
                            <Sidebar.ItemIcon>
                              <ScrollText size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>Runtime Logs</Sidebar.ItemLabel>
                          </Sidebar.Item>
                          <Sidebar.Item id="proj-metrics">
                            <Sidebar.ItemIcon>
                              <BarChart3 size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>Metrics</Sidebar.ItemLabel>
                          </Sidebar.Item>
                        </Sidebar.Item>
                      </Sidebar.Category>,

                      <Sidebar.Category key="proj-infra">
                        {/* Cloud drops CD Pipelines/Environments entirely and pulls Settings out to a
                      standalone item below, so the whole Admin group has nothing left to show. */}
                        {!IS_CLOUD && (
                          <Sidebar.Item id="proj-admin">
                            <Sidebar.ItemIcon>
                              <Settings2 size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>Infrastructure</Sidebar.ItemLabel>
                            <Sidebar.Item id="proj-connections">
                              <Sidebar.ItemIcon>
                                <Link2 size={20} />
                              </Sidebar.ItemIcon>
                              <Sidebar.ItemLabel>Connections</Sidebar.ItemLabel>
                            </Sidebar.Item>
                            <Sidebar.Item id="proj-third-party">
                              <Sidebar.ItemIcon>
                                <Puzzle size={20} />
                              </Sidebar.ItemIcon>
                              <Sidebar.ItemLabel>Third Party Services</Sidebar.ItemLabel>
                            </Sidebar.Item>
                            <Sidebar.Item id="proj-genai-services">
                              <Sidebar.ItemIcon>
                                <Sparkles size={20} />
                              </Sidebar.ItemIcon>
                              <Sidebar.ItemLabel>GenAI Services</Sidebar.ItemLabel>
                            </Sidebar.Item>
                            <Sidebar.Item id="proj-cd-pipelines">
                              <Sidebar.ItemIcon>
                                <GitBranch size={20} />
                              </Sidebar.ItemIcon>
                              <Sidebar.ItemLabel>CD Pipelines</Sidebar.ItemLabel>
                            </Sidebar.Item>
                            <Sidebar.Item id="proj-environments">
                              <Sidebar.ItemIcon>
                                <Layers size={20} />
                              </Sidebar.ItemIcon>
                              <Sidebar.ItemLabel>Environments</Sidebar.ItemLabel>
                            </Sidebar.Item>
                            <Sidebar.Item id="proj-settings">
                              <Sidebar.ItemIcon>
                                <Cog size={20} />
                              </Sidebar.ItemIcon>
                              <Sidebar.ItemLabel>Settings</Sidebar.ItemLabel>
                            </Sidebar.Item>
                          </Sidebar.Item>
                        )}

                        {/* Environments link up to the org page; the pipeline is this project's own. */}
                        {IS_CLOUD && (
                          <Sidebar.Item id="proj-admin">
                            <Sidebar.ItemIcon>
                              <Settings2 size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>Infrastructure</Sidebar.ItemLabel>
                            <Sidebar.Item id="org-environments">
                              <Sidebar.ItemIcon>
                                <Layers size={20} />
                              </Sidebar.ItemIcon>
                              <Sidebar.ItemLabel>Environments</Sidebar.ItemLabel>
                            </Sidebar.Item>
                            <Sidebar.Item id="proj-cd-pipelines">
                              <Sidebar.ItemIcon>
                                <GitBranch size={20} />
                              </Sidebar.ItemIcon>
                              <Sidebar.ItemLabel>Pipelines</Sidebar.ItemLabel>
                            </Sidebar.Item>
                          </Sidebar.Item>
                        )}

                        {IS_CLOUD && (
                          <Sidebar.Item id="proj-settings">
                            <Sidebar.ItemIcon>
                              <Cog size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>Settings</Sidebar.ItemLabel>
                          </Sidebar.Item>
                        )}
                      </Sidebar.Category>,
                    ]}
            </Sidebar.Nav>
          </Sidebar>
        </AppShell.Sidebar>
      )}

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
              <NotFound message={`You don't have access to "${scope.org}". Ask an admin for an invite, or switch to one of your own organizations.`} backTo={ownOrgFallbackUrl} backLabel="Back to your organizations" />
            ) : orgSyncUnresolved ? (
              <Box sx={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <CircularProgress color="primary" />
              </Box>
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
          {IS_WIP && (
            <Suspense fallback={null}>
              <CopilotDrawer />
            </Suspense>
          )}
        </Box>
      </AppShell.Main>

      <AppShell.Footer>
        {pathname.includes('/admin/databases') && (
          <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', fontStyle: 'italic', color: 'text.disabled', px: 2, pb: 1 }}>
            {DB_TRADEMARK_NOTICE}
          </Typography>
        )}
        {/* Matches the sidebar's surface rather than sitting as a white band under it. */}
        <Footer sx={{ backgroundColor: 'background.acrylic', backdropFilter: 'blur(3px)' }}>
          <Footer.Link href={termsOfUseUrl()} target="_blank" rel="noopener noreferrer">
            Terms of Use
          </Footer.Link>
          <Footer.Link href={privacyPolicyUrl()} target="_blank" rel="noopener noreferrer">
            Privacy Policy
          </Footer.Link>
          <Footer.Link href="https://discord.com/invite/wso2" target="_blank" rel="noopener noreferrer">
            Support
          </Footer.Link>
          <Footer.Copyright>&copy; {new Date().getFullYear()}, WSO2 LLC.</Footer.Copyright>
        </Footer>
      </AppShell.Footer>

      {/* Notifications removed console-wide; this slot is kept as the mount point for
          the app-level modals below. */}
      <AppShell.NotificationPanel>
        <FeaturePreviewModal open={featurePreviewOpen} onClose={() => setFeaturePreviewOpen(false)} />

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

export default function AppLayout(): JSX.Element {
  return (
    <CopilotProvider>
      <AppLayoutInner />
    </CopilotProvider>
  );
}
