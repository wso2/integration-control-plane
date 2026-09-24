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

import { Box, Button, Chip, Typography } from '@wso2/oxygen-ui';
import { Sparkles } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { blankLlm, contextLogoUrl, LLM_PROVIDERS, RECOMMENDED_MODELS } from '../../../constants/contextEngine';
import { blankEmbedding, EMBEDDING_PROVIDERS, ragLogoUrl } from '../../../constants/ragIngestion';
import { canShareApiKey } from '../../../utils/contextEngine';
import ModelProviderColumn from './ModelProviderColumn';
import { modelColumnsSx, recommendedBannerSx, stepHeadingSx, stepHintSx } from '../styles';
import type { LlmConfig, LlmProvider } from '../../../types/contextEngine';
import type { EmbeddingConfig, EmbeddingProvider } from '../../../types/ragIngestion';

interface ModelsStepProps {
  embedding: EmbeddingConfig | null;
  llm: LlmConfig | null;
  shareApiKey: boolean;
  onEmbeddingChange: (value: EmbeddingConfig) => void;
  onLlmChange: (value: LlmConfig) => void;
  onShareApiKeyChange: (value: boolean) => void;
}

const EMBEDDING_OPTIONS = EMBEDDING_PROVIDERS.map((p) => ({ id: p.id, name: p.name, logo: ragLogoUrl(p.logo), models: p.models }));
const LLM_OPTIONS = LLM_PROVIDERS.map((p) => ({ id: p.id, name: p.name, logo: contextLogoUrl(p.logo), models: p.models }));

/** Step 3 — embedding and language model side by side, with a one-click recommended pair. */
export default function ModelsStep({ embedding, llm, shareApiKey, onEmbeddingChange, onLlmChange, onShareApiKeyChange }: ModelsStepProps): JSX.Element {
  const rec = RECOMMENDED_MODELS;
  const isRecommended = embedding?.provider === rec.embedding.provider && embedding.model === rec.embedding.model && llm?.provider === rec.llm.provider && llm.model === rec.llm.model;
  const embeddingName = EMBEDDING_PROVIDERS.find((p) => p.id === rec.embedding.provider)?.name ?? rec.embedding.provider;
  const llmName = LLM_PROVIDERS.find((p) => p.id === rec.llm.provider)?.name ?? rec.llm.provider;

  const applyRecommended = () => {
    // Keep any key already typed so applying the default never throws work away.
    onEmbeddingChange({ ...blankEmbedding(rec.embedding.provider), model: rec.embedding.model, apiKey: embedding?.apiKey ?? '' });
    onLlmChange({ ...blankLlm(rec.llm.provider), model: rec.llm.model, apiKey: llm?.apiKey ?? '' });
    onShareApiKeyChange(true);
  };

  return (
    <>
      <Typography variant="subtitle2" sx={stepHeadingSx}>
        Configure Models
      </Typography>
      <Typography variant="body2" sx={stepHintSx}>
        The embedding model indexes your sources; the language model composes answers from what it finds.
      </Typography>

      <Box sx={recommendedBannerSx}>
        <Box sx={{ color: 'primary.main', display: 'flex' }}>
          <Sparkles size={22} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Recommended pair
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {embeddingName} · {rec.embedding.model} for indexing, {llmName} · {rec.llm.model} for answers. One key, good quality, low cost.
          </Typography>
        </Box>
        {isRecommended ? (
          <Chip size="small" color="success" variant="outlined" label="Applied" />
        ) : (
          <Button variant="outlined" size="small" onClick={applyRecommended}>
            Apply recommended
          </Button>
        )}
      </Box>

      <Box sx={modelColumnsSx}>
        <ModelProviderColumn<EmbeddingConfig>
          title="Embedding model"
          purpose="Turns documents into vectors for retrieval."
          providers={EMBEDDING_OPTIONS}
          value={embedding}
          onChange={onEmbeddingChange}
          blank={(id) => blankEmbedding(id as EmbeddingProvider)}
          modelLabel="Embedding model"
        />
        <ModelProviderColumn<LlmConfig>
          title="Language model"
          purpose="Writes the answer from retrieved evidence."
          providers={LLM_OPTIONS}
          value={llm}
          onChange={onLlmChange}
          blank={(id) => blankLlm(id as LlmProvider)}
          modelLabel="Language model"
          shareKey={{ available: canShareApiKey(embedding, llm), checked: shareApiKey, onChange: onShareApiKeyChange }}
        />
      </Box>
    </>
  );
}
