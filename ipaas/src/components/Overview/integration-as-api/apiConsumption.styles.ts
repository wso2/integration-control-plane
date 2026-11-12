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

/** Shared styles for the cloud-only API consumption UI (API keys and OAuth subcards, their drawers, the security drawer). */

export const tableHeadCell = {
  color: 'text.secondary',
  fontSize: '0.7rem',
  fontWeight: 600,
} as const;

export const schemeCell = {
  verticalAlign: 'top',
} as const;

export const schemeDescription = {
  display: 'block',
  mt: 0.75,
} as const;

/** Wrapper that carries a tooltip for a disabled control (which swallows pointer events). */
export const disabledTooltipTarget = {
  display: 'inline-flex',
} as const;

export const endpointSelect = {
  minWidth: 200,
} as const;

/** Read-only look for the key name once the key is issued. */
export const lockedField = {
  '& .MuiInputBase-input.Mui-disabled': {
    WebkitTextFillColor: 'unset',
  },
  '& .MuiInputBase-root.Mui-disabled': {
    bgcolor: 'action.hover',
  },
} as const;

export const credentialsSection = {
  mt: 3,
  pt: 2.5,
  borderTop: '1px solid',
  borderColor: 'divider',
} as const;

export const envChip = {
  height: 22,
  fontSize: '0.7rem',
} as const;

export const centredRow = {
  display: 'flex',
  justifyContent: 'center',
  py: 1.5,
} as const;

export const subCard = {
  mt: 2,
  p: 2,
  borderRadius: 1,
  border: '1px solid',
  borderColor: 'divider',
  bgcolor: 'action.hover',
} as const;

export const subCardHeader = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 1.5,
  flexWrap: 'wrap',
} as const;

export const subCardTitle = {
  display: 'flex',
  alignItems: 'center',
  gap: 1,
  fontWeight: 500,
} as const;

export const loadingRow = {
  display: 'flex',
  justifyContent: 'center',
  py: 2.5,
} as const;

export const panelAlert = {
  mt: 1.5,
} as const;

export const keyList = {
  mt: 1.5,
} as const;

export const keyRowText = {
  flex: 1,
  minWidth: 0,
} as const;

export const keyRowSubtitle = {
  display: 'block',
} as const;

export const keyRow = {
  display: 'flex',
  alignItems: 'center',
  gap: 1.5,
  p: 1.25,
  borderRadius: 0.75,
  border: '1px solid',
  borderColor: 'divider',
  bgcolor: 'background.paper',
} as const;

/** The key icon at the start of an API key row. */
export const keyIcon = {
  display: 'flex',
  color: 'text.secondary',
} as const;

/** A small status chip shown inline after a name or title. */
export const statusChip = {
  height: 16,
  fontSize: '0.6rem',
  '& .MuiChip-label': {
    px: 0.625,
  },
} as const;

export const keyNameRow = {
  minWidth: 0,
} as const;

/** The text button under the key list that shows or hides revoked keys. */
export const revokedToggle = {
  mt: 1,
  px: 0.75,
  color: 'text.secondary',
  textTransform: 'none',
} as const;

export const emptyState = {
  mt: 1.5,
  p: 2.25,
  borderRadius: 1.5,
  border: '1px dashed',
  borderColor: 'divider',
  textAlign: 'center',
} as const;

export const dialogAlert = {
  mb: 2,
} as const;

export const revokeButton = {
  color: 'error.main',
  '&:hover': {
    bgcolor: 'error.lighter',
  },
} as const;

/** Icon actions inside a credential field (copy, reveal). */
export const credIconButton = {
  color: 'primary.main',
  '&:hover': {
    bgcolor: 'primary.lighter',
  },
} as const;

export const fieldLabel = {
  fontSize: 12,
  fontWeight: 500,
  color: 'text.secondary',
  mb: 0.75,
  display: 'flex',
  justifyContent: 'space-between',
} as const;

/** `fieldLabel` for a field that follows another one. */
export const nextFieldLabel = {
  ...fieldLabel,
  mt: 2,
} as const;

export const credField = {
  display: 'flex',
  alignItems: 'center',
  gap: 1,
  px: 1.25,
  py: 0.75,
  borderRadius: 1,
  border: '1px solid',
  borderColor: 'divider',
  bgcolor: 'action.hover',
} as const;

export const credValue = {
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontFamily: 'monospace',
  fontSize: 12.5,
} as const;

/** A titled group inside the security drawer. */
export const sectionTitle = {
  mb: 1.5,
} as const;

export const sectionDescription = {
  mt: -0.75,
  mb: 1.5,
} as const;

/** One operation's scope inputs in the security drawer. */
export const operationScopes = {
  p: 1.5,
  borderRadius: 1,
  border: '1px solid',
  borderColor: 'divider',
} as const;

export const operationHeading = {
  mb: 1,
  minWidth: 0,
} as const;

export const methodChip = {
  height: 20,
  fontSize: '0.65rem',
  fontWeight: 600,
} as const;

export const operationPath = {
  fontFamily: 'monospace',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

export const scopeField = {
  flex: 1,
  minWidth: 0,
} as const;

/** A subcard header that opens and closes its body when clicked. */
export const collapsibleHeader = {
  ...subCardHeader,
  cursor: 'pointer',
} as const;

/** Label/value rows of an environment's security summary. */
export const summaryGrid = {
  mt: 1.5,
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', sm: 'max-content 1fr' },
  columnGap: 2,
  rowGap: 0.75,
  alignItems: 'baseline',
} as const;

export const summaryLabel = {
  color: 'text.secondary',
} as const;

export const summaryCode = {
  fontFamily: 'monospace',
  fontSize: 12.5,
  wordBreak: 'break-all',
} as const;

/** Sets the header's "Configure security" link a little apart from Open in Cloud Editor above it. */
export const securityLinkTarget = {
  display: 'inline-flex',
  mt: 1,
} as const;

/** The header's "Configure security" link. */
export const securityLink = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 0.5,
  whiteSpace: 'nowrap',
  '&:disabled': {
    color: 'text.disabled',
    cursor: 'default',
    textDecoration: 'none',
  },
} as const;

/** A copyable command, such as the token request a client sends. */
export const codeBlock = {
  position: 'relative',
  m: 0,
  p: 1.5,
  pr: 5,
  borderRadius: 1,
  border: '1px solid',
  borderColor: 'divider',
  bgcolor: 'action.hover',
  fontFamily: 'monospace',
  fontSize: 12,
  lineHeight: 1.6,
  whiteSpace: 'pre',
  overflowX: 'auto',
} as const;

/** The copy button in a code block's top right corner. */
export const codeBlockCopy = {
  position: 'absolute',
  top: 6,
  right: 6,
} as const;

/** The numbered steps for creating an OAuth client. */
export const stepList = {
  m: 0,
  pl: 2.5,
  display: 'flex',
  flexDirection: 'column',
  gap: 0.75,
} as const;

/** The OAuth subcard's actions under its description. */
export const oauthActions = {
  mt: 1.5,
  display: 'flex',
  flexWrap: 'wrap',
  gap: 1,
} as const;
