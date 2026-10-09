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

import { Box, Dialog, DialogContent, DialogTitle, Divider, FormControlLabel, IconButton, Stack, Switch, Typography } from '@wso2/oxygen-ui';
import { X } from '@wso2/oxygen-ui-icons-react';
import { useFeaturePreview } from '../../../contexts/FeaturePreviewContext';
import previewFeatures from './previewFeatures.json';

interface FeaturePreviewModalProps {
  open: boolean;
  onClose: () => void;
}

export default function FeaturePreviewModal({ open, onClose }: FeaturePreviewModalProps) {
  const { features, updateFeatures } = useFeaturePreview();

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="h5">Feature Preview</Typography>
          <IconButton size="small" aria-label="close" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </Stack>
      </DialogTitle>
      <Divider />
      <DialogContent sx={{ pt: 1 }}>
        {previewFeatures.length === 0 ? (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">No preview features available</Typography>
          </Box>
        ) : (
          <Stack divider={<Divider />}>
            {previewFeatures.map((feature) => (
              <Stack key={feature.title} direction="row" alignItems="center" justifyContent="space-between" sx={{ py: 1.5 }}>
                <Box sx={{ mr: 2 }}>
                  <Typography variant="body2" fontWeight={600}>
                    {feature.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {feature.description}
                  </Typography>
                </Box>
                <FormControlLabel control={<Switch checked={!!features[feature.title]} onChange={(_, checked) => updateFeatures({ [feature.title]: checked })} color="primary" size="small" />} label="" sx={{ m: 0, flexShrink: 0 }} />
              </Stack>
            ))}
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}
