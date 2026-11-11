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

import { describe, it, expect } from 'vitest';
import { agentGatewayUrlRows, aiGatewayUrlRows, editorExposure, envCardUrlRows, exposureLabels, gatewayExposureState, getEndpointLabel, isBrowserReachable, isExposureTransitioning, resolveEndpointInvokeUrl, trimEndpointName, visibilityUrlOptions } from './endpoints';
import type { EnvEndpoint } from '../types/component';

const ep = (partial: Partial<EnvEndpoint>): EnvEndpoint => ({ id: 'e', releaseId: 'r', environmentId: 'env', displayName: 'ep', type: 'GraphQL', visibility: 'Public', ...partial }) as EnvEndpoint;

describe('resolveEndpointInvokeUrl', () => {
  it('returns empty string for a missing endpoint', () => {
    expect(resolveEndpointInvokeUrl(undefined)).toBe('');
  });

  it('prefers the widest declared visibility and strips the trailing slash', () => {
    const e = ep({ networkVisibilities: ['Public', 'Project'], publicUrl: 'https://pub/graphql/', projectUrl: 'https://proj/graphql' });
    expect(resolveEndpointInvokeUrl(e)).toBe('https://pub/graphql');
  });

  it('falls back to organization visibility when not public', () => {
    const e = ep({ networkVisibilities: ['Organization'], organizationUrl: 'https://org/graphql', projectUrl: 'https://proj/graphql' });
    expect(resolveEndpointInvokeUrl(e)).toBe('https://org/graphql');
  });

  it('falls back to any available url when no visibility matches', () => {
    const e = ep({ networkVisibilities: [], invokeUrl: 'https://any/graphql' });
    expect(resolveEndpointInvokeUrl(e)).toBe('https://any/graphql');
  });
});

describe('trimEndpointName', () => {
  it('drops a redundant leading "Endpoint" word', () => {
    expect(trimEndpointName('Endpoint Covid Status')).toBe('Covid Status');
    // The auto-generated endpoint name shape.
    expect(trimEndpointName('Endpoint 1')).toBe('1');
    expect(trimEndpointName('  Endpoint   Foo  ')).toBe('Foo');
  });

  it('only strips the word when it stands alone', () => {
    expect(trimEndpointName('EndpointFoo')).toBe('EndpointFoo');
    expect(trimEndpointName('Endpoints')).toBe('Endpoints');
    expect(trimEndpointName('My Endpoint')).toBe('My Endpoint');
  });

  it('leaves a hyphenated name starting with "endpoint" intact', () => {
    // The old /^\s*Endpoint\b\s*/i matched before the hyphen and produced "-metrics".
    expect(trimEndpointName('endpoint-metrics')).toBe('endpoint-metrics');
    expect(trimEndpointName('endpoint-9097')).toBe('endpoint-9097');
  });

  it('keeps the original when trimming would empty it', () => {
    expect(trimEndpointName('Endpoint')).toBe('Endpoint');
  });
});

describe('getEndpointLabel', () => {
  // Titles the Ballerina OpenAPI generator emits for the covid19-status sample.
  it('keeps a title that names something', () => {
    expect(getEndpointLabel({ displayName: 'Covid Status', name: 'covid-status', port: 9000 })).toBe('Covid Status');
    expect(getEndpointLabel({ displayName: 'Covid Community Support', name: 'covid-commu-3e5', port: 9003 })).toBe('Covid Community Support');
  });

  it('falls back to the port for a base-path-only title', () => {
    expect(getEndpointLabel({ displayName: '/', name: 'endpoint-9001', port: 9001 })).toBe('9001');
  });

  it('falls back to the port for an empty or absent title', () => {
    expect(getEndpointLabel({ displayName: '', name: 'endpoint-9097', port: 9097 })).toBe('9097');
    expect(getEndpointLabel({ name: 'endpoint-9097', port: 9097 })).toBe('9097');
  });

  it('falls back to the port for a generated numeric-hash title', () => {
    expect(getEndpointLabel({ displayName: '484419380', name: 'endpoint-9002', port: 9002 })).toBe('9002');
  });

  it('prefers a meaningful component.yaml key over the port when the title is absent', () => {
    expect(getEndpointLabel({ name: 'greeter-api', port: 9090 })).toBe('greeter-api');
    expect(getEndpointLabel({ name: 'sample-agent-endpoint', port: 8000 })).toBe('sample-agent-endpoint');
  });

  it('ignores the generated endpoint-<port> key in favour of the port', () => {
    expect(getEndpointLabel({ name: 'endpoint-9090', port: 9090 })).toBe('9090');
  });

  it('normalizes whitespace in a usable title', () => {
    expect(getEndpointLabel({ displayName: '  Covid   Status  ', name: 'covid-status', port: 9000 })).toBe('Covid Status');
  });

  it('returns the key when there is no port to fall back to', () => {
    expect(getEndpointLabel({ displayName: '/', name: 'endpoint-9001' })).toBe('endpoint-9001');
  });
});

