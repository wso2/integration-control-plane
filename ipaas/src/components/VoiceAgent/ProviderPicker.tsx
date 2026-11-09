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

import { Box, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import assemblyaiLogo from '../../assets/voice-providers/assemblyai.svg';
import cartesiaLogo from '../../assets/voice-providers/cartesia.svg';
import deepgramLogo from '../../assets/voice-providers/deepgram.svg';
import elevenlabsLogo from '../../assets/voice-providers/elevenlabs.svg';
import openaiLogo from '../../assets/voice-providers/openai.svg';
import * as styles from './ProviderPicker.styles';

const LOGOS: Record<string, string> = {
  assemblyai: assemblyaiLogo,
  cartesia: cartesiaLogo,
  deepgram: deepgramLogo,
  elevenlabs: elevenlabsLogo,
  openai: openaiLogo,
};

interface ProviderPickerProps {
  label: string;
  providers: readonly { id: string; name: string }[];
  value: string;
  onSelect: (id: string) => void;
  error?: string;
}

export default function ProviderPicker({ label, providers, value, onSelect, error }: ProviderPickerProps): JSX.Element {
  const sorted = [...providers].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Box>
      <Box role="radiogroup" aria-label={label} sx={styles.gridSx}>
        {sorted.map((p) => {
          const selected = p.id === value;
          return (
            <Box key={p.id} component="button" type="button" role="radio" aria-checked={selected} onClick={() => onSelect(p.id)} sx={styles.optionSx}>
              <Box sx={styles.tileSx(selected)}>{LOGOS[p.id] && <Box component="img" src={LOGOS[p.id]} alt="" sx={styles.logoSx} />}</Box>
              <Typography variant="body2" fontWeight={selected ? 600 : 400} sx={styles.captionSx}>
                {p.name}
              </Typography>
            </Box>
          );
        })}
      </Box>
      {error && (
        <Typography variant="caption" color="error" sx={styles.errorSx}>
          {error}
        </Typography>
      )}
    </Box>
  );
}
