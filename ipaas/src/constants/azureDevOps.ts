/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 */

export const AZURE_DEVOPS_AUTH = {
  AUTHORIZE_URL: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  SCOPE: '499b84ac-1321-427f-aa17-267ca6975798/.default offline_access',
  POPUP_DIMENSIONS: 'width=800,height=650',
  POPUP_POLL_INTERVAL_MS: 500,
  CALLBACK_DELIVERY_GRACE_MS: 1000,
  BROADCAST_CHANNEL: 'AZURE_DEVOPS_EXTERNAL_OAUTH',
} as const;
