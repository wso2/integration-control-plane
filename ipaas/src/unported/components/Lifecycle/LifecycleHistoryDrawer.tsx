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

import { Box, Drawer, IconButton, Stack, Typography } from '@wso2/oxygen-ui';
import { X } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import type { LifecycleHistory } from '../../../types/apim';
import { getAge } from '../../../utils/time';

interface LifecycleHistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  lifecycleHistory: LifecycleHistory | undefined;
}

export default function LifecycleHistoryDrawer({ open, onClose, lifecycleHistory }: LifecycleHistoryDrawerProps): JSX.Element {
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      variant="temporary"
      sx={{ '& .MuiDrawer-paper': { width: 560, position: 'fixed', top: 64, height: 'calc(100% - 64px)', borderLeft: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column' } }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
        <Typography variant="h5">History</Typography>
        <IconButton size="small" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </Stack>

      <Box sx={{ overflow: 'auto', flex: 1, px: 2, py: 2 }}>
        {lifecycleHistory &&
          [...lifecycleHistory.list].reverse().map((item, idx, arr) => {
            const isLast = idx === arr.length - 1;
            const action = isLast ? 'API was CREATED.' : `Lifecycle state has changed from ${item.previousState} to ${item.postState}`;
            const age = item.updatedTime ? getAge(new Date(item.updatedTime).getTime(), Date.now()) : '';
            return (
              <Box key={idx} sx={{ display: 'flex', minHeight: isLast ? 'auto' : 80 }}>
                <Box sx={{ width: 72, textAlign: 'right', pr: 1.5, pt: 0.25, flexShrink: 0 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-word', lineHeight: 1.4 }}>
                    {age}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, mr: 1.5 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: 'grey.400', flexShrink: 0, mt: 0.25 }} />
                  {!isLast && <Box sx={{ width: 2, flexGrow: 1, bgcolor: 'grey.300', mt: 0.5 }} />}
                </Box>
                <Box sx={{ pb: 3, minWidth: 0 }}>
                  <Typography variant="body2">{action}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-all', mt: 0.25 }}>
                    {item.user}
                  </Typography>
                </Box>
              </Box>
            );
          })}
      </Box>
    </Drawer>
  );
}
