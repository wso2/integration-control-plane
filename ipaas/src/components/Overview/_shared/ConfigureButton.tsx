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

import { Button } from '@wso2/oxygen-ui';
import { SlidersHorizontal } from '@wso2/oxygen-ui-icons-react';
import { Scopes } from '../../../constants/permissions';
import { useCan } from '../../../hooks/useCan';
import { configureControl } from '../../../utils/configValues';

interface ConfigureButtonProps {
  onClick: () => void;
  /** When true, renders an error-coloured "Configure to continue" affordance. */
  hasMissingConfigs?: boolean;
  /** The drawer opens read-only: the button offers a view instead. */
  readOnly?: boolean;
  disabled?: boolean;
}

/**
 * Presentational Configure entry-point button. Composed by the types that have
 * a configuration drawer (automation, integration-as-api). The drawer itself
 * and the missing-config computation live in the type's own `HeaderStatus`.
 */
export default function ConfigureButton({ onClick, hasMissingConfigs = false, readOnly = false, disabled }: ConfigureButtonProps) {
  const can = useCan();
  if (!can(Scopes.CONFIG_READ)) return null;
  const { label, color } = configureControl(readOnly, hasMissingConfigs);
  return (
    <Button variant="outlined" size="small" color={color} startIcon={<SlidersHorizontal size={14} />} onClick={onClick} disabled={disabled} sx={{ mr: 1 }}>
      {label}
    </Button>
  );
}
