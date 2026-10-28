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

import { Box, Divider, MenuItem, MenuList, Paper, Popover, Stack, Typography } from '@wso2/oxygen-ui';
import { providerIconSx, providerTitleSx } from '../../../components/ProjectCreate/GitProviderCards.styles';
import { Check, ChevronDown, Plus } from '@wso2/oxygen-ui-icons-react';
import { useRef, useState, type JSX, type ReactNode } from 'react';
import { GIT_PROVIDER_LABEL, gitProviderIcon } from '../../../constants/gitProviders';
import type { GitCredential } from '../../../types/credentials';

interface CredentialSelectCardProps {
  /** Credentials-enum provider value (e.g. GitProvider.GITLAB_SELF_MANAGED). */
  provider: string;
  /** Credentials already filtered down to this provider. */
  credentials: GitCredential[];
  selected: GitCredential | null;
  onSelect: (credential: GitCredential) => void;
  /** When provided, renders a "+ Add Credential" row at the top of the dropdown. */
  onAddCredential?: () => void;
  /** Shown inside the dropdown when there are no credentials and no "+ Add" row (e.g. the create-project empty message). */
  emptyContent?: ReactNode;
}

/**
 * The provider-authorize card (Paper) with a "Select a Credential" dropdown, mirroring
 * Devant's git-provider credential picker. Lists the user's stored credentials for the
 * given provider; selecting one threads its id as `secretRef` into repo queries upstream.
 */
export default function CredentialSelectCard({ provider, credentials, selected, onSelect, onAddCredential, emptyContent }: CredentialSelectCardProps): JSX.Element {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const label = GIT_PROVIDER_LABEL[provider] ?? 'Git provider';

  const close = () => setOpen(false);

  return (
    <Paper variant="outlined" sx={{ px: 3, py: 2, borderColor: 'primary', width: '100%', height: '100%' }}>
      {/* Same layout as the other provider cards: icon and title on one row, the credential picker beneath. */}
      <Stack gap={1}>
        <Stack direction="row" gap={1.5} alignItems="center">
          <Box sx={providerIconSx}>{gitProviderIcon(provider, 24)}</Box>
          <Typography variant="body1" fontWeight={600} sx={providerTitleSx}>
            Authorize with {label}
          </Typography>
        </Stack>
        <Box sx={{ minWidth: 0 }}>
          <Box
            ref={anchorRef}
            role="button"
            tabIndex={0}
            aria-haspopup="listbox"
            aria-expanded={open}
            onClick={() => setOpen(true)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setOpen(true)}
            sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, cursor: 'pointer' }}>
            <Typography variant="body2" sx={{ userSelect: 'none' }} color="text.secondary">
              {selected?.name ?? 'Select a Credential'}
            </Typography>
            <Box sx={{ display: 'flex', color: 'primary.main' }}>
              <ChevronDown size={18} />
            </Box>
          </Box>
        </Box>
      </Stack>

      <Popover open={open} anchorEl={anchorRef.current} onClose={close} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} slotProps={{ paper: { sx: { minWidth: anchorRef.current?.offsetWidth ?? 240, mt: 0.5 } } }}>
        <MenuList sx={{ py: 0.5 }}>
          {onAddCredential && [
            <MenuItem
              key="__add__"
              onClick={() => {
                close();
                onAddCredential();
              }}>
              <Stack direction="row" alignItems="center" gap={1} sx={{ color: 'primary.main' }}>
                <Box sx={{ display: 'flex' }}>
                  <Plus size={16} />
                </Box>
                <Typography variant="body2" fontWeight={500} color="primary.main">
                  Add Credential
                </Typography>
              </Stack>
            </MenuItem>,
            <Divider key="__add_divider__" sx={{ my: 0.5 }} />,
          ]}

          {credentials.length > 0
            ? credentials.map((c) => (
                <MenuItem
                  key={c.id}
                  selected={c.id === selected?.id}
                  onClick={() => {
                    close();
                    onSelect(c);
                  }}>
                  <Stack direction="row" alignItems="center" gap={1} sx={{ width: '100%' }}>
                    <Typography variant="body2" sx={{ flex: 1 }}>
                      {c.name}
                    </Typography>
                    {c.id === selected?.id && <Check size={16} />}
                  </Stack>
                </MenuItem>
              ))
            : !onAddCredential && (
                <Box sx={{ px: 2, py: 1.5, maxWidth: 260 }}>
                  {emptyContent ?? (
                    <Typography variant="body2" color="text.secondary">
                      No credentials found. Create a credential to continue.
                    </Typography>
                  )}
                </Box>
              )}
        </MenuList>
      </Popover>
    </Paper>
  );
}
