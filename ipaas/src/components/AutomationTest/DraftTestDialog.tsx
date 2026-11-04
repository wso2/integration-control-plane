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

import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@wso2/oxygen-ui';
import type { JSX } from 'react';

export type DraftDialogMode = 'unsavedChanges' | 'existingDraft';
export type DraftDialogIntent = 'newTest' | 'applyExecution';

interface DraftTestDialogProps {
  open: boolean;
  mode: DraftDialogMode;
  intent: DraftDialogIntent;
  onClose: () => void;
  /** unsavedChanges: keep the current responses as a draft, then proceed. */
  onDraft?: () => void;
  /** unsavedChanges: discard the current responses, then proceed. */
  onClearAndProceed?: () => void;
  /** existingDraft: overwrite the existing draft with the current responses, then proceed. */
  onOverrideDraft?: () => void;
}

/**
 * Asks the user what to do with unsaved runtime-argument responses before starting
 * a New Test or applying a past execution. Ported from Devant's DraftTestDialog:
 * when no draft exists yet, offers Draft vs. Discard; when one already exists,
 * offers to override it. The kept draft is re-applyable from the Executions list.
 */
export default function DraftTestDialog({ open, mode, intent, onClose, onDraft, onClearAndProceed, onOverrideDraft }: DraftTestDialogProps): JSX.Element {
  const isExistingDraft = mode === 'existingDraft';
  const isNewTest = intent === 'newTest';

  const title = isNewTest ? 'Start new test?' : 'Apply execution?';
  const description = isExistingDraft
    ? isNewTest
      ? 'A draft test already exists. Starting a new test will override the existing draft.'
      : 'A draft test already exists. Applying this execution will override the existing draft.'
    : isNewTest
      ? 'You have unsaved runtime arguments. Draft them before starting a new test, or clear them entirely?'
      : 'You have unsaved changes. Do you want to draft the current test and apply?';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{description}</DialogContentText>
      </DialogContent>
      <DialogActions>
        {isExistingDraft ? (
          <>
            <Button variant="outlined" color="inherit" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="contained" onClick={onOverrideDraft}>
              {isNewTest ? 'Override draft & start new test' : 'Override draft & apply'}
            </Button>
          </>
        ) : (
          <>
            <Button variant="outlined" onClick={onClearAndProceed}>
              {isNewTest ? 'Clear & start new test' : 'Clear & apply'}
            </Button>
            <Button variant="contained" onClick={onDraft}>
              {isNewTest ? 'Draft & start new test' : 'Draft & apply'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
