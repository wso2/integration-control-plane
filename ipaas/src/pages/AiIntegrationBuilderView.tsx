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

import { Alert, Box, Button, Dialog, DialogContent, DialogTitle, InputBase, PageContent, Stack, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft, Send } from '@wso2/oxygen-ui-icons-react';
import { Fragment, useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { useLocation } from 'react-router';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { useAuth } from '#auth';
import { useChoreoSampleImages } from '../hooks/useRepository';
import { useProjectId } from '../hooks/useProjects';
import { useOrgUuid } from '../hooks/useOrgUuid';
import { useAiIntegrationBuilder } from '../hooks/useAiIntegrationBuilder';
import { derivePrebuiltSlug } from '../utils/prebuilt';
import { buildCloudEditorUrl } from '../utils/cloudEditor';
import { prebuiltIntegrationSetupUrl, componentsNewUrl } from '../paths';
import type { ConversationTurn, CustomIntegrationResponse } from '../types/aiBuilder';
import type { PrebuiltIntegration } from '../types/prebuilt';
import { LoadingState } from '../components/AiBuilder/LoadingState';
import { PrebuiltMatchCard } from '../components/AiBuilder/PrebuiltMatchCard';
import { CustomPlanCard } from '../components/AiBuilder/CustomPlanCard';
import { UnsupportedCard } from '../components/AiBuilder/UnsupportedCard';
import { InvalidPromptCard } from '../components/AiBuilder/InvalidPromptCard';
import { ErrorCard } from '../components/AiBuilder/ErrorCard';
import { AgentAvatar, UserMessage } from '../components/AiBuilder/ChatMessage';
import { AGENT_ROW_SX, CHAT_COLUMN_SX, CHAT_MESSAGES_SX, INPUT_BOX_SX, STICKY_INPUT_SX } from './AiIntegrationBuilderView.styles';
import type { ProjectScope } from '../nav';

function scaffoldStepsText(response: CustomIntegrationResponse): string {
  const steps = response.steps.map((step, i) => `${i + 1}. ${step.title}: ${step.description}`).join('\n');
  return `Implementation plan for: ${response.title}\n\n${steps}`;
}

function AiIntegrationBuilderView(scope: ProjectScope): JSX.Element {
  const navigate = useAppNavigate();
  const location = useLocation() as { state?: { query?: string } };
  const { userId } = useAuth();
  const { projectId = '' } = useProjectId(scope.project);
  const orgUuid = useOrgUuid() ?? '';
  const { data: sampleImages } = useChoreoSampleImages(orgUuid, projectId);

  const initialQuery = location.state?.query ?? '';
  const { turns, activeQuery, isLoading, currentStage, submitQuery, clearHistory } = useAiIntegrationBuilder(projectId, initialQuery);

  const [followUp, setFollowUp] = useState('');
  const [isEditorOpened, setIsEditorOpened] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!initialQuery) navigate(componentsNewUrl(scope.org, scope.project));
  }, [initialQuery, navigate, scope.org, scope.project]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, isLoading]);

  const handleConfigureDeploy = (integration: PrebuiltIntegration) => {
    navigate(prebuiltIntegrationSetupUrl(scope.org, scope.project, derivePrebuiltSlug(integration)), { state: { integration } });
  };

  const handleOpenEditor = (response: CustomIntegrationResponse, query: string) => {
    const codeServerSample = (sampleImages ?? []).find((img) => img.name === 'Code Server');
    if (!codeServerSample) {
      setPageError('Cloud Editor image is not available. Please try again.');
      return;
    }
    const scaffoldKey = `ai-scaffold-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem(scaffoldKey, JSON.stringify({ initialScaffoldPrompt: query, initialScaffoldSteps: scaffoldStepsText(response) }));

    const url = buildCloudEditorUrl({ userId, orgUuid, orgHandle: scope.org, projectId, codeServerSample, scaffoldKey }, window.location.origin);
    if (window.open(url, '_blank')) {
      setIsEditorOpened(true);
    } else {
      setPageError('Please allow popups and try again.');
    }
  };

  const handleTryAgain = () => {
    clearHistory();
    navigate(componentsNewUrl(scope.org, scope.project));
  };

  const sendFollowUp = () => {
    const query = followUp.trim();
    if (!query || isLoading) return;
    setFollowUp('');
    submitQuery(query);
  };

  const renderAIResponse = (turn: ConversationTurn) => {
    const { query, response } = turn;
    switch (response.type) {
      case 'prebuilt':
        return <PrebuiltMatchCard response={response} onConfigureDeploy={handleConfigureDeploy} />;
      case 'custom':
        return <CustomPlanCard response={response} onOpenEditor={() => handleOpenEditor(response, query)} />;
      case 'unsupported':
        return <UnsupportedCard response={response} onTryAgain={handleTryAgain} />;
      case 'invalid':
        return <InvalidPromptCard response={response} onGoBack={handleTryAgain} />;
      case 'error':
        return <ErrorCard response={response} onRetry={handleTryAgain} />;
      default:
        return <Box />;
    }
  };

  const lastResponseType = turns[turns.length - 1]?.response.type;
  const showInputBar = !isLoading && lastResponseType !== 'unsupported' && lastResponseType !== 'invalid' && lastResponseType !== 'error';

  if (!initialQuery) return <></>;

  return (
    <PageContent sx={{ pt: 5, pb: 2 }}>
      <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate(componentsNewUrl(scope.org, scope.project))} sx={{ mb: 1, alignSelf: 'flex-start' }}>
        Back to Create Integration
      </Button>

      {pageError && (
        <Alert severity="error" onClose={() => setPageError(null)} sx={{ mb: 2 }}>
          {pageError}
        </Alert>
      )}

      <Box sx={CHAT_COLUMN_SX}>
        <Box sx={CHAT_MESSAGES_SX}>
          {turns.map((turn) => (
            <Fragment key={turn.id}>
              <UserMessage query={turn.query} />
              <Box sx={AGENT_ROW_SX}>
                <AgentAvatar />
                <Box sx={{ flex: 1, minWidth: 0 }}>{renderAIResponse(turn)}</Box>
              </Box>
            </Fragment>
          ))}

          {activeQuery && (
            <Fragment>
              <UserMessage query={activeQuery} />
              {isLoading && (
                <Box sx={AGENT_ROW_SX}>
                  <AgentAvatar />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <LoadingState currentStage={currentStage} />
                  </Box>
                </Box>
              )}
            </Fragment>
          )}

          <div ref={bottomRef} />
        </Box>

        {showInputBar && (
          <Box sx={STICKY_INPUT_SX}>
            <Box sx={INPUT_BOX_SX}>
              <InputBase
                multiline
                maxRows={5}
                fullWidth
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                placeholder="Describe another scenario or refine your request…"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && followUp.trim()) {
                    e.preventDefault();
                    sendFollowUp();
                  }
                }}
                sx={{ flex: 1, fontSize: '0.875rem' }}
              />
              <Button aria-label="Send follow-up" variant="contained" color="primary" onClick={sendFollowUp} disabled={!followUp.trim() || isLoading} sx={{ minWidth: 40, borderRadius: 1, flexShrink: 0 }}>
                <Send size={16} />
              </Button>
            </Box>
          </Box>
        )}
      </Box>

      <Dialog open={isEditorOpened} onClose={() => setIsEditorOpened(false)}>
        <DialogTitle>Cloud editor opened</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography>Continue editing the integration from the cloud editor, or go back to create a new integration.</Typography>
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" onClick={() => setIsEditorOpened(false)}>
                Stay here
              </Button>
              <Button variant="contained" color="primary" onClick={handleTryAgain}>
                Go back
              </Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>
    </PageContent>
  );
}

export default AiIntegrationBuilderView;
