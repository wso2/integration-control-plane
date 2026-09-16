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

import { Box, Button, CircularProgress, InputAdornment, PageContent, Pagination, TextField, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft, Search } from '@wso2/oxygen-ui-icons-react';
import { useState, useMemo, useEffect, type JSX } from 'react';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { useCreateComponent } from '../hooks/useComponents';
import FilterSection from '../components/FilterSection';
import SampleGridCard from '../components/SampleGridCard';
import IntegrationCreationLoader from '../components/IntegrationCreationLoader';
import { componentSubTypeFromSample, displayTypeFromSample, formatBuildPack, formatComponentType, normalizeComponentType } from '../constants/integrations';
import { PAGE_SIZE } from '../constants/samples';
import { useSamples } from '../hooks/useSamples';
import { resourceUrl, narrow, newComponentUrl, type ProjectScope } from '../nav';
import type { Sample } from '../types/samples';
import { toHandler } from '../utils/string';
import { useProjectId } from '../hooks/useProjects';
import { trackEvent } from '../utils/tracking';

export default function BrowseSamples(scope: ProjectScope): JSX.Element {
  const navigate = useAppNavigate();
  const { projectId } = useProjectId(scope.project);
  const { data: samplesData, isLoading: isSamplesLoading, isError: isSamplesError } = useSamples();

  const uniqueTypes = samplesData?.uniqueTypes ?? [];
  const uniqueBuildPacks = samplesData?.uniqueBuildPacks ?? [];
  const uniqueTags = samplesData?.uniqueTags ?? [];

  const [search, setSearch] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [selectedBuildPacks, setSelectedBuildPacks] = useState<Set<string>>(new Set());
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [deployingSample, setDeployingSample] = useState<string | null>(null);

  const toggleFilter = (setter: React.Dispatch<React.SetStateAction<Set<string>>>) => (value: string) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const createComponent = useCreateComponent();

  const handleDeploy = (sample: Sample) => {
    if (!projectId) return;
    trackEvent('quick-deploy-click', { org: scope.org, project: scope.project, sample: sample.displayName, buildpack: sample.buildPack });
    setDeployingSample(sample.displayName);
    createComponent.mutate(
      {
        displayName: sample.displayName,
        name: toHandler(sample.displayName),
        description: sample.description,
        orgHandler: scope.org,
        projectId,
        displayType: displayTypeFromSample(sample.componentType, sample.buildPack),
        componentSubType: componentSubTypeFromSample(sample.componentType, sample.buildPack),
        srcGitRepoUrl: sample.repositoryUrl,
        repositorySubPath: `${sample.subDirectory ?? ''}${sample.componentPath}`,
        repositoryBranch: sample.branch ?? 'main',
        isPublicRepo: true,
        enableAutoDeploy: true,
      },
      {
        onSuccess: (component) => navigate(resourceUrl(narrow(scope, component.handler), 'overview')),
        onError: () => setDeployingSample(null),
      },
    );
  };

  const filtered = useMemo(() => {
    const samples = samplesData?.samples ?? [];
    const q = search.toLowerCase();
    return samples.filter((s) => {
      const matchesType = selectedTypes.size === 0 || selectedTypes.has(normalizeComponentType(s.componentType));
      const matchesBuildPack = selectedBuildPacks.size === 0 || selectedBuildPacks.has(s.buildPack);
      const matchesTags = selectedTags.size === 0 || s.tags.some((t) => selectedTags.has(t));
      const matchesSearch = !q || s.displayName.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.tags.some((t) => t.toLowerCase().includes(q));
      return matchesType && matchesBuildPack && matchesTags && matchesSearch;
    });
  }, [samplesData?.samples, search, selectedTypes, selectedBuildPacks, selectedTags]);

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setPage(1);
  }, [filtered]);

  const pageCount = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (isSamplesLoading) {
    return (
      <PageContent sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
        <CircularProgress />
      </PageContent>
    );
  }

  if (isSamplesError) {
    return (
      <PageContent sx={{ pt: 5 }}>
        <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate(newComponentUrl(scope))} sx={{ mb: 2 }}>
          Back
        </Button>
        <Typography color="error">Failed to load samples. Please try again later.</Typography>
      </PageContent>
    );
  }

  if (createComponent.isPending || createComponent.isSuccess || createComponent.isError) {
    return (
      <PageContent sx={{ pt: 5, display: 'flex', flexDirection: 'column', flex: 1 }}>
        <IntegrationCreationLoader
          label="Integration"
          subLabel={deployingSample || undefined}
          isPending={createComponent.isPending}
          isSuccess={createComponent.isSuccess}
          error={createComponent.isError ? (createComponent.error?.message ?? 'Something went wrong. Please try again.') : null}
          onBack={() => {
            createComponent.reset();
            setDeployingSample(null);
          }}
        />
      </PageContent>
    );
  }

  return (
    <PageContent sx={{ pt: 5 }}>
      <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate(newComponentUrl(scope))} sx={{ mb: 2 }}>
        Back
      </Button>

      <Typography variant="h1" sx={{ mb: 0.5, mt: 1 }}>
        Browse Samples
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 5 }}>
        Deploy a sample to get started quickly.
      </Typography>

      {/* Sidebar + Grid layout */}
      <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
        {/* Filter sidebar */}
        <Box
          sx={{
            width: 240,
            flexShrink: 0,
            borderRight: '1px solid',
            borderColor: 'divider',
            pr: 2,
          }}>
          <TextField
            size="small"
            placeholder="Search samples…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            fullWidth
            sx={{ mb: 2 }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={16} />
                  </InputAdornment>
                ),
              },
            }}
          />

          <FilterSection title="Type" items={uniqueTypes} selected={selectedTypes} onToggle={toggleFilter(setSelectedTypes)} labelFn={formatComponentType} />

          <Box sx={{ borderTop: '1px solid', borderColor: 'divider', my: 1 }} />

          <FilterSection title="Technology" items={uniqueBuildPacks} selected={selectedBuildPacks} onToggle={toggleFilter(setSelectedBuildPacks)} labelFn={formatBuildPack} />

          <Box sx={{ borderTop: '1px solid', borderColor: 'divider', my: 1 }} />

          <FilterSection title="Tags" items={uniqueTags} selected={selectedTags} onToggle={toggleFilter(setSelectedTags)} />
        </Box>

        {/* Grid */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {filtered.length === 0 ? (
            <Typography color="text.secondary">No samples match your search.</Typography>
          ) : (
            <>
              {/* Top pagination */}
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                <Pagination count={pageCount} page={page} onChange={(_, value) => setPage(value)} size="small" shape="rounded" />
              </Box>

              <Box
                sx={{
                  display: 'grid',
                  gap: 2,
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                }}>
                {paginated.map((sample) => (
                  <SampleGridCard key={sample.displayName} sample={sample} onDeploy={() => handleDeploy(sample)} isDeploying={deployingSample === sample.displayName} />
                ))}
              </Box>

              {/* Bottom pagination */}
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
                <Pagination count={pageCount} page={page} onChange={(_, value) => setPage(value)} size="small" shape="rounded" />
              </Box>
            </>
          )}
        </Box>
      </Box>
    </PageContent>
  );
}
