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
 * Shown when the chat request rejects with a TypeError, which fetch uses for every network-level
 * failure, including a response the browser blocks for missing CORS headers, whatever message
 * the browser gives it.
 */
export const CHAT_UNREACHABLE = "Couldn't reach the agent through its gateway. It may still be deploying, or its endpoint may not be published on the gateway yet. Try again in a minute, and redeploy the agent if this persists.";

/** Shown for a 502, 503 or 504 answer. */
export const chatNotReady = (status: number): string => `The agent isn't ready to answer yet (HTTP ${status}). It may still be starting up; try again in a minute.`;

/** The message for a chat request that rejected. Any error other than a TypeError is shown with its own message. */
export function chatRequestFailure(err: unknown): string {
  if (err instanceof TypeError) return CHAT_UNREACHABLE;
  const msg = err instanceof Error ? err.message : String(err);
  return `Failed to connect: ${msg}`;
}

/** The message for a chat answer outside 2xx. An empty status text is left out. */
export function chatResponseFailure(status: number, statusText: string): string {
  if (status === 502 || status === 503 || status === 504) return chatNotReady(status);
  return statusText ? `HTTP ${status} ${statusText}` : `HTTP ${status}`;
}
