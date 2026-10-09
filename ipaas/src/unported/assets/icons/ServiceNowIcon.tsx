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

/** ServiceNow logo (from Devant's ChoreoSystem image set). */
export default function ServiceNowIcon({ size = 24 }: { size?: number }): JSX.Element {
  return (
    <svg height={size} width={size} viewBox="0 0 40 37" fill="none" aria-hidden="true">
      <path
        d="M20 0.666687C8.8 0.666687 0 9.4129 0 20.5444C0 26.3752 2.4 31.676 6.13333 35.3865C7.46667 36.7117 9.86667 36.7117 11.4667 35.6515C13.6 33.7963 16.8 32.7361 20 32.7361C23.4667 32.7361 26.1333 33.7963 28.5333 35.6515C30.1333 36.9767 32.2667 36.7117 33.8667 35.1215C37.6 31.4109 40 26.3752 40 20.5444C39.7333 9.67794 30.9333 0.666687 20 0.666687ZM19.7333 30.8809C13.6 30.8809 9.6 26.3752 9.6 20.8095C9.6 15.2437 13.6 10.7381 19.7333 10.7381C25.8667 10.7381 29.8667 15.2437 29.8667 20.8095C29.8667 26.3752 25.8667 30.8809 19.7333 30.8809Z"
        fill="#81B5A1"
      />
    </svg>
  );
}
