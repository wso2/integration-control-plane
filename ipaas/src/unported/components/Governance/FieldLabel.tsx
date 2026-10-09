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

import { Typography } from '@wso2/oxygen-ui';
import type { JSX, ReactNode } from 'react';

/**
 * Field label for the governance forms. The inputs are bare (no MUI `label`),
 * so MUI's built-in `required` asterisk never renders — this draws it on the
 * separate label Typography instead.
 */
export default function FieldLabel({ children, required, optional }: { children: ReactNode; required?: boolean; optional?: boolean }): JSX.Element {
  return (
    <Typography variant="body2">
      {children}
      {required && (
        <Typography component="span" color="error.main">
          {' *'}
        </Typography>
      )}
      {optional && (
        <Typography component="span" variant="caption" color="text.secondary">
          {' (Optional)'}
        </Typography>
      )}
    </Typography>
  );
}
