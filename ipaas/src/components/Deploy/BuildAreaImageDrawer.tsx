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

import { Box, Button, CircularProgress, DrawerPanel, Stack, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import type { DeploymentTrackImage } from '../../types/deployment';
import BuildImageCard from './BuildImageCard';

interface BuildAreaImageDrawerProps {
  open: boolean;
  onClose: () => void;
  images: DeploymentTrackImage[];
  isLoading: boolean;
  selectedImageId: string | null;
  onSelect: (image: DeploymentTrackImage) => void;
}

export default function BuildAreaImageDrawer({ open, onClose, images, isLoading, selectedImageId, onSelect }: BuildAreaImageDrawerProps): JSX.Element {
  return (
    <DrawerPanel open={open} onClose={onClose} width={440}>
      <DrawerPanel.Header>
        <DrawerPanel.Title>Select Image</DrawerPanel.Title>
        <DrawerPanel.Actions>
          <DrawerPanel.CloseButton />
        </DrawerPanel.Actions>
      </DrawerPanel.Header>

      <DrawerPanel.Body>
        {isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={28} />
          </Box>
        )}

        {!isLoading && images.length === 0 && (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              No images available. Trigger a build from the Build page first.
            </Typography>
          </Box>
        )}

        <Stack gap={1.5}>
          {!isLoading &&
            images.map((image, index) => (
              <BuildImageCard
                key={image.imageId}
                image={image}
                isLatest={index === 0}
                variant="selectable"
                isSelected={image.imageId === selectedImageId}
                onSelect={() => {
                  onSelect(image);
                  onClose();
                }}
              />
            ))}
        </Stack>
      </DrawerPanel.Body>

      <DrawerPanel.Footer>
        <Button variant="outlined" size="small" fullWidth onClick={onClose}>
          Close
        </Button>
      </DrawerPanel.Footer>
    </DrawerPanel>
  );
}
