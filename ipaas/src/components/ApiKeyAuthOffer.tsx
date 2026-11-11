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
import type { EndpointTestAccess } from '../hooks/useEndpointTestAccess';

/** Shown when ipaas-service refuses a test key because the endpoint uses another auth mode; offers the switch where `access.canSwitch`. */
export default function ApiKeyAuthOffer({ access, sx }: { access: EndpointTestAccess; sx?: SxProps<Theme> }): JSX.Element | null {
  if (!access.needsApiKeyAuth) return null;
  return (
    <Alert
      severity="info"
      sx={sx}
      action={
        access.canSwitch && (
          <Button color="inherit" size="small" disabled={access.isSwitching} onClick={() => void access.switchToApiKey()}>
            Switch to API key
          </Button>
        )
      }>
      This endpoint uses {access.mode ? SECURITY_MODE_LABEL[access.mode] : 'another'} authentication, so it can&apos;t issue a test key.
      {access.canSwitch && ' Switching it to API key changes how every caller of this API authenticates.'}
      {access.managedIn && ` Its security is managed in ${access.managedIn}. Switch it to API key there, then promote to apply it here.`}
    </Alert>
  );
}
