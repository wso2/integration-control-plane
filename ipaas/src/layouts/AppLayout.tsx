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

import { useContext } from 'react';
import {
  AppShell,
  Badge,
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
  formatRelativeTime,
  Header,
  IconButton,
  InputAdornment,
  MenuItem,
  NotificationPanel,
  Box,
  Popover,
  Sidebar,
  TextField,
  Tooltip,
  Typography,
  UserMenu,
  useAppShell,
  useNotifications,
} from '@wso2/oxygen-ui';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { JSX } from 'react';
import { useNavigate, Outlet, NavLink, useLocation } from 'react-router';
import Logo from '../components/Logo';
import {
  Activity,
  Award,
  BarChart3,
  Bell,
  Binoculars,
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
} from '@wso2/oxygen-ui-icons-react';
import FeaturePreviewModal from '../components/FeaturePreview/FeaturePreviewModal';
import { useProject, useProjectByHandler, useProjects } from '../hooks/useProjects';
import { useComponents } from '../hooks/useComponents';
import { useOrgs, useSwitchOrgToken } from '../hooks/useOrg';
import { useBillingOrg } from '../hooks/useBillingOrg';
import { isSupportedIntegration, GENERIC_SERVICE_TYPES } from '../constants/integrations';
import { identifyIntegration } from '../utils/identifyIntegration';
import { useOrgPermissions } from '../hooks/useAuth';
import { mockNotifications } from '../mock-data/mockNotifications';
import { useScope, useResource, resourceUrl, broaden, narrow, newProjectUrl, newComponentUrl, hasProject, hasComponent, type Resource } from '../nav';
import { componentOverviewUrl, loginUrl, orgHomeUrl, privacyPolicyUrl, profileUrl, projectHomeUrl, termsOfUseUrl } from '../paths';
import { useAuth } from '../auth/AuthContext';
import { useAccessControl } from '../contexts/AccessControlContext';
import { CopilotContext, CopilotProvider } from '../contexts/CopilotContext';
const CopilotDrawer = lazy(() => import('../components/AiCopilot/CopilotDrawer'));
import { IS_WIP, IS_CLOUD } from '../features';
import AIIcon from '../assets/icons/ai/AIIcon';
import { ALL_USER_MGT_PERMISSIONS, Permissions } from '../constants/permissions';
import { UUID_RE } from '../utils/string';

// Maps each org-scope leaf nav ID to its expandable parent group ID
const ORG_PARENT_MAP: Record<string, string> = {
  'org-usage': 'org-insights',
  'org-delivery': 'org-insights',
  'org-compliance': 'org-insights',
  'org-logs': 'org-observability',
  'org-metrics': 'org-observability',
  'org-scheduled-ingestion': 'org-rag',
  'org-service': 'org-rag',
  'org-retrieval': 'org-rag',
  'org-databases': 'org-admin',
  'org-vector-databases': 'org-admin',
  'org-message-brokers': 'org-admin',
  'org-third-party': 'org-admin',
  'org-genai-services': 'org-admin',
  'org-config-groups': 'org-admin',
  'org-governance': 'org-admin',
  'org-cd-pipelines': 'org-admin',
  'org-data-planes': 'org-admin',
  'org-environments': 'org-admin',
  'org-audit-logs': 'org-admin',
  'org-approvals': 'org-admin',
  'org-certificates': 'org-admin',
  'org-settings': 'org-admin',
};

// Maps each project-scope leaf nav ID to its expandable parent group ID
const PROJECT_PARENT_MAP: Record<string, string> = {
  'proj-usage': 'proj-insights',
  'proj-delivery': 'proj-insights',
  'proj-compliance': 'proj-insights',
  'proj-logs': 'proj-observability',
  'proj-metrics': 'proj-observability',
  'proj-connections': 'proj-admin',
  'proj-third-party': 'proj-admin',
  'proj-genai-services': 'proj-admin',
  'proj-cd-pipelines': 'proj-admin',
  'proj-environments': 'proj-admin',
  'proj-settings': 'proj-admin',
};

// Maps each component-scope leaf nav ID to its expandable parent group ID
const COMPONENT_PARENT_MAP: Record<string, string> = {
  integration: 'develop',
  lifecycle: 'develop',
  documents: 'develop',
  plans: 'develop',
  console: 'test',
  'api-chat': 'test',
  usage: 'insights',
  delivery: 'insights',
  compliance: 'insights',
  alerts: 'observability',
  logs: 'observability',
  metrics: 'observability',
  connections: 'admin',
  runtime: 'admin',
  containers: 'admin',
  'configs-secrets': 'admin',
  'health-checks': 'admin',
  scaling: 'admin',
  storage: 'admin',
  'component-settings': 'admin',
};

