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

import { bff, BffError, items, q, seg, type ListResponse } from './_client';
import type { Repository, Commit, UserRepo, RepoBranch, RepoMetadata, RepoTreeNode, ChoreoSampleImageEntry } from '../types/repository';
import type { UpdateBuildpackConfigsInput } from '../types/build';

// ---------------------------------------------------------------------------
// GitHub App (private repos)
//
// The BFF proxies git-app-service under /git/github/*: the user authorizes the
// platform GitHub App once (popup -> /ghapp -> code -> POST installations) and
// repos/branches/trees are then listed per installation — no PAT, no stored
// credential. Wire shapes below mirror git-app-service's DTOs.
// ---------------------------------------------------------------------------

interface GitInstallation {
  installationId: number;
  githubAccount: string;
}

interface GitRepo {
  fullName: string;
  name: string;
  owner: string;
  private: boolean;
  defaultBranch: string;
}

interface GitTreeEntry {
  path: string;
  type: string; // 'tree' | 'blob'
}

// GET repos answers 409 with this marker when the user's GitHub authorization
// expired or was revoked — the UI falls back to the Authorize button.
const GITHUB_AUTH_REQUIRED = 'github-auth-required';

const isGitHubAuthRequired = (err: unknown): boolean => err instanceof BffError && err.status === 409 && err.body.includes(GITHUB_AUTH_REQUIRED);

// The shared branch/tree signatures identify a repo by owner+name only, so the
// installation that grants access is resolved through this index, rebuilt on
// every fetchGitHubUserRepos (the wizard always lists repos before drilling in).
interface OwnerIndexEntry {
  installationId: number;
  defaultBranchByRepo: Map<string, string>;
}

let repoIndex = new Map<string, OwnerIndexEntry>();

async function resolveInstallation(owner: string): Promise<OwnerIndexEntry | undefined> {
  const key = owner.toLowerCase();
  if (!repoIndex.has(key)) {
    // Cold cache (page reload straight into a deep link) — refresh once.
    await fetchGitHubUserRepos();
  }
  return repoIndex.get(key);
}

