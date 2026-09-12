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

export const containerSx = {
  border: '0.7px solid',
  borderColor: 'primary.main',
  borderRadius: 1.5,
  p: 4,
  maxWidth: 1000,
} as const;

export const titleSx = {
  fontWeight: 600,
} as const;

export const subtitleSx = {
  mt: 0.5,
  mb: 3,
} as const;

export const actionItemSx = {
  color: 'primary.main',
} as const;

export const goButtonSx = {
  flexShrink: 0,
  whiteSpace: 'nowrap',
} as const;
