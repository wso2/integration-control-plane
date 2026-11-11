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

import { Alert, Box, Button, Card, CardActionArea, IconButton, ListItemText, MenuItem, Stack, TextField, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Activity, Globe, Pencil } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX, type ReactNode } from 'react';
import type { AgentVoiceEndpointState } from '../../hooks/useAgentVoiceEndpoint';
import { useComponents } from '../../hooks/useComponents';
import type { Project } from '../../types/project';
import type { VoiceTargetMode } from '../../types/voiceAgent';
import { isLiveAiAgent } from '../../utils/identifyIntegration';
import { effectiveVoiceAgentHandler, helperText } from '../../utils/voiceAgent';
import type { VoiceAgentStepProps } from './VoiceAgentSteps';
import * as styles from './VoiceAgentTargetStep.styles';

export interface VoiceAgentTargetStepProps extends VoiceAgentStepProps {
  orgHandler: string;
  projects: Project[];
  projectId: string;
  onProjectChange: (projectId: string) => void;
  lockProject: boolean;
  agentEndpoint: AgentVoiceEndpointState;
  voicedAgents: ReadonlySet<string>;
}

export default function VoiceAgentTargetStep({ settings, errors, onChange, orgHandler, projects, projectId, onProjectChange, lockProject, agentEndpoint, voicedAgents }: VoiceAgentTargetStepProps): JSX.Element {
  const [editingName, setEditingName] = useState(!!settings.name);
  const { data: components, isLoading: loadingAgents } = useComponents(orgHandler, projectId);
  const agents = (components ?? []).filter(isLiveAiAgent);
  const selectedAgent = agents.find((a) => a.handler === settings.targetAgentHandler);

  const chooseMode = (targetMode: VoiceTargetMode) => {
    if (targetMode === settings.targetMode) return;
    onChange({ targetMode, targetAgentHandler: '', targetAgentWsUrl: '' });
  };

  const chooseAgent = (handler: string) => {
    const agent = agents.find((a) => a.handler === handler);
    if (!agent || voicedAgents.has(handler)) return;
    const agentName = agent.displayName || agent.handler;
    onChange({ targetAgentHandler: handler, targetAgentWsUrl: '', displayName: settings.displayName || `${agentName} - Voice agent` });
  };

  return (
    <Stack gap={2.5} sx={styles.formSx}>
      <TextField
        labelPlacement="top"
        select
        label="Target project"
        fullWidth
        value={projectId}
        disabled={lockProject}
        onChange={(e) => {
          onProjectChange(e.target.value);
          onChange({ targetAgentHandler: '', targetAgentWsUrl: '' });
        }}
        helperText={lockProject ? 'The voice agent is created in this project. Start from AI services > Voice agents to pick another one.' : 'The voice agent is created in this project.'}>
        {projects.map((p) => (
          <MenuItem key={p.id} value={p.id}>
            {p.name}
          </MenuItem>
        ))}
      </TextField>

      <Card variant="outlined" sx={styles.targetCardSx}>
        <Stack gap={2}>
          <Box>
            <Typography variant="subtitle1" fontWeight={600}>
              Target agent
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Pick the agent this voice agent relays caller messages to.
            </Typography>
          </Box>
          <Alert severity="info">
            <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
              How your target agent should handle a message
            </Typography>
            <Typography variant="body2">The voice agent talks to your agent over WebSocket, so your agent needs to:</Typography>
            <Box component="ul" sx={styles.ruleListSx}>
              <li>
                <Typography variant="body2">
                  Accept the <code>sessionId</code> as a query parameter on the WebSocket URL (for example <code>ws://your-agent-host/path?sessionId=&lt;id&gt;</code>). It stays the same for the whole conversation.
                </Typography>
              </li>
              <li>
                <Typography variant="body2">Accept each caller message as a plain-text WebSocket message holding the caller&apos;s latest utterance, and reply with a plain-text message.</Typography>
              </li>
              <li>
                <Typography variant="body2">Signal a failure by closing the WebSocket with an error close code and reason, rather than sending the error back as a message.</Typography>
              </li>
            </Box>
          </Alert>

          <Box sx={styles.modeGridSx}>
            <ModeCard selected={settings.targetMode === 'platform'} onSelect={() => chooseMode('platform')} icon={<Activity size={22} />} title="Platform-hosted agent" description="An AI agent already deployed in this project." />
            <ModeCard selected={settings.targetMode === 'external'} onSelect={() => chooseMode('external')} icon={<Globe size={22} />} title="Externally hosted agent" description="Any agent you host yourself, reachable over WebSocket." />
          </Box>

          {settings.targetMode === 'platform' ? (
            <>
              <TextField
                labelPlacement="top"
                select
                label="Agent"
                fullWidth
                value={selectedAgent ? settings.targetAgentHandler : ''}
                disabled={loadingAgents}
                onChange={(e) => chooseAgent(e.target.value)}
                error={!!errors.targetAgentHandler}
                helperText={helperText(errors.targetAgentHandler, agents.length === 0 && !loadingAgents ? 'This project has no AI agents yet. Create one, or use an externally hosted agent.' : ' ')}
                SelectProps={{ displayEmpty: true }}>
                <MenuItem value="" disabled>
                  {loadingAgents ? 'Loading agents' : 'Select a deployed agent to add voice to'}
                </MenuItem>
                {agents.map((a) => (
                  <MenuItem key={a.id} value={a.handler} disabled={voicedAgents.has(a.handler)}>
                    <ListItemText primary={a.displayName || a.handler} secondary={voicedAgents.has(a.handler) ? 'Already has a voice agent' : undefined} />
                  </MenuItem>
                ))}
              </TextField>
              {selectedAgent && <AgentEndpointStatus state={agentEndpoint} agentName={selectedAgent.displayName || selectedAgent.handler} />}
            </>
          ) : (
            <TextField
              labelPlacement="top"
              label="WebSocket URL"
              placeholder="wss://your-agent-host"
              fullWidth
              value={settings.targetAgentWsUrl}
              onChange={(e) => onChange({ targetAgentWsUrl: e.target.value })}
              error={!!errors.targetAgentWsUrl}
              helperText={helperText(errors.targetAgentWsUrl)}
            />
          )}
        </Stack>
      </Card>

      <Box sx={styles.nameRowSx}>
        <TextField labelPlacement="top" label="Display name" fullWidth value={settings.displayName} onChange={(e) => onChange({ displayName: e.target.value })} error={!!errors.displayName} helperText={helperText(errors.displayName)} />
        <TextField
          labelPlacement="top"
          label="Name"
          fullWidth
          value={editingName ? settings.name : effectiveVoiceAgentHandler(settings)}
          disabled={!editingName}
          onChange={(e) => onChange({ name: e.target.value })}
          error={!!errors.name}
          helperText={helperText(errors.name, editingName ? `Created as ${effectiveVoiceAgentHandler(settings) || '…'}` : 'Derived from the display name.')}
          InputProps={{
            endAdornment: !editingName && (
              <Tooltip title="Edit name">
                <IconButton
                  aria-label="Edit name"
                  size="small"
                  onClick={() => {
                    setEditingName(true);
                    onChange({ name: effectiveVoiceAgentHandler(settings) });
                  }}>
                  <Pencil size={16} />
                </IconButton>
              </Tooltip>
            ),
          }}
        />
      </Box>
      <TextField labelPlacement="top" label="Description" optional fullWidth multiline minRows={3} value={settings.description} onChange={(e) => onChange({ description: e.target.value })} helperText=" " />
    </Stack>
  );
}

interface ModeCardProps {
  selected: boolean;
  onSelect: () => void;
  icon: ReactNode;
  title: string;
  description: string;
}

function ModeCard({ selected, onSelect, icon, title, description }: ModeCardProps): JSX.Element {
  return (
    <Card variant="outlined" sx={styles.modeCardSx(selected)}>
      <CardActionArea onClick={onSelect} aria-pressed={selected} sx={styles.modeActionSx}>
        {icon}
        <Box>
          <Typography variant="subtitle1" fontWeight={600}>
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {description}
          </Typography>
        </Box>
      </CardActionArea>
    </Card>
  );
}

export function AgentEndpointStatus({ state, agentName }: { state: AgentVoiceEndpointState; agentName: string }): JSX.Element | null {
  switch (state.status) {
    case 'error':
      return (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={state.retry}>
              Retry
            </Button>
          }>
          {`Couldn't check whether ${agentName} is deployed with a WebSocket endpoint.`}
        </Alert>
      );
    case 'no-environment':
      return <Alert severity="warning">This project has no environment to deploy the voice agent to.</Alert>;
    case 'not-deployed':
      return <Alert severity="warning">{`${agentName} is not deployed in ${state.env.name}. Build and deploy it, then come back.`}</Alert>;
    case 'no-endpoint':
      return <Alert severity="warning">{`${agentName} has no WebSocket endpoint in ${state.env.name}.`}</Alert>;
    default:
      return null;
  }
}
