import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { gql } from './graphql';

export interface GqlPageInfo {
  total: number;
  limit: number;
  offset: number;
}

export interface GqlProject {
  id: string;
  orgId: number;
  name: string;
  handler: string;
  description: string;
  version: string;
  createdDate: string;
  updatedAt: string;
  region: string;
  type: string;
}

export interface GqlComponent {
  projectId: string;
  id: string;
  name: string;
  handler: string;
  displayName: string;
  displayType: string;
  description: string;
  status: string;
  componentType: string;
  componentSubType: string | null;
  version: string;
  createdAt: string;
  lastBuildDate: string;
}

const PROJECTS_QUERY = `{
  projects(orgId: 1) {
    items { id, orgId, name, handler, description, version, createdDate, updatedAt, region, type }
    pageInfo { total, limit, offset }
  }
}`;

const PROJECTS_PAGE_QUERY = `
  query GetProjectsPage($limit: Int!, $offset: Int!) {
    projects(orgId: 1, pagination: { limit: $limit, offset: $offset }) {
      items { id, orgId, name, handler, description, version, createdDate, updatedAt, region, type }
      pageInfo { total, limit, offset }
    }
  }`;

const PROJECT_QUERY = `
  query GetProject($projectId: String!) {
    project(orgId: 1, projectId: $projectId) {
      id, orgId, name, handler, description, version,
      createdDate, updatedAt, region, type
    }
  }`;

const PROJECT_BY_HANDLER_QUERY = `
  query GetProjectByHandler($projectHandler: String!) {
    projectByHandler(orgId: 1, projectHandler: $projectHandler) {
      id, orgId, name, handler, description, version,
      createdDate, updatedAt, region, type
    }
  }`;

const COMPONENTS_QUERY = `
  query GetComponents($orgHandler: String!, $projectId: String!) {
    components(orgHandler: $orgHandler, projectId: $projectId) {
      items { projectId, id, name, handler, displayName, displayType,
              description, status, componentType, componentSubType,
              version, createdAt, lastBuildDate }
      pageInfo { total, limit, offset }
    }
  }`;

const COMPONENTS_PAGE_QUERY = `
  query GetComponentsPage($orgHandler: String!, $projectId: String!, $limit: Int!, $offset: Int!) {
    components(orgHandler: $orgHandler, projectId: $projectId, options: { pagination: { limit: $limit, offset: $offset } }) {
      items { projectId, id, name, handler, displayName, displayType,
              description, status, componentType, componentSubType,
              version, createdAt, lastBuildDate }
      pageInfo { total, limit, offset }
    }
  }`;

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => gql<{ projects: { items: GqlProject[]; pageInfo: GqlPageInfo } }>(PROJECTS_QUERY).then((d) => d.projects.items),
  });
}

export function useProjectsPage(limit: number, offset: number) {
  return useQuery({
    queryKey: ['projects', 'page', limit, offset],
    queryFn: () => gql<{ projects: { items: GqlProject[]; pageInfo: GqlPageInfo } }>(PROJECTS_PAGE_QUERY, { limit, offset }).then((d) => d.projects),
  });
}

export function useProject(projectId: string) {
  return useQuery({
    queryKey: ['project', projectId],
    queryFn: () => gql<{ project: GqlProject }>(PROJECT_QUERY, { projectId }).then((d) => d.project),
    enabled: !!projectId,
  });
}

export function useProjectByHandler(handler: string) {
  return useQuery({
    queryKey: ['project', 'handler', handler],
    queryFn: () => gql<{ projectByHandler: GqlProject }>(PROJECT_BY_HANDLER_QUERY, { projectHandler: handler }).then((d) => d.projectByHandler),
    enabled: !!handler,
  });
}

const PROJECT_HANDLER_AVAILABILITY_QUERY = `
  query ProjectHandlerAvailability($orgId: Int!, $projectHandlerCandidate: String!) {
    projectHandlerAvailability(orgId: $orgId, projectHandlerCandidate: $projectHandlerCandidate) {
      handlerUnique
      alternateHandlerCandidate
    }
  }
`;

export interface GqlProjectHandlerAvailability {
  handlerUnique: boolean;
  alternateHandlerCandidate: string | null;
}

export function useProjectHandlerAvailability(orgId: number, handler: string) {
  return useQuery({
    queryKey: ['project', 'handler-availability', orgId, handler],
    queryFn: () =>
      gql<{ projectHandlerAvailability: GqlProjectHandlerAvailability }>(PROJECT_HANDLER_AVAILABILITY_QUERY, {
        orgId,
        projectHandlerCandidate: handler,
      }).then((d) => d.projectHandlerAvailability),
    enabled: !!handler,
  });
}

const ENVIRONMENT_HANDLER_AVAILABILITY_QUERY = `
  query EnvironmentHandlerAvailability($environmentHandlerCandidate: String!) {
    environmentHandlerAvailability(environmentHandlerCandidate: $environmentHandlerCandidate) {
      handlerUnique
      alternateHandlerCandidate
    }
  }
`;

export interface GqlEnvironmentHandlerAvailability {
  handlerUnique: boolean;
  alternateHandlerCandidate: string | null;
}

export function useEnvironmentHandlerAvailability(handler: string) {
  return useQuery({
    queryKey: ['environment', 'handler-availability', handler],
    queryFn: () =>
      gql<{ environmentHandlerAvailability: GqlEnvironmentHandlerAvailability }>(ENVIRONMENT_HANDLER_AVAILABILITY_QUERY, {
        environmentHandlerCandidate: handler,
      }).then((d) => d.environmentHandlerAvailability),
    enabled: !!handler,
  });
}

export function useComponents(orgHandler: string, projectId: string) {
  return useQuery({
    queryKey: ['components', orgHandler, projectId],
    queryFn: () => gql<{ components: { items: GqlComponent[]; pageInfo: GqlPageInfo } }>(COMPONENTS_QUERY, { orgHandler, projectId }).then((d) => d.components.items),
    enabled: !!orgHandler && !!projectId,
  });
}

