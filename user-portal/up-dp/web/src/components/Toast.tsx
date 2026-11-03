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

import { Alert, Snackbar } from '@wso2/oxygen-ui';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

interface Toast {
  message: string;
  severity: 'success' | 'error' | 'info';
}

const ToastContext = createContext<(message: string, severity?: Toast['severity']) => void>(() => {});

/** One short confirmation at a time, bottom left, as the console shows them. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const show = useCallback((message: string, severity: Toast['severity'] = 'success') => setToast({ message, severity }), []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <Snackbar open={!!toast} autoHideDuration={5000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        <Alert severity={toast?.severity ?? 'success'} variant="filled" onClose={() => setToast(null)} sx={{ minWidth: 280 }}>
          {toast?.message}
        </Alert>
      </Snackbar>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
