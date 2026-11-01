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

import { DrawerPanel } from '@wso2/oxygen-ui';
import { useEffect, useState } from 'react';
import type { Commit, Repository } from '../../types/repository';
import type { BuildRun } from '../../types/deployment';
import { BUILD_DRAWER_TITLES, BuildDrawerType } from '../../constants/build';
import BuildConfigPanel from './BuildConfigPanel';
import BuildDetails from './BuildDetails';
import CommitSelector from './CommitSelector';

interface BuildRightDrawerProps {
  open: boolean;
  onClose: () => void;
  drawerType: BuildDrawerType | null;
  selectedBuild: BuildRun | null;
  componentId: string;
  versionId: string;
  commits: Commit[];
  commitsLoading: boolean;
  onCommitBuild: (commit: Commit) => void;
  isBuildTriggering: boolean;
  repository: Repository | null;
  onNotify: (message: string, severity: 'success' | 'error') => void;
}

export default function BuildRightDrawer({ open, onClose, drawerType, selectedBuild, componentId, versionId, commits, commitsLoading, onCommitBuild, isBuildTriggering, repository, onNotify }: BuildRightDrawerProps) {
  const title = drawerType ? BUILD_DRAWER_TITLES[drawerType] : '';
  const [logsOpen, setLogsOpen] = useState(false);

  // Reset log panel state whenever the drawer type changes or drawer closes
  useEffect(() => { setLogsOpen(false); }, [drawerType, open]);

  const renderContent = () => {
    if (drawerType === BuildDrawerType.BuildLogs && selectedBuild) {
      return <BuildDetails componentId={componentId} versionId={versionId} build={selectedBuild} onLogsToggle={setLogsOpen} />;
    }
    if (drawerType === BuildDrawerType.CommitSelector) {
      return (
        <CommitSelector
          commits={commits}
          commitsLoading={commitsLoading}
          onBuild={(commit) => {
            onCommitBuild(commit);
            onClose();
          }}
          isBuildTriggering={isBuildTriggering}
        />
      );
    }
    if (drawerType === BuildDrawerType.BuildConfig && repository) {
      return <BuildConfigPanel repository={repository} componentId={componentId} versionId={versionId} onClose={onClose} onNotify={onNotify} />;
    }
    return null;
  };

  return (
    <DrawerPanel open={open} onClose={onClose} width={logsOpen ? 720 : 480}>
      <DrawerPanel.Header>
        <DrawerPanel.Title>{title}</DrawerPanel.Title>
        <DrawerPanel.Actions>
          <DrawerPanel.CloseButton />
        </DrawerPanel.Actions>
      </DrawerPanel.Header>

      <DrawerPanel.Body>{renderContent()}</DrawerPanel.Body>
    </DrawerPanel>
  );
}
