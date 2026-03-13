import { useQuery, useQueryClient } from '@tanstack/react-query';
import { gql } from './graphql';

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
    id, orgId, name, handler, description, version,
    createdDate, updatedAt, region, type
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
      projectId, id, name, handler, displayName, displayType,
      description, status, componentType, componentSubType,
      version, createdAt, lastBuildDate
    }
  }`;

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => gql<{ projects: GqlProject[] }>(PROJECTS_QUERY).then((d) => d.projects),
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

export function useComponents(orgHandler: string, projectId: string) {
  return useQuery({
    queryKey: ['components', orgHandler, projectId],
    queryFn: () => gql<{ components: GqlComponent[] }>(COMPONENTS_QUERY, { orgHandler, projectId }).then((d) => d.components),
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
  critical: boolean;
  description?: string;
  createdAt?: string;
}

const ENVIRONMENTS_QUERY = `
  query GetEnvironments($projectId: String!) {
    environments(orgUuid: "default-org-uuid", type: "external", projectId: $projectId) {
      id, name, critical
    }
  }`;

export function useEnvironments(projectId: string) {
  return useQuery({
    queryKey: ['environments', projectId],
    queryFn: () => gql<{ environments: GqlEnvironment[] }>(ENVIRONMENTS_QUERY, { projectId }).then((d) => d.environments),
    enabled: !!projectId,
  });
}

const ALL_ENVIRONMENTS_QUERY = `{
  environments { id, name, description, critical, createdAt }
}`;

export function useAllEnvironments() {
  return useQuery({
    queryKey: ['environments'],
    queryFn: () => gql<{ environments: GqlEnvironment[] }>(ALL_ENVIRONMENTS_QUERY).then((d) => d.environments),
  });
}

export interface GqlLogger {
  loggerName: string;
  componentName: string;
  logLevel: string;
  runtimeIds: string[];
}

const LOGGERS_BY_ENV_AND_COMPONENT_QUERY = `
  query GetLoggers($environmentId: String!, $componentId: String!) {
    loggersByEnvironmentAndComponent(environmentId: $environmentId, componentId: $componentId) {
      loggerName, componentName, logLevel, runtimeIds
    }
  }`;

export function useLoggers(environmentId: string, componentId: string) {
  return useQuery({
    queryKey: ['loggers', environmentId, componentId],
    queryFn: () => gql<{ loggersByEnvironmentAndComponent: GqlLogger[] }>(LOGGERS_BY_ENV_AND_COMPONENT_QUERY, { environmentId, componentId }).then((d) => d.loggersByEnvironmentAndComponent),
    enabled: !!environmentId && !!componentId,
  });
}

export interface GqlRuntime {
  runtimeId: string;
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
  component?: { displayName: string };
}

const RUNTIMES_QUERY = `
  query GetRuntimes($environmentId: String!, $projectId: String!, $componentId: String!) {
    runtimes(environmentId: $environmentId, projectId: $projectId, componentId: $componentId) {
      runtimeId, runtimeType, status, version,
      platformName, platformVersion, platformHome,
      osName, osVersion, registrationTime, lastHeartbeat
    }
  }`;

export function useRuntimes(envId: string, projectId: string, componentId: string) {
  return useQuery({
    queryKey: ['runtimes', envId, projectId, componentId],
    queryFn: () => gql<{ runtimes: GqlRuntime[] }>(RUNTIMES_QUERY, { environmentId: envId, projectId, componentId }).then((d) => d.runtimes),
    enabled: !!envId && !!projectId && !!componentId,
  });
}

const COMPONENT_RUNTIMES_QUERY = `
  query GetComponentRuntimes($environmentId: String!, $projectId: String!, $componentId: String!) {
    runtimes(environmentId: $environmentId, projectId: $projectId, componentId: $componentId) {
      runtimeId, runtimeType, status, version,
      platformName, platformVersion, platformHome,
      osName, osVersion, registrationTime, lastHeartbeat
    }
  }`;

export function useComponentRuntimes(envId: string, projectId: string, componentId: string, enabled = true) {
  return useQuery({
    queryKey: ['componentRuntimes', envId, projectId, componentId],
    queryFn: () => gql<{ runtimes: GqlRuntime[] }>(COMPONENT_RUNTIMES_QUERY, { environmentId: envId, projectId, componentId }).then((d) => d.runtimes),
    enabled: enabled && !!envId && !!projectId && !!componentId,
  });
}

const PROJECT_RUNTIMES_QUERY = `
  query GetProjectRuntimes($environmentId: String!, $projectId: String!) {
    runtimes(environmentId: $environmentId, projectId: $projectId) {
      runtimeId, runtimeType, status, version,
      platformName, platformVersion, platformHome,
      osName, osVersion, registrationTime, lastHeartbeat,
      component { displayName }
    }
  }`;

export function useProjectRuntimes(envId: string, projectId: string) {
  return useQuery({
    queryKey: ['projectRuntimes', envId, projectId],
    queryFn: () => gql<{ runtimes: GqlRuntime[] }>(PROJECT_RUNTIMES_QUERY, { environmentId: envId, projectId }).then((d) => d.runtimes),
    enabled: !!envId && !!projectId,
  });
}

const ORG_RUNTIMES_QUERY = `
  query GetOrgRuntimes($environmentId: String!) {
    runtimes(environmentId: $environmentId) {
      runtimeId, runtimeType, status, version,
      platformName, platformVersion, platformHome,
      osName, osVersion, registrationTime, lastHeartbeat,
      component { displayName }
    }
  }`;

export { RUNTIMES_QUERY, PROJECT_RUNTIMES_QUERY, ORG_RUNTIMES_QUERY };

// ── Component-level Bound Secrets ──

export interface GqlBoundSecretRuntime {
  runtimeId: string;
  status: string;
}

export interface GqlBoundSecret {
  keyId: string;
  createdAt: string;
  runtimes: GqlBoundSecretRuntime[];
}

export const COMPONENT_SECRETS_QUERY = `
  query GetComponentSecrets($componentId: String!, $environmentId: String!) {
    componentSecrets(componentId: $componentId, environmentId: $environmentId) {
      keyId, createdAt, runtimes { runtimeId, status }
    }
  }`;

export function useComponentSecrets(componentId: string, environmentId: string) {
  return useQuery({
    queryKey: ['componentSecrets', componentId, environmentId],
    queryFn: () => gql<{ componentSecrets: GqlBoundSecret[] }>(COMPONENT_SECRETS_QUERY, { componentId, environmentId }).then((d) => d.componentSecrets),
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
      keyId, environmentId, environmentName, bound, createdAt, createdBy
    }
  }`;

