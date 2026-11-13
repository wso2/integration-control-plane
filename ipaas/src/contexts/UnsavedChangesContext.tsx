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
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { JSX, ReactNode } from 'react';
import { useLocation } from 'react-router';
import { historyIndex, historyRestoreDelta, isLeavingLinkClick } from '../utils/unsavedChanges';

interface UnsavedChangesContextType {
  setDirty: (id: string, dirty: boolean) => void;
  remove: (id: string) => void;
  /**
   * Runs `proceed` at once when no form is dirty; otherwise only after the user chooses to leave. A
   * `proceed` that returns a promise (a navigation that makes requests first) keeps leaving allowed until
   * the promise settles, and the guard is back once it has; one that never settles keeps it allowed while
   * the page unloads.
   */
  guardNavigation: (proceed: () => void | Promise<unknown>) => void;
}

const UnsavedChangesContext = createContext<UnsavedChangesContextType | undefined>(undefined);

// An action that stays on the page (an in-page Back) never changes the location, so the bypass also lapses on its own.
const BYPASS_MS = 1000;

export function UnsavedChangesProvider({ children }: { children: ReactNode }): JSX.Element {
  const entries = useRef(new Map<string, boolean>());
  const [blocking, setBlocking] = useState(false);
  const [pendingLeave, setPendingLeave] = useState<(() => void | Promise<unknown>) | null>(null);
  const historyIdx = useRef<number | null>(null);
  const restoringPop = useRef(false);
  // Set by "Leave page" so the one navigation goes through; forms keep their own dirty state.
  const bypass = useRef(false);
  const bypassTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const location = useLocation();

  useEffect(() => {
    historyIdx.current = historyIndex(window.history.state);
    bypass.current = false;
  }, [location]);

  useEffect(() => () => clearTimeout(bypassTimer.current), []);

  const anyDirty = useCallback(() => !bypass.current && [...entries.current.values()].some(Boolean), []);

  const setDirty = useCallback(
    (id: string, dirty: boolean) => {
      entries.current.set(id, dirty);
      setBlocking(anyDirty());
    },
    [anyDirty],
  );

  const remove = useCallback(
    (id: string) => {
      entries.current.delete(id);
      setBlocking(anyDirty());
    },
    [anyDirty],
  );

  const guardNavigation = useCallback(
    (proceed: () => void | Promise<unknown>) => {
      if (!anyDirty()) {
        proceed();
        return;
      }
      setPendingLeave(() => proceed);
    },
    [anyDirty],
  );

  const stay = () => setPendingLeave(null);

  const leave = () => {
    bypass.current = true;
    clearTimeout(bypassTimer.current);
    setPendingLeave(null);
    const result = pendingLeave?.();
    const release = () => {
      bypass.current = false;
    };
    // A timer would lapse before a slow navigation reloads the page and the browser asked again.
    if (result instanceof Promise) result.then(release, release);
    else bypassTimer.current = setTimeout(release, BYPASS_MS);
  };

  useEffect(() => {
    if (!blocking) return;

    // Reload and tab close can only show the browser's own prompt; no in-app dialog is allowed there.
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!anyDirty()) return;
      event.preventDefault();
      event.returnValue = '';
    };

    // Capture on document runs before React's root listener, so the router's Link never sees the click.
    const onClick = (event: MouseEvent) => {
      if (!anyDirty() || !(event.target instanceof Element)) return;
      const anchor = event.target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const link = { href: anchor.href, target: anchor.target, download: anchor.hasAttribute('download') };
      if (!isLeavingLinkClick(event, link, new URL(window.location.href))) return;
      event.preventDefault();
      event.stopPropagation();
      // Replaying the click once released keeps the link's own handlers (tracking, router navigation).
      guardNavigation(() => anchor.click());
    };

    // Capture listeners at the target run before the router's own popstate listener on window.
    const onPopState = (event: PopStateEvent) => {
      if (restoringPop.current) {
        restoringPop.current = false;
        event.stopImmediatePropagation();
        return;
      }
      if (!anyDirty()) return;
      const delta = historyRestoreDelta(historyIdx.current, event.state);
      if (delta === null) return;
      event.stopImmediatePropagation();
      restoringPop.current = true;
      window.history.go(delta);
      guardNavigation(() => window.history.go(-delta));
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPopState, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', onPopState, true);
      restoringPop.current = false;
    };
  }, [blocking, anyDirty, guardNavigation]);

  const value = useMemo<UnsavedChangesContextType>(() => ({ setDirty, remove, guardNavigation }), [setDirty, remove, guardNavigation]);

  return (
    <UnsavedChangesContext.Provider value={value}>
      {children}
      <Dialog open={pendingLeave !== null} onClose={stay} maxWidth="xs" fullWidth>
        <DialogTitle>Leave this page?</DialogTitle>
        <DialogContent>
          <DialogContentText>Changes you made will not be saved.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" color="inherit" onClick={stay}>
            Stay on page
          </Button>
          <Button variant="contained" color="error" onClick={leave}>
            Leave page
          </Button>
        </DialogActions>
      </Dialog>
    </UnsavedChangesContext.Provider>
  );
}

function useUnsavedChangesContext(): UnsavedChangesContextType {
  const context = useContext(UnsavedChangesContext);
  if (!context) {
    throw new Error('Unsaved-changes hooks must be used within UnsavedChangesProvider');
  }
  return context;
}

/** Asks before leaving while `isDirty`; call the returned `allowLeave` before navigating after a save or cancel. */
// eslint-disable-next-line react-refresh/only-export-components
export function useUnsavedChanges(isDirty: boolean): () => void {
  const { setDirty, remove } = useUnsavedChangesContext();
  const id = useId();

  useEffect(() => {
    setDirty(id, isDirty);
  }, [id, isDirty, setDirty]);

  useEffect(() => () => remove(id), [id, remove]);

  return useCallback(() => setDirty(id, false), [id, setDirty]);
}

/** For navigation code: wraps a navigation so it waits for the user's answer while a form is dirty. */
// eslint-disable-next-line react-refresh/only-export-components
export function useLeaveGuard(): (proceed: () => void | Promise<unknown>) => void {
  return useUnsavedChangesContext().guardNavigation;
}
