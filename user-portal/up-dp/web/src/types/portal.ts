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

/** UP-DP's `/api/v1` wire types, as docs/api.md declares them. */

/**
 * The portal app as the SPA signs in with it. The SPA reads the endpoints from the issuer's
 * discovery document, and the scopes from `/api/v1/auth/scopes`.
 */
export interface AuthConfig {
  issuer: string;
  clientId: string;
  resource: string;
}

/** `GET /api/v1/auth/scopes`: what the SPA asks for when it signs in. It answers without a token. */
export interface ScopeList {
  scopes: string[];
}

/** UP-DP serves this as `/config.js`, which the page loads before the SPA. It is the same for the whole deployment. */
export interface PortalConfig {
  portalName: string;
  productName: string;
  orgHandle: string;
  orgName: string;
  theme: string;
  primaryColor?: string;
  links: { terms?: string; privacy?: string; support?: string };
  logo: { light: string; dark: string };
  auth: AuthConfig;
}

export type IntegrationKind = 'aiAgent' | 'automation' | 'workflow';

export interface DeploymentTrack {
  id: string;
  branch: string;
  apiVersion?: string;
  latest: boolean;
  /** An agent's chat endpoints, or a workflow's Management API, on this track. Absent for automations and for a track with no active deployment. */
  endpoints?: GatewayEndpoint[];
}

export interface GatewayEndpoint {
  name: string;
  displayName: string;
  url: string;
}

export interface Integration {
  id: string;
  name: string;
  displayName: string;
  description: string;
  kind: IntegrationKind;
  project: Project;
  /** Latest first. */
  deploymentTracks: DeploymentTrack[];
}

/** A project in iPaaS-Service, which groups integrations. */
export interface Project {
  id: string;
  name: string;
  handle: string;
}

/** One page of `GET /api/v1/integrations`, in display name order. `nextCursor` asks for the next page; absent on the last. */
export interface IntegrationPage {
  items: Integration[];
  nextCursor?: string;
  totalCount: number;
}

export interface RuntimeArgument {
  name: string;
  type: string;
  prefix?: string;
  displayName?: string;
  description?: string;
  delimiter?: string;
  values?: string[];
  repeat?: boolean;
  required?: boolean;
}

/** What is deployed on a track: what running it takes. */
export interface Deployment {
  deploymentTrackId: string;
  environmentName: string;
  /** Absent when it runs only on demand, or its deployment is suspended. */
  schedule?: { cron: string; timezone: string };
  runtimeArgs?: RuntimeArgument[];
}

export type ExecutionStatus = 'Running' | 'Succeeded' | 'Failed';

export interface Execution {
  jobId: string;
  status: ExecutionStatus;
  startTime: string;
  completionTime?: string;
  revisionId?: string;
}

export interface ExecutionPage {
  items: Execution[];
  nextCursor?: string;
}

export interface ExecutionArg {
  name: string;
  value: string;
}