export function useComponentsPage(orgHandler: string, projectId: string, limit: number, offset: number) {
  return useQuery({
    queryKey: ['components', 'page', orgHandler, projectId, limit, offset],
    queryFn: () => gql<{ components: { items: GqlComponent[]; pageInfo: GqlPageInfo } }>(COMPONENTS_PAGE_QUERY, { orgHandler, projectId, limit, offset }).then((d) => d.components),
    enabled: !!orgHandler && !!projectId,
  });
}

export interface GqlComponentDetail extends GqlComponent {
  orgHandler: string;
}

const COMPONENT_BY_HANDLER_QUERY = `
  query GetComponent($projectId: String!, $componentHandler: String!) {
    component(projectId: $projectId, componentHandler: $componentHandler) {
      projectId, id, name, handler, displayName, displayType,
      description, status, componentType, componentSubType,
      version, createdAt, lastBuildDate, orgHandler
    }
  }`;

export function useComponentByHandler(projectId: string, handler: string | undefined) {
  return useQuery({
    queryKey: ['component', projectId, handler],
    queryFn: () => gql<{ component: GqlComponentDetail }>(COMPONENT_BY_HANDLER_QUERY, { projectId, componentHandler: handler }).then((d) => d.component),
    enabled: !!projectId && !!handler,
  });
}

export interface GqlEnvironment {
  id: string;
  name: string;
  handler: string;
  critical: boolean;
  description?: string;
  createdAt?: string;
}

const ENVIRONMENTS_QUERY = `
  query GetEnvironments($projectId: String!) {
    environments(orgUuid: "default-org-uuid", type: "external", projectId: $projectId) {
      items { id, name, handler, critical }
      pageInfo { total, limit, offset }
    }
  }`;

export function useEnvironments(projectId: string) {
  return useQuery({
    queryKey: ['environments', projectId],
    queryFn: () => gql<{ environments: { items: GqlEnvironment[]; pageInfo: GqlPageInfo } }>(ENVIRONMENTS_QUERY, { projectId }).then((d) => d.environments.items),
    enabled: !!projectId,
  });
}

const ALL_ENVIRONMENTS_QUERY = `{
  environments { items { id, name, handler, description, critical, createdAt } pageInfo { total, limit, offset } }
}`;

export function useAllEnvironments() {
  return useQuery({
    queryKey: ['environments'],
    queryFn: () => gql<{ environments: { items: GqlEnvironment[]; pageInfo: GqlPageInfo } }>(ALL_ENVIRONMENTS_QUERY).then((d) => d.environments.items),
  });
}

export interface GqlLogger {
  loggerName: string;
  componentName: string;
  logLevel: string;
  logLevelInSync: boolean | null;
  runtimeIds: string[];
}

const LOGGERS_BY_ENV_AND_COMPONENT_QUERY = `
  query GetLoggers($environmentId: String!, $componentId: String!) {
    loggersByEnvironmentAndComponent(environmentId: $environmentId, componentId: $componentId) {
      items { loggerName, componentName, logLevel, logLevelInSync, runtimeIds }
      pageInfo { total, limit, offset }
    }
  }`;

export function useLoggers(environmentId: string, componentId: string) {
  return useQuery({
    queryKey: ['loggers', environmentId, componentId],
    queryFn: () => gql<{ loggersByEnvironmentAndComponent: { items: GqlLogger[]; pageInfo: GqlPageInfo } }>(LOGGERS_BY_ENV_AND_COMPONENT_QUERY, { environmentId, componentId }).then((d) => d.loggersByEnvironmentAndComponent.items),
    enabled: !!environmentId && !!componentId,
    refetchInterval: (query) => {
      const loggers = query.state.data;
      if (!loggers) return false;
      return loggers.some((l) => l.logLevelInSync === false) ? 1000 : false;
    },
  });
}

export interface GqlRuntime {
  runtimeId: string;
  runtimeName?: string;
  runtimeType: string;
  status: string;
  version: string;
  platformName: string;
  platformVersion: string;
  platformHome: string;
  osName: string;
  osVersion: string;
  registrationTime: string;
  lastHeartbeat: string;
  component?: { id?: string; displayName: string };
}

const RUNTIMES_QUERY = `
  query GetRuntimes($environmentId: String!, $projectId: String!, $componentId: String!) {
    runtimes(environmentId: $environmentId, projectId: $projectId, componentId: $componentId) {
      items { runtimeId, runtimeName, runtimeType, status, version,
              platformName, platformVersion, platformHome,
              osName, osVersion, registrationTime, lastHeartbeat }
      pageInfo { total, limit, offset }
    }
  }`;

export function useRuntimes(envId: string, projectId: string, componentId: string) {
  return useQuery({
    queryKey: ['runtimes', envId, projectId, componentId],
    queryFn: () => gql<{ runtimes: { items: GqlRuntime[]; pageInfo: GqlPageInfo } }>(RUNTIMES_QUERY, { environmentId: envId, projectId, componentId }).then((d) => d.runtimes.items),
    enabled: !!envId && !!projectId && !!componentId,
  });
}

const COMPONENT_RUNTIMES_QUERY = `
  query GetComponentRuntimes($environmentId: String!, $projectId: String!, $componentId: String!) {
    runtimes(environmentId: $environmentId, projectId: $projectId, componentId: $componentId) {
      items { runtimeId, runtimeName, runtimeType, status, version,
              platformName, platformVersion, platformHome,
              osName, osVersion, registrationTime, lastHeartbeat,
              component { displayName } }
      pageInfo { total, limit, offset }
    }
  }`;

export function useComponentRuntimes(envId: string, projectId: string, componentId: string, enabled = true) {
  return useQuery({
    queryKey: ['componentRuntimes', envId, projectId, componentId],
    queryFn: () => gql<{ runtimes: { items: GqlRuntime[]; pageInfo: GqlPageInfo } }>(COMPONENT_RUNTIMES_QUERY, { environmentId: envId, projectId, componentId }).then((d) => d.runtimes.items),
    enabled: enabled && !!envId && !!projectId && !!componentId,
  });
}

