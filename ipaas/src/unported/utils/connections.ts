/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
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

import { ConnectionComponentType, RequestingServiceVisibility } from '../../types/connections';
import type { ChoreoConnectionRequest, ConfigKeyEntry, ConfigVisibility, ConnectionRequest, ConnectionSchemaEntry, EnvConnectionConfig, ResourceReference } from '../../types/connections';

/** `v1` / `1.0` → `V1` / `V1.0` (drops a leading `v`, prefixes `V`). */
export function formatVersion(version: string): string {
  return `V${version.replace(/^v/i, '')}`;
}

/** Turn a raw backend/HTTP error into a message a user can act on. */
export function friendlyConnectionError(raw: string): string {
  const text = (raw || '').toLowerCase();
  if (text.includes('empty api id')) return 'This service can’t be connected to yet — it has no published API. Deploy the service to an environment (or choose a different service) and try again.';
  if (text.includes('already exist') || text.includes('duplicate') || text.includes('name and project')) return 'A connection with this name already exists in the project. Please choose a different name.';
  if (text.includes('http 5') || text.includes('internal server error')) return 'Something went wrong while creating the connection. Please try again in a moment.';
  return raw || 'Failed to create the connection.';
}

/** Access mode a user picks in the form; maps to the visibility list + requesting-service visibility. */
export type ConnectionAccessMode = 'Public' | 'Organization' | 'Project';

/** Description shown on each access-mode card. Mirrors Devant's ConnectionVisibilityCard. */
export const ACCESS_MODE_DESCRIPTION: Record<ConnectionAccessMode, string> = {
  Public: 'Access the service with the public endpoint.',
  Organization: 'Access the service with the organization-level internal endpoint.',
  Project: 'Access the service directly with the project-level endpoint.',
};

export const ACCESS_MODE_ORDER: ConnectionAccessMode[] = ['Public', 'Organization', 'Project'];

export function accessModeFromVisibility(visibility: string): ConnectionAccessMode | null {
  const v = visibility.toUpperCase();
  return v === 'PUBLIC' ? 'Public' : v === 'ORGANIZATION' ? 'Organization' : v === 'PROJECT' ? 'Project' : null;
}

/** Access modes a catalog item supports, in display order (defaults to Project). */
export function availableAccessModes(visibility?: string[]): ConnectionAccessMode[] {
  const set = new Set((visibility ?? []).map(accessModeFromVisibility).filter((m): m is ConnectionAccessMode => m !== null));
  const ordered = ACCESS_MODE_ORDER.filter((m) => set.has(m));
  return ordered.length ? ordered : ['Project'];
}

function requestingVisibilityFor(mode: ConnectionAccessMode): RequestingServiceVisibility {
  if (mode === 'Public') return RequestingServiceVisibility.Public;
  if (mode === 'Organization') return RequestingServiceVisibility.Organization;
  return RequestingServiceVisibility.Project;
}

/** Minimal environment shape needed to build the create body (from `EnvTemplate`). */
export interface EnvForConnection {
  id: string;
  critical: boolean;
}

/** The consuming component for an integration-level (component-scoped) connection. */
export interface ConnectionComponentContext {
  uuid: string;
  type?: string;
}

/**
 * Visibility list for the chosen access mode. Component-scoped connections carry the component uuid;
 * otherwise project mode carries the project uuid and org mode only the org.
 */
export function buildVisibilities(_mode: ConnectionAccessMode, organizationUuid: string, projectUuid: string, component?: ConnectionComponentContext): ConfigVisibility[] {
  // The visibility list is always the connection's own scope (project or component). The chosen
  // access mode is conveyed via `requestingServiceVisibility`, NOT by dropping the project uuid —
  // the backend counts connections by name + project, so `projectUuid` must always be present.
  if (component) return [{ organizationUuid, projectUuid, componentUuid: component.uuid }];
  return [{ organizationUuid, projectUuid }];
}

export interface BuildChoreoConnectionArgs {
  name: string;
  description?: string;
  serviceId: string;
  schemaReference: string;
  accessMode: ConnectionAccessMode;
  organizationUuid: string;
  projectUuid: string;
  orgIdInteger: number;
  environments: EnvForConnection[];
  /** Set for integration-level (component-scoped) connections. */
  component?: ConnectionComponentContext;
}

/**
 * Assemble the create body for an in-platform (Choreo service) connection.
 * Mirrors Devant's `buildConfigState` output for `POST .../choreo-connections?generateCreds=true`:
 * credentials are generated by the platform, so only the target environments, chosen schema and
 * visibility are sent — no per-environment config values.
 */
export function buildChoreoConnectionRequest(args: BuildChoreoConnectionArgs): ChoreoConnectionRequest {
  const { name, description, serviceId, schemaReference, accessMode, organizationUuid, projectUuid, orgIdInteger, environments, component } = args;
  return {
    name: name.trim(),
    description: description?.trim() || undefined,
    serviceId,
    schemaReference,
    visibilities: buildVisibilities(accessMode, organizationUuid, projectUuid, component),
    requestingServiceVisibility: requestingVisibilityFor(accessMode),
    orgIdInteger,
    componentType: component ? (component.type ?? ConnectionComponentType.SERVICE) : ConnectionComponentType.NON_COMPONENT,
    environments: environments.map((e) => ({ id: e.id, isCritical: e.critical, providerEnvId: e.id })),
  };
}

export interface BuildThirdPartyConnectionArgs {
  name: string;
  description?: string;
  serviceId: string;
  schemaReference: string;
  accessMode: ConnectionAccessMode;
  organizationUuid: string;
  projectUuid: string;
  /** Target environments; `id` is the env template id. */
  environments: EnvForConnection[];
  entries: ConnectionSchemaEntry[];
  /** Set for integration-level (component-scoped) connections. */
  component?: ConnectionComponentContext;
}

/**
 * Assemble the create body for a third-party (well-known) service connection →
 * `POST .../third-party-connections?wellKnownService=true`. Per Devant's create flow the schema
 * entries are sent with empty values (filled later); `envMapping` self-references each environment.
 */
export function buildThirdPartyConnectionRequest(args: BuildThirdPartyConnectionArgs): ConnectionRequest {
  const { name, description, serviceId, schemaReference, accessMode, organizationUuid, projectUuid, environments, entries, component } = args;
  const configurations: Record<string, EnvConnectionConfig> = {};
  const envMapping: Record<string, ResourceReference> = {};
  for (const env of environments) {
    const entryMap: Record<string, ConfigKeyEntry> = {};
    for (const entry of entries) {
      entryMap[entry.name] = {
        key: entry.name,
        value: '',
        isSensitive: entry.isSensitive,
        isFile: false,
      };
    }
    configurations[env.id] = { environmentUuid: env.id, isCritical: env.critical, entries: entryMap };
    envMapping[env.id] = { resourceId: env.id, parameterReference: env.id };
  }
  return {
    name: name.trim(),
    description: description?.trim() || undefined,
    serviceId,
    schemaReference,
    visibilities: buildVisibilities(accessMode, organizationUuid, projectUuid, component),
    componentType: component ? (component.type ?? ConnectionComponentType.SERVICE) : ConnectionComponentType.NON_COMPONENT,
    configurations,
    envMapping,
  };
}

/** URL base for a project-scoped connections surface. */
export function projectConnectionsBase(org: string, project: string): string {
  return `/organizations/${org}/projects/${project}/admin/connections`;
}

/** URL base for a component-scoped (integration-level) connections surface. */
export function componentConnectionsBase(org: string, project: string, component: string): string {
  return `/organizations/${org}/projects/${project}/components/${component}/admin/connections`;
}
