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

import { Chip, CircularProgress } from '@wso2/oxygen-ui';
import { Check } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { UPLOAD_STATUS_LABEL, UPLOAD_STATUS_TONE } from '../../../constants/contextEngine';
import { isUploadActive } from '../../../utils/contextEngine';
import type { UploadEntry } from '../../../types/contextEngine';

/** Where one uploaded file stands, with the transfer percentage while it is being sent. */
export default function UploadStatusChip({ entry }: { entry: Pick<UploadEntry, 'status' | 'progress'> }): JSX.Element {
  const active = isUploadActive(entry);
  const label = entry.status === 'uploading' ? `${UPLOAD_STATUS_LABEL.uploading} · ${entry.progress}%` : UPLOAD_STATUS_LABEL[entry.status];
  const icon = active ? <CircularProgress size={10} color="inherit" aria-hidden /> : entry.status === 'searchable' ? <Check size={12} /> : undefined;
  return <Chip size="small" variant="outlined" color={UPLOAD_STATUS_TONE[entry.status]} icon={icon} label={label} />;
}