// Determines, for a given integration (project + component), which of the
// supplied environments have at least one registered runtime. The `runtimes`
// query is environment-scoped, so this runs one query per environment (via
// `useQueries`) and reuses the same cache entries as `useComponentRuntimes`.
// Returns the set of environment ids that have runtimes plus a combined loading
// flag. Used to hide environments where the integration has no runtime deployed
// (e.g. Moesif metrics/logs should only offer environments the integration is
// actually running in).
export function useComponentRuntimesByEnvironments(projectId: string, componentId: string, environmentIds: string[], enabled = true) {
  const results = useQueries({
    queries: environmentIds.map((envId) => ({
      queryKey: ['componentRuntimes', envId, projectId, componentId],
      queryFn: () => gql<{ runtimes: { items: GqlRuntime[]; pageInfo: GqlPageInfo } }>(COMPONENT_RUNTIMES_QUERY, { environmentId: envId, projectId, componentId }).then((d) => d.runtimes.items),
      enabled: enabled && !!envId && !!projectId && !!componentId,
    })),
  });

  const envsWithRuntimes = new Set<string>();
  environmentIds.forEach((envId, index) => {
    const items = results[index]?.data;
    if (items && items.length > 0) {
      envsWithRuntimes.add(envId);
    }
  });

  // Surface failed per-environment requests so callers can distinguish a genuine
  // "no runtimes" result from a fetch failure (a failed request yields undefined
  // data, which would otherwise silently drop the environment).
  const failed = results.find((result) => result.isError);

  return {
    envsWithRuntimes,
    isLoading: results.some((result) => result.isLoading),
    isError: results.some((result) => result.isError),
    error: failed?.error ?? null,
    refetch: () => {
      results.forEach((result) => {
        void result.refetch();
      });
    },
  };
}

const PROJECT_RUNTIMES_QUERY = `
  query GetProjectRuntimes($environmentId: String!, $projectId: String!) {
    runtimes(environmentId: $environmentId, projectId: $projectId) {
      items { runtimeId, runtimeName, runtimeType, status, version,
              platformName, platformVersion, platformHome,
              osName, osVersion, registrationTime, lastHeartbeat,
              component { id, displayName } }
      pageInfo { total, limit, offset }
    }
  }`;

export function useProjectRuntimes(envId: string, projectId: string, enabled = true) {
  return useQuery({
    queryKey: ['projectRuntimes', envId, projectId],
    queryFn: () => gql<{ runtimes: { items: GqlRuntime[]; pageInfo: GqlPageInfo } }>(PROJECT_RUNTIMES_QUERY, { environmentId: envId, projectId }).then((d) => d.runtimes.items),
    enabled: enabled && !!envId && !!projectId,
  });
}

// Project-wide counterpart of `useComponentRuntimesByEnvironments`: determines
// which of the supplied environments have at least one runtime registered for
// ANY integration in the project. Used by the project-scope Moesif views, which
// aggregate every integration's runtimes instead of targeting one integration,
// so the environment selector must offer every environment the project is
// deployed to. Runs one query per environment and shares its cache entries with
// `useProjectRuntimes`.
export function useProjectRuntimesByEnvironments(projectId: string, environmentIds: string[], enabled = true) {
  const results = useQueries({
    queries: environmentIds.map((envId) => ({
      queryKey: ['projectRuntimes', envId, projectId],
      queryFn: () => gql<{ runtimes: { items: GqlRuntime[]; pageInfo: GqlPageInfo } }>(PROJECT_RUNTIMES_QUERY, { environmentId: envId, projectId }).then((d) => d.runtimes.items),
      enabled: enabled && !!envId && !!projectId,
    })),
  });

  const envsWithRuntimes = new Set<string>();
  // The runtimes themselves, keyed by environment, so callers can narrow further
  // (e.g. the Moesif metrics view only aggregates runtimes of the technology its
  // canvas template covers) and build per-runtime filter options without issuing
  // a second query.
  const runtimesByEnv: Record<string, GqlRuntime[]> = {};
  environmentIds.forEach((envId, index) => {
    const items = results[index]?.data;
    runtimesByEnv[envId] = items ?? [];
    if (items && items.length > 0) {
      envsWithRuntimes.add(envId);
    }
  });

  // Surface failed per-environment requests so callers can tell a genuine "no
  // runtimes" result apart from a fetch failure (see the component-scoped hook).
  const failed = results.find((result) => result.isError);

  return {
    envsWithRuntimes,
    runtimesByEnv,
    isLoading: results.some((result) => result.isLoading),
    isError: results.some((result) => result.isError),
    error: failed?.error ?? null,
    refetch: () => {
      results.forEach((result) => {
        void result.refetch();
      });
    },
  };
}

const ORG_RUNTIMES_QUERY = `
  query GetOrgRuntimes($environmentId: String!) {
    runtimes(environmentId: $environmentId) {
      items { runtimeId, runtimeName, runtimeType, status, version,
              platformName, platformVersion, platformHome,
              osName, osVersion, registrationTime, lastHeartbeat,
              component { displayName } }
      pageInfo { total, limit, offset }
    }
  }`;

export { RUNTIMES_QUERY, PROJECT_RUNTIMES_QUERY, ORG_RUNTIMES_QUERY };

const RUNTIMES_PAGE_QUERY = `
  query GetRuntimesPage($environmentId: String!, $projectId: String!, $componentId: String, $limit: Int!, $offset: Int!) {
    runtimes(environmentId: $environmentId, projectId: $projectId, componentId: $componentId, pagination: { limit: $limit, offset: $offset }) {
      items { runtimeId, runtimeName, runtimeType, status, version,
              platformName, platformVersion, platformHome,
              osName, osVersion, registrationTime, lastHeartbeat,
              component { displayName } }
      pageInfo { total, limit, offset }
    }
  }`;

