/**
 * API URLs, external links, and legacy path helpers for pages not yet migrated to nav.ts.
 * Navigation for the main matrix pages is handled by src/nav.ts.
 */

import { withBase } from './utils/basePath';

export function loginUrl(): string {
  return '/login';
}

export function signupUrl(): string {
  return '/signup';
}

export function projectsRedirectUrl(orgHandler: string): string {
  return `/organizations/${orgHandler}/projects/redirect`;
}

export function oidcCallbackUrl(): string {
  return '/signin';
}

export function privacyPolicyUrl(): string {
  return 'https://wso2.com/privacy-policy';
}

export function cookiePolicyUrl(): string {
  return '/cookie-policy';
}

export function termsOfUseUrl(): string {
  return 'https://wso2.com/integration-platform/terms-of-use';
}

export function documentationUrl(): string {
  return 'https://wso2.com/integration-platform/docs/';
}

// ---------------------------------------------------------------------------
// Legacy path helpers — used by flows outside the nav matrix (onboarding,
// create/import, prebuilt integrations, access control, governance,
// certificates). Migrate their callers to nav.ts before removing.
// ---------------------------------------------------------------------------

export function rootUrl(): string {
  return '/';
}

export function orgUrl(orgHandler: string): string {
  return `/organizations/${orgHandler}`;
}

