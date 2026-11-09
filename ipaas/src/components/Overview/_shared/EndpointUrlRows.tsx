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

import { Box, IconButton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Building2, Check, Copy, Folder, Globe } from '@wso2/oxygen-ui-icons-react';
import { useCallback, useEffect, useRef, useState, type ElementType, type JSX } from 'react';
import type { EndpointVisibilityUrl, VisibilityKey } from '../../../utils/endpoints';

const VISIBILITY_ICONS: Record<VisibilityKey, ElementType> = { public: Globe, organization: Building2, project: Folder };

const rowSx = { minWidth: 0 } as const;
const iconSx = { display: 'flex', alignItems: 'center', color: 'primary.main', flexShrink: 0 } as const;
const urlSx = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 } as const;
const copySx = { p: 0.25, flexShrink: 0 } as const;

function CopyButton({ url }: { url: string }): JSX.Element {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setCopied(false), 2000);
    });
  }, [url]);

  return (
    <Tooltip title={copied ? 'Copied!' : 'Copy URL'}>
      <IconButton aria-label="Copy URL" size="small" onClick={handleCopy} sx={copySx}>
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </IconButton>
    </Tooltip>
  );
}

/** One invoke URL, led by the icon of the visibility it serves; `note` adds context such as the API gateway. */
function VisibilityUrlRow({ option, note }: { option: EndpointVisibilityUrl; note?: string }): JSX.Element {
  const Icon = VISIBILITY_ICONS[option.key];
  const title = `Visibility: ${option.label}${note ? ` (${note})` : ''}`;
  return (
    <Stack direction="row" alignItems="center" gap={0.75} sx={rowSx}>
      <Tooltip title={title}>
        <Box component="span" role="img" aria-label={title} sx={iconSx}>
          <Icon size={15} aria-hidden="true" />
        </Box>
      </Tooltip>
      {option.url ? (
        <>
          <Typography variant="body2" sx={urlSx} title={option.url}>
            {option.url}
          </Typography>
          <CopyButton url={option.url} />
        </>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={urlSx} aria-label={`No ${option.label.toLowerCase()} URL`}>
          —
        </Typography>
      )}
    </Stack>
  );
}

/** The endpoint's invoke URLs, one row per visibility it has; "—" when it has none. */
export default function EndpointUrlRows({ options, gatewayUrl, gatewayName = 'API gateway' }: { options: EndpointVisibilityUrl[]; gatewayUrl?: string; gatewayName?: string }): JSX.Element {
  if (options.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        —
      </Typography>
    );
  }
  return (
    <Stack gap={0.5}>
      {options.map((option) => (
        <VisibilityUrlRow key={option.key} option={option} note={gatewayUrl && option.url && option.url === gatewayUrl ? `through the ${gatewayName}` : undefined} />
      ))}
    </Stack>
  );
}