export function useRuntimesPage(envId: string, projectId: string, componentId: string | undefined, limit: number, offset: number) {
  return useQuery({
    queryKey: ['runtimes', 'page', envId, projectId, componentId, limit, offset],
    queryFn: () => gql<{ runtimes: { items: GqlRuntime[]; pageInfo: GqlPageInfo } }>(RUNTIMES_PAGE_QUERY, { environmentId: envId, projectId, componentId, limit, offset }).then((d) => d.runtimes),
    enabled: !!envId && !!projectId,
  });
}

const ORG_RUNTIMES_PAGE_QUERY = `
  query GetOrgRuntimesPage($environmentId: String!, $limit: Int!, $offset: Int!) {
    runtimes(environmentId: $environmentId, pagination: { limit: $limit, offset: $offset }) {
      items { runtimeId, runtimeName, runtimeType, status, version,
              platformName, platformVersion, platformHome,
              osName, osVersion, registrationTime, lastHeartbeat,
              component { displayName } }
      pageInfo { total, limit, offset }
    }
  }`;

export function useOrgRuntimesPage(envId: string, limit: number, offset: number) {
  return useQuery({
    queryKey: ['runtimes', 'page', envId, limit, offset],
    queryFn: () => gql<{ runtimes: { items: GqlRuntime[]; pageInfo: GqlPageInfo } }>(ORG_RUNTIMES_PAGE_QUERY, { environmentId: envId, limit, offset }).then((d) => d.runtimes),
    enabled: !!envId,
  });
}

// ── Component-level Bound Secrets ──

export interface GqlBoundSecretRuntime {
  runtimeId: string;
  status: string;
}

export interface GqlBoundSecret {
  keyId: string;
  createdAt: string;
  createdBy: string | null;
  runtimes: GqlBoundSecretRuntime[];
}

export const COMPONENT_SECRETS_QUERY = `
  query GetComponentSecrets($componentId: String!, $environmentId: String!) {
    componentSecrets(componentId: $componentId, environmentId: $environmentId) {
      items { keyId, createdAt, createdBy, runtimes { runtimeId, status } }
      pageInfo { total, limit, offset }
    }
  }`;

export function useComponentSecrets(componentId: string, environmentId: string) {
  return useQuery({
    queryKey: ['componentSecrets', componentId, environmentId],
    queryFn: () => gql<{ componentSecrets: { items: GqlBoundSecret[]; pageInfo: GqlPageInfo } }>(COMPONENT_SECRETS_QUERY, { componentId, environmentId }).then((d) => d.componentSecrets.items),
    enabled: !!componentId && !!environmentId,
  });
}

// ── Org Secrets ──

export interface GqlOrgSecret {
  keyId: string;
  environmentId: string;
  environmentName: string;
  bound: boolean;
  createdAt: string;
  createdBy: string | null;
}

const ORG_SECRETS_QUERY = `
  query GetOrgSecrets($environmentId: String) {
    orgSecrets(environmentId: $environmentId) {
      items { keyId, environmentId, environmentName, bound, createdAt, createdBy }
      pageInfo { total, limit, offset }
    }
  }`;

export function useOrgSecrets(environmentId?: string) {
  return useQuery({
    queryKey: ['orgSecrets', environmentId],
    queryFn: () => gql<{ orgSecrets: { items: GqlOrgSecret[]; pageInfo: GqlPageInfo } }>(ORG_SECRETS_QUERY, environmentId ? { environmentId } : {}).then((d) => d.orgSecrets.items),
  });
}

export interface GqlArtifactType {
  artifactType: string;
  artifactCount: number;
}

export function useArtifactTypes(componentId: string, envId: string) {
  return useQuery({
    queryKey: ['artifactTypes', componentId, envId],
    queryFn: () =>
      gql<{ componentArtifactTypes: GqlArtifactType[] }>(
        `query ComponentArtifactTypes($componentId: String!, $environmentId: String!) {
          componentArtifactTypes(componentId: $componentId, environmentId: $environmentId) {
            artifactType, artifactCount
          }
        }`,
        { componentId, environmentId: envId },
      ).then((d) => d.componentArtifactTypes),
    enabled: !!componentId && !!envId,
  });
}

// Backend uses camelCase query name: e.g. RestApi → restApisByEnvironmentAndComponent

export interface GqlArtifact {
  name: string;
  [key: string]: unknown;
}

