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