const REPO_METADATA_DEFAULT: RepoMetadata = {
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

// A reachable repo whose tree is empty: the sub-path holds no files, so the
// import flow must detect "empty" (not fall back to "non-empty"). Distinct from
// REPO_METADATA_DEFAULT, which stands in only when the tree can't be fetched.
const REPO_METADATA_EMPTY: RepoMetadata = {
  ...REPO_METADATA_DEFAULT,
  isSubPathValid: false,
  isSubPathEmpty: true,
};

// BFF ComponentRepository fields map 1:1 to Repository; projectName scopes
// the lookup to the component within the caller's namespace.
export async function fetchComponentRepository(projectId: string, componentHandler: string): Promise<Repository | null> {
  try {
    return (await bff.get<Repository | null>(`/components/${seg(componentHandler)}/repository${q({ projectName: projectId })}`)) ?? null;
  } catch {
    return null;
  }
}

// BFF derives the commit list from GitHub for the given branch; the Commit
// model matches Commit field-for-field.
export async function fetchCommitHistory(componentId: string, branch: string): Promise<Commit[]> {
  try {
    return items(await bff.get<ListResponse<Commit>>(`/components/${seg(componentId)}/commit-history${q({ branch })}`));
  } catch {
    return [];
  }
}

// Lists the caller's App-accessible repos, one UserRepo per installation
// (orgName = the GitHub account the App is installed on). Also rebuilds the
// owner -> installation index used by the branch/tree lookups. Empty on
// expired authorization (409 github-auth-required) so the wizard falls back
// to the Authorize button. Repos are read through the GitHub App.
export async function fetchGitHubUserRepos(): Promise<UserRepo[]> {
  try {
    const installations = items(await bff.get<ListResponse<GitInstallation>>('/git/github/installations'));
    const index = new Map<string, OwnerIndexEntry>();
    const indexEntry = (owner: string, installationId: number): OwnerIndexEntry => {
      const key = owner.toLowerCase();
      let entry = index.get(key);
      if (!entry) {
        entry = { installationId, defaultBranchByRepo: new Map() };
        index.set(key, entry);
      }
      return entry;
    };

    const userRepos = (
      await Promise.all(
        installations.map(async (inst): Promise<UserRepo | null> => {
          try {
            const repos = items(await bff.get<ListResponse<GitRepo>>(`/git/github/repos${q({ installationId: inst.installationId })}`));
            indexEntry(inst.githubAccount, inst.installationId);
            for (const r of repos) {
              // Repos shared into an installation can carry an owner different
              // from the installation account — index both.
              indexEntry(r.owner || inst.githubAccount, inst.installationId).defaultBranchByRepo.set(r.name, r.defaultBranch);
            }
            return {
              orgName: inst.githubAccount,
              installationId: String(inst.installationId),
              repositories: repos.map((r) => ({ name: r.name })),
            };
          } catch (err) {
            // Expired/revoked authorization affects every installation — rethrow
            // so the outer handler falls back to the Authorize button. Anything
            // else (e.g. one suspended installation) drops only that account and
            // keeps the user's other installations listed.
            if (isGitHubAuthRequired(err)) throw err;
            console.error(`[cloud] fetchGitHubUserRepos: listing repos for installation ${inst.installationId} failed:`, err);
            return null;
          }
        }),
      )
    ).filter((r): r is UserRepo => r !== null);

    repoIndex = index;
    return userRepos;
  } catch (err) {
    if (!isGitHubAuthRequired(err)) {
      console.error('[cloud] fetchGitHubUserRepos failed:', err);
    }
    return [];
  }
}

// Private repos list branches through the App installation (bare names from
// the BFF; isDefault stamped from the repos listing). Public repos keep the
// anonymous BFF route, which stamps isDefault itself.
export async function fetchRepoBranches(repoOrg: string, repoName: string, isPublicRepo: boolean): Promise<RepoBranch[]> {
  try {
    if (!isPublicRepo) {
      const entry = await resolveInstallation(repoOrg);
      if (entry) {
        const names = items(await bff.get<ListResponse<string>>(`/git/github/branches${q({ installationId: entry.installationId, owner: repoOrg, repo: repoName })}`));
        const defaultBranch = entry.defaultBranchByRepo.get(repoName);
        return names.map((name) => ({ name, isDefault: name === defaultBranch }));
      }
      // No installation covers this owner — fall through to the anonymous
      // route, which still works for public repos.
    }
    return items(await bff.get<ListResponse<RepoBranch>>(`/repos/${seg(repoOrg)}/${seg(repoName)}/branches`));
  } catch {
    return [];
  }
}

// Flatten the nested GitHub tree into full blob paths from the repo root
// (e.g. "samples/svc/Ballerina.toml").
function collectBlobPaths(nodes: RepoTreeNode[], acc: string[] = []): string[] {
  for (const n of nodes) {
    if (n.type === 'blob') acc.push(n.path);
    if (n.children?.length) collectBlobPaths(n.children, acc);
  }
  return acc;
}

// Derived from the wired tree endpoint because the BFF has no repoMetadata
// equivalent. We compute only the flags the import flow uses for technology
// detection + sub-path validation; on any failure we fall back to the default
// so the importer degrades to "non-empty" rather than hanging.
export async function fetchRepoMetadata(org: string, repo: string, branch: string, subPath: string, isPublicRepo = false): Promise<RepoMetadata> {
  try {
    const tree = await fetchRepoContents(org, repo, branch, isPublicRepo);
    if (tree.length === 0) return REPO_METADATA_EMPTY;

    const blobs = collectBlobPaths(tree);
    const norm = subPath.replace(/^\/+/, '').replace(/\/+$/, '');
    const atRoot = (file: string) => blobs.includes(file);
    const atPath = (file: string) => (norm === '' ? atRoot(file) : blobs.includes(`${norm}/${file}`));
    const childrenOfPath = norm === '' ? blobs : blobs.filter((p) => p.startsWith(`${norm}/`));

    return {
      ...REPO_METADATA_DEFAULT,
      isValidRepo: true,
      isSubPathValid: norm === '' || childrenOfPath.length > 0,
      isSubPathEmpty: childrenOfPath.length === 0,
      hasBallerinaTomlInRoot: atRoot('Ballerina.toml'),
      hasBallerinaTomlInPath: atPath('Ballerina.toml'),
      hasPomXmlInRoot: atRoot('pom.xml'),
      hasPomXmlInPath: atPath('pom.xml'),
      hasDockerfileInPath: atPath('Dockerfile'),
      isProcfileExists: atPath('Procfile'),
      isEndpointYamlExists: atPath('endpoints.yaml') || atPath('endpoint.yaml'),
    };
  } catch {
    return REPO_METADATA_DEFAULT;
  }
}

// The BFF advertises the deployable sample images; today that is only the
// Cloud Editor ("Code Server") image, resolved from server config. An empty
// list keeps the editor entry points hidden, so failures degrade the same way
// as an unconfigured environment.
export async function fetchChoreoSampleImages(_orgUuid: string, _projectId: string): Promise<ChoreoSampleImageEntry[]> {
  try {
    return items(await bff.get<ListResponse<ChoreoSampleImageEntry>>('/samples/images'));
  } catch (err) {
    // Log so a failing BFF is distinguishable from a deliberately disabled feature.
    console.error('[cloud] fetchChoreoSampleImages failed, hiding sample images:', err);
    return [];
  }
}

// Saves the unit test opt-in, the submodule setting and the build environment
// variables (key/value only; `id` is a UI row key).
export async function updateBuildpackConfigs(input: UpdateBuildpackConfigsInput): Promise<string> {
  await bff.put(`/components/${seg(input.componentId)}/buildpack-config`, {
    isUnitTestEnabled: input.isUnitTestEnabled,
    pullLatestSubmodules: input.pullLatestSubmodules,
    environmentVariables: input.environmentVariables?.map(({ key, value }) => ({ key, value })),
  });
  return '';
}

// Binds the user's GitHub App installations after the authorize popup: the
// BFF exchanges the OAuth code and discovers the installations server-side.
// 409 = authorized but the App is not installed anywhere yet — the caller
// should open the App installation page (needsInstallation).
export async function obtainGithubToken(authorizationCode: string): Promise<{ success: boolean; message: string; needsInstallation?: boolean }> {
  try {
    await bff.post('/git/github/installations', { code: authorizationCode });
    return { success: true, message: '' };
  } catch (err) {
    if (err instanceof BffError && err.status === 409) {
      return { success: false, message: 'The GitHub App is not installed on any of your accounts.', needsInstallation: true };
    }
    console.error('[cloud] GitHub installation binding failed:', err);
    return { success: false, message: 'Failed to connect your GitHub account. Please try again.' };
  }
}

// Assemble git-app-service's flat tree listing into the nested RepoTreeNode
// shape the import flow consumes (subPath = leaf name, children on trees).
// Intermediate directories are created defensively rather than assuming the
// listing includes every parent dir before its children.
function buildRepoTree(entries: GitTreeEntry[]): RepoTreeNode[] {
  const root: RepoTreeNode[] = [];
  const dirs = new Map<string, RepoTreeNode>();

  const childrenOf = (dirPath: string): RepoTreeNode[] => {
    if (dirPath === '') return root;
    let node = dirs.get(dirPath);
    if (!node) {
      node = { path: dirPath, subPath: dirPath.split('/').pop() ?? dirPath, type: 'tree', children: [] };
      dirs.set(dirPath, node);
      const parent = dirPath.includes('/') ? dirPath.slice(0, dirPath.lastIndexOf('/')) : '';
      childrenOf(parent).push(node);
    }
    return (node.children ??= []);
  };

  for (const entry of [...entries].sort((a, b) => a.path.localeCompare(b.path))) {
    if (!entry.path) continue;
    if (entry.type === 'tree' || entry.type === 'dir') {
      childrenOf(entry.path);
      continue;
    }
    const parent = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : '';
    childrenOf(parent).push({ path: entry.path, subPath: entry.path.split('/').pop() ?? entry.path, type: 'blob' });
  }
  return root;
}

// Private repos read the tree through the App installation (flat listing,
// nested here); public repos keep the anonymous BFF route, which assembles
// the nested tree server-side. Empty on any failure so the importer doesn't
// retry-spin.
export async function fetchRepoContents(org: string, repo: string, branch: string, isPublicRepo = false): Promise<RepoTreeNode[]> {
  try {
    if (!isPublicRepo) {
      const entry = await resolveInstallation(org);
      if (entry) {
        const res = await bff.get<{ items: GitTreeEntry[]; truncated?: boolean }>(`/git/github/tree${q({ installationId: entry.installationId, owner: org, repo, branch })}`);
        if (res?.truncated) {
          console.warn(`[cloud] repo tree for ${org}/${repo}@${branch} is truncated; the directory picker may be incomplete`);
        }
        return buildRepoTree(res?.items ?? []);
      }
      // No installation covers this owner — fall through to the anonymous
      // route, which still works for public repos.
    }
    return items(await bff.get<ListResponse<RepoTreeNode>>(`/repos/${seg(org)}/${seg(repo)}/contents${q({ branch })}`));
  } catch {
    return [];
  }
}
