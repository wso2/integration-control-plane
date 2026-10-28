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
import { CLOUD_EDITOR_READY_TIMEOUT_MS, CLOUD_EDITOR_STEPS, CLOUD_EDITOR_TIMEOUT_MESSAGE } from '../constants/cloudEditor';
import DeploymentWheel from '../components/CloudEditor/DeploymentWheel';
import type { ChoreoSampleImage, CloudEditorStepKey, CodeServerInstance, DeploymentParams } from '../types/cloudEditor';

/**
 * Pull the server's own message out of a BFF failure ({"error":..,"message":..}).
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

        // Readiness is the gate, not the URL: useEditorReady drives the redirect.
        if (!resolved.ready) {
          setStepKey('starting');
          return;
        }
        setStepKey('opening');
        redirect(resolved.url);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      }
    };

    deploy();
  }, [params, createCodeServerMutation, getOrCreateRegistryMutation]);

  // The address is known but the workload may still be starting.
  const awaitingReady = !!instance && !instance.ready;
  const readyQuery = useEditorReady({ userId: params.userId, projectId: params.projectId, componentId: params.componentId }, awaitingReady);

  useEffect(() => {
    if (!awaitingReady) return;
    const current = readyQuery.data;
    if (!current?.ready) return;
    setStepKey('opening');
    // Redirect to the address the server just confirmed, not the one in state.
    redirect(current.url);
  }, [awaitingReady, readyQuery.data]);

  // Polling carries on through failed lookups (a blip during a pod restart is normal), so only
  // the timeout ends the wait; it reports a lookup that was still failing at that point.
  const readyLookupFailingRef = useRef(false);
  readyLookupFailingRef.current = readyQuery.isError;

  // Keep the scale-to-zero timer off the editor for the whole wait.
  useEditorKeepAlive(instance?.url, awaitingReady);

  // Give up if the editor never reports ready.
  useEffect(() => {
    if (!awaitingReady) return undefined;
    const id = window.setTimeout(() => {
      if (hasRedirected.current) return;
      setError(readyLookupFailingRef.current ? 'Could not check whether your Cloud Editor is ready. Please close this window and try again.' : 'Your Cloud Editor setup is taking longer than usual. Please close this window and try again later.');
    }, CLOUD_EDITOR_READY_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [awaitingReady]);

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
