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

import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import TextField from '../../../../components/common/TextField';
import { Eye, EyeOff, X } from '@wso2/oxygen-ui-icons-react';
import { useState, type ComponentType, type JSX, type ReactNode } from 'react';
import AzureDevOpsIcon from '../../../../assets/icons/AzureDevOpsIcon';
import GitLabIcon from '../../../../assets/icons/GitLabIcon';
import BitbucketIcon from '../../../../assets/icons/BitbucketIcon';
import { useCreateGitCredential } from '../../../hooks/useCredentials';
import { GitProvider, type CreateGitCredentialInput, type GitCredential } from '../../../../types/credentials';

interface FieldDef {
  label: string;
  placeholder: string;
  secret?: boolean;
}
interface ProviderDef {
  value: GitProvider;
  label: string;
  Icon: ComponentType<{ size?: number }>;
  f1: FieldDef;
  f2: FieldDef;
  howTo: { text: string; url: string };
  banner: ReactNode;
}

const PROVIDERS: ProviderDef[] = [
  {
    value: GitProvider.BITBUCKET_CLOUD,
    label: 'Bitbucket',
    Icon: BitbucketIcon,
    f1: { label: 'Username', placeholder: 'Enter Bitbucket Username' },
    f2: { label: 'App password', placeholder: 'Enter Bitbucket App password', secret: true },
    howTo: { text: 'How to create an App password?', url: 'https://support.atlassian.com/bitbucket-cloud/docs/create-an-app-password/' },
    banner: (
      <>
        <Typography variant="body2" sx={{ mb: 0.5 }}>
          Grant the following permissions to your App password:
        </Typography>
        <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
          <li>Account (Read)</li>
          <li>Pull requests (Read/Write)</li>
          <li>Repositories (Read/Write)</li>
          <li>Webhooks (Read/Write)</li>
        </Box>
      </>
    ),
  },
  {
    value: GitProvider.GITLAB_SELF_MANAGED,
    label: 'GitLab',
    Icon: GitLabIcon,
    f1: { label: 'Server URL', placeholder: 'Enter server URL' },
    f2: { label: 'Access Token', placeholder: 'Enter personal access token', secret: true },
    howTo: { text: 'How to create a personal access token?', url: 'https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html#create-a-personal-access-token' },
    banner: <Typography variant="body2">Grant the API scope to your access token and set its expiry to &lsquo;Do not expire&rsquo;. Use a public GitLab server URL with SSL (https) enabled.</Typography>,
  },
  {
    value: GitProvider.AZURE_DEVOPS,
    label: 'Azure DevOps',
    Icon: AzureDevOpsIcon,
    f1: { label: 'Organization Name', placeholder: 'Enter Azure DevOps Organization Name' },
    f2: { label: 'Personal Access Token', placeholder: 'Enter Personal Access Token', secret: true },
    howTo: { text: 'How to create a personal access token?', url: 'https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate' },
    banner: (
      <Typography variant="body2">
        Grant the <strong>Code (Read)</strong>, <strong>Project (Read)</strong> and <strong>Team (Read)</strong> scopes to your Personal Access Token, and the <strong>Organization</strong> specified above.
      </Typography>
    ),
  },
];

function buildInput(provider: GitProvider, name: string, f1: string, f2: string): CreateGitCredentialInput {
  switch (provider) {
    case GitProvider.GITLAB_SELF_MANAGED:
      return { name, type: provider, gitLabServerConfig: { serverUrl: f1, pat: f2 } };
    case GitProvider.AZURE_DEVOPS:
      return { name, type: provider, azureDevOpsConfig: { organizationName: f1, pat: f2 } };
    default:
      return { name, type: GitProvider.BITBUCKET_CLOUD, bitbucketCredential: { userName: f1, appPassword: f2 } };
  }
}

/** Field label with a red required asterisk (the dialog's inputs use standalone labels, not TextField's built-in one). */
function RequiredLabel({ children }: { children: ReactNode }): JSX.Element {
  return (
    <Typography variant="body2" sx={{ mb: 0.75 }}>
      {children}{' '}
      <Box component="span" sx={{ color: 'error.main' }}>
        *
      </Box>
    </Typography>
  );
}

