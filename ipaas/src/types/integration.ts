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

import type { ComponentType } from 'react';
import type { Component } from './component';
import type { Environment } from './environment';

/**
 * The set of integration types whose Overview rendering is owned by a dedicated
 * module under `src/components/<page>/<type>/` (e.g. `overview/automation/`).
 * Resolved from a
 * component's (displayType, componentSubType) pair by `identifyIntegration`.
 *
 * Any component whose pair does not resolve to a known type falls into
 * `'unsupported'`, which renders a fallback module.
 */
export type IntegrationType = 'integration-as-api' | 'webhook' | 'automation' | 'file-integration' | 'event-integration' | 'ai-agent' | 'mcp-server' | 'mcp-proxy' | 'tailscale-vpn' | 'rag-ingestion' | 'unsupported';

/** Underlying build runtime, when the integration type has more than one. */
export type IntegrationRuntime = 'ballerina' | 'mi' | 'unknown';

/**
 * The output of `identifyIntegration`. `raw` preserves the original wire
 * fields as an escape hatch for code that needs to distinguish edge cases
 * the discriminator does not capture.
 */
export interface IntegrationIdentity {
  type: IntegrationType;
  runtime: IntegrationRuntime;
  raw: {
    displayType: string;
    componentSubType: string | null;
  };
}

/** A transient, type-agnostic notification surfaced by the shared shell. */
export interface EnvCardNotification {
  text: string;
  severity: 'success' | 'error';
  /** Optional second line; `text` is promoted to a heading when present. */
  detail?: string;
}

/**
 * The data + callbacks the shared `EnvCardShell` passes to every per-type slot.
 *
 * The shell owns the truly generic concerns: the per-env deployment fetch (and
 * its polling), and the cross-slot coordination state that sibling slots share
 * (notification, pending-trigger, refresh). Each slot reads what it needs from
 * here and fetches any *type-specific* data (schema, endpoints, swagger,
 * executions, schedule, logs) itself via the domain hooks.
 *
 * Slots receive this whole shape and destructure the fields they use; a slot
 * that ignores, say, `requestPoll` simply doesn't read it.
 */
export interface EnvCardSlotProps {
  // identity + location
  component: Component;
  env: Environment;
  prevEnv?: Environment;
  versionId: string;
  projectId: string;
  orgHandler: string;
  projectHandler: string;
  componentHandler: string;
  deploymentPipelineId: string;
  /** `env.templateId ?? env.id` — used by schema/config fetches. */
  envTemplateId: string;

  // page-level
  isBuildInProgress?: boolean;

  // shell-derived deployment data (fetched once by the shell, shared by all slots)
  releaseId: string;
  deploymentStatusV2: string | null;
  hasDeployment: boolean;
  loadingDeployment: boolean;
  /** The commit this environment is running — not the repo's newest. */
  deployedCommit?: { sha: string; message?: string } | null;
  deployedCommitSha?: string;
  buildId?: string;
  releaseMgtReleaseId?: string;
  releaseMgtDeploymentId?: string;

  // shared callbacks
  onNotify: (notification: EnvCardNotification) => void;
  /** Ask the shell to poll the deployment briefly (after an explicit stop/redeploy). */
  requestPoll: () => void;
  /**
   * Record an optimistic pending trigger (Run / Run-with-args) so the body's
   * executions table shows a queued sentinel row immediately. Automation's
   * actions slot and executions body both use it; other types ignore it.
   */
  onTrigger: (triggerTime: number, args?: string[] | null) => void;
}

/**
 * Left header slot: the type's status indicator + Configure entry point.
 * Rendered inside the generic `EnvCardHeader` frame, after the commit info.
 * Types with no status/configure concept omit the slot.
 */
export type HeaderStatusProps = EnvCardSlotProps;

/**
 * Right header slot: the type's action buttons (Run/Schedule, Stop/Test/Logs…).
 * Rendered inside the generic `EnvCardHeader` frame, before the Refresh icon.
 */
export type EnvCardActionsProps = EnvCardSlotProps;

/**
 * Body slot: the type's content only — panels, tables, insights, log streams.
 * No `Card`/header chrome (that's the shell's frame).
 */
export interface EnvCardBodyProps extends EnvCardSlotProps {
  /** Set by the actions slot via `onTrigger`; drives the queued sentinel row. */
  pendingTriggerTime: number | null;
  pendingTriggerArgs?: string[] | null;
  /** Called when the table has reconciled the pending trigger with real data. */
  onTriggerResolved: () => void;
}

/** Optional footer slot, rendered below the body. No type ships one today. */
export type EnvCardFooterProps = EnvCardSlotProps;

/**
 * Full-header escape hatch for types whose header differs a lot from the
 * generic frame (e.g. file-integration: env name + Critical chip + Refresh,
 * with no commit / status / actions). When a module provides `CustomHeader`,
 * the shell renders it *instead* of `EnvCardHeader`, and `HeaderStatus` /
 * `EnvCardActions` are ignored. Same philosophy as `CustomOverview`.
 */
export interface CustomHeaderProps extends EnvCardSlotProps {
  isRefreshing: boolean;
  onRefresh: () => void;
}

/**
 * Props for slots that sit at the top of the overview (above env cards) or
 * for full-takeover `CustomOverview` components used by outliers (Tailscale).
 */
export interface OverviewHeaderSlotProps {
  component: Component;
  identity: IntegrationIdentity;
}

/**
 * The contract each integration type fulfils for the Overview surface.
 *
 * Header composition has two modes:
 *   - generic frame: provide `HeaderStatus` (left) and/or `EnvCardActions`
 *     (right); the shared `EnvCardHeader` renders env name + commit + Refresh
 *     around them.
 *   - escape hatch: provide `CustomHeader` to take over the whole header.
 *
 * `EnvCardBody` is the type's content (the shell wraps it in the Card frame);
 * `EnvCardFooter` is an optional below-body slot. A type may instead provide
 * `CustomOverview` to bypass the env-card concept entirely (Tailscale-style).
 *
 * Any slot a type doesn't need is omitted — no null-returning placeholders.
 */
export interface IntegrationModule {
  displayName: string;
  Icon: ComponentType<{ size?: number }>;

  // header — generic-frame slots
  HeaderStatus?: ComponentType<HeaderStatusProps>;
  EnvCardActions?: ComponentType<EnvCardActionsProps>;
  // header — full escape hatch (replaces the generic frame header)
  CustomHeader?: ComponentType<CustomHeaderProps>;

  // body + footer
  EnvCardBody?: ComponentType<EnvCardBodyProps>;
  EnvCardFooter?: ComponentType<EnvCardFooterProps>;

  // above-cards slot + full-overview escape hatch
  OverviewHeaderExtras?: ComponentType<OverviewHeaderSlotProps>;
  CustomOverview?: ComponentType<OverviewHeaderSlotProps>;

  /**
   * Component-header capability: hide the "Open in Cloud / VS Code" editor
   * entry point. Set by types that have no in-editor source-editing surface —
   * e.g. MCP (server + proxy), matching devant which excludes it for MCP.
   */
  hideOpenInEditor?: boolean;
}
