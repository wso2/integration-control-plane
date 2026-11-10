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
import { BI_BUILDPACK } from '../constants/integrations';
import { isAutoDeployOffered } from './autoDeploy';

const offered = (buildpackType: string, displayType: string, componentSubType: string | null = null) => isAutoDeployOffered({ buildpackType, displayType, componentSubType });

describe('isAutoDeployOffered', () => {
  it('is not offered for the integrations ipaas-service deploys itself', () => {
    expect(offered(BI_BUILDPACK, 'ballerinaService')).toBe(false);
    expect(offered('MI', 'miApiService')).toBe(false);
    expect(offered('MI', 'miWebhook')).toBe(false);
    expect(offered('MI', 'miCronjob')).toBe(false);
    expect(offered('MI', 'miEventHandler')).toBe(false);
    expect(offered('MI', 'miApiService', 'miFileIntegration')).toBe(false);
    // An MI display type decides it when the buildpack is not reported.
    expect(offered('', 'miCronjob')).toBe(false);
  });

  it('is offered for agents and for integrations of another runtime', () => {
    expect(offered(BI_BUILDPACK, 'ballerinaService', 'aiAgent')).toBe(true);
    expect(offered('other', 'byocEventHandler')).toBe(true);
  });
});