function AppLayoutInner(): JSX.Element {
  const { setShowCopilot } = useContext(CopilotContext);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const scope = useScope();
  const resource = useResource();

  const queryClient = useQueryClient();
  const { username, displayName, pictureUrl, logout, userId, isOidcUser } = useAuth();
  const { hasAnyPermission, setOrgPermissions } = useAccessControl();

  // Cloud-only billing trial indicator. useBillingOrg is gated to IS_CLOUD, so
  // wip/icp return null here and the chip below is never rendered or bundled.
  const { org: billingOrg } = useBillingOrg('integration-platform');
  const billingTrial = billingOrg?.subscription?.status === 'trial' ? billingOrg.subscription.trial : null;
  const trialEndLabel = billingTrial?.trial_end ? `Trial ends ${new Date(billingTrial.trial_end).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : '';

  const { state: shell, actions } = useAppShell({ initialCollapsed: true });

  // Compute the active nav item ID — uses URL matching for component/org scopes; Matrix resource for project scope
  const activeNavId = useMemo((): string => {
    if (!hasProject(scope)) {
      // Org scope
      const base = `/organizations/${scope.org}`;
      const rest = pathname.slice(base.length).replace(/^\//, '');
      if (!rest || rest === 'home') return 'overview';
      if (rest.startsWith('build')) return 'build';
      if (rest.startsWith('develop')) return 'org-develop';
      if (rest.startsWith('deploy')) return 'org-deploy';
      if (rest.startsWith('test')) return 'org-test';
      if (rest.startsWith('insights/usage')) return 'org-usage';
      if (rest.startsWith('insights/delivery')) return 'org-delivery';
      if (rest.startsWith('insights/compliance')) return 'org-compliance';
      if (rest.startsWith('logs')) return 'org-logs';
      if (rest.startsWith('metrics')) return 'org-metrics';
      if (rest.startsWith('rag/scheduled-ingestion')) return 'org-scheduled-ingestion';
      if (rest.startsWith('rag/service')) return 'org-service';
      if (rest.startsWith('rag/retrieval')) return 'org-retrieval';
      if (rest.startsWith('admin/databases')) return 'org-databases';
      if (rest.startsWith('admin/vector-databases')) return 'org-vector-databases';
      if (rest.startsWith('admin/message-brokers')) return 'org-message-brokers';
      if (rest.startsWith('admin/third-party')) return 'org-third-party';
      if (rest.startsWith('admin/genai-services')) return 'org-genai-services';
      if (rest.startsWith('admin/config-groups')) return 'org-config-groups';
      if (rest.startsWith('admin/governance')) return 'org-governance';
      if (rest.startsWith('admin/cd-pipelines')) return 'org-cd-pipelines';
      if (rest.startsWith('admin/data-planes')) return 'org-data-planes';
      if (rest.startsWith('environments')) return 'org-environments';
      if (rest.startsWith('admin/audit-logs')) return 'org-audit-logs';
      if (rest.startsWith('admin/approvals')) return 'org-approvals';
      if (rest.startsWith('admin/certificates')) return 'org-certificates';
      if (rest.startsWith('settings')) return 'org-settings';
      return 'overview';
    }
    if (!hasComponent(scope)) {
      // Project scope
      const projB = `/organizations/${scope.org}/projects/${scope.project}`;
      const rest = pathname.slice(projB.length).replace(/^\//, '');
      if (!rest || rest === 'home') return 'proj-overview';
      if (rest.startsWith('develop')) return 'proj-develop';
      if (rest.startsWith('build')) return 'proj-build';
      if (rest.startsWith('deploy')) return 'proj-deploy';
      if (rest.startsWith('test')) return 'proj-test';
      if (rest.startsWith('insights/usage')) return 'proj-usage';
      if (rest.startsWith('insights/delivery')) return 'proj-delivery';
      if (rest.startsWith('insights/compliance')) return 'proj-compliance';
      if (rest.startsWith('observe/runtimelogs') || rest.startsWith('logs')) return 'proj-logs';
      if (rest.startsWith('observe/metrics') || rest.startsWith('metrics')) return 'proj-metrics';
      if (rest.startsWith('admin/connections')) return 'proj-connections';
      if (rest.startsWith('admin/third-party')) return 'proj-third-party';
      if (rest.startsWith('admin/gen-ai-services')) return 'proj-genai-services';
      if (rest.startsWith('admin/cd-pipelines')) return 'proj-cd-pipelines';
      if (rest.startsWith('devops/environments') || rest.startsWith('environments')) return 'proj-environments';
      if (rest.startsWith('settings')) return 'proj-settings';
      if (rest.startsWith('runtimes')) return 'proj-overview';
      return 'proj-overview';
    }
    const base = `/organizations/${scope.org}/projects/${scope.project}/components/${scope.component}`;
    const rest = pathname.slice(base.length).replace(/^\//, '');
    if (!rest || rest === 'overview') return 'overview';
    if (rest.startsWith('build')) return 'build';
    if (rest.startsWith('deploy')) return 'deploy';
    if (rest.startsWith('test/console')) return 'console';
    if (rest.startsWith('test/api-chat')) return 'api-chat';
    if (rest.startsWith('test/agent-chat')) return 'agent-chat';
    if (rest.startsWith('test')) return 'test';
    if (rest.startsWith('manage/lifecycle')) return 'lifecycle';
    if (rest.startsWith('documents')) return 'documents';
    if (rest.startsWith('plans')) return 'plans';
    if (rest.startsWith('insights/usage')) return 'usage';
    if (rest.startsWith('insights/delivery')) return 'delivery';
    if (rest.startsWith('insights/compliance')) return 'compliance';
    if (rest.startsWith('alerts')) return 'alerts';
    if (rest.startsWith('logs')) return 'logs';
    if (rest.startsWith('metrics')) return 'metrics';
    if (rest.startsWith('runtimes')) return 'runtime';
    if (rest.startsWith('admin/connections')) return 'connections';
    if (rest.startsWith('admin/containers')) return 'containers';
    if (rest.startsWith('admin/configs')) return 'configs-secrets';
    if (rest.startsWith('admin/health-checks')) return 'health-checks';
    if (rest.startsWith('admin/scaling')) return 'scaling';
    if (rest.startsWith('admin/storage')) return 'storage';
    if (rest.startsWith('settings/access-control')) return 'component-settings';
    return 'overview';
  }, [pathname, scope]);

  // Auto-expand the parent group when navigating to a child nav item
  useEffect(() => {
    const parentMap = hasComponent(scope) ? COMPONENT_PARENT_MAP : !hasProject(scope) ? ORG_PARENT_MAP : PROJECT_PARENT_MAP;
    const parent = parentMap[activeNavId];
    if (parent && !shell.expandedMenus[parent]) {
      actions.toggleMenu(parent);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNavId]);

  const [tabIndex, setTabIndex] = useState(0);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [featurePreviewOpen, setFeaturePreviewOpen] = useState(false);
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
  const { data: orgsData = [] } = useOrgs();
  const switchOrgTokenMutation = useSwitchOrgToken();

  const { notifications, actions: notifActions, unreadCount, unreadNotifications } = useNotifications({ initialNotifications: [...mockNotifications] });
  const alertNotifications = notifications.filter((n) => n.type === 'warning' || n.type === 'error');
  const getFilteredNotifications = () => {
    if (tabIndex === 1) return unreadNotifications;
    if (tabIndex === 2) return alertNotifications;
    return notifications;
  };

  const projectParam = hasProject(scope) ? scope.project : '';
  const isProjectUuid = UUID_RE.test(projectParam);
  const { data: projectByHandler } = useProjectByHandler(!isProjectUuid ? projectParam : '');
  const { data: projectById } = useProject(isProjectUuid ? projectParam : '');
  const { data: projects = [] } = useProjects();
  const projectFromList = !isProjectUuid && projectParam ? (projects.find((p) => p.handler === projectParam) ?? null) : null;
  const project = isProjectUuid ? projectById : (projectByHandler ?? projectFromList);
  const projectId = project?.id ?? '';
  const { data: allComponents = [] } = useComponents(scope.org, projectId);
  const components = allComponents.filter((c) => isSupportedIntegration(c.displayType, c.componentSubType ?? null));

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
    // Fallback: search in components list by handler or id
    if (hasComponent(scope)) {
      const foundComponent = components.find((c) => c.handler === scope.component || c.id === scope.component || String(c.id) === scope.component);
      if (foundComponent?.displayName) return foundComponent.displayName;
      // If still showing UUID, show loading instead
      const isUuid = UUID_RE.test(scope.component);
      return isUuid ? 'Loading...' : scope.component;
    }
    return '';
  };

  // Persist last visited project so post-login can navigate back to it
  useEffect(() => {
    if (userId && hasProject(scope)) {
      localStorage.setItem(`icp_last_project:${userId}`, JSON.stringify({ org: scope.org, project: scope.project }));
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
      localStorage.setItem('icp_org_numeric_id', String(match.numericId));
      setOrgIdVersion((v) => v + 1); // trigger re-render so queries re-evaluate orgId()
    }
  }, [isOidcUser, userId, scope.org, orgsData]);

  // Find component UUID for permission checks
  const currentComponent = hasComponent(scope) ? components.find((c) => c.handler === scope.component) : undefined;
  const componentId = currentComponent?.id;

  /** Returns the resource if the user has permission at the target scope, or 'overview' as fallback. */
  const canAccessResource = (targetScope: Parameters<typeof hasProject>[0], target: Resource, targetProjectId: string | undefined = projectId || undefined, targetComponentId: string | undefined = componentId): Resource => {
    switch (target) {
      case 'overview':
        return 'overview';
      case 'access-control': {
        const perms: string[] = [...ALL_USER_MGT_PERMISSIONS];
        if (hasProject(targetScope)) perms.push(Permissions.PROJECT_EDIT, Permissions.PROJECT_MANAGE);
        if (hasComponent(targetScope)) perms.push(Permissions.INTEGRATION_EDIT, Permissions.INTEGRATION_MANAGE);
        return hasAnyPermission(perms, targetProjectId, targetComponentId) ? 'access-control' : 'overview';
      }
      case 'logs':
        return 'logs';
      case 'alerts':
        return hasComponent(targetScope) ? 'alerts' : 'overview';
      case 'build':
        return 'build';
      case 'deploy':
        return hasComponent(targetScope) ? 'deploy' : 'overview';
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

  const orgBase = !hasProject(scope) ? `/organizations/${scope.org}` : '';
  const projBase = hasProject(scope) && !hasComponent(scope) ? `/organizations/${scope.org}/projects/${scope.project}` : '';
  const compBase = hasComponent(scope) ? `/organizations/${scope.org}/projects/${scope.project}/components/${scope.component}` : '';

  const handleOrgNavSelect = (id: string) => {
    const urlMap: Record<string, string> = {
      overview: `${orgBase}/home`,
      build: `${orgBase}/build`,
      'org-develop': `${orgBase}/develop`,
      'org-deploy': `${orgBase}/deploy`,
      'org-test': `${orgBase}/test`,
      'org-usage': `${orgBase}/insights/usage`,
      'org-delivery': `${orgBase}/insights/delivery`,
      'org-compliance': `${orgBase}/insights/compliance`,
      'org-logs': `${orgBase}/logs`,
      'org-metrics': `${orgBase}/metrics`,
      'org-scheduled-ingestion': `${orgBase}/rag/scheduled-ingestion`,
      'org-service': `${orgBase}/rag/service`,
      'org-retrieval': `${orgBase}/rag/retrieval`,
      'org-databases': `${orgBase}/admin/databases`,
      'org-vector-databases': `${orgBase}/admin/vector-databases`,
      'org-message-brokers': `${orgBase}/admin/message-brokers`,
      'org-third-party': `${orgBase}/admin/third-party`,
      'org-genai-services': `${orgBase}/admin/genai-services`,
      'org-config-groups': `${orgBase}/admin/config-groups`,
      'org-governance': `${orgBase}/admin/governance`,
      'org-cd-pipelines': `${orgBase}/admin/cd-pipelines`,
      'org-data-planes': `${orgBase}/admin/data-planes`,
      'org-environments': `${orgBase}/environments`,
      'org-audit-logs': `${orgBase}/admin/audit-logs`,
      'org-approvals': `${orgBase}/admin/approvals`,
      'org-certificates': `${orgBase}/admin/certificates`,
      'org-settings': `${orgBase}/settings/access-control/users`,
    };
    const url = urlMap[id];
    if (url) navigate(url);
  };

  const handleProjectNavSelect = (id: string) => {
    const urlMap: Record<string, string> = {
      'proj-overview': `${projBase}/home`,
      'proj-develop': `${projBase}/develop`,
      'proj-build': `${projBase}/build`,
      'proj-deploy': `${projBase}/deploy`,
      'proj-test': `${projBase}/test`,
      'proj-usage': `${projBase}/insights/usage`,
      'proj-delivery': `${projBase}/insights/delivery`,
      'proj-compliance': `${projBase}/insights/compliance`,
      'proj-logs': `${projBase}/observe/runtimelogs`,
      'proj-metrics': `${projBase}/observe/metrics`,
      'proj-connections': `${projBase}/admin/connections`,
      'proj-third-party': `${projBase}/admin/third-party-services`,
      'proj-genai-services': `${projBase}/admin/gen-ai-services`,
      'proj-cd-pipelines': `${projBase}/admin/cd-pipelines`,
      'proj-environments': `${projBase}/devops/environments`,
      'proj-settings': `${projBase}/settings/project-overview`,
    };
    const url = urlMap[id];
    if (url) navigate(url);
  };

  const handleComponentNavSelect = (id: string) => {
    const urlMap: Record<string, string> = {
      overview: `${compBase}/overview`,
      integration: `${compBase}/overview`,
      lifecycle: `${compBase}/manage/lifecycle`,
      documents: `${compBase}/documents`,
      plans: `${compBase}/plans`,
      build: `${compBase}/build`,
      deploy: `${compBase}/deploy`,
      test: `${compBase}/test`,
      console: `${compBase}/test/console`,
      'api-chat': `${compBase}/test/api-chat`,
      'agent-chat': `${compBase}/test/agent-chat`,
      usage: `${compBase}/insights/usage`,
      delivery: `${compBase}/insights/delivery`,
      compliance: `${compBase}/insights/compliance`,
      alerts: `${compBase}/alerts`,
      logs: `${compBase}/logs`,
      metrics: `${compBase}/metrics`,
      connections: `${compBase}/admin/connections`,
      runtime: `${compBase}/runtimes`,
      containers: `${compBase}/admin/containers`,
      'configs-secrets': `${compBase}/admin/configs`,
      'health-checks': `${compBase}/admin/health-checks`,
      scaling: `${compBase}/admin/scaling`,
      storage: `${compBase}/admin/storage`,
      'component-settings': `${compBase}/settings/access-control/roles`,
    };
    const url = urlMap[id];
    if (url) navigate(url);
  };

  return (
    <AppShell>
      <AppShell.Navbar>
        <Header>
          <Header.Toggle collapsed={shell.sidebarCollapsed} onToggle={actions.toggleSidebar} />
          <Header.Brand>
            <Header.BrandLogo>
              <NavLink to={orgHomeUrl(scope.org)} style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
                <Logo />
              </NavLink>
            </Header.BrandLogo>
          </Header.Brand>
          <Header.Switchers showDivider={false}>
            <Box
              ref={orgCardRef}
              role="button"
              tabIndex={0}
              sx={{ position: 'relative', display: 'inline-flex', alignSelf: 'center', cursor: 'pointer' }}
              onClick={() => navigate(orgHomeUrl(scope.org))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate(orgHomeUrl(scope.org));
                }
              }}>
              <ComplexSelect
                value={scope.org}
                open={false}
                onChange={() => {}}
                onOpen={() => {}}
                size="small"
                sx={{ minWidth: 180 }}
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
                renderValue={() => <ComplexSelect.MenuItem.Text primary={scope.org} secondary="Organization" />}
                label="Organization">
                <ComplexSelect.MenuItem value={scope.org}>
                  <ComplexSelect.MenuItem.Text primary={scope.org} secondary="Organization" />
                </ComplexSelect.MenuItem>
              </ComplexSelect>
            </Box>
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
                        navigate(orgHomeUrl(o.handle));
                        return;
                      }
                      switchOrgTokenMutation
                        .mutateAsync(o.handle)
                        .then(() => {
                          if (o.numericId > 0) {
                            window.API_CONFIG.asgardeoOrgNumericId = o.numericId;
                            localStorage.setItem('icp_org_numeric_id', String(o.numericId));
                          }
                          queryClient.clear();
                          navigate(orgHomeUrl(o.handle));
                        })
                        .catch(() => navigate(orgHomeUrl(o.handle)));
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
                      selected={hasProject(scope) && (scope.project === p.handler || scope.project === p.id)}
                      onClick={() => {
                        setProjectMenuAnchor(null);
                        setProjectSearch('');
                        const newScope = narrow({ level: 'organizations', org: scope.org }, p.handler);
                        const target = resource ?? 'overview';
                        const resolvedTarget = canAccessResource(newScope, target, p.id, undefined);
                        navigate(resolvedTarget === 'overview' ? projectHomeUrl(scope.org, p.handler) : resourceUrl(newScope, resolvedTarget));
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
                    value={project?.handler ?? scope.project}
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
                    renderValue={() => <ComplexSelect.MenuItem.Text primary={getProjectDisplayName()} secondary="Project" />}
                    label="Projects">
                    {/* Placeholder item so renderValue fires while project is loading by UUID */}
                    {isProjectUuid && !project && (
                      <ComplexSelect.MenuItem key="__uuid_placeholder__" value={scope.project} sx={{ display: 'none' }}>
                        <ComplexSelect.MenuItem.Text primary={getProjectDisplayName()} secondary="Project" />
                      </ComplexSelect.MenuItem>
                    )}
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
                      const resolvedOrgTarget = canAccessResource(orgScope, target);
                      navigate(resolvedOrgTarget === 'overview' ? orgHomeUrl(scope.org) : resourceUrl(orgScope, resolvedOrgTarget));
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
                            if (activeNavId === 'lifecycle') {
                              navigate(GENERIC_SERVICE_TYPES.has(c.displayType) ? `/organizations/${scope.org}/projects/${scope.project}/components/${c.handler}/manage/lifecycle` : componentOverviewUrl(scope.org, scope.project, c.handler));
                            } else {
                              const resolvedTarget = canAccessResource(newScope, resource ?? 'overview', projectId, c.id);
                              navigate(resolvedTarget === 'overview' ? componentOverviewUrl(scope.org, scope.project, c.handler) : resourceUrl(newScope, resolvedTarget));
                            }
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
                  renderValue={() => <ComplexSelect.MenuItem.Text primary={getComponentDisplayName()} secondary="Integration" />}
                  label="Integrations">
                  {/* Fallback keeps the value valid while components are loading */}
                  {!components.some((c) => c.handler === scope.component) && (
                    <ComplexSelect.MenuItem key="__current" value={scope.component} sx={{ display: 'none' }}>
                      <ComplexSelect.MenuItem.Text primary="" secondary="" />
                    </ComplexSelect.MenuItem>
                  )}
                  {components.map((c) => (
                    <ComplexSelect.MenuItem key={c.id} value={c.handler}>
                      <ComplexSelect.MenuItem.Text primary={c.displayName} secondary={c.displayType} />
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
            {IS_CLOUD && billingTrial && (
              <Tooltip title={trialEndLabel}>
                <Chip label={`Trial · ${billingTrial.days_remaining} day${billingTrial.days_remaining === 1 ? '' : 's'} remaining`} color="warning" size="small" sx={{ fontWeight: 500, mr: 0.5 }} />
              </Tooltip>
            )}
            <ColorSchemeToggle />
            <Tooltip title="Notifications">
              <IconButton onClick={actions.toggleNotificationPanel} size="small" sx={{ color: 'text.secondary' }}>
                <Badge badgeContent={unreadCount ?? 0} color="error" max={99} invisible={(unreadCount ?? 0) === 0}>
                  <Bell size={20} />
                </Badge>
              </IconButton>
            </Tooltip>
            {IS_WIP && (
              <Button
                variant="outlined"
                size="small"
                startIcon={<AIIcon width={16} height={16} />}
                onClick={() => setShowCopilot(true)}
                sx={{
                  borderColor: 'primary.main',
                  color: 'primary.main',
                  pl: 1.5,
                  py: 0.5,
                  mx: 1,
                  '&:hover': { bgcolor: 'action.hover' },
                }}>
                Copilot
              </Button>
            )}
            <Divider orientation="vertical" flexItem sx={{ mx: 1, display: { xs: 'none', sm: 'block' } }} />
            <UserMenu>
              <UserMenu.Trigger name={displayName || username || 'User'} avatar={pictureUrl} />
              <UserMenu.Header name={displayName || username || 'User'} email={username} role="Admin" avatar={pictureUrl} />
              <UserMenu.Item icon={<UserIcon size={18} />} label="Profile" onClick={() => navigate(profileUrl())} />
              <UserMenu.Item icon={<ScanEye size={18} />} label="Feature Preview" onClick={() => setFeaturePreviewOpen(true)} />
              <UserMenu.Divider />
              <UserMenu.Logout icon={<LogOut size={18} />} label="Sign Out" onClick={() => setConfirmDialogOpen(true)} />
            </UserMenu>
          </Header.Actions>
        </Header>
      </AppShell.Navbar>

      <AppShell.Sidebar>
        <Sidebar
          collapsed={shell.sidebarCollapsed}
          activeItem={activeNavId}
          expandedMenus={shell.expandedMenus}
          onSelect={(id) => {
            if (id === 'expand') {
              actions.toggleSidebar();
            } else if (hasComponent(scope)) {
              handleComponentNavSelect(id);
            } else if (!hasProject(scope)) {
              handleOrgNavSelect(id);
            } else if (!hasComponent(scope)) {
              handleProjectNavSelect(id);
            } else {
              handleComponentNavSelect(id);
            }
          }}
          onToggleExpand={actions.toggleMenu}
          sx={{ backgroundColor: 'background.acrylic', backdropFilter: 'blur(3px)' }}>
          <Sidebar.Nav>
            {!hasProject(scope) ? (
              /* Org-level nav */
              <Sidebar.Category>
                <Sidebar.Item id="overview">
                  <Sidebar.ItemIcon>
                    <LayoutDashboard size={20} />
                  </Sidebar.ItemIcon>
                  <Sidebar.ItemLabel>Overview</Sidebar.ItemLabel>
                </Sidebar.Item>

                <Sidebar.Item id="org-develop">
                  <Sidebar.ItemIcon>
                    <Lightbulb size={20} />
                  </Sidebar.ItemIcon>
                  <Sidebar.ItemLabel>Develop</Sidebar.ItemLabel>
                </Sidebar.Item>

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

                <Sidebar.Item id="org-observability">
                  <Sidebar.ItemIcon>
                    <Binoculars size={20} />
                  </Sidebar.ItemIcon>
                  <Sidebar.ItemLabel>Observability</Sidebar.ItemLabel>
                  <Sidebar.Item id="org-logs">
                    <Sidebar.ItemIcon>
                      <ScrollText size={20} />
                    </Sidebar.ItemIcon>
                    <Sidebar.ItemLabel>Logs</Sidebar.ItemLabel>
                  </Sidebar.Item>
                  <Sidebar.Item id="org-metrics">
                    <Sidebar.ItemIcon>
                      <BarChart3 size={20} />
                    </Sidebar.ItemIcon>
                    <Sidebar.ItemLabel>Metrics</Sidebar.ItemLabel>
                  </Sidebar.Item>
                </Sidebar.Item>

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

                <Sidebar.Item id="org-admin">
                  <Sidebar.ItemIcon>
                    <Settings2 size={20} />
                  </Sidebar.ItemIcon>
                  <Sidebar.ItemLabel>Admin</Sidebar.ItemLabel>
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
              </Sidebar.Category>
            ) : hasComponent(scope) ? (
              (() => {
                const isGenericService = GENERIC_SERVICE_TYPES.has(currentComponent?.displayType ?? '');
                const integrationType = identifyIntegration(currentComponent?.displayType ?? '', currentComponent?.componentSubType ?? null).type;
                const runtimeLogsType = ['file-integration', 'event-integration'].includes(integrationType);
                const aiAgentType = integrationType === 'ai-agent';
                // MCP (server + proxy): a single Test tab → the MCP playground
                // (@wso2-org/mcp-playground). No Console/API-Chat sub-items.
                const mcpType = integrationType === 'mcp-server' || integrationType === 'mcp-proxy';
                return (
                  <>
                    <Sidebar.Category>
                      <Sidebar.Item id="overview">
                        <Sidebar.ItemIcon>
                          <LayoutDashboard size={20} />
                        </Sidebar.ItemIcon>
                        <Sidebar.ItemLabel>Overview</Sidebar.ItemLabel>
                      </Sidebar.Item>
                    </Sidebar.Category>

                    <Sidebar.Category>
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
                      ) : (
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
                          {IS_WIP && (
                            <Sidebar.Item id="api-chat">
                              <Sidebar.ItemIcon>
                                <MessageSquare size={20} />
                              </Sidebar.ItemIcon>
                              <Sidebar.ItemLabel>API Chat</Sidebar.ItemLabel>
                            </Sidebar.Item>
                          )}
                        </Sidebar.Item>
                      )}

                      {isGenericService && (
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
                        <Sidebar.Item id="alerts">
                          <Sidebar.ItemIcon>
                            <Bell size={20} />
                          </Sidebar.ItemIcon>
                          <Sidebar.ItemLabel>Alerts</Sidebar.ItemLabel>
                        </Sidebar.Item>
                        <Sidebar.Item id="logs">
                          <Sidebar.ItemIcon>
                            <ScrollText size={20} />
                          </Sidebar.ItemIcon>
                          <Sidebar.ItemLabel>Logs</Sidebar.ItemLabel>
                        </Sidebar.Item>
                        <Sidebar.Item id="metrics">
                          <Sidebar.ItemIcon>
                            <BarChart3 size={20} />
                          </Sidebar.ItemIcon>
                          <Sidebar.ItemLabel>Metrics</Sidebar.ItemLabel>
                        </Sidebar.Item>
                      </Sidebar.Item>

                      <Sidebar.Item id="admin">
                        <Sidebar.ItemIcon>
                          <Settings2 size={20} />
                        </Sidebar.ItemIcon>
                        <Sidebar.ItemLabel>Admin</Sidebar.ItemLabel>
                        <Sidebar.Item id="connections">
                          <Sidebar.ItemIcon>
                            <Link2 size={20} />
                          </Sidebar.ItemIcon>
                          <Sidebar.ItemLabel>Connections</Sidebar.ItemLabel>
                        </Sidebar.Item>
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
                        {isGenericService && (
                          <Sidebar.Item id="scaling">
                            <Sidebar.ItemIcon>
                              <Maximize2 size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>Scaling</Sidebar.ItemLabel>
                          </Sidebar.Item>
                        )}
                        <Sidebar.Item id="storage">
                          <Sidebar.ItemIcon>
                            <HardDrive size={20} />
                          </Sidebar.ItemIcon>
                          <Sidebar.ItemLabel>Storage</Sidebar.ItemLabel>
                        </Sidebar.Item>
                        {canSeeAccessControl && (
                          <Sidebar.Item id="component-settings">
                            <Sidebar.ItemIcon>
                              <Cog size={20} />
                            </Sidebar.ItemIcon>
                            <Sidebar.ItemLabel>Settings</Sidebar.ItemLabel>
                          </Sidebar.Item>
                        )}
                      </Sidebar.Item>
                    </Sidebar.Category>
                  </>
                );
              })()
            ) : (
              /* Project-level nav */
              <Sidebar.Category>
                <Sidebar.Item id="proj-overview">
                  <Sidebar.ItemIcon>
                    <LayoutDashboard size={20} />
                  </Sidebar.ItemIcon>
                  <Sidebar.ItemLabel>Overview</Sidebar.ItemLabel>
                </Sidebar.Item>

                <Sidebar.Item id="proj-develop">
                  <Sidebar.ItemIcon>
                    <Lightbulb size={20} />
                  </Sidebar.ItemIcon>
                  <Sidebar.ItemLabel>Develop</Sidebar.ItemLabel>
                </Sidebar.Item>

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

                <Sidebar.Item id="proj-observability">
                  <Sidebar.ItemIcon>
                    <Binoculars size={20} />
                  </Sidebar.ItemIcon>
                  <Sidebar.ItemLabel>Observability</Sidebar.ItemLabel>
                  <Sidebar.Item id="proj-logs">
                    <Sidebar.ItemIcon>
                      <ScrollText size={20} />
                    </Sidebar.ItemIcon>
                    <Sidebar.ItemLabel>Logs</Sidebar.ItemLabel>
                  </Sidebar.Item>
                  <Sidebar.Item id="proj-metrics">
                    <Sidebar.ItemIcon>
                      <BarChart3 size={20} />
                    </Sidebar.ItemIcon>
                    <Sidebar.ItemLabel>Metrics</Sidebar.ItemLabel>
                  </Sidebar.Item>
                </Sidebar.Item>

                <Sidebar.Item id="proj-admin">
                  <Sidebar.ItemIcon>
                    <Settings2 size={20} />
                  </Sidebar.ItemIcon>
                  <Sidebar.ItemLabel>Admin</Sidebar.ItemLabel>
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
              </Sidebar.Category>
            )}
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
              overflowY: 'auto',
              overflowX: 'auto',
            }}>
            <Outlet />
          </Box>
          {IS_WIP && (
            <Suspense fallback={null}>
              <CopilotDrawer />
            </Suspense>
          )}
        </Box>
      </AppShell.Main>

      <AppShell.Footer>
        <Footer>
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
        </NotificationPanel>

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
