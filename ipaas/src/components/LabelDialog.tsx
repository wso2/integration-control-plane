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

import { Autocomplete, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Tooltip } from '@wso2/oxygen-ui';
import { useEffect, useState } from 'react';
import type { ComponentDetail } from '../types/component';
import { useProjectComponentLabels } from '../hooks/useProjects';
import { useUpdateComponent } from '../hooks/useComponents';

const LABEL_OPTIONS = [
  'Business Intelligence/Analytics',
  'Business Intelligence/Artificial Intelligence',
  'Business Intelligence/Dashboards',
  'Business Intelligence/Data Warehouse',
  'Business Intelligence/Language Analysis',
  'Business Intelligence/Reporting',
  'Business Intelligence/Visualization',
  'Business Management/ERP',
  'Commerce/eCommerce',
  'Communication/Call & SMS',
  'Communication/Call Tracking',
  'Communication/Email',
  'Communication/Notifications',
  'Communication/Team Chat',
  'Communication/Video Conferencing',
  'Content & Files/Blogs',
  'Content & Files/Documents',
  'Content & Files/File Management & Storage',
  'Content & Files/Images & Design',
  'Content & Files/Notes',
  'Content & Files/Video & Audio',
  'Education/Dictionary',
  'Education/eLearning',
  'Education/Translator',
  'Finance/Accounting',
  'Finance/Asset Management',
  'Finance/Billing',
  'Finance/Cryptocurrency',
  'Finance/Payment',
  'Finance/Payroll',
  'Human Resources/HRMS',
  'Human Resources/Talent Acquisition',
  'Internet of Things/Device Management',
  'IT Operations/Browser Tools',
  'IT Operations/Bug Trackers',
  'IT Operations/Build Tools',
  'IT Operations/Cloud Services',
  'IT Operations/Databases',
  'IT Operations/Data Ingestion',
  'IT Operations/Debug Tools',
  'IT Operations/Enterprise Architecture Tools',
  'IT Operations/Geographic Information Systems',
  'IT Operations/Message Brokers',
  'IT Operations/Security & Identity Tools',
  'IT Operations/Server Monitoring',
  'IT Operations/Source Control',
  'IT Operations/Testing Tools',
  'Lifestyle & Entertainment/App Store',
  'Lifestyle & Entertainment/Books',
  'Lifestyle & Entertainment/Fitness',
  'Lifestyle & Entertainment/Gaming',
  'Lifestyle & Entertainment/News & Lifestyle',
  'Lifestyle & Entertainment/Ride-Hailing',
  'Marketing/Ads & Conversion',
  'Marketing/Drip Emails',
  'Marketing/Email Newsletters',
  'Marketing/Event Management',
  'Marketing/Marketing Automation',
  'Marketing/Social Media Accounts',
  'Marketing/Social Media Marketing',
  'Marketing/Transactional Email',
  'Marketing/Url Shortener',
  'Marketing/Webinar',
  'Productivity/Calendars',
  'Productivity/Product Management',
  'Productivity/Project Management',
  'Productivity/Spreadsheets',
  'Productivity/Task Management',
  'Productivity/Time Tracking',
  'Sales & CRM/Contact Management',
  'Sales & CRM/Customer Relationship Management',
  'Sales & CRM/Forms & Surveys',
  'Sales & CRM/Scheduling & Booking',
  'Support/Customer Appreciation',
  'Support/Customer Support',
  'Vendor/Amazon',
  'Vendor/Google',
  'Vendor/Microsoft',
  'Website & App Building/App Builders',
  'Website & App Building/SEO',
  'Website & App Building/Website Builders',
  'Website & App Building/Web Scraper',
  'Cost/Free',
  'Cost/Freemium',
  'Cost/Paid',
];

interface LabelDialogProps {
  open: boolean;
  onClose: () => void;
  component: ComponentDetail;
  projectId: string;
  currentLabels: string[];
}

const titleSx = { fontWeight: 700 } as const;

export default function LabelDialog({ open, onClose, component, projectId, currentLabels }: LabelDialogProps) {
  // The platform's labels stay, whatever is removed: the BFF adds them back on save anyway.
  const locked = component.lockedLabels ?? [];
  const withLocked = (value: string[]) => [...locked, ...value.filter((l) => !locked.includes(l))];
  const [labels, setLabels] = useState<string[]>(() => withLocked(currentLabels));
  const updateComponent = useUpdateComponent();
  const { data: projectLabels = [] } = useProjectComponentLabels(projectId);

  useEffect(() => {
    if (open) setLabels(withLocked(currentLabels));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const options = [...new Set([...LABEL_OPTIONS, ...projectLabels])];
  const hasChanges = [...labels].sort().join(',') !== [...withLocked(currentLabels)].sort().join(',');
  const hasLabels = currentLabels.length > 0;

  const handleSave = () => {
    updateComponent.mutate(
      {
        id: component.id,
        displayName: component.displayName ?? component.handler,
        description: component.description ?? ' ',
        version: component.version ?? 'v1.0',
        labels,
        projectId,
        handler: component.handler,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={titleSx}>{hasLabels ? 'Edit labels' : 'Labels'}</DialogTitle>
      <DialogContent>
        <Stack gap={1} sx={{ pt: 1 }}>
          <Autocomplete
            multiple
            options={options}
            value={labels}
            onChange={(_, value) => setLabels(withLocked(value as string[]))}
            freeSolo
            disableCloseOnSelect
            disableClearable
            renderTags={(value: string[], getTagProps) =>
              value.map((option, index) => {
                const { key, onDelete, ...tagProps } = getTagProps({ index });
                if (!locked.includes(option)) return <Chip key={key} label={option} size="small" variant="outlined" onDelete={onDelete} {...tagProps} />;
                return (
                  <Tooltip key={key} title="Set by the platform. It can't be removed.">
                    <Chip label={option} size="small" variant="outlined" {...tagProps} />
                  </Tooltip>
                );
              })
            }
            renderInput={(params) => (
              <TextField {...params} labelPlacement="top" label={hasLabels ? 'Labels' : 'Add new label'} variant="outlined" size="small" placeholder={labels.length === 0 ? 'e.g. payments' : ''} helperText="Press Enter to add a label." />
            )}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" color="inherit" onClick={onClose} disabled={updateComponent.isPending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={!hasChanges || updateComponent.isPending} startIcon={updateComponent.isPending ? <CircularProgress size={13} color="inherit" /> : undefined}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
