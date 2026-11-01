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

import { Alert, Button, type SxProps, type Theme } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { SECURITY_MODE_LABEL } from '../constants/apiConsumption';
import { Scopes } from '../constants/permissions';
import { useCan } from '../hooks/useCan';
import type { EndpointTestAccess } from '../hooks/useEndpointTestAccess';

/**
 * Shown when ipaas-service refuses a test key because the endpoint uses another auth mode. Switching
 * changes the security of the whole API, so it is gated like Configure Security.
 */
export default function ApiKeyAuthOffer({ access, sx }: { access: EndpointTestAccess; sx?: SxProps<Theme> }): JSX.Element | null {
  const canSwitch = useCan()(Scopes.ENDPOINT_UPDATE);
  if (!access.needsApiKeyAuth) return null;
  return (
    <Alert
      severity="info"
      sx={sx}
      action={
        canSwitch && (
          <Button color="inherit" size="small" disabled={access.isSwitching} onClick={() => void access.switchToApiKey()}>
            Switch to API key
          </Button>
        )
      }>
      This endpoint uses {access.mode ? SECURITY_MODE_LABEL[access.mode] : 'another'} authentication, so it can&apos;t issue a test key. Switching it to API key changes how every caller of this API authenticates.
    </Alert>
  );
}
