import { useMutation, useQueryClient } from '@tanstack/react-query';
import { gql } from './graphql';
import { FETCHABLE, settle, type Fetchable } from './fetchable';
import type { GqlArtifact, GqlComponent, GqlEnvironment, GqlProject } from './queries';
import { toBackendArtifactType, toggleStateValue, type ArtifactState } from './artifactToggleMutations';

export interface CreateProjectInput {
  name: string;
  handler: string;
  description: string;
  orgHandler: string;
}

const CREATE_PROJECT = `
  mutation CreateProject($name: String!, $description: String!, $projectHandler: String!, $orgHandler: String!) {
    createProject(project: {
      name: $name,
      description: $description,
      projectHandler: $projectHandler,
      orgId: 1,
      orgHandler: $orgHandler,
      version: "1.0.0"
    }) {
      id, orgId, name, version, createdDate, handler, region,
      description, defaultDeploymentPipelineId, deploymentPipelineIds,
      type, updatedAt
    }
  }`;

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) =>
      gql<{ createProject: GqlProject }>(CREATE_PROJECT, {
        name: input.name,
        description: input.description,
        projectHandler: input.handler,
        orgHandler: input.orgHandler,
      }).then((d) => d.createProject),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export interface UpdateProjectInput {
  id: string;
  orgId?: number;
  name?: string;
  version?: string;
  description?: string;
}

const UPDATE_PROJECT = `
  mutation UpdateProject($project: ProjectUpdateInput!) {
    updateProject(project: $project) {
      id, orgId, name, version, createdDate, handler, extendedHandler, region,
      description, owner, labels, defaultDeploymentPipelineId, deploymentPipelineIds,
      type, gitProvider, gitOrganization, repository, branch, secretRef,
      ownerId, createdBy, updatedAt, updatedBy
    }
  }`;

const DELETE_PROJECT = `
  mutation DeleteProject($orgId: Int!, $projectId: String!) {
    deleteProject(orgId: $orgId, projectId: $projectId) {
      status, details
    }
  }`;

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProjectInput) => gql<{ updateProject: GqlProject }>(UPDATE_PROJECT, { project: input }).then((d) => d.updateProject),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['project'] });
    },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orgId, projectId }: { orgId: number; projectId: string }) => gql<{ deleteProject: { status: string; details: string } }>(DELETE_PROJECT, { orgId, projectId }).then((d) => d.deleteProject),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

// ── Environment CRUD ──

export interface EnvironmentInput {
  name: string;
  environmentHandler: string;
  description: string;
  critical: boolean;
}

const CREATE_ENVIRONMENT = `
  mutation CreateEnvironment($name: String!, $environmentHandler: String!, $description: String!, $critical: Boolean!) {
    createEnvironment(environment: { name: $name, environmentHandler: $environmentHandler, description: $description, critical: $critical }) {
      id, name, handler, description, critical, createdAt
    }
  }`;

const UPDATE_ENVIRONMENT = `
  mutation UpdateEnvironment($environmentId: String!, $name: String!, $handler: String, $description: String!, $critical: Boolean!) {
    updateEnvironment(environmentId: $environmentId, name: $name, handler: $handler, description: $description, critical: $critical) {
      id, name, handler, description, critical, createdAt
    }
  }`;

const DELETE_ENVIRONMENT = `
  mutation DeleteEnvironment($environmentId: String!) {
    deleteEnvironment(environmentId: $environmentId)
  }`;

export function useCreateEnvironment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EnvironmentInput) => gql<{ createEnvironment: GqlEnvironment }>(CREATE_ENVIRONMENT, { ...input }).then((d) => d.createEnvironment),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['environments'] }),
  });
}

export function useUpdateEnvironment() {
  const qc = useQueryClient();
  return useMutation({
    // Typed against what UPDATE_ENVIRONMENT actually sends ($handler), not against
    // EnvironmentInput, whose field is environmentHandler — the create and update mutations
    // simply name this variable differently. Borrowing the create type here made every
    // caller pass a `handler` the type did not admit, so the frontend did not typecheck and
    // `pnpm build` (tsc -b && vite build) could not produce a bundle.
    mutationFn: (input: { environmentId: string; name: string; handler?: string; description: string; critical: boolean }) => gql<{ updateEnvironment: GqlEnvironment }>(UPDATE_ENVIRONMENT, { ...input }).then((d) => d.updateEnvironment),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['environments'] }),
  });
}

export function useDeleteEnvironment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (environmentId: string) => gql<{ deleteEnvironment: string }>(DELETE_ENVIRONMENT, { environmentId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['environments'] }),
  });
}

interface DeleteRuntimeResult {
  deleted: boolean;
  orphanedKeyId: string | null;
  secretRevoked: boolean;
}

