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
import { Alert, Box, CircularProgress, colors, useTheme } from '@wso2/oxygen-ui';
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { getMoesifCanvasTemplate } from '../assets/moesifCanvasTemplate';

// Message types exchanged with the embedded Moesif canvas over postMessage.
// Kept in sync with Moesif's embedded canvas protocol (mirrors the reference
// implementation in wso2/identity-apps moesif-canvas-iframe.tsx).
const MSG = {
  CANVAS_INIT: 'CANVAS_INIT',
  CANVAS_READY: 'CANVAS_READY',
  CANVAS_RESIZE: 'CANVAS_RESIZE',
  ORG_LOAD_FINISHED: 'ORG_LOAD_FINISHED',
  REFRESH_TOKEN: 'REFRESH_TOKEN',
  SET_TOKEN: 'SET_TOKEN',
} as const;

// Minimum canvas height until the iframe reports its real content height.
const CANVAS_MIN_HEIGHT = 600;

// Development-only diagnostics. Deliberately logs only the message/event type —
// never embed URLs, origins, token metadata or event payloads — so no sensitive
// data leaks into the console in production builds.
const debug = (...args: unknown[]): void => {
  if (import.meta.env.DEV) {
    console.log('[MoesifCanvas]', ...args);
  }
};

// Embeds the Moesif metrics canvas in an iframe and drives the postMessage
// handshake: once the iframe DOM loads we send SET_TOKEN (the auth token), and
// once the iframe reports both ORG_LOAD_FINISHED and CANVAS_READY we send
// CANVAS_INIT (the dashboard template + theme). The canvas reports its content
// height via CANVAS_RESIZE, and may ask for a fresh token via REFRESH_TOKEN.
// A single runtime the canvas can be filtered by: `value` is the actual runtime
// id (matched against the metric tag / log attribute) and `label` is the
// user-facing name, always qualified by the owning integration (see
// runtimeOptionLabel in utils/moesifRuntimeOptions).
export interface RuntimeOption {
  label: string;
  value: string;
}

