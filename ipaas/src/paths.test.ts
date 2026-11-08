import { afterEach, describe, expect, it } from 'vitest';
import { cloudConsoleHomeUrl, cloudConsoleOrganizationsUrl, cloudConsoleSubscriptionsUrl } from './paths';

const withConfig = (config: Partial<typeof window.API_CONFIG>) => {
  window.API_CONFIG = config as typeof window.API_CONFIG;
};

describe('WSO2 Cloud console links', () => {
  afterEach(() => withConfig({}));

  it("fall back to the console's own origin, which deployments share with the Cloud console", () => {
    withConfig({});
    expect(cloudConsoleOrganizationsUrl()).toBe(`${window.location.origin}/organizations`);
    expect(cloudConsoleSubscriptionsUrl()).toBe(`${window.location.origin}/billing?tab=subscriptions`);
  });

  it('use CLOUD_CONSOLE_URL when it is set', () => {
    withConfig({ cloudConsoleUrl: 'https://cloud-console.example' });
    expect(cloudConsoleHomeUrl()).toBe('https://cloud-console.example/');
    expect(cloudConsoleOrganizationsUrl()).toBe('https://cloud-console.example/organizations');
    expect(cloudConsoleSubscriptionsUrl()).toBe('https://cloud-console.example/billing?tab=subscriptions');
  });
});
