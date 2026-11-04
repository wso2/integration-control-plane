/*
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
