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
import { detectTechnology, isBallerinaWorkspace, extractWorkspaceModules, isBallerinaModule } from './technologyDetection';
import type { RepoMetadata } from '../types/repository';
import type { RepoTreeNode } from '../types/repository';

const baseMetadata: RepoMetadata = {
  isBareRepo: false,
  isSubPathEmpty: false,
  isSubPathValid: true,
  isValidRepo: true,
  hasBallerinaTomlInPath: false,
  hasBallerinaTomlInRoot: false,
  isDockerfilePathValid: true,
  hasDockerfileInPath: false,
  hasPomXmlInPath: false,
  hasPomXmlInRoot: false,
  isBuildpackPathValid: true,
  isProcfileExists: false,
  isEndpointYamlExists: false,
};

describe('detectTechnology', () => {
  it('returns null when metadata is undefined', () => {
    expect(detectTechnology(undefined)).toBe(null);
  });

  it('returns ballerina when a Ballerina.toml is in the sub path', () => {
    expect(detectTechnology({ ...baseMetadata, hasBallerinaTomlInPath: true })).toBe('ballerina');
  });

  it('returns ballerina when a Ballerina.toml is in the root', () => {
    expect(detectTechnology({ ...baseMetadata, hasBallerinaTomlInRoot: true })).toBe('ballerina');
  });

  it('returns mi when a pom.xml is in the sub path', () => {
    expect(detectTechnology({ ...baseMetadata, hasPomXmlInPath: true })).toBe('mi');
  });

  it('returns mi when a pom.xml is in the root', () => {
    expect(detectTechnology({ ...baseMetadata, hasPomXmlInRoot: true })).toBe('mi');
  });

  it('prioritizes ballerina detection over mi detection', () => {
    expect(detectTechnology({ ...baseMetadata, hasBallerinaTomlInRoot: true, hasPomXmlInRoot: true })).toBe('ballerina');
  });

  it('reads the root markers for every spelling of the root path', () => {
    for (const root of ['/', '', '//']) {
      expect(detectTechnology({ ...baseMetadata, hasBallerinaTomlInRoot: true }, root)).toBe('ballerina');
      expect(detectTechnology({ ...baseMetadata, hasPomXmlInRoot: true }, root)).toBe('mi');
    }
  });

  it('returns mi for a pom.xml sub path under a Ballerina repository root', () => {
    expect(detectTechnology({ ...baseMetadata, hasPomXmlInPath: true, hasBallerinaTomlInRoot: true }, '/services/orders')).toBe('mi');
  });

  it('returns ballerina for a Ballerina.toml sub path under an MI repository root', () => {
    expect(detectTechnology({ ...baseMetadata, hasBallerinaTomlInPath: true, hasPomXmlInRoot: true }, '/services/orders')).toBe('ballerina');
  });

  it('ignores the root markers for a sub path that carries none of its own', () => {
    expect(detectTechnology({ ...baseMetadata, hasBallerinaTomlInRoot: true, hasPomXmlInRoot: true }, '/docs')).toBe('non-empty');
  });

  it('reports an empty sub path as empty even when the root has markers', () => {
    expect(detectTechnology({ ...baseMetadata, isSubPathEmpty: true, hasBallerinaTomlInRoot: true }, '/new-module')).toBe('empty');
  });

  it('returns empty when the sub path is empty and no build files are present', () => {
    expect(detectTechnology({ ...baseMetadata, isSubPathEmpty: true })).toBe('empty');
  });

  it('returns non-empty when nothing else matches', () => {
    expect(detectTechnology(baseMetadata)).toBe('non-empty');
  });
});

describe('isBallerinaWorkspace', () => {
  it('returns false when there is no root Ballerina.toml', () => {
    const nodes: RepoTreeNode[] = [{ path: 'src', subPath: 'src', type: 'tree' }];
    expect(isBallerinaWorkspace(nodes)).toBe(false);
  });

  it('returns false when the root Ballerina.toml exists but no subdirectory has one', () => {
    const nodes: RepoTreeNode[] = [
      { path: 'Ballerina.toml', subPath: 'Ballerina.toml', type: 'blob' },
      { path: 'src', subPath: 'src', type: 'tree', children: [{ path: 'src/main.bal', subPath: 'main.bal', type: 'blob' }] },
    ];
    expect(isBallerinaWorkspace(nodes)).toBe(false);
  });

  it('returns true when the root and a subdirectory both have a Ballerina.toml', () => {
    const nodes: RepoTreeNode[] = [
      { path: 'Ballerina.toml', subPath: 'Ballerina.toml', type: 'blob' },
      {
        path: 'service',
        subPath: 'service',
        type: 'tree',
        children: [{ path: 'service/Ballerina.toml', subPath: 'Ballerina.toml', type: 'blob' }],
      },
    ];
    expect(isBallerinaWorkspace(nodes)).toBe(true);
  });

  it('returns false for an empty node list', () => {
    expect(isBallerinaWorkspace([])).toBe(false);
  });

  it('ignores subdirectories without children', () => {
    const nodes: RepoTreeNode[] = [
      { path: 'Ballerina.toml', subPath: 'Ballerina.toml', type: 'blob' },
      { path: 'service', subPath: 'service', type: 'tree' },
    ];
    expect(isBallerinaWorkspace(nodes)).toBe(false);
  });
});

describe('extractWorkspaceModules', () => {
  it('extracts modules from directories containing a Ballerina.toml', () => {
    const nodes: RepoTreeNode[] = [
      {
        path: 'my-service',
        subPath: 'my-service',
        type: 'tree',
        children: [{ path: 'my-service/Ballerina.toml', subPath: 'Ballerina.toml', type: 'blob' }],
      },
    ];
    expect(extractWorkspaceModules(nodes)).toEqual([{ path: 'my-service', name: 'my-service', displayName: 'My Service', integrationType: 'service' }]);
  });

  it('excludes directories without a Ballerina.toml child', () => {
    const nodes: RepoTreeNode[] = [{ path: 'docs', subPath: 'docs', type: 'tree', children: [] }];
    expect(extractWorkspaceModules(nodes)).toEqual([]);
  });

  it('excludes blob nodes', () => {
    const nodes: RepoTreeNode[] = [{ path: 'Ballerina.toml', subPath: 'Ballerina.toml', type: 'blob' }];
    expect(extractWorkspaceModules(nodes)).toEqual([]);
  });

  it('returns an empty array for an empty node list', () => {
    expect(extractWorkspaceModules([])).toEqual([]);
  });
});

describe('isBallerinaModule', () => {
  it('returns true for a tree node with a Ballerina.toml child', () => {
    const node: RepoTreeNode = {
      path: 'my-service',
      subPath: 'my-service',
      type: 'tree',
      children: [{ path: 'my-service/Ballerina.toml', subPath: 'Ballerina.toml', type: 'blob' }],
    };
    expect(isBallerinaModule(node)).toBe(true);
  });

  it('returns false for a blob node', () => {
    const node: RepoTreeNode = { path: 'Ballerina.toml', subPath: 'Ballerina.toml', type: 'blob' };
    expect(isBallerinaModule(node)).toBe(false);
  });

  it('returns false for a tree node without a Ballerina.toml child', () => {
    const node: RepoTreeNode = { path: 'docs', subPath: 'docs', type: 'tree', children: [] };
    expect(isBallerinaModule(node)).toBe(false);
  });

  it('returns false for a tree node with no children', () => {
    const node: RepoTreeNode = { path: 'docs', subPath: 'docs', type: 'tree' };
    expect(isBallerinaModule(node)).toBe(false);
  });
});
