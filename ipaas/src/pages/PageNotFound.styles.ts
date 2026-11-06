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

export const pageSx = {
  display: 'flex',
  flex: 1,
  alignItems: 'center',
  justifyContent: 'center',
  p: 4,
} as const;

export const fullScreenSx = { minHeight: '100vh' } as const;

/**
 * The illustration's motion: the page floats, the magnifier sweeps across it, the halo
 * breathes, the address-bar caret blinks and the sparkles twinkle. The halo scales about
 * its own centre, so it needs `transformBox: fill-box`.
 */
export const artSx = {
  color: 'primary.main',
  width: 260,
  maxWidth: '100%',
  '& svg': { display: 'block', width: '100%', height: 'auto' },
  '& .nf-halo': { transformBox: 'fill-box', transformOrigin: 'center', animation: 'nfPulse 7s ease-in-out infinite' },
  '& .nf-page': { animation: 'nfFloat 7s ease-in-out infinite' },
  '& .nf-lens': { animation: 'nfScan 5.5s ease-in-out infinite' },
  '& .nf-caret': { animation: 'nfBlink 1.1s steps(1) infinite' },
  '& .nf-spark': { animation: 'nfTwinkle 3.4s ease-in-out infinite' },
  '& .nf-spark-alt': { animation: 'nfTwinkle 4.2s ease-in-out .6s infinite' },
  '@keyframes nfPulse': { '0%, 100%': { transform: 'scale(1)' }, '50%': { transform: 'scale(1.06)' } },
  '@keyframes nfFloat': { '0%, 100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
  '@keyframes nfScan': { '0%, 100%': { transform: 'translate(-26px, 4px)' }, '50%': { transform: 'translate(18px, -6px)' } },
  '@keyframes nfBlink': { '0%, 49%': { opacity: 1 }, '50%, 100%': { opacity: 0 } },
  '@keyframes nfTwinkle': { '0%, 100%': { opacity: 0.25 }, '50%': { opacity: 1 } },
  '@media (prefers-reduced-motion: reduce)': {
    '& .nf-halo, & .nf-page, & .nf-lens, & .nf-caret, & .nf-spark, & .nf-spark-alt': { animation: 'none' },
  },
} as const;

export const textStackSx = {
  maxWidth: 420,
  textAlign: 'center',
} as const;

export const actionSx = {
  mt: 2.5,
  borderRadius: 999,
  px: 2.75,
} as const;