// Maps artifactType to its GraphQL query field name and useful display fields
// `fields` = flat scalar fields, `gqlFields` = full GraphQL selection (including nested)
// fields = card columns, gqlFields = full GraphQL selection (including nested)
const ARTIFACT_QUERY_MAP: Record<string, { queryName: string; field: string; fields: string; gqlFields: string }> = {
  RestApi: {
    queryName: 'restApisByEnvironmentAndComponent',
    field: 'restApisByEnvironmentAndComponent',
    fields: 'name, context, version, state',
    gqlFields: 'name, context, version, state, stateInSync, tracing, tracingInSync, statistics, statisticsInSync, compositeApp, url, runtimes { runtimeId, runtimeName, status }, resources { path, methods }',
  },
  ProxyService: {
    queryName: 'proxyServicesByEnvironmentAndComponent',
    field: 'proxyServicesByEnvironmentAndComponent',
    fields: 'name, state',
    gqlFields: 'name, state, stateInSync, tracing, tracingInSync, statistics, statisticsInSync, compositeApp, endpoints, runtimes { runtimeId, runtimeName, status }',
  },
  Endpoint: {
    queryName: 'endpointsByEnvironmentAndComponent',
    field: 'endpointsByEnvironmentAndComponent',
    fields: 'name, type, state',
    gqlFields: 'name, type, state, stateInSync, tracing, tracingInSync, statistics, statisticsInSync, attributes { name, value }, runtimes { runtimeId, runtimeName, status }',
  },
  InboundEndpoint: {
    queryName: 'inboundEndpointsByEnvironmentAndComponent',
    field: 'inboundEndpointsByEnvironmentAndComponent',
    fields: 'name, protocol',
    gqlFields: 'name, protocol, sequence, onError, state, stateInSync, tracing, tracingInSync, statistics, statisticsInSync, compositeApp, runtimes { runtimeId, runtimeName, status }',
  },
  Sequence: {
    queryName: 'sequencesByEnvironmentAndComponent',
    field: 'sequencesByEnvironmentAndComponent',
    fields: 'name, type, container, state',
    gqlFields: 'name, type, container, state, stateInSync, tracing, tracingInSync, statistics, statisticsInSync, runtimes { runtimeId, runtimeName, status }',
  },
  Task: { queryName: 'tasksByEnvironmentAndComponent', field: 'tasksByEnvironmentAndComponent', fields: 'name, group, state', gqlFields: 'name, class, group, state, stateInSync, compositeApp, runtimes { runtimeId, runtimeName, status }' },
  LocalEntry: { queryName: 'localEntriesByEnvironmentAndComponent', field: 'localEntriesByEnvironmentAndComponent', fields: 'name, type', gqlFields: 'name, type, value, state, stateInSync, runtimes { runtimeId, runtimeName, status }' },
  CompositeApp: {
    queryName: 'compositeAppsByEnvironmentAndComponent',
    field: 'compositeAppsByEnvironmentAndComponent',
    fields: 'name, version, state',
    gqlFields: 'name, version, state, errorMessage, artifacts { name, type }, runtimes { runtimeId, runtimeName, status }',
  },
  Connector: {
    queryName: 'connectorsByEnvironmentAndComponent',
    field: 'connectorsByEnvironmentAndComponent',
    fields: 'name, package, description, state',
    gqlFields: 'name, package, version, description, state, stateInSync, runtimes { runtimeId, runtimeName, status }',
  },
  RegistryResource: { queryName: 'registryResourcesByEnvironmentAndComponent', field: 'registryResourcesByEnvironmentAndComponent', fields: 'name, type', gqlFields: 'name, type, runtimes { runtimeId, runtimeName, status }' },
  Listener: {
    queryName: 'listenersByEnvironmentAndComponent',
    field: 'listenersByEnvironmentAndComponent',
    fields: 'name, package, protocol, host, port, state',
    gqlFields: 'name, package, protocol, host, port, state, stateInSync, runtimes { runtimeId, runtimeName, status }',
  },
  Service: {
    queryName: 'servicesByEnvironmentAndComponent',
    field: 'servicesByEnvironmentAndComponent',
    fields: 'name, package, basePath, type',
    gqlFields: 'name, package, basePath, type, state, stateInSync, runtimes { runtimeId, runtimeName, status }, resources { path, method, url, methods }, listeners { name, package, protocol, host, port, state }',
  },
  Automation: {
    queryName: 'automationsByEnvironmentAndComponent',
    field: 'automationsByEnvironmentAndComponent',
    fields: 'packageOrg, packageName, packageVersion',
    gqlFields: 'packageOrg, packageName, packageVersion, runtimeIds, runtimes { runtimeId, runtimeName, status, executionTimestamps }, executionTimestamp',
  },
  Workflow: {
    queryName: 'workflowsByEnvironmentAndComponent',
    field: 'workflowsByEnvironmentAndComponent',
    fields: 'name, workerCount',
    gqlFields: 'name, isActive, workerCount, inputSchema, state, runtimes { runtimeId, runtimeName, status }',
  },
  MessageStore: {
    queryName: 'messageStoresByEnvironmentAndComponent',
    field: 'messageStoresByEnvironmentAndComponent',
    fields: 'name, type, size',
    gqlFields: 'name, type, size, state, stateInSync, compositeApp, runtimes { runtimeId, runtimeName, status }',
  },
  MessageProcessor: {
    queryName: 'messageProcessorsByEnvironmentAndComponent',
    field: 'messageProcessorsByEnvironmentAndComponent',
    fields: 'name, type, state',
    gqlFields: 'name, type, state, stateInSync, compositeApp, runtimes { runtimeId, runtimeName, status }',
  },
  Template: {
    queryName: 'templatesByEnvironmentAndComponent',
    field: 'templatesByEnvironmentAndComponent',
    fields: 'name, type',
    gqlFields: 'name, type, tracing, statistics, compositeApp, runtimes { runtimeId, runtimeName, status }',
  },
  DataService: {
    queryName: 'dataServicesByEnvironmentAndComponent',
    field: 'dataServicesByEnvironmentAndComponent',
    fields: 'name, state',
    gqlFields: 'name, description, state, stateInSync, errorMessage, compositeApp, runtimes { runtimeId, runtimeName, status }',
  },
  DataSource: {
    queryName: 'dataSourcesByEnvironmentAndComponent',
    field: 'dataSourcesByEnvironmentAndComponent',
    fields: 'name, type, state',
    gqlFields: 'name, type, driver, url, username, state, runtimes { runtimeId, runtimeName, status }',
  },
};

const IN_SYNC_KEYS = ['stateInSync', 'tracingInSync', 'statisticsInSync'] as const;

export function useArtifacts(artifactType: string, envId: string, componentId: string, options?: { enabled?: boolean; active?: boolean }) {
  const mapping = ARTIFACT_QUERY_MAP[artifactType];
  const supportedInSyncKeys = mapping ? IN_SYNC_KEYS.filter((k) => mapping.gqlFields.includes(k)) : [];
  const isActive = options?.active ?? true;
  return useQuery({
    queryKey: ['artifacts', artifactType, envId, componentId],
    queryFn: async () => {
      if (!mapping) return [];
      const data = await gql<Record<string, { items: GqlArtifact[] }>>(
        `query ArtifactQuery($environmentId: String!, $componentId: String!) { ${mapping.field}(environmentId: $environmentId, componentId: $componentId) { items { ${mapping.gqlFields} } pageInfo { total, limit, offset } } }`,
        {
          environmentId: envId,
          componentId,
        },
      );
      return data[mapping.field]?.items ?? [];
    },
    enabled: !!artifactType && !!envId && !!componentId && !!mapping && (options?.enabled ?? true),
    refetchInterval: (query) => {
      if (!isActive) return false;
      const artifacts = query.state.data;
      if (!artifacts) return false;
      const syncing = artifacts.some((a) => supportedInSyncKeys.some((k) => a[k] !== true));
      return syncing ? 1000 : false;
    },
  });
}

