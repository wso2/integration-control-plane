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
import { matchSample } from './samples';
import type { Repository } from '../types/repository';
import type { Sample } from '../types/samples';

const sample: Sample = {
  displayName: 'Hello World Service',
  description: 'desc',
  componentType: 'service',
  buildPack: 'ballerina',
  repositoryUrl: 'https://github.com/wso2/integration-samples/',
  componentPath: '/integrator-default-profile/samples/hello-world-service',
  thumbnailPath: '',
  tags: [],
};

const repository: Repository = {
  gitProvider: 'github',
  organizationApp: 'wso2',
  nameApp: 'integration-samples',
  branch: 'main',
  appSubPath: 'integrator-default-profile/samples/hello-world-service',
};

describe('matchSample', () => {
  it('matches when repo url, sample path and branch align', () => {
    expect(matchSample(repository, [sample])).toBe(sample);
  });

  it('matches a sub path with a leading slash', () => {
    expect(matchSample({ ...repository, appSubPath: '/integrator-default-profile/samples/hello-world-service' }, [sample])).toBe(sample);
  });

  it('does not match a prebuilt integration in the same repository', () => {
    expect(matchSample({ ...repository, appSubPath: 'integrator-default-profile/samples/salesforceops-to-googlesheets' }, [sample])).toBeUndefined();
  });

  it('does not match another repository', () => {
    expect(matchSample({ ...repository, organizationApp: 'someone' }, [sample])).toBeUndefined();
  });

  it('does not match another branch', () => {
    expect(matchSample({ ...repository, branch: 'dev' }, [sample])).toBeUndefined();
  });

  it('matches a catalog path with a trailing slash', () => {
    expect(matchSample(repository, [{ ...sample, componentPath: `${sample.componentPath}/` }])).toBeDefined();
  });

  it('does not match a repository on another git provider', () => {
    expect(matchSample({ ...repository, gitProvider: 'gitlab' }, [sample])).toBeUndefined();
  });

  it('returns undefined without a repository or samples', () => {
    expect(matchSample(null, [sample])).toBeUndefined();
    expect(matchSample(repository, undefined)).toBeUndefined();
  });
});
