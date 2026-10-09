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
 * Third Party Services are internal-marketplace services registered from a
 * user-supplied service definition (`isThirdParty=true`, `isTemplated=false`).
 * They share the marketplace API + detail UI with GenAI services; the difference
 * is the register flow (own definition + service type) and the list filter.
 */

/** The service types a third-party service can declare, with the matching marketplace IDL type. */
export const THIRD_PARTY_SERVICE_TYPES: { value: string; label: string; idlType: string }[] = [
  { value: 'REST', label: 'REST', idlType: 'OpenAPI' },
  { value: 'GRAPHQL', label: 'GraphQL', idlType: 'GraphQL' },
  { value: 'SOAP', label: 'SOAP', idlType: 'WSDL' },
  { value: 'ASYNC_API', label: 'AsyncAPI', idlType: 'AsyncAPI' },
  { value: 'GRPC', label: 'gRPC', idlType: 'Proto' },
];

export const THIRD_PARTY_DEFAULT_SERVICE_TYPE = 'REST';

/** IDL type for a given service type (defaults to OpenAPI). */
export function idlTypeForServiceType(serviceType: string): string {
  return THIRD_PARTY_SERVICE_TYPES.find((t) => t.value === serviceType)?.idlType ?? 'OpenAPI';
}

/** Banner illustration path (recolored copy of Devant's ThirdParty.svg). */
export const THIRD_PARTY_BANNER = 'assets/images/third-party-services-banner.svg';
