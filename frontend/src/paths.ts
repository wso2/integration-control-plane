// API URLs, external links, and legacy path helpers; navigation for the main matrix pages lives in src/nav.ts.

export function loginUrl(): string {
  return '/login';
}

export function oidcCallbackUrl(): string {
  return '/sso/callback';
}

export function notAuthorizedUrl(): string {
  return '/sso/not-authorized';
}

export function profileUrl(): string {
  return '/profile';
}

export function privacyPolicyUrl(): string {
  return '/privacy-policy';
}

export function cookiePolicyUrl(): string {
  return '/cookie-policy';
}

export function forceChangePasswordUrl(): string {
  return '/change-password';
}

// ---------------------------------------------------------------------------
// Legacy path helpers — used by pages outside the nav matrix (Organizations,
// Analytics, Components, ComponentEditor, Error, etc.). Migrate these pages
// to nav.ts before removing.
// ---------------------------------------------------------------------------

export function rootUrl(): string {
  return '/';
}

export function errorUrl(type?: string): string {
  return type ? `/error?type=${encodeURIComponent(type)}` : '/error';
}

export function orgUrl(orgHandler: string): string {
  return `/organizations/${orgHandler}`;
}

export function orgProjectsUrl(orgHandler: string): string {
  return orgUrl(orgHandler);
}

export function newOrgUrl(): string {
  return '/organizations/new';
}

export function editOrgUrl(orgId: string): string {
  return `/organizations/${orgId}/edit`;
}

export function projectUrl(orgHandler: string, projectHandler: string): string {
  return `/organizations/${orgHandler}/projects/${projectHandler}`;
}

export function editProjectUrl(orgHandler: string, projectId: string): string {
  return `/organizations/${orgHandler}/projects/${projectId}/edit`;
}

export function componentUrl(orgHandler: string, projectHandler: string, componentHandler: string): string {
  return `/organizations/${orgHandler}/projects/${projectHandler}/components/${componentHandler}`;
}

export function newComponentUrl(orgHandler: string, projectHandler: string): string {
  return `/organizations/${orgHandler}/projects/${projectHandler}/components/new`;
}

export function editComponentUrl(orgHandler: string, projectHandler: string, componentId: string): string {
  return `/organizations/${orgHandler}/projects/${projectHandler}/components/${componentId}/edit`;
}

export function newOrgUserUrl(orgHandler: string): string {
  return `/organizations/${orgHandler}/settings/access-control/users/new`;
}

export function newOrgRoleUrl(orgHandler: string): string {
  return `/organizations/${orgHandler}/settings/access-control/roles/new`;
}

export function newOrgGroupUrl(orgHandler: string): string {
  return `/organizations/${orgHandler}/settings/access-control/groups/new`;
}

export function editEnvironmentUrl(orgHandler: string, envId: string): string {
  return `/organizations/${orgHandler}/environments/${envId}/edit`;
}

export function orgAccessControlUrl(orgHandler: string, tab: 'users' | 'roles' | 'groups' | 'sso-mappings' = 'users'): string {
  return `/organizations/${orgHandler}/settings/access-control/${tab}`;
}

export function editOrgUserUrl(orgHandler: string, userId: string): string {
  return `/organizations/${orgHandler}/settings/access-control/users/${userId}/edit`;
}

export function editOrgGroupUrl(orgHandler: string, groupId: string): string {
  return `/organizations/${orgHandler}/settings/access-control/groups/${groupId}/edit`;
}

export function projectGroupDetailUrl(orgHandler: string, projectHandler: string, groupId: string): string {
  return `/organizations/${orgHandler}/projects/${projectHandler}/settings/access-control/groups/${groupId}/edit`;
}

export function componentGroupDetailUrl(orgHandler: string, projectHandler: string, componentHandler: string, groupId: string): string {
  return `/organizations/${orgHandler}/projects/${projectHandler}/components/${componentHandler}/settings/access-control/groups/${groupId}/edit`;
}

export function orgRoleDetailUrl(orgHandler: string, roleId: string): string {
  return `/organizations/${orgHandler}/settings/access-control/roles/${roleId}/edit`;
}

