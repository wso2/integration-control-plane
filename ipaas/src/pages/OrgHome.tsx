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
import { useAuth } from '../auth/AuthContext';
// ButtonBase, Stack (below) and ArrowRight, Settings, Users (icons) are only used by the
// persona-selection step, which is commented out below — restore these imports alongside it.
import { Alert, Box, Button, Card, CardContent, CircularProgress, FormControl, MenuItem, Select, Typography } from '@wso2/oxygen-ui';
import { useOrgUuid } from '../hooks/useOrgUuid';
import { useCreateDefaultProject, useFetchProjectsByOrgId, useInitOrg } from '../hooks/useOrg';
import { useCreateProject } from '../hooks/useProjects';
import { fetchProjects as fetchProjectsApi } from '#api/projects';
import { projectHomeUrl } from '../paths';
import { newComponentUrl } from '../nav';
import { IS_CLOUD } from '../features';
import { DEFAULT_PROJECT_HANDLER } from '../constants/project';
import Projects from './Projects';

const REGION_KEY = 'region';

// Disabled along with the persona-selection step below — we aren't saving this anywhere yet.
// const PERSONAS = [
//   {
//     id: 'developer',
//     title: 'Developer/Architect/Product Manager',
//     description: 'Focus on building, testing, and deploying applications.',
//     Icon: Users,
//   },
//   {
//     id: 'platform-engineer',
//     title: 'Platform Engineer/SRE',
//     description: 'Focus on infrastructure, governance, service mesh, and monitoring.',
//     Icon: Settings,
//   },
// ] as const;

