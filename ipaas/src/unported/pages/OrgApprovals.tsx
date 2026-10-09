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

import { Alert, Box, Button, CircularProgress, PageContent, PageTitle, Tab, Tabs } from '@wso2/oxygen-ui';
import { ClipboardCheck } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import EmptyListing from '../../components/EmptyListing';
import ApprovalReviewDrawer from '../components/Approvals/ApprovalReviewDrawer';
import ApprovalsTable, { type ApprovalsTab } from '../components/Approvals/ApprovalsTable';
import { usePastWorkflowInstances, useWorkflowInstances } from '../hooks/useWorkflows';
import type { WorkflowInstanceResponse } from '../../types/workflow';
import type { OrgScope } from '../../nav';

export default function OrgApprovals(_scope: OrgScope): JSX.Element {
  const [tab, setTab] = useState<ApprovalsTab>('pending');
  const [selected, setSelected] = useState<WorkflowInstanceResponse | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const pending = useWorkflowInstances();
  const past = usePastWorkflowInstances();
  const active = tab === 'pending' ? pending : past;
  const instances = active.data ?? [];

  return (
    <PageContent>
      <PageTitle sx={{ mb: 2 }}>
        <PageTitle.Header>Approvals</PageTitle.Header>
      </PageTitle>

      {alert && (
        <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 2 }}>
          {alert.message}
        </Alert>
      )}

      <Tabs value={tab} onChange={(_e, v) => setTab(v as ApprovalsTab)} sx={{ mb: 2 }}>
        <Tab value="pending" label="Pending" />
        <Tab value="past" label="Past" />
      </Tabs>

      {active.isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : active.isError ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => active.refetch()}>
              Retry
            </Button>
          }>
          Failed to load approvals.
        </Alert>
      ) : instances.length === 0 ? (
        <EmptyListing
          icon={<ClipboardCheck size={48} />}
          title={tab === 'pending' ? 'No pending approvals' : 'No past approvals'}
          description={tab === 'pending' ? 'Approval requests awaiting your review will appear here.' : 'Approved, rejected and cancelled requests will appear here.'}
        />
      ) : (
        <ApprovalsTable instances={instances} tab={tab} onSelect={setSelected} />
      )}

      <ApprovalReviewDrawer
        instance={selected}
        onClose={() => setSelected(null)}
        onActionDone={(message) => {
          setSelected(null);
          setAlert({ type: 'success', message });
        }}
        onActionError={(message) => setAlert({ type: 'error', message })}
      />
    </PageContent>
  );
}
