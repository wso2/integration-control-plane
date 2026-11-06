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

// Package portal is iPaaS-Service's portal route group: the only routes a portal
// client may call, and only for its own org.
package portal

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/wso2-enterprise/integration-user-portal-service/ipaas-mock/catalog"
	"github.com/wso2-enterprise/integration-user-portal-service/ipaas-mock/config"
	"github.com/wso2-enterprise/integration-user-portal-service/ipaas-mock/platformidp"
	ipaasportal "github.com/wso2-enterprise/integration-user-portal-service/shared/external-services/ipaas-portal"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/web"
)

type Handler struct {
	catalog *catalog.Catalog
	idp     *platformidp.IdP
}

func New(c *catalog.Catalog, idp *platformidp.IdP) *Handler {
	return &Handler{catalog: c, idp: idp}
}

type envKey struct{}

func (h *Handler) Routes() http.Handler {
	r := chi.NewRouter()
	r.Route("/user-portal/orgs/{orgUuid}/environments/{envId}", func(r chi.Router) {
		r.Use(h.portalClientOnly, h.knownEnvironment)
		r.Get("/scopes", h.scopes)
		r.Get("/projects", h.projects)
		r.Get("/components", h.components)
		r.Get("/components/{componentUid}", h.component)
		r.Get("/components/{componentUid}/deployment-tracks/{trackId}/deployment", h.deployment)
		r.Get("/components/{componentUid}/deployment-tracks/{trackId}/executions", h.executions)
		r.Post("/components/{componentUid}/deployment-tracks/{trackId}/executions", h.trigger)
	})

	// Mock only: what publishing and unpublishing in the console does.
	r.Route("/mock/environments/{envId}/published/{componentUid}", func(r chi.Router) {
		r.Use(h.knownEnvironment)
		r.Put("/", h.setPublished(true))
		r.Delete("/", h.setPublished(false))
	})
	return r
}

// knownEnvironment answers 404 for an environment the org doesn't have, and
// hands the handlers its name.
func (h *Handler) knownEnvironment(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		env, err := h.catalog.Environment(chi.URLParam(r, "envId"))
		if err != nil {
			writeError(w, r, err)
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), envKey{}, env.Name)))
	})
}

func envName(r *http.Request) string {
	name, _ := r.Context().Value(envKey{}).(string)
	return name
}

// portalClientOnly admits a Platform IdP token issued to the portal client of the org in
// the path: its client ID is exactly the portal prefix and that org's UUID.
func (h *Handler) portalClientOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !ok || raw == "" {
			web.StatusUnauthorized(w, r, errors.New("no bearer token"))
			return
		}

		claims, err := h.idp.Verify(raw)
		if err != nil {
			web.StatusUnauthorized(w, r, err)
			return
		}

		if !strings.HasPrefix(claims.ClientID, config.PortalClientPrefix) {
			web.StatusForbidden(w, r, fmt.Errorf("client %q is not a portal client", claims.ClientID))
			return
		}

		orgUUID := chi.URLParam(r, "orgUuid")
		if claims.OUID != orgUUID || orgUUID != h.catalog.Org().UUID.String() ||
			claims.ClientID != config.PortalClientPrefix+orgUUID {
			web.StatusForbidden(w, r, fmt.Errorf("token org %q may not read org %q", claims.OUID, orgUUID))
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (h *Handler) scopes(w http.ResponseWriter, r *http.Request) {
	web.WriteResponse(w, r, http.StatusOK, ipaasportal.PublishedScopes{Scopes: h.catalog.Scopes(envName(r))})
}

func (h *Handler) setPublished(published bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := h.catalog.SetPublished(envName(r), chi.URLParam(r, "componentUid"), published); err != nil {
			writeError(w, r, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

func (h *Handler) projects(w http.ResponseWriter, r *http.Request) {
	web.WriteResponse(w, r, http.StatusOK, ipaasportal.ProjectList{Items: h.catalog.Projects(envName(r), kindsOf(r))})
}

func (h *Handler) components(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	limit, _ := strconv.Atoi(query.Get("limit"))
	page, err := h.catalog.Components(envName(r), ipaasportal.ComponentQuery{
		Kinds:    kindsOf(r),
		Projects: query["project"],
		Search:   query.Get("search"),
		Limit:    limit,
		Cursor:   query.Get("cursor"),
	})
	if err != nil {
		writeError(w, r, err)
		return
	}
	web.WriteResponse(w, r, http.StatusOK, page)
}

func (h *Handler) component(w http.ResponseWriter, r *http.Request) {
	component, err := h.catalog.Component(envName(r), chi.URLParam(r, "componentUid"))
	if err != nil {
		writeError(w, r, err)
		return
	}
	web.WriteResponse(w, r, http.StatusOK, component)
}

func (h *Handler) deployment(w http.ResponseWriter, r *http.Request) {
	deployment, err := h.catalog.Deployment(envName(r), chi.URLParam(r, "componentUid"), chi.URLParam(r, "trackId"))
	if err != nil {
		writeError(w, r, err)
		return
	}
	web.WriteResponse(w, r, http.StatusOK, deployment)
}

func (h *Handler) executions(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	page, err := h.catalog.Executions(envName(r), chi.URLParam(r, "componentUid"), chi.URLParam(r, "trackId"),
		limit, r.URL.Query().Get("before"))
	if err != nil {
		writeError(w, r, err)
		return
	}
	web.WriteResponse(w, r, http.StatusOK, page)
}

func (h *Handler) trigger(w http.ResponseWriter, r *http.Request) {
	var req ipaasportal.TriggerRequest
	if err := web.ReadJSON(w, r, &req); err != nil {
		web.StatusBadRequest(w, r, err, `Request body must be JSON carrying "args".`)
		return
	}

	execution, err := h.catalog.Trigger(envName(r), chi.URLParam(r, "componentUid"), chi.URLParam(r, "trackId"), req.Args)
	if err != nil {
		writeError(w, r, err)
		return
	}
	web.WriteResponse(w, r, http.StatusAccepted, execution)
}

func kindsOf(r *http.Request) []ipaasportal.DisplayType {
	var kinds []ipaasportal.DisplayType
	for _, kind := range r.URL.Query()["kind"] {
		kinds = append(kinds, ipaasportal.DisplayType(kind))
	}
	return kinds
}

func writeError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, catalog.ErrNotFound):
		web.StatusNotFound(w, r, err)
	case errors.Is(err, catalog.ErrInvalidArgs):
		web.StatusBadRequest(w, r, err, strings.TrimPrefix(err.Error(), catalog.ErrInvalidArgs.Error()+": "))
	case errors.Is(err, catalog.ErrInvalidCursor):
		web.StatusBadRequest(w, r, err, ipaasportal.InvalidCursorMessage)
	default:
		web.StatusInternalServerError(w, r, err, nil)
	}
}
