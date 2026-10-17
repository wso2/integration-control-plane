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

import { Box, Button, CircularProgress, Divider, FormControlLabel, Link, Stack, Switch, Typography } from '@wso2/oxygen-ui';
import { GitBranch } from '@wso2/oxygen-ui-icons-react';
import { useCallback, useRef, useState } from 'react';
import { useUpdateBuildpackConfigs } from '../../hooks/useRepository';
import type { Repository } from '../../types/repository';
import type { BuildEnvVar } from '../../types/build';
import { gitProviderLabel, repoUrl, Row } from '../../utils/build';
import BuildEnvVarsEditor from './BuildEnvVarsEditor';

interface BuildConfigPanelProps {
  repository: Repository;
  componentId: string;
  versionId: string;
  onClose: () => void;
  onNotify: (message: string, severity: 'success' | 'error') => void;
}

export default function BuildConfigPanel({ repository, componentId, versionId, onClose, onNotify }: BuildConfigPanelProps) {
  const { organizationApp, nameApp, branch, gitProvider, buildpackConfig, isBuildConfigurationMigrated } = repository;
  const url = repoUrl(repository);

  const versionConfig = buildpackConfig?.find((c) => c.versionId === versionId) ?? buildpackConfig?.[0];
  // Without buildpackConfig the stored settings are unknown: the builder takes none, or
  // they could not be read. They are then neither shown nor sent, since saving the empty
  // defaults would overwrite what is stored.
  const hasBuildSettings = versionConfig !== undefined;

  const initialEnvVars: BuildEnvVar[] = versionConfig?.keyValues?.map(({ id, key, value }) => ({ id, key, value })) ?? [];

  const [isUnitTestEnabled, setIsUnitTestEnabled] = useState(versionConfig?.isUnitTestEnabled ?? false);
  const [savedUnitTestEnabled, setSavedUnitTestEnabled] = useState(versionConfig?.isUnitTestEnabled ?? false);

  const [isPullLatestSubmodules, setIsPullLatestSubmodules] = useState(versionConfig?.pullLatestSubmodules ?? false);
  const [savedPullLatestSubmodules, setSavedPullLatestSubmodules] = useState(versionConfig?.pullLatestSubmodules ?? false);

  const [envVars, setEnvVars] = useState<BuildEnvVar[]>(initialEnvVars);
  const [savedEnvVars, setSavedEnvVars] = useState<BuildEnvVar[]>(initialEnvVars);
  const [hasEnvVarError, setHasEnvVarError] = useState(false);

  const pendingSaveValue = useRef({ isUnitTestEnabled, isPullLatestSubmodules, envVars });

  const updateBuildpackConfigs = useUpdateBuildpackConfigs();

  const handleEnvVarsChange = useCallback((vars: BuildEnvVar[]) => setEnvVars(vars), []);
  const handleEnvVarError = useCallback((hasError: boolean) => setHasEnvVarError(hasError), []);

  const handleSaveBuildConfig = () => {
    pendingSaveValue.current = { isUnitTestEnabled, isPullLatestSubmodules, envVars: [...envVars] };
    updateBuildpackConfigs.mutate(
      {
        componentId,
        versionId,
        buildContext: versionConfig?.buildContext ?? '',
        languageVersion: versionConfig?.languageVersion ?? '',
        environmentVariables: hasBuildSettings ? envVars : undefined,
        isUnitTestEnabled: hasBuildSettings ? isUnitTestEnabled : undefined,
        pullLatestSubmodules: isPullLatestSubmodules,
        enableTrivyScan: versionConfig?.enableTrivyScan ?? false,
      },
      {
        onSuccess: () => {
          const saved = pendingSaveValue.current;
          setSavedUnitTestEnabled(saved.isUnitTestEnabled);
          setSavedPullLatestSubmodules(saved.isPullLatestSubmodules);
          setSavedEnvVars(saved.envVars);
          onClose();
          onNotify('Build configuration saved successfully.', 'success');
        },
        onError: () => onNotify('Failed to save build configuration. Please try again.', 'error'),
      },
    );
  };

  const isDirty =
    isUnitTestEnabled !== savedUnitTestEnabled ||
    isPullLatestSubmodules !== savedPullLatestSubmodules ||
    JSON.stringify(envVars) !== JSON.stringify(savedEnvVars);

  return (
    <Stack gap={2}>
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2 }}>
        <Stack gap={1.5}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Source Repository
          </Typography>

          <Divider />

          <Row label="Provider">
            <Typography variant="body2">{gitProviderLabel(gitProvider)}</Typography>
          </Row>

          <Row label="Repository">
            {url ? (
              <Link href={url} target="_blank" rel="noopener noreferrer" variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {organizationApp}/{nameApp}
              </Link>
            ) : (
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                {organizationApp}/{nameApp}
              </Typography>
            )}
          </Row>

          <Row label="Branch">
            <Stack direction="row" alignItems="center" gap={0.5}>
              <GitBranch size={13} style={{ opacity: 0.6 }} />
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                {branch || '—'}
              </Typography>
            </Stack>
          </Row>
        </Stack>
      </Box>

      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2 }}>
        <Stack gap={1.5}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Build Options
          </Typography>

          <Divider />

          {hasBuildSettings ? (
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Stack gap={0.25}>
                <Typography variant="body2">Run Unit Tests</Typography>
                <Typography variant="caption" color="text.secondary">
                  Execute unit tests as part of the build process
                </Typography>
              </Stack>
              <FormControlLabel
                control={<Switch checked={isUnitTestEnabled} onChange={(e) => setIsUnitTestEnabled(e.target.checked)} size="small" />}
                label=""
                sx={{ m: 0 }}
              />
            </Stack>
          ) : (
            <Typography variant="caption" color="text.secondary">
              Unit tests and build environment variables aren&apos;t available for this component.
            </Typography>
          )}

          {isBuildConfigurationMigrated && (
            <>
              <Divider />
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Stack gap={0.25}>
                  <Typography variant="body2">Pull Latest Submodules</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Pull the latest version of all git submodules during the build
                  </Typography>
                </Stack>
                <FormControlLabel
                  control={<Switch checked={isPullLatestSubmodules} onChange={(e) => setIsPullLatestSubmodules(e.target.checked)} size="small" />}
                  label=""
                  sx={{ m: 0 }}
                />
              </Stack>
            </>
          )}

          {hasBuildSettings && (
            <>
              <Divider />
              <BuildEnvVarsEditor value={envVars} onChange={handleEnvVarsChange} onHasError={handleEnvVarError} />
            </>
          )}

          <Stack direction="row" justifyContent="flex-end" sx={{ pt: 0.5 }}>
            <Button
              variant="contained"
              size="small"
              onClick={handleSaveBuildConfig}
              disabled={!isDirty || hasEnvVarError || updateBuildpackConfigs.isPending}
              startIcon={updateBuildpackConfigs.isPending ? <CircularProgress color="inherit" size={14} /> : undefined}
            >
              {updateBuildpackConfigs.isPending ? 'Saving' : 'Save'}
            </Button>
          </Stack>
        </Stack>
      </Box>
    </Stack>
  );
}
