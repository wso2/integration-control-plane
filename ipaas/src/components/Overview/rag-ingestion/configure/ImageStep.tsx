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

import { Button, CircularProgress, Stack, Typography, TextField } from '@wso2/oxygen-ui';
import { useState, type JSX } from 'react';
import { useDeployByoiImage } from '../../../../hooks/useRagIngestion';

interface ImageStepProps {
  componentId: string;
  releaseId: string;
  /** The currently-deployed image URL, used to prefill the field. */
  currentImage: string;
  onNotify: (message: string, severity: 'success' | 'error') => void;
}

/**
 * The Configure-drawer "Update Image" step: edit the BYOI container image URL and
 * redeploy the release with it. Mirrors devant's ImageUpdateWizard final step.
 */
export default function ImageStep({ componentId, releaseId, currentImage, onNotify }: ImageStepProps): JSX.Element {
  const [imageUrl, setImageUrl] = useState(currentImage);
  const deploy = useDeployByoiImage();

  const changed = imageUrl.trim() !== '' && imageUrl.trim() !== currentImage;

  const submit = () => {
    deploy.mutate(
      { componentId, releaseId, imageUrl: imageUrl.trim() },
      {
        onSuccess: () => onNotify('Deployment triggered with the new image.', 'success'),
        onError: (e) => onNotify(e instanceof Error ? e.message : 'Failed to deploy the image.', 'error'),
      },
    );
  };

  return (
    <Stack gap={2}>
      <Typography variant="body2" color="text.secondary">
        Update the container image this ingestion runs, then redeploy.
      </Typography>
      <TextField labelPlacement="top" label="Image URL" required fullWidth size="small" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
      <Stack direction="row" justifyContent="flex-end">
        <Button variant="contained" onClick={submit} disabled={!imageUrl.trim() || deploy.isPending} startIcon={deploy.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {deploy.isPending ? 'Deploying…' : changed ? 'Update & Deploy' : 'Redeploy'}
        </Button>
      </Stack>
    </Stack>
  );
}
