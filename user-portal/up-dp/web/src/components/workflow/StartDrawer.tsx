/*
 * Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com). All Rights Reserved.
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein is strictly forbidden, unless permitted by WSO2 in accordance with
 * the WSO2 Commercial License available at http://wso2.com/licenses.
 * For specific language governing the permissions and limitations under
 * this license, please see the license as well as any agreement you've
 * entered into with WSO2 governing the purchase of this software and any
 * associated services.
 */

import { Alert, Button, CircularProgress, Skeleton, Stack, Typography } from '@wso2/oxygen-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDefinitions, useStartRun } from '../../hooks/useWorkflows';
import type { WorkflowDefinition } from '../../types/workflow';
import { humanize } from '../../utils/time';
import { ActionCard, DetailDrawer, SectionCard, SubmitError } from '../detail';
import SchemaEditor, { useSchemaEditor } from '../SchemaEditor';

function InputForm({ definition, url, onStarted }: { definition: WorkflowDefinition; url: string; onStarted: (run: { workflowId: string; runId: string }) => void }) {
  const { t } = useTranslation();
  const editor = useSchemaEditor(definition.inputSchema);
  const start = useStartRun(url);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <SectionCard title={t('workflow.startDrawer.input')}>
        <SchemaEditor editor={editor} disabled={start.isPending} />
      </SectionCard>
      <SubmitError message={error} onClear={() => setError(null)} />
      <Stack direction="row" justifyContent="flex-end">
        <Button
          variant="contained"
          disabled={start.isPending}
          startIcon={start.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}
          onClick={() => {
            const read = editor.read();
            if (!read.ok) return;
            setError(null);
            start.mutate({ workflowType: definition.workflowType, input: read.value }, { onSuccess: onStarted, onError: (e) => setError(e.message) });
          }}>
          {start.isPending ? t('workflow.startDrawer.starting') : t('common.actions.start')}
        </Button>
      </Stack>
    </>
  );
}

/** Starts a run: pick what to start when the workflow offers more than one, then fill in its input. */
export default function StartDrawer({ name, url, onClose, onStarted }: { name: string; url: string; onClose: () => void; onStarted: (run: { workflowId: string; runId: string }) => void }) {
  const { t } = useTranslation();
  const { data: definitions, isLoading, isError, refetch } = useDefinitions(url);
  const startable = (definitions ?? []).filter((d) => d.isActive && d.kind === 'WORKFLOW');
  const [chosen, setChosen] = useState<string | null>(null);
  const definition = startable.find((d) => d.workflowType === chosen) ?? (startable.length === 1 ? startable[0] : undefined);

  return (
    <DetailDrawer title={t('workflow.startDrawer.title', { name })} subtitle={t('workflow.startDrawer.subtitle')} onClose={onClose}>
      {isLoading && <Skeleton variant="rounded" height={200} />}
      {isError && (
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void refetch()}>{t('common.actions.retry')}</Button>}>
          {t('workflow.startDrawer.loadError')}
        </Alert>
      )}
      {definitions && startable.length === 0 && <Alert severity="info">{t('workflow.startDrawer.nothingToStart')}</Alert>}
      {startable.length > 1 && (
        <SectionCard title={t('workflow.startDrawer.workflow')}>
          <Stack direction="row" gap={1.5} flexWrap="wrap">
            {startable.map((d) => (
              <ActionCard key={d.workflowType} title={humanize(d.workflowType)} subtitle={d.workflowType} selected={definition?.workflowType === d.workflowType} onClick={() => setChosen(d.workflowType)} />
            ))}
          </Stack>
        </SectionCard>
      )}
      {definition ? (
        <InputForm key={definition.workflowType} definition={definition} url={url} onStarted={onStarted} />
      ) : (
        startable.length > 1 && (
          <Typography variant="body2" color="text.secondary">
            {t('workflow.startDrawer.chooseWhatToStart')}
          </Typography>
        )
      )}
    </DetailDrawer>
  );
}
