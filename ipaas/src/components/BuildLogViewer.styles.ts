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

const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

const blink = (name: string, period: string) => ({
  animation: `${name} ${period} steps(1) infinite`,
  [`@keyframes ${name}`]: { '0%, 49%': { opacity: 1 }, '50%, 100%': { opacity: 0 } },
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
});

/** Paper takes its surface from the active colour scheme, so the panel follows light and dark. */
export const paperSx = (fill: boolean) => ({ position: 'relative', display: 'flex', flexDirection: 'column', borderRadius: 0.75, overflow: 'hidden', ...(fill ? { height: '100%' } : { maxHeight: 420 }) }) as const;

export const headerSx = { flexShrink: 0, px: 1.5, py: 0.75, gap: 1.5, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'action.hover' } as const;

export const streamStatusSx = (live: boolean) => ({ display: 'inline-flex', alignItems: 'center', gap: 0.75, fontSize: '12px', fontWeight: 600, color: live ? 'success.main' : 'text.secondary' }) as const;

export const streamDotSx = (live: boolean) => ({ width: 7, height: 7, borderRadius: '50%', bgcolor: live ? 'success.main' : 'text.disabled', flexShrink: 0, ...(live ? blink('buildLogLiveBlink', '1.2s') : {}) }) as const;

export const pendingDotSx = (index: number) =>
  ({
    opacity: 0,
    animation: 'buildLogDots 1.2s infinite',
    animationDelay: `${index * 0.3}s`,
    '@keyframes buildLogDots': { '0%, 20%': { opacity: 0 }, '30%, 80%': { opacity: 1 }, '100%': { opacity: 0 } },
    '@media (prefers-reduced-motion: reduce)': { animation: 'none', opacity: 1 },
  }) as const;

export const lineCountSx = { fontSize: '12px', color: 'text.secondary', fontVariantNumeric: 'tabular-nums' } as const;

export const toolButtonSx = (copied: boolean) => ({ color: copied ? 'success.main' : 'text.secondary', '&:hover': { color: 'text.primary' } }) as const;

export const logBodySx = { flex: '1 1 auto', minHeight: 0, m: 0, px: 2, py: 1.5, overflowY: 'auto', fontFamily: MONO, fontSize: '0.75rem', lineHeight: 1.6, color: 'text.primary', whiteSpace: 'pre-wrap', wordBreak: 'break-all' } as const;

export const waitingSx = { color: 'text.secondary' } as const;

export const cursorSx = { display: 'inline-block', width: '1px', height: '1.1em', ml: 0.5, verticalAlign: 'text-bottom', bgcolor: 'text.primary', ...blink('buildLogCursorBlink', '1s') } as const;

export const loadingSx = { display: 'flex', justifyContent: 'center', py: 3 } as const;

export const jumpButtonSx = { position: 'absolute', right: 16, bottom: 16, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', boxShadow: 3, '&:hover': { bgcolor: 'background.paper' } } as const;