export function orgHomeUrl(orgHandler: string): string {
  return `/organizations/${orgHandler}/home`;
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

export function projectHomeUrl(orgHandler: string, projectHandler: string): string {
  return `/organizations/${orgHandler}/projects/${projectHandler}/home`;
}

export function componentUrl(orgHandler: string, projectHandler: string, componentHandler: string): string {
  return `/organizations/${orgHandler}/projects/${projectHandler}/components/${componentHandler}`;
}

export function componentOverviewUrl(orgHandler: string, projectHandler: string, componentHandler: string): string {
  return `/organizations/${orgHandler}/projects/${projectHandler}/components/${componentHandler}/overview`;
}

export function importComponentUrl(orgHandler: string, projectHandler: string): string {
  return `/organizations/${orgHandler}/projects/${projectHandler}/components/new/import`;
}

export function componentsNewUrl(orgHandler: string, projectHandler: string): string {
  return `/organizations/${orgHandler}/projects/${projectHandler}/components/new`;
}

export function browseSamplesUrl(orgHandler: string, projectHandler: string): string {
  return `/organizations/${orgHandler}/projects/${projectHandler}/components/new/samples`;
}

export function componentsNewAiBuilderUrl(orgHandler: string, projectHandler: string): string {
  return `/organizations/${orgHandler}/projects/${projectHandler}/components/new/ai-builder`;
}

export function prebuiltIntegrationsUrl(orgHandler: string, projectHandler: string): string {
  return `/organizations/${orgHandler}/projects/${projectHandler}/prebuilt-integrations`;
}

export function prebuiltIntegrationSetupUrl(orgHandler: string, projectHandler: string, slug: string): string {
  return `/organizations/${orgHandler}/projects/${projectHandler}/prebuilt-integrations/${encodeURIComponent(slug)}`;
}

export function prebuiltIntegrationDeployUrl(orgHandler: string, projectHandler: string, slug: string): string {
  return `/organizations/${orgHandler}/projects/${projectHandler}/prebuilt-integrations/${encodeURIComponent(slug)}/deploy`;
}

export function importComingSoonUrl(orgHandler: string, projectHandler: string): string {
  return `/organizations/${orgHandler}/projects/${projectHandler}/components/new/import-coming-soon`;
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

export function orgAccessControlUrl(orgHandler: string, tab: 'users' | 'roles' | 'groups' = 'users'): string {
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

export function componentAccessControlUrl(orgHandler: string, projectHandler: string, componentHandler: string, tab: 'roles' | 'groups' = 'roles'): string {
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

export function componentBuildUrl(orgHandler: string, projectHandler: string, componentHandler: string): string {
  return `/organizations/${orgHandler}/projects/${projectHandler}/components/${componentHandler}/build`;
}

export function componentDeployUrl(orgHandler: string, projectHandler: string, componentHandler: string): string {
  return `/organizations/${orgHandler}/projects/${projectHandler}/components/${componentHandler}/deploy`;
}

export function orgGovernanceUrl(orgHandler: string): string {
  return `/organizations/${orgHandler}/admin/governance`;
}

export function orgGovernanceNewPolicyUrl(orgHandler: string): string {
  return `/organizations/${orgHandler}/admin/governance/policies/new`;
}

export function orgGovernancePolicyUrl(orgHandler: string, policyId: string): string {
  return `/organizations/${orgHandler}/admin/governance/policies/${encodeURIComponent(policyId)}`;
}

export function orgGovernanceNewAiPolicyUrl(orgHandler: string): string {
  return `/organizations/${orgHandler}/admin/governance/ai-policies/new`;
}

export function orgGovernanceAiPolicyUrl(orgHandler: string, policyId: string): string {
  return `/organizations/${orgHandler}/admin/governance/ai-policies/${encodeURIComponent(policyId)}`;
}

export function orgGovernanceNewRulesetUrl(orgHandler: string): string {
  return `/organizations/${orgHandler}/admin/governance/rulesets/new`;
}

export function orgGovernanceRulesetUrl(orgHandler: string, rulesetId: string): string {
  return `/organizations/${orgHandler}/admin/governance/rulesets/${encodeURIComponent(rulesetId)}`;
}

export function orgGovernanceNewDocumentUrl(orgHandler: string): string {
  return `/organizations/${orgHandler}/admin/governance/documents/new`;
}

export function orgGovernanceDocumentUrl(orgHandler: string, documentId: string): string {
  return `/organizations/${orgHandler}/admin/governance/documents/${encodeURIComponent(documentId)}`;
}

/** AI policies and ruleset/document policies open different governance editors. */
export function orgGovernancePolicyEditorUrl(orgHandler: string, policyId: string, policyType?: string | null): string {
  return (policyType ?? '').toLowerCase() === 'ai' ? orgGovernanceAiPolicyUrl(orgHandler, policyId) : orgGovernancePolicyUrl(orgHandler, policyId);
}

export function orgCertificatesUrl(orgHandler: string): string {
  return `/organizations/${orgHandler}/admin/certificates`;
}

export function orgNewCertificateUrl(orgHandler: string): string {
  return `/organizations/${orgHandler}/admin/certificates/new`;
}

export function orgCertificateUrl(orgHandler: string, certificateId: string): string {
  return `/organizations/${orgHandler}/admin/certificates/${encodeURIComponent(certificateId)}`;
}

export function projectComplianceUrl(orgHandler: string, projectHandler: string): string {
  return `/organizations/${orgHandler}/projects/${projectHandler}/insights/compliance`;
}

export function componentComplianceUrl(orgHandler: string, projectHandler: string, componentHandler: string): string {
  return `/organizations/${orgHandler}/projects/${projectHandler}/components/${componentHandler}/insights/compliance`;
}

// ---------------------------------------------------------------------------
// External links
// ---------------------------------------------------------------------------

export const external = {
  wso2: 'https://www.wso2.com',
  wso2Contact: 'https://wso2.com/contact/',
  vite: 'https://vite.dev',
  react: 'https://react.dev',
  oxygenUi: 'https://github.com/wso2/oxygen-ui/tree/next',
  githubNew: 'https://github.com/new',
} as const;

/** Public host bases used to build a component's source repo URL per git provider. */
export const gitProviderBase = {
  github: 'https://github.com',
  bitbucket: 'https://bitbucket.org',
  gitlab: 'https://gitlab.com',
  azure: 'https://dev.azure.com',
} as const;

// Build GitHub OAuth authorization URL for repository access.
// redirectUri falls back to window.location.origin + '/ghapp' when empty.
export function buildGitHubOAuthUrl(redirectUri: string, clientId: string, state: string, scope = 'repo,read:user'): string {
  const params = new URLSearchParams({
    redirect_uri: redirectUri || `${window.location.origin}${withBase('/ghapp')}`,
    client_id: clientId,
    scope,
    state,
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

// GitHub App installation page — opened when the user authorized the App but
// has not installed it on any account/org yet (bind returns 409).
export function buildGitHubAppInstallUrl(slug: string): string {
  return `https://github.com/apps/${slug}/installations/new`;
}

/** Moesif dashboard and the ipaas-service viewer-token endpoint. */
export const MOESIF_ORIGINS = ['https://www.moesif.com', 'https://web-dev.moesif.com'] as const;
// The isolated APIs section leaves out the LLM, MCP and A2A traffic cards.
export const moesifInsightsUrl = (origin: string): string => `${origin}/wrap/basic/apis?embedded_ui=true&isolated_section=true#auth=post`;
export const analyticsViewerTokenUrl = (base: string): string => `${base}/analytics/id-token`;
