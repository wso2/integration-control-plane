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

import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { useLocation, useParams } from 'react-router';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Link, Typography } from '@wso2/oxygen-ui';
import { X } from '@wso2/oxygen-ui-icons-react';

import { useAuth } from '#auth';
import { loginUrl, orgHomeUrl, privacyPolicyUrl } from '../paths';

export default function ProjectsRedirect(): JSX.Element {
  const { orgHandler } = useParams<{ orgHandler: string }>();
  const navigate = useAppNavigate();
  const location = useLocation();
  const { logout, userId } = useAuth();
  const [open, setOpen] = useState(false);

  const tosKey = `tos_accepted:${userId}:${orgHandler}`;

  useEffect(() => {
    if (localStorage.getItem(tosKey) === 'true') {
      // Forward state (e.g. a "deleted successfully" flash message) through to the destination —
      // this is a transparent hop, so callers shouldn't need to know it exists.
      navigate(orgHomeUrl(orgHandler!), { replace: true, state: location.state });
    } else {
      setOpen(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAccept = () => {
    localStorage.setItem(tosKey, 'true');
    setOpen(false);
    navigate(orgHomeUrl(orgHandler!), { replace: true, state: location.state });
  };

  const handleDecline = () => {
    setOpen(false);
    logout().finally(() => navigate(loginUrl(), { replace: true }));
  };

  return (
    <Dialog open={open} maxWidth="sm" fullWidth disableEscapeKeyDown>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          Welcome to WSO2 Integration Platform!
          <IconButton size="small" onClick={handleDecline} aria-label="decline and close">
            <X size={18} />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body1">
          Please accept{' '}
          <Link href="https://wso2.com/integration-platform/terms-of-use" target="_blank" rel="noopener noreferrer">
            Terms of Use
          </Link>{' '}
          and{' '}
          <Link href={privacyPolicyUrl()} target="_blank" rel="noopener noreferrer">
            Privacy Policy
          </Link>{' '}
          to continue!
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="outlined" color="secondary" onClick={handleDecline}>
          Decline
        </Button>
        <Button variant="contained" color="primary" onClick={handleAccept}>
          Accept
        </Button>
      </DialogActions>
    </Dialog>
  );
}
