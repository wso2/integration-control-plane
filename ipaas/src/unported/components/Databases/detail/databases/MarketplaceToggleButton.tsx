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

import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@wso2/oxygen-ui';
import { Store } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX, type MouseEvent } from 'react';
import { useSetDatabaseMarketplace } from '../../../../hooks/usePlatformServices';
import { DB_STATUS } from '../../../../../constants/platformServices';
import type { DatabaseInfo } from '../../../../../types/platformServices';
import type { Notify } from './types';

interface MarketplaceToggleButtonProps {
  serverId: string;
  database: DatabaseInfo;
  isCredsAvailable: boolean;
  onImportCredentials: () => void;
  notify: Notify;
}

export default function MarketplaceToggleButton({ serverId, database, isCredsAvailable, onImportCredentials, notify }: MarketplaceToggleButtonProps): JSX.Element {
  const [dialog, setDialog] = useState<'confirm' | 'needsCreds' | null>(null);
  const setMarketplace = useSetDatabaseMarketplace(serverId);
  const listed = database.display_on_marketplace;

  const open = (e: MouseEvent) => {
    e.stopPropagation(); // don't toggle the accordion
    if (!listed && !isCredsAvailable) setDialog('needsCreds');
    else setDialog('confirm');
  };

  const close = () => setDialog(null);

  const confirm = () => {
    setMarketplace.mutate(
      { name: database.name, display: !listed },
      {
        onSuccess: () => {
          notify('success', listed ? `'${database.name}' removed from the Marketplace.` : `'${database.name}' added to the Marketplace.`);
          close();
        },
        onError: (e) => {
          notify('error', e instanceof Error ? e.message : 'Failed to update the Marketplace status.');
          close();
        },
      },
    );
  };

  return (
    <>
      <Button size="small" color={listed ? 'error' : 'primary'} startIcon={<Store size={15} />} onClick={open}>
        {listed ? 'Remove from Marketplace' : 'Add to Marketplace'}
      </Button>

      {dialog === 'needsCreds' && (
        <Dialog open onClose={close} maxWidth="sm" fullWidth onClick={(e) => e.stopPropagation()}>
          <DialogTitle>Add to Marketplace</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary">
              Import at least one credential before adding &lsquo;{database.name}&rsquo; to the Marketplace.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={close}>Cancel</Button>
            <Button
              variant="contained"
              onClick={() => {
                close();
                onImportCredentials();
              }}>
              Import Credentials
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {dialog === 'confirm' && (
        <Dialog open onClose={close} maxWidth="sm" fullWidth onClick={(e) => e.stopPropagation()}>
          <DialogTitle>{listed ? `Remove '${database.name}' from the Marketplace?` : 'Add to Marketplace'}</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary">
              {listed ? `New connections to '${database.name}' will no longer be allowed. Existing connections are not affected.` : `Are you sure you want to add '${database.name}' to the Marketplace?`}
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={close}>No</Button>
            <Button
              variant="contained"
              color={listed ? 'error' : 'primary'}
              onClick={confirm}
              disabled={setMarketplace.isPending || (!listed && database.status !== DB_STATUS.READY)}
              startIcon={setMarketplace.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
              Yes
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}
