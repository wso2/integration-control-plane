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

import { Box, Paper, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { GitHub } from '@wso2/oxygen-ui-icons-react';
import { type JSX, type ReactNode } from 'react';
import GitLogoIcon from '../../assets/icons/GitLogoIcon';
import GitLabIcon from '../../assets/icons/GitLabIcon';
import BitbucketIcon from '../../assets/icons/BitbucketIcon';
import AzureDevOpsIcon from '../../assets/icons/AzureDevOpsIcon';
import { GitProvider } from '../../types/credentials';
import { providerCardSx, providerGridSx, providerIconSx, providerTitleSx } from './GitProviderCards.styles';
import { providerComingSoonLabel } from '../../constants/gitProviders';

interface GitProviderCardsProps {
  onGitHubSelect: () => void;
  onPublicSelect: () => void;
}

const ICON_SIZE = 24;

/** A provider card: icon and title only; what it imports from is in the tooltip. */
function InfoCard({ icon, title, tooltip, onClick, disabled = false }: { icon: ReactNode; title: string; tooltip: ReactNode; onClick?: () => void; disabled?: boolean }): JSX.Element {
  return (
    <Tooltip title={tooltip} placement="top">
      <Paper
        variant="outlined"
        role={disabled ? undefined : 'button'}
        tabIndex={disabled ? undefined : 0}
        onClick={disabled ? undefined : onClick}
        onKeyDown={disabled ? undefined : (e) => (e.key === 'Enter' || e.key === ' ') && onClick?.()}
        sx={providerCardSx(disabled)}>
        <Stack direction="row" gap={1.5} alignItems="center">
          <Box sx={providerIconSx}>{icon}</Box>
          <Typography variant="body1" fontWeight={600} sx={providerTitleSx}>
            {title}
          </Typography>
        </Stack>
      </Paper>
    </Tooltip>
  );
}

export default function GitProviderCards({ onGitHubSelect, onPublicSelect }: GitProviderCardsProps): JSX.Element {
  // Private GitHub needs the platform GitHub App, so environments without a
  // configured client id can only import public repos.
  const gitHubEnabled = !!window.API_CONFIG.githubAppClientId;

  // The tooltip says what the card would import from, then why it is not available yet.
  const comingSoonCard = (icon: ReactNode, title: string, description: string, message: string) => (
    <InfoCard
      icon={icon}
      title={title}
      tooltip={
        <>
          {description}
          <br />
          {message}
        </>
      }
      disabled
    />
  );

  return (
    <Box sx={providerGridSx}>
      {/* Public Git Repository — first, since it needs no authorization */}
      <InfoCard icon={<GitLogoIcon size={ICON_SIZE} />} title="Connect a Public GitHub Repository" tooltip="Import from a public GitHub repository" onClick={onPublicSelect} />

      {/* GitHub */}
      {gitHubEnabled ? (
        <InfoCard icon={<GitHub size={ICON_SIZE} />} title="Authorize with GitHub" tooltip="Import from a private GitHub repository" onClick={onGitHubSelect} />
      ) : (
        comingSoonCard(<GitHub size={ICON_SIZE} />, 'Authorize with GitHub', 'Import from a private GitHub repository', 'Private GitHub repositories are not enabled in this environment')
      )}

      {/* Bitbucket */}
      {comingSoonCard(<BitbucketIcon size={ICON_SIZE} />, 'Authorize with Bitbucket', 'Import from a Bitbucket repository', providerComingSoonLabel(GitProvider.BITBUCKET_CLOUD))}

      {/* GitLab */}
      {comingSoonCard(<GitLabIcon size={ICON_SIZE} />, 'Authorize with GitLab', 'Import from a GitLab repository', providerComingSoonLabel(GitProvider.GITLAB_SELF_MANAGED))}

      {/* Azure DevOps */}
      {comingSoonCard(<AzureDevOpsIcon size={ICON_SIZE} />, 'Authorize with Azure DevOps', 'Import from an Azure DevOps repository', providerComingSoonLabel(GitProvider.AZURE_DEVOPS))}
    </Box>
  );
}