export default function AddCredentialDialog({
  onClose,
  onAdded,
  onError,
  initialProvider,
  onAddedCredential,
  lockProvider = false,
  onCancel,
}: {
  onClose: () => void;
  onAdded: (name: string) => void;
  onError: (message: string) => void;
  initialProvider?: GitProvider;
  onAddedCredential?: (credential: GitCredential) => void;
  /** Lock the dialog to `initialProvider` — hides the provider selector (import flow enters from a specific provider). */
  lockProvider?: boolean;
  /** When provided, a Cancel button is shown even in lock mode (otherwise the locked dialog is non-dismissible). The caller decides what cancel does (e.g. navigate away, or just close). */
  onCancel?: () => void;
}): JSX.Element {
  const create = useCreateGitCredential();
  const [name, setName] = useState('');
  const [provider, setProvider] = useState<GitProvider>(initialProvider ?? GitProvider.BITBUCKET_CLOUD);
  const [f1, setF1] = useState('');
  const [f2, setF2] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [saveError, setSaveError] = useState('');
  const def = PROVIDERS.find((p) => p.value === provider)!;
  const canSave = name.trim() && f1.trim() && f2.trim() && !create.isPending;

  const selectProvider = (value: GitProvider) => {
    setProvider(value);
    setF1('');
    setF2('');
    setShowSecret(false);
  };

  const handleSave = () => {
    setSaveError('');
    create.mutate(buildInput(provider, name.trim(), f1.trim(), f2.trim()), {
      onSuccess: (credential) => {
        onClose();
        onAdded(name.trim());
        onAddedCredential?.(credential);
      },
      onError: (e) => {
        const message = e.message || 'Failed to add the credential.';
        // Locked (import) flow: keep the modal open and surface the error inline
        // so the user can fix the token and re-authorize without losing context.
        if (lockProvider) {
          setSaveError(message);
          return;
        }
        onClose();
        onError(message);
      },
    });
  };

  return (
    <Dialog open onClose={lockProvider ? undefined : onClose} disableEscapeKeyDown={lockProvider} maxWidth="sm" fullWidth>
      {!lockProvider && (
        <IconButton aria-label="Close" onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
          <X size={18} />
        </IconButton>
      )}
      <DialogTitle sx={{ textAlign: 'center', fontWeight: 700, fontSize: (t) => t.typography.h4.fontSize, mt: 2 }}>
        {lockProvider ? (
          <Stack direction="row" alignItems="center" justifyContent="center" gap={1}>
            <def.Icon size={26} />
            Authorize with {def.label}
          </Stack>
        ) : (
          'Add Credentials'
        )}
      </DialogTitle>
      <DialogContent>
        <Stack gap={2.5} sx={{ mt: 1 }}>
          {saveError && (
            <Alert severity="error" onClose={() => setSaveError('')}>
              {saveError}
            </Alert>
          )}
          <Box>
            <RequiredLabel>Credential Name</RequiredLabel>
            <TextField value={name} onChange={(e) => setName(e.target.value)} fullWidth placeholder="Enter Credential Name" />
          </Box>

          {!lockProvider && (
            <Box>
              <Typography variant="body2" sx={{ mb: 0.75 }}>
                Service Provider
              </Typography>
              <Stack direction="row" gap={1.5}>
                {PROVIDERS.map((p) => {
                  const selected = p.value === provider;
                  return (
                    <Box
                      key={p.value}
                      role="button"
                      tabIndex={0}
                      onClick={() => selectProvider(p.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          selectProvider(p.value);
                        }
                      }}
                      sx={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 1,
                        py: 1.5,
                        border: '1px solid',
                        borderColor: selected ? 'primary.main' : 'divider',
                        borderRadius: 1.5,
                        cursor: 'pointer',
                        bgcolor: selected ? 'action.hover' : 'transparent',
                      }}>
                      <p.Icon size={22} />
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {p.label}
                      </Typography>
                    </Box>
                  );
                })}
              </Stack>
            </Box>
          )}

          <Box>
            <RequiredLabel>{def.f1.label}</RequiredLabel>
            <TextField value={f1} onChange={(e) => setF1(e.target.value)} fullWidth placeholder={def.f1.placeholder} />
          </Box>

          <Box>
            <RequiredLabel>{def.f2.label}</RequiredLabel>
            <TextField
              value={f2}
              onChange={(e) => setF2(e.target.value)}
              fullWidth
              type={showSecret ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder={def.f2.placeholder}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title={showSecret ? 'Hide' : 'Show'}>
                      <IconButton size="small" aria-label={showSecret ? 'Hide' : 'Show'} onClick={() => setShowSecret((s) => !s)} edge="end">
                        {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                      </IconButton>
                    </Tooltip>
                  </InputAdornment>
                ),
              }}
            />
            <Typography component="a" href={def.howTo.url} target="_blank" rel="noopener noreferrer" variant="caption" sx={{ display: 'inline-block', mt: 0.5, color: 'primary.main', textDecoration: 'none' }}>
              {def.howTo.text}
            </Typography>
          </Box>

          <Alert severity="info" icon={false}>
            {def.banner}
          </Alert>
        </Stack>
      </DialogContent>
      <DialogActions>
        {!lockProvider ? (
          <Button onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
        ) : onCancel ? (
          <Button onClick={onCancel} disabled={create.isPending}>
            Cancel
          </Button>
        ) : null}
        <Button variant="contained" onClick={handleSave} disabled={!canSave} startIcon={create.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {create.isPending ? (lockProvider ? 'Authorizing…' : 'Saving…') : lockProvider ? 'Authorize' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
