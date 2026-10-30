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

import { Alert, Box, Button, CircularProgress, PageContent, Typography } from '@wso2/oxygen-ui';
import { useEffect, useRef, useState, type JSX } from 'react';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { useDeployPrebuiltIntegration } from '../hooks/useDeployPrebuiltIntegration';
import { usePrebuiltIntegrationConfig } from '../contexts/PrebuiltIntegrationConfigContext';
import { resourceUrl, narrow, type ProjectScope } from '../nav';
import { prebuiltIntegrationsUrl } from '../paths';
import { useProjectId } from '../hooks/useProjects';

export default function PrebuiltIntegrationDeploy(scope: ProjectScope): JSX.Element {
  const navigate = useAppNavigate();
  const { integration, configValues, clearAll } = usePrebuiltIntegrationConfig();

  const { projectId } = useProjectId(scope.project);
  const { deploy, reset, progress, stepLabel, error, errorSeverity, isDeploying, isSuccess, componentHandler, configSaveError } = useDeployPrebuiltIntegration();
  const hasDeployedRef = useRef(false);
  const [configAlertDismissed, setConfigAlertDismissed] = useState(false);

  useEffect(() => {
    if (!integration || !projectId) return;
    if (hasDeployedRef.current) return;
    hasDeployedRef.current = true;
    deploy({
      integration,
      orgHandler: scope.org,
      projectId,
      configValues,
    });
    // Only fire once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (isSuccess && componentHandler && (!configSaveError || configAlertDismissed)) {
      const overviewUrl = resourceUrl(narrow(scope, componentHandler), 'overview');
      navigate(overviewUrl, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, componentHandler, configAlertDismissed]);

  // Cleared on unmount, not before navigating: navigation waits for the next
  // route's chunk, and wiping the context first drops this page into its
  // "Integration not found" branch for the duration.
  useEffect(() => clearAll, [clearAll]);

  if (!integration) {
    return (
      <PageContent fullWidth sx={{ pt: 5 }}>
        <Alert severity="error" sx={{ maxWidth: 480 }}>
          Integration not found. Please go back and try again.
        </Alert>
        <Button sx={{ mt: 2 }} onClick={() => navigate(prebuiltIntegrationsUrl(scope.org, scope.project))}>
          Back to Browse
        </Button>
      </PageContent>
    );
  }

  if (error) {
    return (
      <PageContent fullWidth sx={{ pt: 5, display: 'flex', flexDirection: 'column', flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Alert severity={errorSeverity} sx={{ maxWidth: 480, width: '100%', mb: 3 }}>
          {error}
        </Alert>
        <Button
          variant="outlined"
          onClick={() => {
            reset();
            if (projectId) {
              deploy({ integration, orgHandler: scope.org, projectId, configValues });
            }
          }}>
          Retry
        </Button>
      </PageContent>
    );
  }

  return (
    <PageContent fullWidth sx={{ pt: 5, display: 'flex', flexDirection: 'column', flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Typography variant="h2" sx={{ mb: 1 }}>
        Deploying {integration.displayName}…
      </Typography>

      <Box sx={{ position: 'relative', display: 'inline-flex', my: 3 }}>
        <CircularProgress variant={isDeploying ? 'determinate' : 'indeterminate'} value={progress} size={80} thickness={4} sx={{ color: 'primary.main' }} />
        {isDeploying && (
          <Box
            sx={{
              top: 0,
              left: 0,
              bottom: 0,
              right: 0,
              position: 'absolute',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Typography variant="caption" component="div" color="text.secondary">
              {progress}%
            </Typography>
          </Box>
        )}
      </Box>

      <Typography color="text.secondary" variant="body2">
        {stepLabel || 'Preparing deployment…'}
      </Typography>

      {configSaveError && !configAlertDismissed && (
        <Alert severity="warning" onClose={() => setConfigAlertDismissed(true)} sx={{ mt: 3, maxWidth: 480, width: '100%', textAlign: 'left' }}>
          Failed to save configurations. Please configure the integration once the deployment finishes.
        </Alert>
      )}
    </PageContent>
  );
}
