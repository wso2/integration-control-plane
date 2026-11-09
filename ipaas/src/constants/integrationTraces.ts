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

/** The observer's largest trace page; it also stops counting matches here. */
export const TRACE_QUERY_LIMIT = 1000;

/** OpenTelemetry's service.name for a process that sets none. */
export const UNKNOWN_SERVICE = 'unknown_service';

/** The newest traces a service's trace list shows; its counts still cover every trace. */
export const SERVICE_TRACE_LIST_LIMIT = 100;

/** Span queries in flight at once while reading the sample. */
export const SPAN_FETCH_CONCURRENCY = 6;
