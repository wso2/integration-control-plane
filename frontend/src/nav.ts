import { createContext, createElement, useContext, type FC, type JSX } from 'react';
import { Outlet, useParams, useLocation } from 'react-router';
import { capitalize } from './utils/string';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Level = 'organizations' | 'projects' | 'components';

export type OrgScope = { level: 'organizations'; org: string };
export type ProjectScope = { level: 'projects'; org: string; project: string };
export type ComponentScope = { level: 'components'; org: string; project: string; component: string };
export type Scope = OrgScope | ProjectScope | ComponentScope;

export type ScopeForLevel = { organizations: OrgScope; projects: ProjectScope; components: ComponentScope };

export type Resource = 'overview' | 'workflows' | 'tasks' | 'test' | 'logs' | 'loggers' | 'metrics' | 'runtimes' | 'environments' | 'access-control';

export type Matrix = { [R in Resource]: { segment: string; pages: Partial<{ [L in Level]: FC<ScopeForLevel[L]> }> } };

export interface SidebarItem {
  resource: Resource;
  label: string;
  url: string;
  active: boolean;
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function hasProject(scope: Scope): scope is ProjectScope | ComponentScope {
  return scope.level !== 'organizations';
}

export function hasComponent(scope: Scope): scope is ComponentScope {
  return scope.level === 'components';
}

// ---------------------------------------------------------------------------
// Internal state — populated once by generateMatrixRoutes, read thereafter
// ---------------------------------------------------------------------------

let MATRIX: Record<Resource, { segment: string; levels: readonly Level[] }>;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const LEVEL_CHAIN: Level[] = ['organizations', 'projects', 'components'];

const LEVEL_PARAMS: Record<Level, string> = {
  organizations: ':orgHandler',
  projects: ':projectHandler',
  components: ':componentHandler',
};

function scopeValue(scope: Scope, level: Level): string {
  if (level === 'organizations') return scope.org;
  if (level === 'projects') {
    if (hasProject(scope)) return scope.project;
    return '';
  }
  if (hasComponent(scope)) return scope.component;
  return '';
}

function scopePrefix(scope: Scope): string {
  const idx = LEVEL_CHAIN.indexOf(scope.level);
  return LEVEL_CHAIN.slice(0, idx + 1)
    .map((l) => `/${l}/${scopeValue(scope, l)}`)
    .join('');
}

function urlPattern(level: Level, segment: string): string {
  const idx = LEVEL_CHAIN.indexOf(level);
  const parts = LEVEL_CHAIN.slice(0, idx + 1).map((l) => `${l}/${LEVEL_PARAMS[l]}`);
  if (segment) parts.push(segment);
  return parts.join('/');
}

// ---------------------------------------------------------------------------
// Core pure functions
// ---------------------------------------------------------------------------

export function resourceUrl(scope: Scope, resource: Resource): string {
  const effective = MATRIX[resource].levels.includes(scope.level) ? resource : 'overview';
  let seg = MATRIX[effective].segment;
  // Replace route parameters with default values based on scope level
  if (effective === 'access-control') {
    seg = seg.replace(':tab', scope.level === 'organizations' ? 'users' : 'roles');
  }
  const prefix = scopePrefix(scope);
  return seg ? `${prefix}/${seg}` : prefix;
}

export function broaden(scope: Scope): Scope | null {
  if (scope.level === 'components') return { level: 'projects', org: scope.org, project: scope.project };
  if (scope.level === 'projects') return { level: 'organizations', org: scope.org };
  return null;
}

export function narrow(scope: Scope, childId: string): Scope {
  if (scope.level === 'organizations') return { level: 'projects', org: scope.org, project: childId };
  if (scope.level === 'projects') return { level: 'components', org: scope.org, project: scope.project, component: childId };
  return scope;
}

// Labels where capitalize(resource) is not the name people know the page by.
const SIDEBAR_LABELS: Partial<Record<Resource, string>> = {
  tasks: 'Human Tasks',
};

export function sidebarItems(scope: Scope, currentResource: Resource | null): SidebarItem[] {
  return (Object.entries(MATRIX) as [Resource, (typeof MATRIX)[Resource]][])
    .filter(([, def]) => def.levels.includes(scope.level))
    .map(([resource]) => ({
      resource,
      label: SIDEBAR_LABELS[resource] ?? capitalize(resource),
      url: resourceUrl(scope, resource),
      active: resource === currentResource,
    }));
}

export function newProjectUrl(scope: { org: string }): string {
  return `/organizations/${scope.org}/projects/new`;
}

export function newEnvironmentUrl(scope: { org: string }): string {
  return `/organizations/${scope.org}/environments/new`;
}

export function newComponentUrl(scope: { org: string; project: string }): string {
  return `/organizations/${scope.org}/projects/${scope.project}/components/new`;
}

// ---------------------------------------------------------------------------
// React context & ScopeResolver
// ---------------------------------------------------------------------------

interface NavState {
  scope: Scope;
  resource: Resource | null;
}

const NavContext = createContext<NavState | null>(null);

export function useScope(): Scope {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useScope() called outside ScopeResolver');
  return ctx.scope;
}

export function useResource(): Resource | null {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useResource() called outside ScopeResolver');
  return ctx.resource;
}

function resolveScope(orgHandler: string, projectHandler?: string, componentHandler?: string): Scope {
  if (componentHandler && projectHandler) return { level: 'components', org: orgHandler, project: projectHandler, component: componentHandler };
  if (projectHandler) return { level: 'projects', org: orgHandler, project: projectHandler };
  return { level: 'organizations', org: orgHandler };
}

function resolveResource(pathname: string, scope: Scope): Resource | null {
  const prefix = scopePrefix(scope);
  const rest = pathname.slice(prefix.length).replace(/^\//, '');
  for (const [resource, def] of Object.entries(MATRIX) as [Resource, (typeof MATRIX)[Resource]][]) {
    if (!def.levels.includes(scope.level)) continue;
    // Convert segment pattern to regex, replacing :param with [^/]+
    const segmentPattern = def.segment.replace(/:[^/]+/g, '[^/]+');
    // Exact match for empty segments (overview), prefix match for others so sub-pages (e.g. role detail) still resolve
    const pattern = segmentPattern ? '^' + segmentPattern + '($|/)' : '^$';
    if (new RegExp(pattern).test(rest)) return resource;
  }
  return null;
}

export function ScopeResolver(): JSX.Element {
  const { orgHandler = 'default', projectHandler, componentHandler } = useParams();
  const { pathname } = useLocation();
  const scope = resolveScope(orgHandler, projectHandler, componentHandler);
  const resource = resolveResource(pathname, scope);
  return createElement(NavContext.Provider, { value: { scope, resource } }, createElement(Outlet));
}

// ---------------------------------------------------------------------------
// withScope HOC
// ---------------------------------------------------------------------------

export function withScope<S extends Scope>(Component: FC<S>, validLevels: readonly Level[]): FC {
  return function Wrapped() {
    const scope = useScope();
    if (!validLevels.includes(scope.level)) return createElement('p', null, `This page is not available at the ${scope.level} level.`);
    return createElement(Component, scope as S);
  };
}

// ---------------------------------------------------------------------------
// Route generation
// ---------------------------------------------------------------------------

interface GeneratedRoute {
  path: string;
  element: JSX.Element;
}

export function generateMatrixRoutes(matrix: Matrix): GeneratedRoute[] {
  MATRIX = Object.fromEntries((Object.entries(matrix) as [Resource, Matrix[Resource]][]).map(([resource, def]) => [resource, { segment: def.segment, levels: Object.keys(def.pages) as Level[] }])) as Record<Resource, { segment: string; levels: Level[] }>;

  const routes: GeneratedRoute[] = [];
  for (const [, def] of Object.entries(matrix) as [Resource, Matrix[Resource]][]) {
    for (const [level, PageComponent] of Object.entries(def.pages) as [Level, FC<never>][]) {
      routes.push({
        path: urlPattern(level, def.segment),
        element: createElement(withScope(PageComponent, [level])),
      });
    }
  }
  return routes;
}

// Re-export loginUrl for ProtectedRoute (stays in paths.ts as API URL, but keep backward compat)
export { loginUrl } from './paths';
