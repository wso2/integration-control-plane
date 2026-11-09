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

import type { JSX } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Link, Stack, Typography } from '@wso2/oxygen-ui';
import { useMarketingConsent, useRecordMarketingConsent } from '../hooks/useMarketingConsent';
import { privacyPolicyUrl } from '../paths';
import { shouldAskMarketingConsent } from '../utils/marketingConsent';

/**
 * Asks a signed-in person, once, whether they want WSO2 marketing email. The answer covers all of
 * WSO2 Cloud, so a person who answered in another product's console is not asked.
 *
 * While the record loads, or when it cannot be read (consent not configured in this environment, or
 * any failure), nothing is shown: the prompt is optional and must never get in the way of the console.
 * The dialog cannot be dismissed without an answer. A failed save keeps it open with the error.
 * `AppLayout` does not mount it on the Terms of Use page, so it never stacks on that dialog; it opens
 * once the person accepts and moves on.
 */
export default function MarketingConsentDialog(): JSX.Element | null {
  const { data: consent } = useMarketingConsent();
  const record = useRecordMarketingConsent();

  if (!consent || !shouldAskMarketingConsent(consent)) return null;

  return (
    <Dialog open disableEscapeKeyDown maxWidth="sm" fullWidth aria-labelledby="marketing-consent-title">
      <DialogTitle id="marketing-consent-title">Welcome to WSO2 Cloud</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <DialogContentText>Want to stay in the loop? Get product updates, resources, and event invites by email. You can unsubscribe at any time.</DialogContentText>
          <Typography variant="body2">
            Learn how we handle your data in our{' '}
            <Link href={privacyPolicyUrl()} target="_blank" rel="noopener noreferrer">
              privacy policy
            </Link>
            .
          </Typography>
          {record.isError && <Alert severity="error">Could not save your choice. Please try again.</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={() => record.mutate('Unsubscribed')} disabled={record.isPending}>
          No thanks
        </Button>
        <Button variant="contained" onClick={() => record.mutate('Confirmed')} disabled={record.isPending}>
          Subscribe
        </Button>
      </DialogActions>
    </Dialog>
  );
}
