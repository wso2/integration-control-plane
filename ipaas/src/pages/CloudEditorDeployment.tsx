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
import { useCreateCodeServer, useEditorKeepAlive, useEditorReady, useGetOrCreateSampleRegistry } from '../hooks/useCloudEditor';
import { useComponentPods } from '../hooks/useRuntime';
import { CLOUD_EDITOR_POLL_MS, CLOUD_EDITOR_READY_TIMEOUT_MS, CLOUD_EDITOR_SLOW_NOTICE_MS, CLOUD_EDITOR_STEPS, CLOUD_EDITOR_TIMEOUT_MESSAGE, CLOUD_EDITOR_TIMEOUT_MS } from '../constants/cloudEditor';
import { displayableEditorUrl, highestPodPhase } from '../utils/cloudEditor';
import DeploymentWheel from '../components/CloudEditor/DeploymentWheel';
import type { ChoreoSampleImage, CloudEditorStepKey, CodeServerInstance, DeploymentParams } from '../types/cloudEditor';

/**
 * Pull the server's own message out of a BFF failure ({"error":..,"message":..}).
 * Duck-typed rather than `instanceof BffError`: #api resolves per product.
 */
function serverDetail(err: unknown): string | null {
  const body = (err as { body?: unknown } | null)?.body;
  if (typeof body !== 'string' || body === '') return null;
  try {
    const parsed = JSON.parse(body) as { message?: unknown };
    if (typeof parsed.message === 'string' && parsed.message) return parsed.message;
  } catch {
    // Not JSON — fall through to the raw body.
  }
  return body.length <= 200 ? body : null;
}

export default function CloudEditorDeployment(): JSX.Element {
  const location = useLocation();
  const [stepKey, setStepKey] = useState<CloudEditorStepKey>('initializing');
  const [error, setError] = useState<string | null>(null);
  const [instance, setInstance] = useState<CodeServerInstance | null>(null);
  const [slowNotice, setSlowNotice] = useState(false);
  const [waitStalled, setWaitStalled] = useState(false);
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
          throw new Error(serverDetail(err) ?? 'Unable to set up the Cloud Editor environment. Please try again or contact support if the problem persists.', { cause: err });
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
          const timedOut = err instanceof Error && err.message === CLOUD_EDITOR_TIMEOUT_MESSAGE;
          const message = timedOut ? 'Your Cloud Editor is taking longer than expected to become ready. Please try again later or contact support.' : 'Unable to start the Cloud Editor. Please try again or contact support if the problem persists.';
          throw new Error(serverDetail(err) ?? message, { cause: err });
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

        const resolved: CodeServerInstance = { ...created, url: editorUrl.toString() };
        setInstance(resolved);
        setStepKey('scheduling');

        // No cluster coordinates (e.g. cloud) → pod status can't be polled.
        if (!resolved.clusterId || !resolved.releaseId || !resolved.namespace) {
          // Readiness is the gate, not the URL: useEditorReady drives the redirect.
          if (!resolved.ready) {
            setStepKey('starting');
            return;
          }
          setStepKey('opening');
          redirect(resolved.url);
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

  // Cloud: the address is known but the workload may still be starting.
  const awaitingReady = !!instance && !instance.ready && !instance.clusterId;
  const readyQuery = useEditorReady({ userId: params.userId, projectId: params.projectId, componentId: params.componentId }, awaitingReady);

  useEffect(() => {
    if (!awaitingReady) return;
    const current = readyQuery.data;
    if (!current?.ready) return;
    setStepKey('opening');
    // Redirect to the address the server just confirmed, not the one in state.
    redirect(current.url);
  }, [awaitingReady, readyQuery.data]);

  // Keep the scale-to-zero timer off the editor for the whole wait.
  useEditorKeepAlive(instance?.url, isPolling || awaitingReady);

  // A cold create waits on a multi-minute image pull, which reads as a hang.
  // Timed from mount: `instance` arriving mid-wait must not restart the clock.
  useEffect(() => {
    const id = window.setTimeout(() => setSlowNotice(true), CLOUD_EDITOR_SLOW_NOTICE_MS);
    return () => clearTimeout(id);
  }, []);

  // The readiness wait has no natural end, so bound it. Non-fatal on purpose: the
  // address is still correct, so the page keeps showing it instead of replacing
  // everything with an error screen.
  useEffect(() => {
    if (!awaitingReady) return undefined;
    const id = window.setTimeout(() => setWaitStalled(true), CLOUD_EDITOR_READY_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [awaitingReady]);

  // A poll that keeps failing after its retries is the same dead end.
  const stalled = waitStalled || (awaitingReady && readyQuery.isError);

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
      {slowNotice && !stalled && (
        <Typography variant="body2" color="text.secondary" textAlign="center">
          First-time setup downloads the editor image and can take a few minutes. Please keep this tab open.
        </Typography>
      )}
      {stalled && (
        <Alert severity="warning" sx={{ maxWidth: 560, width: '100%' }}>
          <Typography variant="body2">Your Cloud Editor is still not responding. It may still be starting — try the address below, or close this tab and open the editor again later. Contact support if it keeps happening.</Typography>
        </Alert>
      )}
      {awaitingReady && instance && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, maxWidth: 560 }}>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            Your editor will be at this address:
          </Typography>
          <Typography variant="body2" fontFamily="monospace" textAlign="center" sx={{ wordBreak: 'break-all' }}>
            {displayableEditorUrl(instance.url)}
          </Typography>
          <Button variant="text" size="small" onClick={() => redirect(instance.url)}>
            Open editor anyway
          </Button>
          <Typography variant="caption" color="text.secondary" textAlign="center">
            It may show a gateway error until the editor finishes starting — refresh if it does.
          </Typography>
        </Box>
      )}
    </Box>
  );
}
