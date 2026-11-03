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

package handlers

import (
	"net/http"

	"github.com/wso2-enterprise/integration-user-portal-service/shared/web"
	"github.com/wso2-enterprise/integration-user-portal-service/up-dp/domain"
)

type scopeList struct {
	Scopes []string `json:"scopes"`
}

type ScopeHandler struct {
	scopes domain.ScopeService
}

func NewScopeHandler(scopes domain.ScopeService) *ScopeHandler {
	return &ScopeHandler{scopes: scopes}
}

func (h *ScopeHandler) List(w http.ResponseWriter, r *http.Request) {
	web.WriteResponse(w, r, http.StatusOK, scopeList{Scopes: h.scopes.Scopes(r.Context())})
}
