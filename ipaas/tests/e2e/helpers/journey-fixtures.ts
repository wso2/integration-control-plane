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

/** What the cloud journey is written against: its fixtures, their copy, and its budgets. */

export const SAMPLE = 'Hello World Service';
/**
 * The scheduled-task sample second in wso2/integration-samples' .metadata/samples.json, so the Samples tab
 * features it next to SAMPLE. Both publish an image, so they deploy without a build. The deploy names the
 * integration after the sample, so a rename there breaks 04d.
 */
export const AUTOMATION = 'Scheduled Logger';
export const MI_TECHNOLOGY = 'WSO2 Integrator: MI';
/** The MI samples publish no runnable image, so 04e imports one from source and builds it. */
export const MI_AUTOMATION_REPO_URL = 'https://github.com/wso2/integration-samples';
export const MI_AUTOMATION_SUB_PATH = ['integrator-mi-profile', 'PersonLookupAutomation'] as const;
/** formatRepoNameToDisplayName of the sub path's last segment, which the import form derives. */
export const MI_AUTOMATION = 'PersonLookupAutomation';
export const AGENT_TYPE = 'AI Agent';
export const ENV = 'Development';

export const AGENT_REPO_URL = 'https://github.com/gabilvtg/bal-task-assistant';
/** The import derives the name from the repository, so it is read off the page, or matched by pattern. */
export const AGENT_NAME_PATTERN = /bal[- ]?task[- ]?assistant/i;
export const AGENT_PROMPT = 'Hello from dokimibot';

export const CONSUMER = 'ipaas-test-consumer';
export const NO_CONSUMERS = 'No consumer applications yet. Create your first consumer application to start calling this API.';
export const NO_SCHEDULE = 'This automation doesn’t have an active schedule. Add one to run it automatically.';

/** Order matters: this is the order AppLayout renders them in. Hrefs from paths.ts. */
export const FOOTER_LINKS = [
  ['Documentation', 'https://wso2.com/integration-platform/docs/'],
  ['Support', 'https://discord.com/invite/wso2'],
  ['Terms of Use', 'https://wso2.com/integration-platform/terms-of-use'],
  ['Privacy Policy', 'https://wso2.com/privacy-policy'],
] as const;

export const CLOUD_SECTIONS = ['Package registries', 'User Portal'] as const;
export const UNPORTED_SECTIONS = ['Access Control', 'Egress Control', 'Workflows', 'Credentials', 'On-Prem Keys', 'Application Security'] as const;

/** Deleting an integration is asynchronous: the row greys out, then goes. Observed at ~3 minutes on DEV. */
export const REMOVAL_TIMEOUT_MS = 10 * 60_000;
/** A project goes only once its integrations are gone, so it is given longer than any one of them. */
export const PROJECT_REMOVAL_TIMEOUT_MS = 15 * 60_000;
export const DEPLOY_TIMEOUT_MS = 7 * 60_000;
/** deployLatestBuild's worst case: two card waits and a reload, the enable, the started alert and Deploy hiding (about 8.2 minutes). */
export const DEPLOY_ACTION_MS = 9 * 60_000;
/** MI deployments run longer than Ballerina ones. */
export const MI_DEPLOY_TIMEOUT_MS = 10 * 60_000;
/** The card reports the previous deployment for a moment after Apply, so the status waits it out. */
export const REDEPLOY_SETTLE_MS = 60_000;
export const AGENT_REPLY_TIMEOUT_MS = 90_000;
/** An agent's import triggers a second build minutes after the first settles, so the card is watched this long past it. */
export const BUILD_QUIET_MS = 90_000;
/** An agent has no deployment until its last build lands, and the card offers nothing before that. */
export const AGENT_GATE_TIMEOUT_MS = 15 * 60_000;
export const AGENT_GATE_POLL_MS = 30_000;

/** A fresh test key is refused until it propagates (10-22s), so Execute is retried across that window. */
export const EXECUTE_ATTEMPTS = 6;
export const EXECUTE_GAP_MS = 8_000;

/** Gateway readiness trails the deployment going Active, so the endpoint is probed outside the browser first. */
export const PROBE_TIMEOUT_MS = 3 * 60_000;
export const PROBE_GAP_MS = 10_000;

/** The free plan's shortest schedule interval, from the billing limits (scheduleValidation.ts); a shorter one disables Update. */
export const SCHEDULE_INTERVAL_MINUTES = 5;
/** A five-minute schedule fires four times in the budget, so three survives a late first fire. */
export const EXECUTIONS_TARGET = 3;
export const EXECUTIONS_WATCH_MS = 20 * 60_000;
export const EXECUTIONS_POLL_MS = 45_000;