describe('visibilityUrlOptions', () => {
  it('offers only the visibilities actually set on the endpoint', () => {
    const value = visibilityUrlOptions(ep({ networkVisibilities: ['Public'], publicUrl: 'https://a.example', organizationUrl: 'http://svc.cluster.local' }));
    expect(value).toEqual([{ key: 'public', label: 'Public', url: 'https://a.example' }]);
  });

  it('offers Project, not Organization, for a project-visible endpoint', () => {
    const value = visibilityUrlOptions(ep({ networkVisibilities: ['Project'], organizationUrl: 'http://svc.cluster.local', projectUrl: 'http://svc.cluster.local' }));
    expect(value).toEqual([{ key: 'project', label: 'Project', url: 'http://svc.cluster.local' }]);
  });

  // A visibility whose URL the mapper left unset contributes no row, rather than borrowing
  // another visibility's URL and mislabelling it.
  it('drops a declared visibility that has no URL', () => {
    expect(visibilityUrlOptions(ep({ networkVisibilities: ['Project'], organizationUrl: 'http://svc.cluster.local' }))).toEqual([]);
  });

  it('uses the gateway URL for Public without renaming the option', () => {
    const value = visibilityUrlOptions(ep({ networkVisibilities: ['Public'], publicUrl: 'https://raw.example' }), 'https://gw.example/api-1');
    expect(value).toEqual([{ key: 'public', label: 'Public', url: 'https://gw.example/api-1' }]);
  });

  it('keeps every visibility when several are set', () => {
    const value = visibilityUrlOptions(ep({ networkVisibilities: ['Public', 'Organization'], publicUrl: 'https://a.example', organizationUrl: 'http://svc.cluster.local' }));
    expect(value.map((v) => v.label)).toEqual(['Public', 'Organization']);
  });

  it('does not filter when the endpoint reports no visibilities', () => {
    const value = visibilityUrlOptions(ep({ publicUrl: 'https://a.example' }));
    expect(value.map((v) => v.key)).toEqual(['public']);
  });

  it('falls back to invokeUrl when no visibility-specific URL exists', () => {
    const value = visibilityUrlOptions(ep({ networkVisibilities: ['Public'], invokeUrl: 'https://only.example' }));
    expect(value).toEqual([{ key: 'public', label: 'Public', url: 'https://only.example' }]);
  });

  it('labels the invoke-URL fallback with the visibility the endpoint has', () => {
    const value = visibilityUrlOptions(ep({ networkVisibilities: ['Project'], invokeUrl: 'http://svc.cluster.local' }));
    expect(value).toEqual([{ key: 'project', label: 'Project', url: 'http://svc.cluster.local' }]);
  });

  it('labels the fallback Public when the endpoint names no visibility', () => {
    expect(visibilityUrlOptions(ep({ invokeUrl: 'https://only.example' }))).toEqual([{ key: 'public', label: 'Public', url: 'https://only.example' }]);
  });
});

describe('isBrowserReachable', () => {
  it('is true only for Public — organization and project URLs are in-cluster hosts', () => {
    expect(isBrowserReachable('public')).toBe(true);
    expect(isBrowserReachable('organization')).toBe(false);
    expect(isBrowserReachable('project')).toBe(false);
  });
});

const tiers = (publicStatus: string, organizationStatus: string) => ({ public: { status: publicStatus }, organization: { status: organizationStatus } }) as EnvEndpoint['visibilityStatus'];

describe('editorExposure', () => {
  it('opens on the saved choice even while the gateway state is unknown', () => {
    expect(editorExposure({ exposure: 'organization', visibilityStatus: tiers('UNKNOWN', 'UNKNOWN'), networkVisibilities: [] })).toEqual({ exposure: 'organization', legacyBothHosts: false });
  });

  it('falls back to the reported tiers without a saved choice', () => {
    expect(editorExposure({ visibilityStatus: tiers('DISABLED', 'ENABLED') }).exposure).toBe('organization');
    expect(editorExposure({ visibilityStatus: tiers('DISABLED', 'DISABLED') }).exposure).toBe('none');
  });

  it('never opens an API on the gateway as not exposed when neither its host nor a saved choice is known', () => {
    expect(editorExposure({ visibilityStatus: tiers('UNKNOWN', 'UNKNOWN'), networkVisibilities: ['Project'] }).exposure).toBe('public');
  });

  it('opens an endpoint reported on both hosts as Public and flags it', () => {
    expect(editorExposure({ visibilityStatus: tiers('ENABLED', 'ENABLED') })).toEqual({ exposure: 'public', legacyBothHosts: true });
  });
});

