import { beforeEach, describe, expect, it } from 'vitest';
import { generateAndSaveAzureDevOpsState, validateAndClearAzureDevOpsState } from './azureDevOpsState';

beforeEach(() => sessionStorage.clear());

describe('azureDevOpsState', () => {
  it('accepts only the exact issued state and consumes it', () => {
    const state = generateAndSaveAzureDevOpsState();
    expect(validateAndClearAzureDevOpsState(state)).toBe(true);
    expect(validateAndClearAzureDevOpsState(state)).toBe(false);
  });

  it('rejects a forged state and consumes the stored nonce', () => {
    const state = generateAndSaveAzureDevOpsState();
    expect(validateAndClearAzureDevOpsState('forged')).toBe(false);
    expect(validateAndClearAzureDevOpsState(state)).toBe(false);
  });
});