const DELETE_RUNTIME = `
  mutation DeleteRuntime($runtimeId: String!, $revokeSecret: Boolean) {
    deleteRuntime(runtimeId: $runtimeId, revokeSecret: $revokeSecret) {
      deleted, orphanedKeyId, secretRevoked
    }
  }`;

export function useDeleteRuntime() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ runtimeId, revokeSecret }: { runtimeId: string; revokeSecret?: boolean }) => gql<{ deleteRuntime: DeleteRuntimeResult }>(DELETE_RUNTIME, { runtimeId, revokeSecret }).then((d) => d.deleteRuntime),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['runtimes'] });
      qc.invalidateQueries({ queryKey: ['componentSecrets'] });
      qc.invalidateQueries({ queryKey: ['orgSecrets'] });
    },
  });
}

// ── Artifact status toggle ──

const UPDATE_ARTIFACT_STATUS = `
  mutation UpdateArtifactStatus($input: ArtifactStatusChangeInput!) {
    updateArtifactStatus(input: $input) {
      status, message, successCount, failedCount, details
    }
  }`;

const UPDATE_LISTENER_STATE = `
  mutation UpdateListenerState($input: ListenerControlInput!) {
    updateListenerState(input: $input) {
      success, message, commandIds
    }
  }`;

export interface ArtifactStatusInput {
  envId: string;
  componentId: string;
  artifactType: string;
  artifactName: string;
  status: ArtifactState;
}

export interface ListenerStateInput {
  runtimeIds: string[];
  listenerName: string;
  listenerPackage?: string;
  port?: number;
  action: 'START' | 'STOP';
}

// ── Component CRUD ──

export interface CreateComponentInput {
  displayName: string;
  name: string;
  description: string;
  orgHandler: string;
  projectId: string;
  componentType: 'MI' | 'BI';
  /** Integration type encoded as devant does — see `resolveDisplayType`. */
  displayType: string;
  /** Set only for types sharing a generic service displayType — see `resolveComponentSubType`. */
  componentSubType?: string;
}

const CREATE_COMPONENT = `
  mutation CreateComponent($component: ComponentInput!) {
    createComponent(component: $component) {
      id, name, displayName, handler, orgId, projectId, createdAt, updatedAt
    }
  }`;

export function useCreateComponent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateComponentInput) =>
      gql<{ createComponent: GqlComponent }>(CREATE_COMPONENT, {
        component: {
          name: input.name,
          displayName: input.displayName,
          description: input.description,
          orgId: 1,
          orgHandler: input.orgHandler,
          projectId: input.projectId,
          componentType: input.componentType,
          displayType: input.displayType,
          ...(input.componentSubType && { componentSubType: input.componentSubType }),
          technology: 'WSO2MI',
          isPublicRepo: false,
        },
      }).then((d) => d.createComponent),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['components'] }),
  });
}

export interface UpdateComponentInput {
  id: string;
  displayName: string;
  description: string;
  componentType: 'MI' | 'BI';
  /**
   * Integration type. Sent as a pair with `componentSubType`: supplying
   * `displayType` clears a stale subtype when `componentSubType` is absent.
   */
  displayType?: string;
  componentSubType?: string;
}

const UPDATE_COMPONENT = `
  mutation UpdateComponent($component: ComponentUpdateInput!) {
    updateComponent(component: $component) {
      id, name, displayName, handler, orgId, projectId, createdAt, updatedAt, description
    }
  }`;

export function useUpdateComponent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateComponentInput) => gql<{ updateComponent: GqlComponent }>(UPDATE_COMPONENT, { component: input }).then((d) => d.updateComponent),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['components'] });
      qc.invalidateQueries({ queryKey: ['component'] });
    },
  });
}

interface DeleteComponentResult {
  status: string;
  canDelete: boolean;
  message: string;
  encodedData: string;
}

const DELETE_COMPONENT_V2 = `
  mutation DeleteComponentV2($orgHandler: String!, $componentId: String!, $projectId: String!) {
    deleteComponentV2(orgHandler: $orgHandler, componentId: $componentId, projectId: $projectId) {
      status, canDelete, message, encodedData
    }
  }`;

export function useDeleteComponent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { orgHandler: string; componentId: string; projectId: string }) => gql<{ deleteComponentV2: DeleteComponentResult }>(DELETE_COMPONENT_V2, input).then((d) => d.deleteComponentV2),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['components'] }),
  });
}

export function useUpdateArtifactStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ArtifactStatusInput) =>
      gql<{ updateArtifactStatus: { status: string; message: string } }>(UPDATE_ARTIFACT_STATUS, {
        input: { componentId: input.componentId, artifactType: toBackendArtifactType(input.artifactType), artifactName: input.artifactName, status: input.status },
      }).then((d) => d.updateArtifactStatus),
    onMutate: async (input) => {
      const scope = (q: { queryKey: readonly unknown[] }) => q.queryKey[2] === input.envId && q.queryKey[3] === input.componentId;
      await qc.cancelQueries({ queryKey: ['artifacts', input.artifactType], predicate: scope });
      const newState = toggleStateValue(input.status);
      qc.setQueriesData<GqlArtifact[]>({ queryKey: ['artifacts', input.artifactType], predicate: scope }, (old) => old?.map((a) => (a.name === input.artifactName ? { ...a, state: newState } : a)));
    },
  });
}

