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
import { useParams } from 'react-router';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { useAuth } from '../auth';
import { Alert, Box, Button, Card, CardContent, Typography } from '@wso2/oxygen-ui';
import ProjectCardListSkeleton from '../components/ProjectCardListSkeleton';
import { useCreateProject } from '../hooks/useProjects';
import { fetchProjects as fetchProjectsApi } from '../api/projects';
import { projectHomeUrl } from '../paths';
import { newComponentUrl } from '../nav';
import { DEFAULT_PROJECT_HANDLER } from '../constants/project';
import Projects from './Projects';

function OnboardingShell({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        bgcolor: 'background.default',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Card sx={{ maxWidth: 480, width: '100%', borderRadius: 2, boxShadow: 3, bgcolor: 'background.paper' }}>
        <CardContent sx={{ p: 4, '&:last-child': { pb: 4 } }}>{children}</CardContent>
      </Card>
    </Box>
  );
}

export default function OrgHome(): JSX.Element {
  const { orgHandler } = useParams<{ orgHandler: string }>();
  const navigate = useAppNavigate();
  const { userId } = useAuth();

  // Unscoped, a second org — or a second user on this browser — read as already-onboarded.
  const onboardedKey = `persona:${userId}:${orgHandler ?? ''}`;
  const [step, setStep] = useState<'checking' | 'provisioning-error' | 'done'>(() => (localStorage.getItem(onboardedKey) ? 'done' : 'checking'));

  // The route reuses this component across orgs, so a switch must re-check against the new key
  // rather than keep the previous org's 'done'.
  useEffect(() => {
    setStep(localStorage.getItem(onboardedKey) ? 'done' : 'checking');
  }, [onboardedKey]);

  const [provisionError, setProvisionError] = useState<string | null>(null);
  const createProjectMutation = useCreateProject();

  // A user with projects goes straight to the most recently updated one, so they land in a
  // project view instead of the org-home spinner; a new org gets its Default project.
  useEffect(() => {
    if (step !== 'checking') return;
    fetchProjectsApi()
      .then((projects) => {
        const usable = projects.filter((p) => p.handler);
        if (usable.length > 0) {
          const recent = usable.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
          localStorage.setItem(onboardedKey, 'developer');
          navigate(projectHomeUrl(orgHandler!, recent.handler), { replace: true });
          return undefined;
        }
        return createProjectMutation.mutateAsync({ name: 'Default', handler: DEFAULT_PROJECT_HANDLER, description: '', orgHandler: orgHandler! }).then(() => {
          localStorage.setItem(onboardedKey, 'developer');
          // freshDefaultProject tells AppLayout it can hide the left nav immediately, without
          // waiting on the components/projects queries — we already know this project is empty
          // and the org has no other projects, since we just created it.
          navigate(newComponentUrl({ org: orgHandler!, project: DEFAULT_PROJECT_HANDLER }), { replace: true });
        });
      })
      .catch((err) => {
        setProvisionError(err instanceof Error ? err.message : 'Setup failed. Please try again.');
        setStep('provisioning-error');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, navigate, orgHandler]);

  if (step === 'checking') {
    return <ProjectCardListSkeleton />;
  }

  if (step === 'provisioning-error') {
    return (
      <OnboardingShell>
        <Typography variant="h3" component="h1" sx={{ mb: 4 }}>
          Something went wrong
        </Typography>
        <Alert severity="error" sx={{ mb: 3 }}>
          {provisionError}
        </Alert>
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <Button
            variant="contained"
            color="primary"
            onClick={() => {
              setProvisionError(null);
              setStep('checking');
            }}>
            Retry
          </Button>
        </Box>
      </OnboardingShell>
    );
  }

  return <Projects level="organizations" org={orgHandler!} />;
}