export function projectAccessControlUrl(orgHandler: string, projectHandler: string, tab: 'roles' | 'groups' = 'roles'): string {
  return `/organizations/${orgHandler}/projects/${projectHandler}/settings/access-control/${tab}`;
}

export function projectRoleDetailUrl(orgHandler: string, projectHandler: string, roleId: string): string {
  return `/organizations/${orgHandler}/projects/${projectHandler}/settings/access-control/roles/${roleId}/edit`;
}

// 'sso-mappings' is included because the component Access Control tab strip navigates with this builder when SSO is on.
export function componentAccessControlUrl(orgHandler: string, projectHandler: string, componentHandler: string, tab: 'roles' | 'groups' | 'sso-mappings' = 'roles'): string {
  return `/organizations/${orgHandler}/projects/${projectHandler}/components/${componentHandler}/settings/access-control/${tab}`;
}

export function componentRoleDetailUrl(orgHandler: string, projectHandler: string, componentHandler: string, roleId: string): string {
  return `/organizations/${orgHandler}/projects/${projectHandler}/components/${componentHandler}/settings/access-control/roles/${roleId}/edit`;
}

export function orgAnalyticsUrl(orgHandler: string): string {
  return `/organizations/${orgHandler}/analytics`;
}

export function orgAnalyticsLogsUrl(orgHandler: string): string {
  return `/organizations/${orgHandler}/analytics/logs`;
}

// ---------------------------------------------------------------------------
// Route segments
// ---------------------------------------------------------------------------

export const loggersSegment = 'loggers';

// ---------------------------------------------------------------------------
// External links
// ---------------------------------------------------------------------------

export const external = {
  wso2: 'https://www.wso2.com',
  wso2Contact: 'https://wso2.com/contact/',
  vite: 'https://vite.dev',
  react: 'https://react.dev',
  oxygenUi: 'https://github.com/wso2/oxygen-ui/tree/next',
} as const;

// ---------------------------------------------------------------------------
// Mock-data path constants
// ---------------------------------------------------------------------------

export const dashboard = '/dashboard';
export const analytics = {
  base: '/analytics',
  reports: '/analytics/reports',
  realtime: '/analytics/realtime',
  trends: '/analytics/trends',
} as const;
export const users = { list: '/users', roles: '/users/roles', permissions: '/users/permissions' } as const;
export const projects = '/projects';
export const integrations = '/integrations';
export const security = { base: '/security', apiKeys: '/security/api-keys' } as const;
export const databases = '/databases';
export const domains = '/domains';
export const settings = { base: '/settings', notifications: '/settings/notifications' } as const;
export const help = '/help';
export const docs = {
  tutorials: {
    createProject: '/docs/tutorials/create-project',
    inviteTeam: '/docs/tutorials/invite-team',
    configureSettings: '/docs/tutorials/configure-settings',
  },
  references: {
    concepts: '/docs/references/concepts',
    configuration: '/docs/references/configuration',
  },
} as const;
export const support = {
  helpCenter: '/support/help-center',
  contact: '/support/contact',
} as const;

// ---------------------------------------------------------------------------
// API URLs
// ---------------------------------------------------------------------------

// Re-export from config/api for backward compatibility
// ---------------------------------------------------------------------------

export { loginApiUrl, refreshTokenApiUrl, revokeTokenApiUrl, oidcAuthorizeApiUrl, oidcLogoutApiUrl, oidcCallbackApiUrl, changePasswordApiUrl, forceChangePasswordApiUrl } from './config/api';

// Logs URL helper
export const observabilityLogsApiUrl = (): string => window.API_CONFIG.observabilityUrl + '/logs?live=true';
// Metrics URL helper
export const observabilityMetricsApiUrl = (): string => window.API_CONFIG.observabilityUrl + '/metrics';
export const observabilityWorkflowMetricsApiUrl = (): string => window.API_CONFIG.observabilityUrl + '/workflow-metrics';

// ---------------------------------------------------------------------------
// WSDL/SOAP namespace constants
// ---------------------------------------------------------------------------

export const WSDL_NS = 'http://schemas.xmlsoap.org/wsdl/';
export const SOAP_NS = 'http://schemas.xmlsoap.org/wsdl/soap/';
export const SOAP12_NS = 'http://schemas.xmlsoap.org/wsdl/soap12/';
