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

import { Box, FormControlLabel, Radio, RadioGroup, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { blankLlm, CONTEXT_EMBEDDING_PROVIDERS, contextLogoUrl, EMBEDDING_LOGO_DARK, LLM_PROVIDERS } from '../../../constants/contextEngine';
import { blankEmbedding } from '../../../constants/ragIngestion';
import { canShareApiKey, type AnswerChoice } from '../../../utils/contextEngine';
import ModelProviderColumn from './ModelProviderColumn';
import { modelColumnsSx, stepHeadingAloneSx } from '../styles';
import type { LlmConfig, LlmProvider } from '../../../types/contextEngine';
import type { EmbeddingConfig, EmbeddingProvider } from '../../../types/ragIngestion';

interface ModelsStepProps {
  embedding: EmbeddingConfig | null;
  llm: LlmConfig | null;
  shareApiKey: boolean;
  answerChoice: AnswerChoice;
  answerLlm: LlmConfig | null;
  onEmbeddingChange: (value: EmbeddingConfig) => void;
  onLlmChange: (value: LlmConfig) => void;
  onShareApiKeyChange: (value: boolean) => void;
  onAnswerChoiceChange: (value: AnswerChoice) => void;
  onAnswerLlmChange: (value: LlmConfig) => void;
}

const EMBEDDING_OPTIONS = CONTEXT_EMBEDDING_PROVIDERS.map((p) => ({ id: p.id, name: p.name, logo: contextLogoUrl(p.logo), logoDark: EMBEDDING_LOGO_DARK[p.id] && contextLogoUrl(EMBEDDING_LOGO_DARK[p.id]), models: p.models }));
const LLM_OPTIONS = LLM_PROVIDERS.map((p) => ({ id: p.id, name: p.name, logo: contextLogoUrl(p.logo), logoDark: p.logoDark && contextLogoUrl(p.logoDark), models: p.models }));

const ANSWER_CHOICES: { value: AnswerChoice; label: string }[] = [
  { value: 'same', label: 'Same as the language model' },
  { value: 'different', label: 'A different model' },
  { value: 'off', label: 'Off' },
];

/** Embedding, language and answer model side by side. */
export default function ModelsStep({ embedding, llm, shareApiKey, answerChoice, answerLlm, onEmbeddingChange, onLlmChange, onShareApiKeyChange, onAnswerChoiceChange, onAnswerLlmChange }: ModelsStepProps): JSX.Element {
  return (
    <>
      <Typography variant="subtitle2" sx={stepHeadingAloneSx}>
        Configure Models
      </Typography>

      <Box sx={modelColumnsSx}>
        <ModelProviderColumn<EmbeddingConfig>
          title="Embedding model"
          purpose="Indexes your sources for search."
          providers={EMBEDDING_OPTIONS}
          value={embedding}
          onChange={onEmbeddingChange}
          blank={(id) => blankEmbedding(id as EmbeddingProvider)}
          modelLabel="Embedding model"
        />
        <ModelProviderColumn<LlmConfig>
          title="Language model"
          purpose={answerChoice === 'same' ? 'Builds the graph and writes answers.' : 'Builds the graph.'}
          providers={LLM_OPTIONS}
          value={llm}
          onChange={onLlmChange}
          blank={(id) => blankLlm(id as LlmProvider)}
          modelLabel="Language model"
          shareKey={{ available: canShareApiKey(embedding, llm), checked: shareApiKey, onChange: onShareApiKeyChange }}
        />
        <ModelProviderColumn<LlmConfig>
          key={answerChoice}
          title="Answer model"
          purpose="Writes the cited answers."
          providers={LLM_OPTIONS}
          value={answerLlm}
          onChange={onAnswerLlmChange}
          blank={(id) => blankLlm(id as LlmProvider)}
          modelLabel="Answer model"
          showProviders={answerChoice === 'different'}
          choice={
            <RadioGroup value={answerChoice} onChange={(_e, value) => onAnswerChoiceChange(value as AnswerChoice)} aria-label="Answer model">
              {ANSWER_CHOICES.map((c) => (
                <FormControlLabel key={c.value} value={c.value} control={<Radio size="small" />} label={<Typography variant="body2">{c.label}</Typography>} />
              ))}
            </RadioGroup>
          }
        />
      </Box>
    </>
  );
}
