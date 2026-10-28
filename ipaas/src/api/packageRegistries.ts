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
 * Ballerina Central access token API. Calls the ipaas-service BFF.
 *
 * Org-scoped via the caller's JWT, never a client param
 * (see src/hooks/useBallerinaCentralToken.ts).
 */

import { bff, BffError } from './_client';
import { BALLERINA_CENTRAL_TOKEN_PATH } from '../constants/packageRegistries';
import type { BallerinaCentralTokenStatus } from '../types/packageRegistries';

function tryParseErrorMessage(body: string): string | undefined {
  try {
    return (JSON.parse(body) as { message?: string }).message;
  } catch {
    return undefined;
  }
}

function unwrapError(err: unknown): never {
  const message = err instanceof BffError ? tryParseErrorMessage(err.body) : undefined;
  throw message ? new Error(message) : err;
}

export const fetchBallerinaCentralToken = (): Promise<BallerinaCentralTokenStatus> => bff.get<BallerinaCentralTokenStatus>(BALLERINA_CENTRAL_TOKEN_PATH).catch(unwrapError);

/** Verifies against Ballerina Central before saving; rotates the existing secret on repeat saves. */
export const saveBallerinaCentralToken = (token: string): Promise<BallerinaCentralTokenStatus> => bff.put<BallerinaCentralTokenStatus>(BALLERINA_CENTRAL_TOKEN_PATH, { token }).catch(unwrapError);

/** Idempotent — safe to call even if nothing's configured. */
export const removeBallerinaCentralToken = (): Promise<void> => bff.delete<void>(BALLERINA_CENTRAL_TOKEN_PATH).catch(unwrapError);
