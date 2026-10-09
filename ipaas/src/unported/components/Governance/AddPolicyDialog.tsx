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

import { Button, Card, CardContent, Dialog, DialogContent, DialogTitle, Grid, Stack, Typography } from '@wso2/oxygen-ui';
import { FileText, Layers } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';

interface AddPolicyDialogProps {
  open: boolean;
  onClose: () => void;
  onRulesetPolicy: () => void;
  onAiPolicy: () => void;
}

const policyCardStyles = {
  border: '1px solid',
  borderColor: 'divider',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  '&:hover': {
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
    borderColor: 'primary.main',
  },
} as const;

export default function AddPolicyDialog({ open, onClose, onRulesetPolicy, onAiPolicy }: AddPolicyDialogProps): JSX.Element {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Policy</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12 }}>
            <Card sx={policyCardStyles} onClick={onRulesetPolicy}>
              <CardContent sx={{ textAlign: 'center', py: 3 }}>
                <Stack gap={1.5} alignItems="center">
                  <Layers size={32} />
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    Using Rule Definitions
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Create policy using rulesets from the ruleset catalog
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12 }}>
            <Card sx={policyCardStyles} onClick={onAiPolicy}>
              <CardContent sx={{ textAlign: 'center', py: 3 }}>
                <Stack gap={1.5} alignItems="center">
                  <FileText size={32} />
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    Using Document
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Create policy using natural language document to enforce AI governance.
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Stack direction="row" gap={1} justifyContent="flex-end" sx={{ mt: 3 }}>
          <Button onClick={onClose}>Cancel</Button>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
