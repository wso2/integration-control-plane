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

import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { useLocation } from 'react-router';
import { Alert, Box, Button, Typography } from '@wso2/oxygen-ui';
import { useCreateCodeServer, useEditorKeepAlive, useGetOrCreateSampleRegistry } from '../hooks/useCloudEditor';
import { useComponentPods } from '../hooks/useRuntime';
import { CLOUD_EDITOR_POLL_MS, CLOUD_EDITOR_STEPS, CLOUD_EDITOR_TIMEOUT_MS } from '../constants/cloudEditor';
import { highestPodPhase } from '../utils/cloudEditor';
import { HttpError } from '../types/http';
import DeploymentWheel from '../components/CloudEditor/DeploymentWheel';
import type { ChoreoSampleImage, CloudEditorStepKey, CodeServerInstance, DeploymentParams } from '../types/cloudEditor';

export default function CloudEditorDeployment(): JSX.Element {
  const location = useLocation();
  const [stepKey, setStepKey] = useState<CloudEditorStepKey>('initializing');
  const [error, setError] = useState<string | null>(null);
  const [instance, setInstance] = useState<CodeServerInstance | null>(null);
  const hasRun = useRef(false);
  const hasRedirected = useRef(false);
  const getOrCreateRegistryMutation = useGetOrCreateSampleRegistry();
  const createCodeServerMutation = useCreateCodeServer();

  const params = useMemo<DeploymentParams>(() => {
    const q = new URLSearchParams(location.search);
    return {
      userId: q.get('userId') ?? '',
      orgUuid: q.get('orgUuid') ?? '',
      orgHandle: q.get('orgHandle') ?? '',
      projectId: q.get('projectId') ?? '',
      componentId: q.get('componentId') ?? '',
      codeServerSample: q.get('codeServerSample') ?? '',
      sourceCommitHash: q.get('sourceCommitHash') ?? '',
    };
  }, [location.search]);

  const redirect = (url: string) => {
    if (hasRedirected.current) return;
    hasRedirected.current = true;
    window.location.replace(url);
  };

  // Provision the editor, then hand off to pod polling (or redirect immediately
  // when the platform can't report pod status — e.g. cloud).
  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const deploy = async () => {
      try {
        if (!params.orgUuid || !params.projectId || !params.componentId || !params.codeServerSample || !params.userId || !params.orgHandle) {
          throw new Error('Missing required deployment parameters. Please close this window and try again.');
        }

        let codeServerSample: ChoreoSampleImage;
        try {
          codeServerSample = JSON.parse(params.codeServerSample) as ChoreoSampleImage;
        } catch {
          throw new Error('Invalid Code Server image data. Please close this window and try again.');
        }
        if (!codeServerSample.image_url) {
          throw new Error('Code Server image URL is missing. Please close this window and try again.');
        }

        setStepKey('creating');
        let registry;
        try {
          registry = await getOrCreateRegistryMutation.mutateAsync(params.orgUuid);
        } catch (err) {
          throw new Error('Unable to set up the Cloud Editor environment. Please try again or contact support if the problem persists.', { cause: err });
        }

        let created: CodeServerInstance;
        try {
          created = await createCodeServerMutation.mutateAsync({
            userId: params.userId,
            organizationId: params.orgUuid,
            projectId: params.projectId,
            componentId: params.componentId,
            orgHandle: params.orgHandle,
            imageUrl: codeServerSample.image_url,
            registryId: registry.id,
            sourceCommitHash: params.sourceCommitHash || undefined,
          });
        } catch (err) {
          // An HttpError here carries a message the API wrote for the user (e.g. the
          // editor quota being full, which tells them how to free one). Show it:
          // replacing it with the generic string is what made a self-fixable
          // condition look like an outage. Anything else is not actionable, so it
          // keeps the generic wording.
          throw new Error(
            err instanceof HttpError
              ? err.message
              : 'Unable to start the Cloud Editor. Please try again or contact support if the problem persists.',
            { cause: err },
          );
        }

        const normalized = created.url.startsWith('http') ? created.url : `https://${created.url}`;
        let editorUrl: URL;
        try {
          editorUrl = new URL(normalized);
        } catch {
          throw new Error('Invalid editor URL returned from server. Please close this window and try again.');
        }
        if (editorUrl.protocol !== 'https:') {
          throw new Error('Editor URL must use HTTPS. Please close this window and try again.');
        }

        const ready: CodeServerInstance = { ...created, url: editorUrl.toString() };
        setInstance(ready);
        setStepKey('scheduling');

        // No cluster coordinates (e.g. cloud) → pod status can't be polled; go straight to the editor.
        if (!ready.clusterId || !ready.releaseId || !ready.namespace) {
          setStepKey('opening');
          redirect(ready.url);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      }
    };

    deploy();
  }, [params, createCodeServerMutation, getOrCreateRegistryMutation]);

  // This page has no component handler/name available (only params.componentId, a UUID) —
  // harmless since cloud's clusterId/namespace are already absent here (see the redirect
  // above), so the query stays disabled on cloud regardless of componentName.
  const podsQuery = useComponentPods(params.projectId, '', instance?.clusterId ?? '', instance?.releaseId ?? '', instance?.namespace ?? '', CLOUD_EDITOR_POLL_MS);
  const pods = useMemo(() => podsQuery.data ?? [], [podsQuery.data]);
  const isAnyPodRunning = pods.some((p) => p.status?.phase === 'Running');
  const isPolling = !!instance?.clusterId && !isAnyPodRunning;

  // Advance the wheel as the pod's conditions progress.
  useEffect(() => {
    if (!instance?.clusterId) return;
    setStepKey(isAnyPodRunning ? 'opening' : highestPodPhase(pods));
  }, [instance, isAnyPodRunning, pods]);

  // Redirect once the pod is running.
  useEffect(() => {
    if (instance && isAnyPodRunning) redirect(instance.url);
  }, [instance, isAnyPodRunning]);

  useEditorKeepAlive(instance?.url, isPolling);

  // Give up if the pod never becomes ready.
  useEffect(() => {
    if (!isPolling) return undefined;
    const id = window.setTimeout(() => {
      if (!hasRedirected.current) setError('Your Cloud Editor setup is taking longer than usual. Please close this window and try again later.');
    }, CLOUD_EDITOR_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [isPolling]);

  const activeIndex = CLOUD_EDITOR_STEPS.findIndex((s) => s.key === stepKey);

  if (error) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 2, p: 4 }}>
        <Alert severity="error" sx={{ maxWidth: 520, width: '100%' }}>
          <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
            Cloud Editor Setup Failed
          </Typography>
          <Typography variant="body2">{error}</Typography>
        </Alert>
        <Button variant="outlined" onClick={() => window.close()}>
          Close Tab
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 4, p: 3 }}>
      <Typography variant="h3" fontWeight={700} textAlign="center">
        Your Cloud Editor instance is currently being created.
      </Typography>
      <DeploymentWheel steps={CLOUD_EDITOR_STEPS} activeIndex={activeIndex} />
    </Box>
  );
}