// Paginated variant — used by the Supporting Artifacts panel. Passes limit/offset to the
// backend so the GQL call carries real pagination params (not just client-side slicing).
export function useArtifactPage(artifactType: string, envId: string, componentId: string, limit: number, offset: number, options?: { enabled?: boolean }) {
  const mapping = ARTIFACT_QUERY_MAP[artifactType];
  return useQuery({
    queryKey: ['artifacts-page', artifactType, envId, componentId, limit, offset],
    queryFn: async () => {
      if (!mapping) return { items: [] as GqlArtifact[], total: 0 };
      const data = await gql<Record<string, { items: GqlArtifact[]; pageInfo: GqlPageInfo }>>(
        `query ArtifactQuery($environmentId: String!, $componentId: String!, $limit: Int!, $offset: Int!) {
          ${mapping.field}(environmentId: $environmentId, componentId: $componentId, pagination: { limit: $limit, offset: $offset }) {
            items { ${mapping.gqlFields} }
            pageInfo { total, limit, offset }
          }
        }`,
        { environmentId: envId, componentId, limit, offset },
      );
      const page = data[mapping.field];
      return { items: page?.items ?? [], total: page?.pageInfo?.total ?? 0 };
    },
    enabled: !!artifactType && !!envId && !!componentId && !!mapping && (options?.enabled ?? true),
    placeholderData: (prev) => prev,
  });
}

export { ARTIFACT_QUERY_MAP };

// ── Artifact detail panel queries ──

const ARTIFACT_SOURCE_QUERY = `
  query GetArtifactSource($environmentId: String!, $componentId: String!, $artifactType: String!, $artifactName: String!, $packageName: String, $templateType: String) {
    artifactSourceByComponent(environmentId: $environmentId, componentId: $componentId, artifactType: $artifactType, artifactName: $artifactName, packageName: $packageName, templateType: $templateType)
  }`;

export function useArtifactSource(envId: string, componentId: string, artifactType: string, artifactName: string, packageName?: string, templateType?: string) {
  return useQuery({
    queryKey: ['artifactSource', envId, componentId, artifactType, artifactName, packageName, templateType],
    queryFn: () =>
      gql<{ artifactSourceByComponent: string }>(ARTIFACT_SOURCE_QUERY, {
        environmentId: envId,
        componentId,
        artifactType,
        artifactName,
        packageName,
        templateType,
      }).then((d) => d.artifactSourceByComponent),
    enabled: !!envId && !!componentId && !!artifactType && !!artifactName,
  });
}

const LOCAL_ENTRY_VALUE_QUERY = `
  query LocalEntryValue($componentId: String!, $entryName: String!, $environmentId: String) {
    localEntryValueByComponent(componentId: $componentId, entryName: $entryName, environmentId: $environmentId)
  }`;

export function useLocalEntryValue(componentId: string, entryName: string, envId: string) {
  return useQuery({
    queryKey: ['localEntryValue', componentId, entryName, envId],
    queryFn: () =>
      gql<{ localEntryValueByComponent: string }>(LOCAL_ENTRY_VALUE_QUERY, {
        componentId,
        entryName,
        environmentId: envId,
      }).then((d) => d.localEntryValueByComponent),
    enabled: !!componentId && !!entryName && !!envId,
  });
}

const DATA_SOURCE_OVERVIEW_QUERY = `
  query GetDataSourceOverview($componentId: String!, $dataSourceName: String!, $environmentId: String) {
    dataSourceOverviewByComponent(
      componentId: $componentId
      dataSourceName: $dataSourceName
      environmentId: $environmentId
    ) {
      name
      value
    }
  }`;

export function useDataSourceOverview(componentId: string, dataSourceName: string, envId: string) {
  return useQuery({
    queryKey: ['dataSourceOverview', componentId, dataSourceName, envId],
    queryFn: () =>
      gql<{ dataSourceOverviewByComponent: GqlArtifactParam[] }>(DATA_SOURCE_OVERVIEW_QUERY, {
        componentId,
        dataSourceName,
        environmentId: envId,
      }).then((d) => d.dataSourceOverviewByComponent),
    enabled: !!componentId && !!dataSourceName && !!envId,
  });
}

export interface GqlDataServiceOverview {
  serviceName: string;
  serviceDescription?: string;
  wsdl1_1?: string;
  wsdl2_0?: string;
  swagger_url?: string;
  dataSources: Array<{ dataSourceId: string; dataSourceType?: string }>;
  queries: Array<{ id: string; dataSourceId?: string }>;
  resources: Array<{ resourcePath: string; resourceMethod?: string }>;
  operations: Array<{ operationName: string; queryName?: string }>;
}

const DATA_SERVICE_OVERVIEW_QUERY = `
  query GetDataServiceOverview($componentId: String!, $dataServiceName: String!, $environmentId: String) {
    dataServiceOverviewByComponent(
      componentId: $componentId
      dataServiceName: $dataServiceName
      environmentId: $environmentId
    ) {
      serviceName
      serviceDescription
      wsdl1_1
      wsdl2_0
      swagger_url
      dataSources {
        dataSourceId
        dataSourceType
      }
      queries {
        id
        dataSourceId
      }
      resources {
        resourcePath
        resourceMethod
      }
      operations {
        operationName
        queryName
      }
    }
  }`;

