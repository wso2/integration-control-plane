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

import type { ReactNode } from 'react';
import type { KnowledgeBase } from '../../types/knowledgeBase';
import { retrievalUnavailableReason } from '../../utils/knowledgeBase';
import RetrievalChat from './RetrievalChat';
import { Scopes } from '../../constants/permissions';
import { useCan } from '../../hooks/useCan';

/** The retrieval test for a knowledge base, queried as `componentId`. */
export default function KnowledgeBaseRetrieval({ knowledgeBase, componentId }: { knowledgeBase: KnowledgeBase; componentId: string }): ReactNode {
  const refusal = useCan()(Scopes.ENDPOINT_TEST) ? null : "Your role can't query knowledge bases.";
  return <RetrievalChat knowledgeBase={knowledgeBase} componentId={componentId} unavailableReason={refusal ?? retrievalUnavailableReason(knowledgeBase)} />;
}
