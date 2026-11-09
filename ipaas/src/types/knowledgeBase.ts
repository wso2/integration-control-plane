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
 * A RAG knowledge base: a vector store, an embedding model and a chunking
 * configuration, served by a KB Service deployed to `environment`, the one the
 * BFF runs knowledge bases in.
 * `config` holds the settings exactly as the service reads them
 * (`VECTORDB_PROVIDER`, `COLLECTION_NAME`, …); secret values never leave the
 * BFF, so only their names are known.
 */
export interface KnowledgeBase {
  name: string;
  displayName: string;
  description: string;
  /** The project holding the KB Service and its data sources. */
  projectName: string;
  environment: string;
  config: Record<string, string>;
  secretKeys: string[];
  /** KB Service deployment status: ACTIVE, IN_PROGRESS, ERROR, SUSPENDED, or '' before the first rollout; CREATING while its create runs, FAILED if it did not finish. */
  status: string;
  /** Why the create FAILED; '' otherwise. */
  error: string;
  /** The KB Service's URL on the API Platform gateway, which takes an API key; '' until it is exposed there. */
  serviceUrl: string;
  /** How putting the KB Service's API on the gateway is going, while it has no `serviceUrl`; absent when unknown. */
  apiStatus?: KnowledgeBaseApiStatus;
  dataSources: KnowledgeBaseDataSource[];
  createdAt: string;
  /** When the KB Service last changed state, which a redeploy does; absent from older BFFs. */
  updatedAt?: string;
}

/** The last run of the reconciliation that puts a KB Service's API on the gateway, as a deploy's is recorded. */
export interface KnowledgeBaseApiStatus {
  /** PENDING, RUNNING, SUCCEEDED, DEGRADED, FAILED, … */
  status: string;
  /** A stable code, such as GATEWAY_UNAVAILABLE or GATEWAY_PROVISIONING. */
  error?: string;
  nextRetryAt?: string;
}

/** An ingestion job that loads a Google Drive folder or S3 bucket into its knowledge base. */
export interface KnowledgeBaseDataSource {
  /** The ingestion integration's handler. */
  name: string;
  displayName: string;
  config: Record<string, string>;
  secretKeys: string[];
  /** '' for a source that runs only when triggered. */
  cronExpression: string;
  cronTimezone: string;
  /** Deployment status, as for a knowledge base, CREATING and FAILED included. */
  status: string;
  /** Why the create FAILED; '' otherwise. */
  error: string;
  /** Set when a one-time source's first ingestion, started after its create, could not be started; '' otherwise. */
  firstRunError: string;
  releaseName: string;
  createdAt: string;
}

/** Settings split the way the BFF stores them: plain values and secrets. */
export interface KnowledgeBaseSettings {
  config: Record<string, string>;
  secrets: Record<string, string>;
}

export interface CreateKnowledgeBaseDataSourceInput extends KnowledgeBaseSettings {
  name: string;
  displayName: string;
  /** '' runs the ingestion once, now. */
  cronExpression: string;
  cronTimezone: string;
}

export interface CreateKnowledgeBaseInput extends KnowledgeBaseSettings {
  name: string;
  displayName: string;
  description: string;
  dataSource: CreateKnowledgeBaseDataSourceInput | null;
}

/**
 * `secrets` is the full set to keep: a secret sent as '' keeps its stored
 * value, and one left out is removed.
 */
export interface UpdateKnowledgeBaseInput extends KnowledgeBaseSettings {
  displayName: string;
  description: string;
}
