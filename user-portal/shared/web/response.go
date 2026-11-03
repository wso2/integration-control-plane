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

package web

import (
	"fmt"
	"net/http"
)

func WriteResponse(w http.ResponseWriter, r *http.Request, status int, data any) {
	err := WriteJSON(r.Context(), w, status, data)
	if err != nil {
		StatusInternalServerError(w, r, fmt.Errorf("failed to write JSON response: %v", err), nil)
	}
}

// WriteNoContent answers 204. It echoes the correlation id itself, because with no
// body WriteJSON never runs.
func WriteNoContent(w http.ResponseWriter, r *http.Request) {
	SetCorrelationID(r.Context(), w)
	w.WriteHeader(http.StatusNoContent)
}

// Redirect answers 302, echoing the correlation id for the same reason.
func Redirect(w http.ResponseWriter, r *http.Request, url string) {
	SetCorrelationID(r.Context(), w)
	http.Redirect(w, r, url, http.StatusFound)
}