export function useUpdateListenerState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ListenerStateInput) =>
      gql<{ updateListenerState: { success: boolean; message: string; commandIds: string[] } }>(UPDATE_LISTENER_STATE, {
        input: {
          runtimeIds: input.runtimeIds,
          listenerName: input.listenerName,
          listenerPackage: input.listenerPackage,
          port: input.port,
          action: input.action,
        },
      }).then((d) => {
        // The backend signals failure via `success: false` on an otherwise-200 response
        // (unlike a thrown GraphQL error), so that has to be checked explicitly here —
        // otherwise a rejected action looks identical to a successful one to react-query.
        if (!d.updateListenerState.success) throw new Error(d.updateListenerState.message || 'Failed to update listener state');
        return d.updateListenerState;
      }),
    onSuccess: () => {
      // Invalidate all listener queries to refetch the updated state
      qc.invalidateQueries({ queryKey: ['artifacts', 'Listener'] });
    },
  });
}

// ── Logger mutations ──

export interface UpdateLogLevelInput {
  runtimeIds: string[];
  componentName?: string;
  loggerName?: string;
  loggerClass?: string;
  logLevel: 'OFF' | 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
  componentType?: string;
}

const UPDATE_LOG_LEVEL = `
  mutation UpdateLogLevel($input: UpdateLogLevelInput!) {
    updateLogLevel(input: $input) {
      ${FETCHABLE}, success, message, commandIds
    }
  }`;

export function useUpdateLogLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateLogLevelInput) =>
      settle((requestId) =>
        gql<{ updateLogLevel: Fetchable & { success: boolean; message: string; commandIds: string[] } }>(UPDATE_LOG_LEVEL, {
          input: {
            runtimeIds: input.runtimeIds,
            ...(input.componentName && { componentName: input.componentName }),
            ...(input.loggerName && { loggerName: input.loggerName }),
            ...(input.loggerClass && { loggerClass: input.loggerClass }),
            ...(input.componentType && { componentType: input.componentType }),
            logLevel: input.logLevel,
            requestId,
          },
        }).then((d) => d.updateLogLevel),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loggers'] });
    },
  });
}

const DELETE_LOGGER = `
  mutation DeleteLogger($input: DeleteLoggerInput!) {
    deleteLogger(input: $input) {
      ${FETCHABLE}, success, message
    }
  }`;

export function useDeleteLogger() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ runtimeIds, loggerName }: { runtimeIds: string[]; loggerName: string }) =>
      settle((requestId) =>
        gql<{ deleteLogger: Fetchable & { success: boolean; message: string } }>(DELETE_LOGGER, {
          input: { runtimeIds, loggerName, requestId },
        }).then((d) => d.deleteLogger),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loggers'] });
    },
  });
}

// ── Org-level Secrets ──

const CREATE_ORG_SECRET = `
  mutation CreateOrgSecret($environmentId: String!, $componentId: String) {
    createOrgSecret(environmentId: $environmentId, componentId: $componentId)
  }`;

const REVOKE_ORG_SECRET = `
  mutation RevokeOrgSecret($keyId: String!) {
    revokeOrgSecret(keyId: $keyId)
  }`;

export function useCreateOrgSecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ environmentId, componentId }: { environmentId: string; componentId?: string }) => gql<{ createOrgSecret: string }>(CREATE_ORG_SECRET, { environmentId, componentId }).then((d) => d.createOrgSecret),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orgSecrets'] }),
  });
}

export function useRevokeOrgSecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (keyId: string) => gql<{ revokeOrgSecret: boolean }>(REVOKE_ORG_SECRET, { keyId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orgSecrets'] });
      qc.invalidateQueries({ queryKey: ['componentSecrets'] });
    },
  });
}

// ── Task trigger ──

const TRIGGER_ARTIFACT = `
  mutation TriggerTask($input: ArtifactTriggerInput!) {
    triggerArtifact(input: $input) {
      status, message, successCount, failedCount, details
    }
  }`;

export interface TriggerTaskInput {
  componentId: string;
  taskName: string;
}

export function useTriggerTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TriggerTaskInput) =>
      gql<{ triggerArtifact: { status: string; message: string; successCount: number; failedCount: number; details: string[] } }>(TRIGGER_ARTIFACT, {
        input: {
          componentId: input.componentId,
          taskName: input.taskName,
        },
      }).then((d) => d.triggerArtifact),
    onSuccess: () => {
      // Invalidate task queries to refetch the updated state
      qc.invalidateQueries({ queryKey: ['artifacts', 'Task'] });
    },
  });
}
