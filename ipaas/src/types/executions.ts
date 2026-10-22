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

export interface ExecutionConfigs {
  cronjobFrequency: string;
  cronjobTimezone: string;
  cronjobAllowConcurrency?: boolean;
  timeoutSeconds?: number;
  retryCount?: number;
}

export interface TaskExecution {
  id: string;
  startTime: string;
  completionTime: string;
  runId: string;
  revisionId: string;
  failedReason: string;
  status: string;
  arguments?: string | null;
}

export interface ExecutionLogEntry {
  timestamp: string;
  message: string;
  level?: string;
  container?: string;
}

/**
 * The bounds of a single run, as the executions table holds them: unix seconds
 * in string form (see toTaskExecution). An empty completionTime means the run
 * has not finished. Log backends that can only filter by component and time
 * need this to isolate one execution.
 */
export type ExecutionLogWindow = Pick<TaskExecution, 'startTime' | 'completionTime'>;

export interface ExecutionArgument {
  argumentName: string;
  argumentValue: string;
}

export interface UpdateJobConfigsInput {
  orgHandler: string;
  componentId: string;
  environmentId: string;
  versionId: string;
  cronFrequency?: string;
  cronTimezone?: string;
  jobTimeoutSeconds?: number;
  cronJobAllowConcurrency?: boolean;
  jobRetryCount?: number;
}

/** Identifies the schedule to stop: `releaseId` names its deployment track. `orgHandler` is unused by cloud. */
export interface StopScheduleInput {
  componentId: string;
  envId: string;
  orgHandler: string;
  releaseId: string;
}

export interface TriggerComponentInput {
  orgHandler: string;
  projectId: string;
  componentId: string;
  releaseId: string;
  args?: { argument_name: string; argument_value: string }[];
}

/** Result of triggering a run — the new execution's id (null if the backend returned none). */
export interface TriggerRunResult {
  runId: string | null;
}

// runtime arguments (Automation "Test" form)
// Mirrors Devant's runtime-args schema + dynamic-form model. The backend derives
// `RuntimeArgument[]` from the automation's entrypoint signature (Ballerina `main`
// params) or, for image-based components, from user-declared CLI args.

/** One declared runtime argument, as returned by the `runtimeArguments` query. */
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

/** Input widget chosen for a field, derived from a `RuntimeArgument`'s type/repeat. */
export type FormInputType = 'text' | 'number' | 'dropdown' | 'radio' | 'checkbox' | 'multi-text';

export interface FormTileOption {
  id: string;
  label: string;
  value: string;
}

/** A `RuntimeArgument` resolved into everything the form needs to render one field. */
export interface FormField {
  id: string;
  label: string;
  description: string;
  required: boolean;
  runtimeType?: string;
  inputType: FormInputType;
  options: FormTileOption[];
  placeholder: string;
}

export type DynamicFormFieldValue = string | string[] | boolean;
export type DynamicFormData = Record<string, DynamicFormFieldValue>;
export type DynamicFormValidationErrors = Record<string, string>;

/** Serialized run-pod argument (snake_case wire shape used by the trigger payload). */
export interface TriggerArgument {
  argument_name: string;
  argument_value: string;
}
