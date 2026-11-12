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

import { DEFAULT_FORWARDED_TOKEN_HEADER } from '../constants/apiConsumption';
import type { Environment } from '../types/environment';
import type { UserPortalPublishability, UserPortalRefusal, UserPortalState } from '../types/userPortal';
import { apiErrorMessage, httpCodeOf } from './apiErrors';
import { WORKFLOW_MANAGEMENT_API_TITLE } from './workflowIntegration';

/** At least one environment: the Enable dialog opens only when there is one to enable the User Portal in. */
export type SomeEnvironments = [Environment, ...Environment[]];

export const hasSomeEnvironments = (environments: Environment[]): environments is SomeEnvironments => environments.length > 0;

/** A portal on its way somewhere: setting up, starting or being removed. It is read again every few seconds. */
export const portalBusy = (state: UserPortalState): boolean => state === 'setting-up' || state === 'starting' || state === 'removing';

export const USER_PORTAL_NOT_ENABLED = 'USER_PORTAL_NOT_ENABLED';
export const USER_PORTAL_NOT_DEPLOYED = 'USER_PORTAL_NOT_DEPLOYED';

/** Why a role without the deploy scope can't publish or unpublish. */
export const DEPLOY_REFUSAL = "Your role can't publish integrations to the User Portal.";

/** The environment has no User Portal, so none of the other publishing rules can be met yet. */
export const userPortalIsOff = ({ published, reasons }: UserPortalPublishability): boolean => !published && reasons.some((r) => r.code === USER_PORTAL_NOT_ENABLED);

/** A publish's scopes that the User Portal can't hold, and so its users' tokens never carry. */
export const rejectedScopesText = (scopes: string[]): string => `The User Portal can't hold ${scopes.length === 1 ? 'this scope' : 'these scopes'}, so its users' tokens never carry ${scopes.length === 1 ? 'it' : 'them'}: ${scopes.join(', ')}.`;

/** ipaas-service's User Portal error codes, each worded for the environment `env` it was refused in. */
const MESSAGES: Record<string, (env: string) => string> = {
  USER_PORTAL_NOT_PUBLISHABLE: () => 'Only AI agents, automations and workflows can be published to the User Portal.',
  USER_PORTAL_INVALID_ENVIRONMENT: (env) => `The User Portal can't use ${env}.`,
  USER_PORTAL_PIPELINE: () => 'Only integrations of projects on the default deployment pipeline can be published to the User Portal.',
  USER_PORTAL_AGENT_OAUTH_REQUIRED: () => "Turn on OAuth security for the agent. The User Portal calls it with its users' tokens.",
  [USER_PORTAL_NOT_ENABLED]: (env) => `The User Portal is not enabled in ${env}.`,
  [USER_PORTAL_NOT_DEPLOYED]: (env) => `Deploy it to ${env} first. The User Portal lists only what runs there.`,
  USER_PORTAL_NO_PUBLIC_ENDPOINT: (env) => `Expose the endpoint the User Portal calls publicly in ${env}.`,
  USER_PORTAL_NO_MANAGEMENT_API: (env) => `The workflow has no ${WORKFLOW_MANAGEMENT_API_TITLE} endpoint deployed in ${env}.`,
  USER_PORTAL_API_KEY: () => 'An endpoint the User Portal calls is secured with an API key. Secure it with JWT.',
  USER_PORTAL_SECURED_BY_PROMOTION: (env) => `The Workflow Management API doesn't take JWT in ${env}, or isn't known to, and ${env} gets its security only by promotion. Publish the workflow in the environment it is promoted from, then promote it to ${env}.`,
  USER_PORTAL_AUDIENCE_MISSING: () => "An endpoint checks token audiences without the User Portal's. Add the User Portal to its audiences, or clear them.",
  USER_PORTAL_TOKEN_NOT_FORWARDED: () => `An endpoint the User Portal calls doesn't forward the caller's token. Turn token forwarding on, in the ${DEFAULT_FORWARDED_TOKEN_HEADER} header.`,
  USER_PORTAL_PUBLISH_LIMIT: (env) => `The User Portal in ${env} holds as many integrations as it can. Unpublish one first.`,
  USER_PORTAL_SCOPES_NOT_SYNCED: () => "The User Portal's scopes could not be updated. Try again.",
  USER_PORTAL_SIGN_IN_NOT_READY: (env) => `The User Portal's sign-in isn't ready in ${env} yet. Publish again once it is.`,
  USER_PORTAL_REDEPLOY_FAILED: () => "The workflow couldn't be redeployed for the User Portal's sign-in, so it isn't published. Publish again.",
  USER_PORTAL_PUBLISH_INTERRUPTED: () => "Publishing didn't finish. Publish again.",
  USER_PORTAL_PUBLISH_FAILED: () => 'Publishing to the User Portal failed. Publish again.',
  USER_PORTAL_PUBLISH_UNDOING: (env) => `An earlier publish is still being undone in ${env}. Publish again in a minute.`,
  USER_PORTAL_CONSOLE_ACCESS_NOT_RESTORED: () => 'The workflow is unpublished, but switching it back to the console failed. Unpublish again to finish.',
};

/**
 * A User Portal refusal as the console words it. A code the console doesn't know yet keeps ipaas-service's
 * message, which still says what to change.
 */
export const refusalText = ({ code, message }: UserPortalRefusal, env: string): string => MESSAGES[code]?.(env) ?? message;

/** A failed User Portal call: its code worded, or else the API's sentence. */
export const userPortalErrorText = (error: unknown, env: string): string => MESSAGES[httpCodeOf(error)]?.(env) ?? apiErrorMessage(error, 'Something went wrong.');

/**
 * The note shown while a publish finishes in the background: a workflow's redeploys it for the User Portal's sign-in,
 * and every publish adds its scopes to the User Portal.
 */
export const publishingText = (env: string, isWorkflow: boolean): string =>
  isWorkflow ? `Publishing to the User Portal in ${env}. The workflow is redeployed for the User Portal's sign-in; this takes a minute or two.` : `Publishing to the User Portal in ${env}. Its scopes are added to the User Portal; this can take a minute.`;

/** The note shown while an unpublish finishes in the background: a workflow is given back to the console, and its scopes taken off. */
export const unpublishingText = (env: string, isWorkflow: boolean): string =>
  isWorkflow
    ? `Unpublished from the User Portal in ${env}. The workflow is redeployed to take the console's API key again; this takes a minute or two.`
    : `Unpublished from the User Portal in ${env}. Its scopes are being taken off the User Portal; this can take a minute.`;

// The rules about what runs in the environment. With nothing deployed there they all fail, and deploying is the fix.
const NEEDS_A_DEPLOYMENT = new Set(['USER_PORTAL_NO_PUBLIC_ENDPOINT', 'USER_PORTAL_NO_MANAGEMENT_API', 'USER_PORTAL_API_KEY', 'USER_PORTAL_SECURED_BY_PROMOTION', 'USER_PORTAL_AUDIENCE_MISSING', 'USER_PORTAL_TOKEN_NOT_FORWARDED']);

/** The refusals to show: an integration not deployed in the environment shows that, not what follows from it. */
export const shownRefusals = (reasons: UserPortalRefusal[]): UserPortalRefusal[] => (reasons.some((r) => r.code === USER_PORTAL_NOT_DEPLOYED) ? reasons.filter((r) => !NEEDS_A_DEPLOYMENT.has(r.code)) : reasons);
