/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 */

import { session } from '../utils/storage';

const AZURE_DEVOPS_OAUTH_STATE_KEY = 'azure_devops_oauth_state';

export function generateAndSaveAzureDevOpsState(): string {
  const state = crypto.randomUUID();
  session.set(AZURE_DEVOPS_OAUTH_STATE_KEY, state);
  return state;
}

export function validateAndClearAzureDevOpsState(state: string): boolean {
  const saved = session.get(AZURE_DEVOPS_OAUTH_STATE_KEY);
  session.remove(AZURE_DEVOPS_OAUTH_STATE_KEY);
  return saved !== null && saved === state;
}
