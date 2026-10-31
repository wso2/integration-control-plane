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
 * The signed-in session as code outside React sees it. The Thunder SDK only
 * hands out tokens through its React context, so AuthProvider connects it here
 * once the SDK has settled — before any child renders, so before any request.
 */

import { isExpired } from './jwt';

export interface CloudUser {
  userId: string;
  username: string;
  displayName: string;
  pictureUrl?: string;
}

export interface CloudSession {
  user: CloudUser;
  /** `ouHandle`: Thunder scopes the token to one org at sign-in. */
  orgHandle: string;
  /** `ouId` */
  orgUuid: string;
}

interface Connection {
  session: CloudSession;
  /** The SDK's getter: always the latest token, refreshed ahead of expiry. */
  getAccessToken: () => Promise<string>;
  /** Ends the session locally once the token has expired anyway. */
  onExpired: () => void;
}

let connection: Connection | null = null;

export function connect(next: Connection): void {
  connection = next;
}

export function disconnect(): void {
  connection = null;
}

export async function getAccessToken(): Promise<string | null> {
  if (!connection) return null;
  return (await connection.getAccessToken()) || null;
}

export async function authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(url, { ...options, headers });

  // The SDK refreshes ahead of expiry, so there is no refresh-and-retry here.
  // A 401 for an expired (or missing) token means the session is over; one for
  // a live token is the API's own answer and goes back to the caller.
  if (res.status === 401 && (!token || isExpired(token))) {
    connection?.onExpired();
  }
  return res;
}

export function getOrgUuidFromToken(): string | null {
  return connection ? connection.session.orgUuid : null;
}

/** The signed-in session, for code outside React (analytics). Null when signed out. */
export function getSession(): CloudSession | null {
  return connection ? connection.session : null;
}
