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

import { type JSX } from 'react';
import { useSearchParams } from 'react-router';
import { useAppNavigate } from '../../../hooks/useAppNavigate';
import { contextEngineUrl } from '../../../paths';
import GraphExplorer from '../graph/GraphExplorer';
import ProvenanceView from '../graph/ProvenanceView';
import type { ContextEngineDetail } from '../../../types/contextEngine';

interface GraphTabProps {
  engine: ContextEngineDetail;
  orgHandle: string;
}

/**
 * The Graph tab: the engine's knowledge graph to explore, or, with `?query=`,
 * how one stored answer was derived from it. `?node=` keeps the chosen node in
 * the URL, so a link from the Playground opens with that passage selected and
 * Back returns to the same view.
 */
export default function GraphTab({ engine, orgHandle }: GraphTabProps): JSX.Element {
  const [params, setParams] = useSearchParams();
  const navigate = useAppNavigate();
  const queryId = params.get('query');
  const node = params.get('node');

  const setNode = (key: string | null) => {
    const next = new URLSearchParams(params);
    if (key) next.set('node', key);
    else next.delete('node');
    setParams(next, { replace: true });
  };

  if (queryId) {
    return (
      <ProvenanceView
        engine={engine}
        orgHandle={orgHandle}
        queryId={queryId}
        initialKey={node}
        onSelectKey={setNode}
        onBackToAnswer={() => navigate(`${contextEngineUrl(orgHandle, engine.id, 'playground')}?open=${encodeURIComponent(queryId)}`)}
        onExit={() => setParams(new URLSearchParams())}
        onExploreEntity={(id) => setParams(new URLSearchParams({ node: id }))}
      />
    );
  }
  return <GraphExplorer engine={engine} orgHandle={orgHandle} initialKey={node} onSelectKey={setNode} onExplain={(id) => setParams(new URLSearchParams({ query: id }))} />;
}
