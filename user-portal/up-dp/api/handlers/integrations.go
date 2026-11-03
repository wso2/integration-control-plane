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
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	ipaasportal "github.com/wso2-enterprise/integration-user-portal-service/shared/external-services/ipaas-portal"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/upstream"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/web"
	"github.com/wso2-enterprise/integration-user-portal-service/up-dp/api/middleware"
	"github.com/wso2-enterprise/integration-user-portal-service/up-dp/domain"
)

const (
	IntegrationIDParam = "integrationId"
	TrackIDParam       = "trackId"

	defaultPageSize = 20
	maxPageSize     = 100
)

type IntegrationHandler struct {
	catalog domain.CatalogService
}

func NewIntegrationHandler(catalog domain.CatalogService) *IntegrationHandler {
	return &IntegrationHandler{catalog: catalog}
}

func (h *IntegrationHandler) List(w http.ResponseWriter, r *http.Request) {
	params := r.URL.Query()
	query := domain.IntegrationQuery{
		Projects: params["project"],
		Search:   strings.TrimSpace(params.Get("search")),
		Limit:    defaultPageSize,
		Cursor:   params.Get("cursor"),
	}
	for _, raw := range params["kind"] {
		kind := domain.IntegrationKind(raw)
		if !kind.Valid() {
			web.StatusBadRequest(w, r, errors.New("unknown kind "+raw), `kind must be "aiAgent", "automation" or "workflow".`)
			return
		}
		query.Kinds = append(query.Kinds, kind)
	}
	if raw := params.Get("limit"); raw != "" {
		limit, err := strconv.Atoi(raw)
		if err != nil || limit < 1 || limit > maxPageSize {
			web.StatusBadRequest(w, r, fmt.Errorf("limit %q", raw), fmt.Sprintf("limit must be a number from 1 to %d.", maxPageSize))
			return
		}
		query.Limit = limit
	}

	page, err := h.catalog.Integrations(r.Context(), permissions(r), query)
	if errors.Is(err, ipaasportal.ErrInvalidCursor) {
		web.StatusBadRequest(w, r, err, "The cursor is not one this listing gave. Start again from the first page.")
		return
	}
	if err != nil {
		writeUpstreamError(w, r, err)
		return
	}
	web.WriteResponse(w, r, http.StatusOK, page)
}

func (h *IntegrationHandler) Projects(w http.ResponseWriter, r *http.Request) {
	projects, err := h.catalog.Projects(r.Context(), permissions(r))
	if err != nil {
		writeUpstreamError(w, r, err)
		return
	}
	if projects == nil {
		projects = []ipaasportal.Project{}
	}
	web.WriteResponse(w, r, http.StatusOK, projects)
}

func (h *IntegrationHandler) Get(w http.ResponseWriter, r *http.Request) {
	integration, err := h.catalog.Integration(r.Context(), permissions(r), chi.URLParam(r, IntegrationIDParam))
	if err != nil {
		writeUpstreamError(w, r, err)
		return
	}
	web.WriteResponse(w, r, http.StatusOK, integration)
}

func (h *IntegrationHandler) Deployment(w http.ResponseWriter, r *http.Request) {
	deployment, err := h.catalog.Deployment(r.Context(), permissions(r), chi.URLParam(r, IntegrationIDParam), chi.URLParam(r, TrackIDParam))
	if err != nil {
		writeUpstreamError(w, r, err)
		return
	}
	web.WriteResponse(w, r, http.StatusOK, deployment)
}

func (h *IntegrationHandler) Executions(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	page, err := h.catalog.Executions(r.Context(), permissions(r), chi.URLParam(r, IntegrationIDParam), chi.URLParam(r, TrackIDParam), limit, r.URL.Query().Get("before"))
	if err != nil {
		writeUpstreamError(w, r, err)
		return
	}
	web.WriteResponse(w, r, http.StatusOK, page)
}

func (h *IntegrationHandler) Trigger(w http.ResponseWriter, r *http.Request) {
	var req ipaasportal.TriggerRequest
	if err := web.ReadJSON(w, r, &req); err != nil {
		web.StatusBadRequest(w, r, err, `Request body must be JSON carrying "args".`)
		return
	}

	execution, err := h.catalog.Trigger(r.Context(), permissions(r), chi.URLParam(r, IntegrationIDParam), chi.URLParam(r, TrackIDParam), req.Args)
	if err != nil {
		var invalid *ipaasportal.InvalidArgsError
		if errors.As(err, &invalid) {
			web.StatusBadRequest(w, r, err, invalid.Message)
			return
		}
		writeUpstreamError(w, r, err)
		return
	}
	web.WriteResponse(w, r, http.StatusAccepted, execution)
}

func permissions(r *http.Request) domain.Permissions {
	return domain.NewPermissions(middleware.Identity(r.Context()).Scopes)
}

func writeUpstreamError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, domain.ErrForbidden):
		web.StatusForbidden(w, r, err)
	case errors.Is(err, upstream.ErrNotFound), errors.Is(err, domain.ErrNotFound):
		web.StatusNotFound(w, r, err)
	case errors.Is(err, upstream.ErrUnavailable):
		web.StatusServiceUnavailable(w, r, err)
	default:
		web.StatusInternalServerError(w, r, err, nil)
	}
}