const REGIONS = [
  { value: 'US', label: '🇺🇸 US' },
  { value: 'EU', label: '🇪🇺 EU' },
];

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
  const [step, setStep] = useState<'checking' | 'persona' | 'region' | 'provisioning-error' | 'done'>(() => (localStorage.getItem(onboardedKey) ? 'done' : 'checking'));

  // The route reuses this component across orgs, so a switch must re-check against the new key
  // rather than keep the previous org's 'done'.
  useEffect(() => {
    setStep(localStorage.getItem(onboardedKey) ? 'done' : 'checking');
  }, [onboardedKey]);
  // setPersona is unused while the persona-selection step below is commented out — restore it there.
  const [persona] = useState<string>('developer');
  const [region, setRegion] = useState<string>('US');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [provisionError, setProvisionError] = useState<string | null>(null);

  const fetchProjects = useFetchProjectsByOrgId();
  const initOrgMutation = useInitOrg();
  const createProjectMutation = useCreateDefaultProject();
  const createCloudProjectMutation = useCreateProject();
  const orgUuidFromToken = useOrgUuid();

  // Derived on every render so the effect below re-fires once AppLayout's async
  // ID-recovery sets window.API_CONFIG.asgardeoOrgNumericId and triggers a re-render.
  const orgNumericId = window.API_CONFIG.asgardeoOrgNumericId || parseInt(localStorage.getItem('org_numeric_id') || '0', 10);

  // For users without persona set, check if they already have projects (existing user).
  // If yes, skip onboarding and go directly to the projects list.
  // The effect waits (returns early) until orgNumericId is non-zero so it does not
  // prematurely fall through to the persona step before the ID has been recovered.
  useEffect(() => {
    if (step !== 'checking') return;

    // Cloud: numeric IDs aren't issued by Thunder; skip the AppLayout
    // ID-recovery wait and use the JWT-scoped fetchProjects. Navigate
    // straight to the most recently updated project when one exists so
    // users land in a project view instead of the org-home spinner.
    if (IS_CLOUD) {
      fetchProjectsApi(0)
        .then((projects) => {
          const usable = projects.filter((p) => p.handler);
          if (usable.length > 0) {
            const recent = usable.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
            localStorage.setItem(onboardedKey, 'developer');
            navigate(projectHomeUrl(orgHandler!, recent.handler), { replace: true });
            return undefined;
          }
          // Cloud has no region-scoped data planes, so region selection doesn't apply here —
          // provision the default project directly instead of showing that step.
          return createCloudProjectMutation.mutateAsync({ name: 'Default', handler: DEFAULT_PROJECT_HANDLER, description: '', orgHandler: orgHandler! }).then(() => {
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
      return;
    }

    if (!orgNumericId) return; // wait for AppLayout's ID-recovery to complete
    fetchProjects(orgNumericId)
      .then((projects) => {
        if (projects.some((p) => p.handler)) {
          localStorage.setItem(onboardedKey, 'developer');
          setStep('done');
        } else {
          // Persona selection is disabled (see the commented-out step below) — go straight to region.
          setStep('region');
        }
      })
      .catch(() => setStep('region'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, orgNumericId, fetchProjects, navigate, orgHandler]);

  if (step === 'checking') {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', bgcolor: 'background.default' }}>
        <CircularProgress />
      </Box>
    );
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

  if (step === 'done') {
    return <Projects level="organizations" org={orgHandler!} />;
  }

  if (step === 'region') {
    const handleGetStarted = async () => {
      setIsSubmitting(true);
      setSubmitError(null);
      try {
        const orgUuid = orgUuidFromToken;
        const orgNumericId = window.API_CONFIG.asgardeoOrgNumericId ?? parseInt(localStorage.getItem('org_numeric_id') ?? '0', 10);
        const handle = orgHandler!;

        // Step 1: Init default environments for the org
        if (orgUuid) {
          await initOrgMutation.mutateAsync({ orgUuid, region });
        }

        // Step 2: Create the default project.
        // cloud: Thunder issues no numeric org id, so the numericId-gated
        // default-project route is unavailable; provision through the JWT-scoped
        // create API instead. Either path must succeed before we navigate to the
        // project route below, otherwise onboarding lands on a missing project.
        if (IS_CLOUD) {
          await createCloudProjectMutation.mutateAsync({ name: 'Default', handler: DEFAULT_PROJECT_HANDLER, description: '', orgHandler: handle });
        } else if (orgNumericId) {
          await createProjectMutation.mutateAsync({ orgNumericId, orgHandler: handle, projectHandler: DEFAULT_PROJECT_HANDLER });
        }

        // Only mark onboarding complete and navigate on success
        localStorage.setItem(onboardedKey, persona);
        localStorage.setItem(REGION_KEY, region);
        // freshDefaultProject tells AppLayout it can hide the left nav immediately, without
        // waiting on the components/projects queries — we already know this project is empty and
        // the org has no other projects, since we just created it.
        navigate(newComponentUrl({ org: orgHandler!, project: DEFAULT_PROJECT_HANDLER }), { replace: true });
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'Setup failed. Please try again.');
        setIsSubmitting(false);
      }
    };

    return (
      <OnboardingShell>
        <Typography variant="h3" component="h1" sx={{ mb: 4 }}>
          Select Your Region
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Select the cloud region to deploy your applications.
        </Typography>

        <Alert severity="info" variant="outlined" icon={false} sx={{ mb: 3 }}>
          You can start with the default Cloud Data Plane and later set up your own Private Data Plane by connecting your Kubernetes cluster
        </Alert>

        {submitError && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {submitError}
          </Alert>
        )}

        <FormControl size="small" sx={{ mb: 3, width: 200, display: 'flex', mx: 'auto' }}>
          <Select value={region} onChange={(e) => setRegion(e.target.value as string)} MenuProps={{ sx: { zIndex: 10000 } }}>
            {REGIONS.map((r) => (
              <MenuItem key={r.value} value={r.value}>
                {r.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5 }}>
          {/* Back → persona is disabled along with the persona step below — nothing to go back to. */}
          <Button variant="contained" color="primary" onClick={handleGetStarted} disabled={isSubmitting} startIcon={isSubmitting ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {isSubmitting ? 'Setting up...' : 'Get Started'}
          </Button>
        </Box>
      </OnboardingShell>
    );
  }

  // step === 'persona' — disabled for now, we aren't saving this selection anywhere.
  // `setStep('persona')` is never called (all call sites above go straight to 'region'
  // instead), so this is unreachable; kept commented out rather than deleted so it's
  // easy to bring back once persona is actually persisted.
  //
  // return (
  //   <OnboardingShell>
  //     <Typography variant="h3" component="h1" sx={{ mb: 4 }}>
  //       Welcome to WSO2 Integration Platform
  //     </Typography>
  //     <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
  //       WSO2 Integration Platform provides customized views for developers, architects, platform engineers, and SREs to streamline workflows.
  //     </Typography>
  //
  //     <Typography variant="body2" sx={{ mb: 1.5 }}>
  //       Select your persona to get started
  //     </Typography>
  //
  //     <Box role="radiogroup" aria-label="Select your persona">
  //       <Stack spacing={1.5}>
  //         {PERSONAS.map(({ id, title, description, Icon }) => (
  //           <ButtonBase
  //             key={id}
  //             role="radio"
  //             aria-checked={persona === id}
  //             tabIndex={0}
  //             onClick={() => setPersona(id)}
  //             sx={{
  //               display: 'block',
  //               width: '100%',
  //               textAlign: 'left',
  //               border: persona === id ? '2px solid' : '1px solid',
  //               borderColor: persona === id ? 'primary.main' : 'divider',
  //               borderRadius: 1,
  //               '&:hover': { borderColor: 'primary.main' },
  //               '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: '2px' },
  //             }}>
  //             <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', py: 1.5, px: 2 }}>
  //               <Box sx={{ color: 'primary.main', mt: 0.5, flexShrink: 0 }}>
  //                 <Icon size={28} />
  //               </Box>
  //               <Box>
  //                 <Typography variant="body1" fontWeight="bold">
  //                   {title}
  //                 </Typography>
  //                 <Typography variant="body2" color="text.secondary">
  //                   {description}
  //                 </Typography>
  //               </Box>
  //             </Box>
  //           </ButtonBase>
  //         ))}
  //       </Stack>
  //     </Box>
  //
  //     <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
  //       <Button variant="contained" color="primary" onClick={() => setStep('region')} endIcon={<ArrowRight size={16} />}>
  //         Next
  //       </Button>
  //     </Box>
  //   </OnboardingShell>
  // );
  return <></>;
}