export default function MoesifCanvas({
  embedUrl,
  token,
  isMI,
  runtimeIds = [],
  onRefreshToken,
  template: templateOverride,
}: {
  embedUrl: string;
  token: string;
  isMI: boolean;
  runtimeIds?: RuntimeOption[];
  onRefreshToken?: () => void;
  // Optional canvas template to render instead of the default metrics canvas
  // (BI/MI). Used to embed a different canvas — e.g. the application logs canvas
  // — through the same postMessage handshake. When omitted, the metrics canvas
  // template selected by `isMI` is used.
  template?: unknown;
}): JSX.Element {
  const theme = useTheme();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeHeight, setIframeHeight] = useState<number>(CANVAS_MIN_HEIGHT);
  // Bumped on every iframe document load (initial load and any subsequent
  // reload). Using a counter instead of a boolean guarantees the SET_TOKEN
  // effect re-runs on every load — a false→true boolean reset would batch to a
  // no-op on reloads and never re-fire the handshake without a remount.
  const [loadGeneration, setLoadGeneration] = useState(0);
  const [orgLoaded, setOrgLoaded] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);

  // The dashboard/workspace definitions the canvas renders. A caller-supplied
  // template (e.g. the application logs canvas) takes precedence; otherwise the
  // metrics canvas (BI vs MI) is used.
  const template = useMemo(() => templateOverride ?? getMoesifCanvasTemplate(isMI), [templateOverride, isMI]);

  // Stable, order-independent key for the integration's runtime ids so the
  // CANVAS_INIT effect only re-fires when the actual set of runtimes changes
  // (a fresh array prop on every render would otherwise retrigger it).
  const runtimeIdsKey = useMemo(
    () =>
      runtimeIds
        .map((r) => r.value)
        .sort()
        .join(','),
    [runtimeIds],
  );

  // Only accept/post messages to the canvas' own origin (derived from the embed
  // URL). If the backend-generated embed URL can't be parsed we treat it as a
  // configuration fault: the origin stays empty and all origin-scoped messaging
  // is skipped (we never broadcast to '*', which would leak the auth token).
  const embeddedOrigin = useMemo(() => {
    try {
      return new URL(embedUrl).origin;
    } catch {
      console.error('[MoesifCanvas] unparsable embed URL; messaging disabled');
      return '';
    }
  }, [embedUrl]);

  // Brand-aligned palette for the canvas charts.
  const chartColors = useMemo(() => [colors.orange[500], colors.deepOrange[500], colors.amber[600], colors.blue[500], colors.teal[500], colors.green[600], colors.indigo[400], colors.purple[400]], []);

  // Always send the latest token (used when the canvas requests a refresh).
  const tokenRef = useRef(token);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  const post = (message: { type?: string } & Record<string, unknown>): void => {
    // Without a known canvas origin we cannot safely scope the message, so skip
    // it entirely rather than broadcasting to '*' (which would leak SET_TOKEN).
    if (!embeddedOrigin) {
      debug('skipping post; embed origin unknown', message.type);
      return;
    }

    debug('→ post', message.type);
    iframeRef.current?.contentWindow?.postMessage(message, embeddedOrigin);
  };

  // Deliver the auth token once the iframe DOM has loaded and a token exists.
  // Re-runs when the token is refreshed by the parent so the canvas never uses
  // an expired token.
  useEffect(() => {
    if (loadGeneration > 0 && token) {
      post({ token, type: MSG.SET_TOKEN });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadGeneration, token]);

  // Initialise the canvas (template + theme) only after the iframe reports that
  // both the org has loaded and the canvas is ready.
  useEffect(() => {
    if (orgLoaded && canvasReady) {
      // Scope the canvas to the runtimes in view via the dashboard's `runtimeId`
      // context filter (declared in the canvas template's
      // dashboards[].filters.context). The filter is a multi-select
      // `parentOptions` dropdown: `options` lists every runtime (user-facing
      // `label` + actual runtime id `value`) and `value` carries the
      // pre-selection. Every runtime is pre-selected so the canvas opens on all
      // the data in scope (matching the OpenSearch views, which default to all
      // integrations) rather than on one arbitrary runtime; narrowing is then
      // done in the dropdown. Only sent when runtimes are known so the canvas
      // falls back to its unfiltered view otherwise.
      const context = runtimeIds.length > 0 ? { runtimeId: { value: runtimeIds.map((r) => r.value), options: runtimeIds.map((r) => ({ label: r.label, value: r.value })) } } : {};
      if (import.meta.env.DEV) {
        console.log('[MoesifCanvas] CANVAS_INIT context', { runtimeIds, runtimeIdsKey, context });
      }
      post({
        template,
        context,
        theme: {
          autoHeight: true,
          brandColor: theme.palette.primary.main,
          brandTextColor: theme.palette.primary.main,
          chartColors,
          navigation: { showIcons: false, type: 'tabs' },
        },
        type: MSG.CANVAS_INIT,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgLoaded, canvasReady, template, theme.palette.primary.main, chartColors, runtimeIdsKey]);

  // Handle messages coming back from the canvas iframe.
  useEffect(() => {
    const handler = (event: MessageEvent): void => {
      const data = event.data as { type?: string; height?: number };
      // Only trust messages sent by our own canvas iframe's window. This drops
      // this app's own postMessages (Vite HMR, React refresh, etc.) and any
      // other frames without discarding legitimate messages that happen to share
      // our window origin.
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }
      debug('← message', data?.type);
      // If we have no known canvas origin (unparsable embed URL) we cannot trust
      // any sender, so drop the message. Otherwise enforce an exact origin match.
      if (!embeddedOrigin || event.origin !== embeddedOrigin) {
        debug('dropped message from unexpected origin', data?.type);
        return;
      }
      switch (data?.type) {
        case MSG.ORG_LOAD_FINISHED:
          setOrgLoaded(true);
          break;
        case MSG.CANVAS_READY:
          setCanvasReady(true);
          break;
        case MSG.CANVAS_RESIZE:
          if (Number.isFinite(data.height) && (data.height as number) > 0) {
            setIframeHeight(Math.ceil(data.height as number));
          }
          break;
        case MSG.REFRESH_TOKEN:
          // Ask the parent to mint a fresh token; also resend the current one so
          // the canvas keeps working until the new token arrives via props.
          onRefreshToken?.();
          if (tokenRef.current) {
            post({ token: tokenRef.current, type: MSG.SET_TOKEN });
          }
          break;
        default:
          break;
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embeddedOrigin, onRefreshToken]);

  const ready = orgLoaded && canvasReady;
  // An empty origin means the backend-supplied embed URL failed to parse. The
  // handshake can never complete in that state, so surface a configuration error
  // rather than leaving the user on an indefinite loading spinner.
  const invalidEmbedUrl = !embeddedOrigin;

  if (invalidEmbedUrl) {
    return (
      <Box sx={{ width: '100%', minHeight: CANVAS_MIN_HEIGHT, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Alert severity="error">Unable to load the Moesif metrics canvas: the dashboard embed URL is misconfigured. Please contact your administrator.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ position: 'relative', width: '100%', minHeight: CANVAS_MIN_HEIGHT }}>
      {!ready && (
        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <CircularProgress size={28} />
        </Box>
      )}
      <iframe
        ref={iframeRef}
        title="Moesif metrics canvas"
        src={embedUrl}
        scrolling="no"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        // The canvas derives the parent origin from document.referrer and only
        // posts CANVAS_RESIZE / CANVAS_RENDERED to it; with no referrer those
        // messages are dropped and the iframe stays clipped at the min height.
        // strict-origin sends just the origin, never the ICP path.
        referrerPolicy="strict-origin"
        onLoad={() => {
          debug('iframe onLoad');
          // A fresh document is loaded: drop any prior handshake state so the
          // CANVAS_INIT gate (orgLoaded && canvasReady) waits for the reloaded
          // canvas to re-announce itself, and bump the load generation so the
          // SET_TOKEN effect re-fires and re-delivers the token to the new
          // document. This reissues the full handshake on every reload without
          // needing a component remount.
          setOrgLoaded(false);
          setCanvasReady(false);
          setLoadGeneration((generation) => generation + 1);
        }}
        style={{ width: '100%', height: iframeHeight, minHeight: CANVAS_MIN_HEIGHT, border: 'none', visibility: ready ? 'visible' : 'hidden' }}
      />
    </Box>
  );
}