export function useDataServiceOverview(componentId: string, dataServiceName: string, envId: string) {
  return useQuery({
    queryKey: ['dataServiceOverview', componentId, dataServiceName, envId],
    queryFn: () =>
      gql<{ dataServiceOverviewByComponent: GqlDataServiceOverview }>(DATA_SERVICE_OVERVIEW_QUERY, {
        componentId,
        dataServiceName,
        environmentId: envId,
      }).then((d) => d.dataServiceOverviewByComponent),
    enabled: !!componentId && !!dataServiceName && !!envId,
  });
}

const MESSAGE_PROCESSOR_OVERVIEW_QUERY = `
  query GetMessageProcessorOverview($componentId: String!, $processorName: String!, $environmentId: String) {
    messageProcessorOverviewByComponent(
      componentId: $componentId
      processorName: $processorName
      environmentId: $environmentId
    ) {
      name
      value
    }
  }`;

export function useMessageProcessorOverview(componentId: string, processorName: string, envId: string) {
  return useQuery({
    queryKey: ['messageProcessorOverview', componentId, processorName, envId],
    queryFn: () =>
      gql<{ messageProcessorOverviewByComponent: GqlArtifactParam[] }>(MESSAGE_PROCESSOR_OVERVIEW_QUERY, {
        componentId,
        processorName,
        environmentId: envId,
      }).then((d) => d.messageProcessorOverviewByComponent),
    enabled: !!componentId && !!processorName && !!envId,
  });
}

// Maps display artifactType to the backend "type" param used in artifactSourceByComponent
export const ARTIFACT_TYPE_TO_SOURCE_TYPE: Record<string, string> = {
  RestApi: 'api',
  ProxyService: 'proxy-service',
  Endpoint: 'endpoint',
  InboundEndpoint: 'inbound-endpoint',
  Sequence: 'sequence',
  Task: 'task',
  LocalEntry: 'local-entry',
  CompositeApp: 'composite-app',
  Connector: 'connector',
  RegistryResource: 'registry-resource',
  Listener: 'listener',
  Service: 'service',
  Automation: 'automation',
  MessageStore: 'message-store',
  MessageProcessor: 'message-processor',
  Template: 'template',
  DataService: 'data-service',
  DataSource: 'data-source',
};

export interface GqlArtifactParam {
  name: string;
  value: string;
}

const ARTIFACT_PARAMS_QUERY = `
  query ArtifactParams($componentId: String!, $artifactType: String!, $artifactName: String!, $environmentId: String, $runtimeId: String, $packageName: String) {
    artifactParametersByComponent(
      componentId: $componentId,
      artifactType: $artifactType,
      artifactName: $artifactName,
      environmentId: $environmentId,
      runtimeId: $runtimeId,
      packageName: $packageName
    ) {
      name
      value
    }
  }`;

export function useArtifactParams(componentId: string, artifactType: string, artifactName: string, envId: string, runtimeId?: string, packageName?: string) {
  return useQuery({
    queryKey: ['artifactParams', componentId, artifactType, artifactName, envId, runtimeId, packageName],
    queryFn: () =>
      gql<{ artifactParametersByComponent: GqlArtifactParam[] }>(ARTIFACT_PARAMS_QUERY, {
        componentId,
        artifactType,
        artifactName,
        environmentId: envId,
        runtimeId,
        packageName,
      }).then((d) => d.artifactParametersByComponent),
    enabled: !!componentId && !!artifactType && !!artifactName && !!envId,
  });
}

const ARTIFACT_WSDL_QUERY = `
  query ArtifactWsdl($componentId: String!, $artifactType: String!, $artifactName: String!, $environmentId: String, $runtimeId: String, $packageName: String) {
    artifactWsdlByComponent(
      componentId: $componentId,
      artifactType: $artifactType,
      artifactName: $artifactName,
      environmentId: $environmentId,
      runtimeId: $runtimeId,
      packageName: $packageName
    )
  }`;

export function useArtifactWsdl(componentId: string, artifactType: string, artifactName: string, envId: string, runtimeId?: string, packageName?: string) {
  return useQuery({
    queryKey: ['artifactWsdl', componentId, artifactType, artifactName, envId, runtimeId, packageName],
    queryFn: () =>
      gql<{ artifactWsdlByComponent: string }>(ARTIFACT_WSDL_QUERY, {
        componentId,
        artifactType,
        artifactName,
        environmentId: envId,
        runtimeId,
        packageName,
      }).then((d) => d.artifactWsdlByComponent),
    enabled: !!componentId && !!artifactType && !!artifactName && !!envId,
  });
}

// ── Refresh environment artifacts ──

export function useRefreshEnvironmentArtifacts() {
  const qc = useQueryClient();

  return (envId: string, componentId: string) => {
    return Promise.all([
      qc.invalidateQueries({
        queryKey: ['artifacts'],
        predicate: (query) => {
          const [, , envIdKey, compIdKey] = query.queryKey;
          return envIdKey === envId && compIdKey === componentId;
        },
      }),
      qc.invalidateQueries({
        queryKey: ['artifactTypes', componentId, envId],
      }),
    ]);
  };
}

// ── Log Files ──

export interface GqlLogFile {
  fileName: string;
  size: string;
}

export interface GqlLogFilesByRuntime {
  count: number;
  files: GqlLogFile[];
  pageInfo: GqlPageInfo;
}

const LOG_FILES_BY_RUNTIME_QUERY = `
  query LogFilesByRuntime($runtimeId: String!, $searchKey: String, $limit: Int, $offset: Int) {
    logFilesByRuntime(runtimeId: $runtimeId, searchKey: $searchKey, pagination: { limit: $limit, offset: $offset }) {
      count
      files {
        fileName
        size
      }
      pageInfo { total, limit, offset }
    }
  }`;

