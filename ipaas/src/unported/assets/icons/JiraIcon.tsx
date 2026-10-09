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

/** Jira logo (from Devant's ChoreoSystem image set). */
export default function JiraIcon({ size = 24 }: { size?: number }): JSX.Element {
  return (
    <svg height={size} width={size} viewBox="0 0 39 40" fill="none" aria-hidden="true">
      <path
        d="M37.8743 18.8807L20.8198 1.66843L19.1667 0L6.32868 12.9567L0.458987 18.8807C-0.152996 19.4991 -0.152996 20.5009 0.458987 21.1193L12.1879 32.9567L19.1667 40L32.0047 27.0433L32.2035 26.8427L37.8743 21.1193C38.4863 20.5009 38.4863 19.4991 37.8743 18.8807ZM19.1667 25.9134L13.3074 20L19.1667 14.0866L25.0259 20L19.1667 25.9134Z"
        fill="#2684FF"
      />
    </svg>
  );
}
