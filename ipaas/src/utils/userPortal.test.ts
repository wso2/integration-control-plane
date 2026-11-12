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

import { describe, expect, it } from 'vitest';
import { BffError } from '../api/_client';
import { portalBusy, refusalText, shownRefusals, userPortalErrorText } from './userPortal';

describe('portalBusy', () => {
  it('holds for a portal setting up, starting or being removed, and no other', () => {
    expect((['setting-up', 'starting', 'removing'] as const).every(portalBusy)).toBe(true);
    expect((['not-enabled', 'active', 'unhealthy', 'failed'] as const).some(portalBusy)).toBe(false);
  });
});

describe('refusalText', () => {
  it('words a known code for the environment', () => {
    expect(refusalText({ code: 'USER_PORTAL_NOT_DEPLOYED', message: 'deploy it first' }, 'Production')).toBe('Deploy it to Production first. The User Portal lists only what runs there.');
  });

  it("keeps ipaas-service's message for a code it doesn't know", () => {
    expect(refusalText({ code: 'USER_PORTAL_SOMETHING_NEW', message: 'a new rule' }, 'Production')).toBe('a new rule');
  });
});

describe('refusalText for a background publish', () => {
  it('words the codes a background publish ends with as the synchronous one does', () => {
    expect(refusalText({ code: 'USER_PORTAL_REDEPLOY_FAILED', message: 'x' }, 'Production')).toBe(userPortalErrorText(new BffError(502, '{"code":"USER_PORTAL_REDEPLOY_FAILED","message":"x"}'), 'Production'));
  });

  it('words an interrupted publish and a generic failure as asking to publish again', () => {
    expect(refusalText({ code: 'USER_PORTAL_PUBLISH_INTERRUPTED', message: 'x' }, 'Production')).toBe("Publishing didn't finish. Publish again.");
    expect(refusalText({ code: 'USER_PORTAL_PUBLISH_FAILED', message: 'x' }, 'Production')).toBe('Publishing to the User Portal failed. Publish again.');
    expect(refusalText({ code: 'USER_PORTAL_PUBLISH_UNDOING', message: 'x' }, 'Production')).toBe('An earlier publish is still being undone in Production. Publish again in a minute.');
  });
});

describe('userPortalErrorText', () => {
  it('words a coded error', () => {
    expect(userPortalErrorText(new BffError(502, '{"code":"USER_PORTAL_SCOPES_NOT_SYNCED","message":"scopes"}'), 'Production')).toBe("The User Portal's scopes could not be updated. Try again.");
  });

  it("falls back to the API's sentence without a code", () => {
    expect(userPortalErrorText(new BffError(404, '{"message":"component not found"}'), 'Production')).toBe('component not found');
  });
});

describe('shownRefusals', () => {
  const refusal = (code: string) => ({ code, message: code });

  it('drops the rules a deployment would settle when nothing is deployed', () => {
    const reasons = [refusal('USER_PORTAL_NOT_ENABLED'), refusal('USER_PORTAL_NOT_DEPLOYED'), refusal('USER_PORTAL_NO_PUBLIC_ENDPOINT'), refusal('USER_PORTAL_API_KEY')];
    expect(shownRefusals(reasons).map((r) => r.code)).toEqual(['USER_PORTAL_NOT_ENABLED', 'USER_PORTAL_NOT_DEPLOYED']);
  });

  it('drops the gateway security a promotion would bring when nothing is deployed', () => {
    const reasons = [refusal('USER_PORTAL_NOT_DEPLOYED'), refusal('USER_PORTAL_SECURED_BY_PROMOTION')];
    expect(shownRefusals(reasons).map((r) => r.code)).toEqual(['USER_PORTAL_NOT_DEPLOYED']);
  });

  it('keeps every rule of a deployed integration', () => {
    const reasons = [refusal('USER_PORTAL_NO_PUBLIC_ENDPOINT'), refusal('USER_PORTAL_API_KEY')];
    expect(shownRefusals(reasons)).toEqual(reasons);
  });
});