export function useLogFilesByRuntime(runtimeId: string, searchKey?: string, limit?: number, offset?: number) {
  return useQuery({
    queryKey: ['logFiles', runtimeId, searchKey, limit, offset],
    queryFn: () =>
      gql<{ logFilesByRuntime: GqlLogFilesByRuntime }>(LOG_FILES_BY_RUNTIME_QUERY, {
        runtimeId,
        searchKey: searchKey || null,
        limit: limit ?? null,
        offset: offset ?? null,
      }).then((d) => d.logFilesByRuntime),
    enabled: !!runtimeId,
    placeholderData: (prev) => prev,
  });
}

const LOG_FILE_CONTENT_QUERY = `
  query LogFileContent($runtimeId: String!, $fileName: String!) {
    logFileContent(runtimeId: $runtimeId, fileName: $fileName)
  }`;

export function useLogFileContent(runtimeId: string, fileName: string, enabled = false) {
  return useQuery({
    queryKey: ['logFileContent', runtimeId, fileName],
    queryFn: () =>
      gql<{ logFileContent: string }>(LOG_FILE_CONTENT_QUERY, {
        runtimeId,
        fileName,
      }).then((d) => d.logFileContent),
    enabled: enabled && !!runtimeId && !!fileName,
  });
}

// ── OpenAPI Definitions ──
// Packed by the swagger-pack compiler plugin (icp-runtime-bridge) and reported via the full
// heartbeat; only BI runtimes with remoteManagement=true and at least one HTTP service have any.

export interface GqlOpenApiDefinition {
  fileName: string;
  // Raw OpenAPI document as a JSON string (no JSON scalar in this schema) - parse client-side.
  definition: string;
}

const OPENAPI_DEFINITIONS_BY_RUNTIME_QUERY = `
  query OpenApiDefinitionsByRuntime($runtimeId: String!) {
    openApiDefinitionsByRuntime(runtimeId: $runtimeId) {
      fileName
      definition
    }
  }`;

export function useOpenApiDefinitionsByRuntime(runtimeId: string, enabled = true) {
  return useQuery({
    queryKey: ['openApiDefinitions', runtimeId],
    queryFn: () => gql<{ openApiDefinitionsByRuntime: GqlOpenApiDefinition[] }>(OPENAPI_DEFINITIONS_BY_RUNTIME_QUERY, { runtimeId }).then((d) => d.openApiDefinitionsByRuntime),
    enabled: enabled && !!runtimeId,
  });
}

// ============================================
// Registry Browser Queries
// ============================================

export interface GqlRegistryProperty {
  name: string;
  value: string;
}

export interface GqlRegistryDirectoryItem {
  name: string;
  mediaType: string;
  isDirectory: boolean;
  properties: GqlRegistryProperty[];
}

export interface GqlRegistryDirectoryResponse {
  count: number;
  items: GqlRegistryDirectoryItem[];
}

export interface GqlRegistryResourceMetadata {
  name: string;
  mediaType: string;
}

export interface GqlRegistryPropertiesResponse {
  count: number;
  properties: GqlRegistryProperty[];
}

const REGISTRY_DIRECTORY_QUERY = `
  query RegistryDirectory($runtimeId: String!, $path: String!, $expand: Boolean) {
    registryDirectory(runtimeId: $runtimeId, path: $path, expand: $expand) {
      count
      items {
        name
        mediaType
        isDirectory
        properties {
          name
          value
        }
      }
    }
  }`;

const REGISTRY_FILE_CONTENT_QUERY = `
  query RegistryFileContent($runtimeId: String!, $path: String!) {
    registryFileContent(runtimeId: $runtimeId, path: $path)
  }`;

const REGISTRY_RESOURCE_METADATA_QUERY = `
  query RegistryResourceMetadata($runtimeId: String!, $path: String!) {
    registryResourceMetadata(runtimeId: $runtimeId, path: $path) {
      name
      mediaType
    }
  }`;

const REGISTRY_RESOURCE_PROPERTIES_QUERY = `
  query RegistryResourceProperties($runtimeId: String!, $path: String!) {
    registryResourceProperties(runtimeId: $runtimeId, path: $path) {
      count
      properties {
        name
        value
      }
    }
  }`;

export function useRegistryDirectory(runtimeId: string, path: string, expand = false) {
  return useQuery({
    queryKey: ['registryDirectory', runtimeId, path, expand],
    queryFn: () =>
      gql<{ registryDirectory: GqlRegistryDirectoryResponse }>(REGISTRY_DIRECTORY_QUERY, {
        runtimeId,
        path,
        expand,
      }).then((d) => d.registryDirectory),
    enabled: !!runtimeId && !!path,
  });
}

export function useRegistryFileContent(runtimeId: string, path: string, enabled = false) {
  return useQuery({
    queryKey: ['registryFileContent', runtimeId, path],
    queryFn: () =>
      gql<{ registryFileContent: string }>(REGISTRY_FILE_CONTENT_QUERY, {
        runtimeId,
        path,
      }).then((d) => d.registryFileContent),
    enabled: enabled && !!runtimeId && !!path,
  });
}

export function useRegistryResourceMetadata(runtimeId: string, path: string, enabled = false) {
  return useQuery({
    queryKey: ['registryResourceMetadata', runtimeId, path],
    queryFn: () =>
      gql<{ registryResourceMetadata: GqlRegistryResourceMetadata }>(REGISTRY_RESOURCE_METADATA_QUERY, {
        runtimeId,
        path,
      }).then((d) => d.registryResourceMetadata),
    enabled: enabled && !!runtimeId && !!path,
  });
}

export function useRegistryResourceProperties(runtimeId: string, path: string, enabled = false) {
  return useQuery({
    queryKey: ['registryResourceProperties', runtimeId, path],
    queryFn: () =>
      gql<{ registryResourceProperties: GqlRegistryPropertiesResponse }>(REGISTRY_RESOURCE_PROPERTIES_QUERY, {
        runtimeId,
        path,
      }).then((d) => d.registryResourceProperties),
    enabled: enabled && !!runtimeId && !!path,
  });
}
