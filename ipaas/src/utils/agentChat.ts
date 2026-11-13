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

/**
 * A chat request the browser could not complete. fetch rejects with a TypeError for every
 * network-level failure, and its message differs by browser ("Failed to fetch", "Load failed",
 * "NetworkError when attempting to fetch resource."). A gateway answer without CORS headers
 * lands here too, so the agent may well be running: the gateway may have no route for it yet,
 * which the browser cannot tell apart from an unreachable host.
 */
export const CHAT_UNREACHABLE = "Couldn't reach the agent through its gateway. It may still be deploying, or its endpoint may not be published on the gateway yet. Try again in a minute, and redeploy the agent if this persists.";

/** The gateway is up but has no ready instance of the agent behind it, as while it starts. */
export const chatNotReady = (status: number): string => `The agent isn't ready to answer yet (HTTP ${status}). It may still be starting up; try again in a minute.`;

/** What the chat shows for a request that threw instead of answering. */
export function chatRequestFailure(err: unknown): string {
  if (err instanceof TypeError) return CHAT_UNREACHABLE;
  const msg = err instanceof Error ? err.message : String(err);
  return `Failed to connect: ${msg}`;
}

/** What the chat shows for an answer outside 2xx. HTTP/2 answers carry no status text. */
export function chatResponseFailure(status: number, statusText: string): string {
  if (status === 502 || status === 503 || status === 504) return chatNotReady(status);
  return statusText ? `HTTP ${status} ${statusText}` : `HTTP ${status}`;
}