describe('exposureLabels', () => {
  it.each([
    { exposure: 'public' as const, labels: ['Public'] },
    { exposure: 'organization' as const, labels: ['Organization'] },
    { exposure: 'none' as const, labels: [] },
  ])('maps $exposure to the editor label', ({ exposure, labels }) => {
    expect(exposureLabels(exposure)).toEqual(labels);
  });
});

describe('gatewayExposureState', () => {
  it.each([
    { status: tiers('ENABLED', 'DISABLED'), state: 'enabled' },
    { status: tiers('DISABLED', 'ENABLING'), state: 'transitioning' },
    { status: tiers('UNKNOWN', 'UNKNOWN'), state: 'unknown' },
    { status: tiers('FAILED', 'DISABLED'), state: 'failed' },
    { status: tiers('DISABLED', 'DISABLED'), state: 'none' },
    { status: undefined, state: 'none' },
  ])('reads $status as $state', ({ status, state }) => {
    expect(gatewayExposureState(status).state).toBe(state);
  });

  it('polls while either host moves, including a switch between them', () => {
    expect(isExposureTransitioning(tiers('ENABLED', 'ENABLING'))).toBe(true);
    expect(isExposureTransitioning(tiers('DISABLING', 'ENABLED'))).toBe(true);
    expect(isExposureTransitioning(tiers('ENABLED', 'DISABLED'))).toBe(false);
  });
});

describe('envCardUrlRows', () => {
  const urls = { publicUrl: 'https://gw.example/api', organizationUrl: 'http://apip-internal:8080/api', projectUrl: 'http://svc.dp:8090' };
  const rows = (partial: Partial<EnvEndpoint>, override?: string) => Object.fromEntries(envCardUrlRows(ep({ ...urls, ...partial }), override).map((row) => [row.key, row.url]));

  it('shows only the host the endpoint is exposed on, never the project URL', () => {
    expect(rows({ networkVisibilities: ['Project', 'Organization'] })).toEqual({ organization: urls.organizationUrl });
    expect(rows({ networkVisibilities: ['Project', 'Public'] })).toEqual({ public: urls.publicUrl });
  });

  it('shows the project URL only for a project-only endpoint', () => {
    expect(rows({ networkVisibilities: ['Project'] })).toEqual({ project: urls.projectUrl });
    expect(rows({ networkVisibilities: ['Project', 'Public'], exposure: 'none' })).toEqual({ project: urls.projectUrl });
  });

  it('never puts the project or invoke URL in a gateway row', () => {
    expect(rows({ networkVisibilities: [], exposure: 'public', publicUrl: '', invokeUrl: urls.projectUrl })).toEqual({ public: '' });
  });

  it('shows the gateway URL for Public when the API is served there', () => {
    expect(rows({ networkVisibilities: ['Public'] }, 'https://apip.example/api').public).toBe('https://apip.example/api');
  });

  it('never shows the raw route as the public URL of a gateway-managed endpoint', () => {
    expect(rows({ networkVisibilities: [], exposure: 'public', visibilityStatus: tiers('UNKNOWN', 'UNKNOWN') }).public).toBe('');
    const reported = { public: { status: 'ENABLED' as const, url: 'https://apip.example/api' }, organization: { status: 'DISABLED' as const } };
    expect(rows({ networkVisibilities: ['Public'], visibilityStatus: reported }).public).toBe('https://apip.example/api');
  });

  it('follows the saved choice while the gateway cannot confirm the host', () => {
    expect(rows({ networkVisibilities: [], exposure: 'organization', visibilityStatus: tiers('UNKNOWN', 'UNKNOWN') })).toEqual({ organization: urls.organizationUrl });
  });

  it('shows the saved host as pending while the gateway still serves the other one', () => {
    expect(rows({ networkVisibilities: ['Public'], exposure: 'organization' })).toEqual({ organization: '' });
  });
});

describe('aiGatewayUrlRows', () => {
  const proxyUrl = 'https://gw.example.com/default/orders-mcp/mcp';

  it('shows only the AI gateway proxy URL, as Public', () => {
    expect(aiGatewayUrlRows(proxyUrl)).toEqual([{ key: 'public', label: 'Public', url: proxyUrl }]);
  });

  it('lists nothing while the proxy has no URL', () => {
    expect(aiGatewayUrlRows('')).toEqual([]);
  });
});

describe('agentGatewayUrlRows', () => {
  const agentUrl = 'https://gw.example.com/math-tutor';

  it('shows the AI gateway URL as Public', () => {
    expect(agentGatewayUrlRows(agentUrl)).toEqual([{ key: 'public', label: 'Public', url: agentUrl }]);
  });

  it('keeps the Public row, empty, while the gateway has no URL', () => {
    expect(agentGatewayUrlRows('')).toEqual([{ key: 'public', label: 'Public', url: '' }]);
  });
});