export function useOrgSecrets(environmentId?: string) {
  return useQuery({
    queryKey: ['orgSecrets', environmentId],
    queryFn: () => gql<{ orgSecrets: GqlOrgSecret[] }>(ORG_SECRETS_QUERY, environmentId ? { environmentId } : {}).then((d) => d.orgSecrets),
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
    gqlFields: 'name, context, version, state, stateInSync, tracing, tracingInSync, statistics, statisticsInSync, carbonApp, url, runtimes { runtimeId, status }, resources { path, methods }',
  },
  ProxyService: { queryName: 'proxyServicesByEnvironmentAndComponent', field: 'proxyServicesByEnvironmentAndComponent', fields: 'name, state', gqlFields: 'name, state, stateInSync, tracing, tracingInSync, statistics, statisticsInSync, carbonApp, endpoints, runtimes { runtimeId, status }' },
  Endpoint: { queryName: 'endpointsByEnvironmentAndComponent', field: 'endpointsByEnvironmentAndComponent', fields: 'name, type, state', gqlFields: 'name, type, state, stateInSync, tracing, tracingInSync, statistics, statisticsInSync, attributes { name, value }, runtimes { runtimeId, status }' },
  InboundEndpoint: {
    queryName: 'inboundEndpointsByEnvironmentAndComponent',
    field: 'inboundEndpointsByEnvironmentAndComponent',
    fields: 'name, protocol',
    gqlFields: 'name, protocol, sequence, onError, state, stateInSync, tracing, tracingInSync, statistics, statisticsInSync, carbonApp, runtimes { runtimeId, status }',
  },
  Sequence: { queryName: 'sequencesByEnvironmentAndComponent', field: 'sequencesByEnvironmentAndComponent', fields: 'name, type, container, state', gqlFields: 'name, type, container, state, stateInSync, tracing, tracingInSync, statistics, statisticsInSync, runtimes { runtimeId, status }' },
  Task: { queryName: 'tasksByEnvironmentAndComponent', field: 'tasksByEnvironmentAndComponent', fields: 'name, group, state', gqlFields: 'name, class, group, state, stateInSync, carbonApp, runtimes { runtimeId, status }' },
  LocalEntry: { queryName: 'localEntriesByEnvironmentAndComponent', field: 'localEntriesByEnvironmentAndComponent', fields: 'name, type', gqlFields: 'name, type, value, state, stateInSync, runtimes { runtimeId, status }' },
  CarbonApp: { queryName: 'carbonAppsByEnvironmentAndComponent', field: 'carbonAppsByEnvironmentAndComponent', fields: 'name, version', gqlFields: 'name, version, state, artifacts { name, type }, runtimes { runtimeId, status }' },
  Connector: { queryName: 'connectorsByEnvironmentAndComponent', field: 'connectorsByEnvironmentAndComponent', fields: 'name, package, description, state', gqlFields: 'name, package, version, description, state, stateInSync, runtimes { runtimeId, status }' },
  RegistryResource: { queryName: 'registryResourcesByEnvironmentAndComponent', field: 'registryResourcesByEnvironmentAndComponent', fields: 'name, type', gqlFields: 'name, type, runtimes { runtimeId, status }' },
  Listener: { queryName: 'listenersByEnvironmentAndComponent', field: 'listenersByEnvironmentAndComponent', fields: 'name, package, protocol, host, port, state', gqlFields: 'name, package, protocol, host, port, state, stateInSync, runtimes { runtimeId, status }' },
  Service: {
    queryName: 'servicesByEnvironmentAndComponent',
    field: 'servicesByEnvironmentAndComponent',
    fields: 'name, package, basePath, type',
    gqlFields: 'name, package, basePath, type, state, stateInSync, runtimes { runtimeId, status }, resources { path, method, url, methods }',
  },
  Automation: {
    queryName: 'automationsByEnvironmentAndComponent',
    field: 'automationsByEnvironmentAndComponent',
    fields: 'packageOrg, packageName, packageVersion',
    gqlFields: 'packageOrg, packageName, packageVersion, runtimeIds, runtimes { runtimeId, status, executionTimestamps }, executionTimestamp',
  },
  MessageStore: {
    queryName: 'messageStoresByEnvironmentAndComponent',
    field: 'messageStoresByEnvironmentAndComponent',
    fields: 'name, type, size',
    gqlFields: 'name, type, size, state, stateInSync, carbonApp, runtimes { runtimeId, status }',
  },
  MessageProcessor: {
    queryName: 'messageProcessorsByEnvironmentAndComponent',
    field: 'messageProcessorsByEnvironmentAndComponent',
    fields: 'name, type, state',
    gqlFields: 'name, type, state, stateInSync, tracing, carbonApp, runtimes { runtimeId, status }',
  },
  Template: {
    queryName: 'templatesByEnvironmentAndComponent',
    field: 'templatesByEnvironmentAndComponent',
    fields: 'name, type',
    gqlFields: 'name, type, tracing, statistics, carbonApp, runtimes { runtimeId, status }',
  },
  DataService: {
    queryName: 'dataServicesByEnvironmentAndComponent',
    field: 'dataServicesByEnvironmentAndComponent',
    fields: 'name, state',
    gqlFields: 'name, description, state, stateInSync, carbonApp, runtimes { runtimeId, status }',
  },
  DataSource: {
    queryName: 'dataSourcesByEnvironmentAndComponent',
    field: 'dataSourcesByEnvironmentAndComponent',
    fields: 'name, type, state',
    gqlFields: 'name, type, driver, url, username, state, runtimes { runtimeId, status }',
  },
};

const IN_SYNC_KEYS = ['stateInSync', 'tracingInSync', 'statisticsInSync'] as const;

export function useArtifacts(artifactType: string, envId: string, componentId: string, options?: { enabled?: boolean }) {
  const mapping = ARTIFACT_QUERY_MAP[artifactType];
  return useQuery({
    queryKey: ['artifacts', artifactType, envId, componentId],
    queryFn: async () => {
      if (!mapping) return [];
      const data = await gql<Record<string, GqlArtifact[]>>(`query ArtifactQuery($environmentId: String!, $componentId: String!) { ${mapping.field}(environmentId: $environmentId, componentId: $componentId) { ${mapping.gqlFields} } }`, {
        environmentId: envId,
        componentId,
      });
      return data[mapping.field] ?? [];
    },
    enabled: !!artifactType && !!envId && !!componentId && !!mapping && (options?.enabled ?? true),
    refetchInterval: (query) => {
      const artifacts = query.state.data;
      if (!artifacts) return false;
      const syncing = artifacts.some((a) =>
        IN_SYNC_KEYS.some((k) => a[k] === false),
      );
      return syncing ? 1000 : false;
    },
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
  CarbonApp: 'carbon-app',
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
}

const LOG_FILES_BY_RUNTIME_QUERY = `
  query LogFilesByRuntime($runtimeId: String!, $searchKey: String) {
    logFilesByRuntime(runtimeId: $runtimeId, searchKey: $searchKey) {
      count
      files {
        fileName
        size
      }
    }
  }`;

export function useLogFilesByRuntime(runtimeId: string, searchKey?: string) {
  return useQuery({
    queryKey: ['logFiles', runtimeId, searchKey],
    queryFn: () =>
      gql<{ logFilesByRuntime: GqlLogFilesByRuntime }>(LOG_FILES_BY_RUNTIME_QUERY, {
        runtimeId,
        searchKey: searchKey || null,
      }).then((d) => d.logFilesByRuntime),
    enabled: !!runtimeId,
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
