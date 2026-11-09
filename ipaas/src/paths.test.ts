import { afterEach, describe, expect, it } from 'vitest';
import { cloudConsoleHomeUrl, cloudConsoleOrganizationsUrl, cloudConsoleProjectManageUrl, cloudConsoleSubscriptionsUrl } from './paths';

const withConfig = (config: Partial<typeof window.API_CONFIG>) => {
  window.API_CONFIG = config as typeof window.API_CONFIG;
};

describe('WSO2 Cloud console links', () => {
  afterEach(() => withConfig({}));

  it("fall back to the console's own origin, which deployments share with the Cloud console", () => {
    withConfig({});
    expect(cloudConsoleOrganizationsUrl()).toBe(`${window.location.origin}/organizations`);
    expect(cloudConsoleSubscriptionsUrl()).toBe(`${window.location.origin}/billing?tab=subscriptions`);
    expect(cloudConsoleProjectManageUrl('orders')).toBe(`${window.location.origin}/projects/orders/manage`);
  });

  it('use CLOUD_CONSOLE_URL when it is set', () => {
    withConfig({ cloudConsoleUrl: 'https://cloud-console.example' });
    expect(cloudConsoleHomeUrl()).toBe('https://cloud-console.example/');
    expect(cloudConsoleOrganizationsUrl()).toBe('https://cloud-console.example/organizations');
    expect(cloudConsoleSubscriptionsUrl()).toBe('https://cloud-console.example/billing?tab=subscriptions');
    expect(cloudConsoleProjectManageUrl('orders')).toBe('https://cloud-console.example/projects/orders/manage');
  });

  it('encode the project handle in the project manage URL', () => {
    withConfig({ cloudConsoleUrl: 'https://cloud-console.example' });
    expect(cloudConsoleProjectManageUrl('a b/c')).toBe('https://cloud-console.example/projects/a%20b%2Fc/manage');
  });
});
