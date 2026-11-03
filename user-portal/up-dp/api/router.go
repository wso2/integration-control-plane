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

package api

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"

	"github.com/wso2-enterprise/integration-user-portal-service/shared/httpmw"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/web"
	"github.com/wso2-enterprise/integration-user-portal-service/up-dp/api/handlers"
	"github.com/wso2-enterprise/integration-user-portal-service/up-dp/api/middleware"
	"github.com/wso2-enterprise/integration-user-portal-service/up-dp/config"
	"github.com/wso2-enterprise/integration-user-portal-service/up-dp/service"
)

const (
	apiPrefix  = "/api/v1"
	healthPath = apiPrefix + "/health"
)

func Mount(services *service.Registry, cfg config.Config, logger *zap.Logger) http.Handler {
	r := chi.NewRouter()

	var quiet []string
	if !cfg.LogHealthChecks {
		quiet = append(quiet, healthPath)
	}
	r.Use(httpmw.RequestID, httpmw.CorrelationID, httpmw.WithLogger(logger), httpmw.Recovery,
		httpmw.LoggerMiddleware(quiet...), securityHeaders)

	health := web.NewHealthHandler(cfg.Env, cfg.Version)
	configScript := handlers.NewConfigScript(cfg.Portal, cfg.Org, cfg.OIDC)
	integrations := handlers.NewIntegrationHandler(services.CatalogService)
	scopes := handlers.NewScopeHandler(services.ScopeService)

	r.Route(apiPrefix, func(r chi.Router) {
		r.Get("/health", health.CheckHealth)
		r.With(noStore).Get("/auth/scopes", scopes.List)

		r.Group(func(r chi.Router) {
			r.Use(noStore, middleware.WithAuth(services.TokenService))

			r.Get("/projects", integrations.Projects)
			r.Get("/integrations", integrations.List)
			r.Get("/integrations/{"+handlers.IntegrationIDParam+"}", integrations.Get)
			r.Route("/integrations/{"+handlers.IntegrationIDParam+"}/deployment-tracks/{"+handlers.TrackIDParam+"}", func(r chi.Router) {
				r.Get("/deployment", integrations.Deployment)
				r.Get("/executions", integrations.Executions)
				r.Post("/executions", integrations.Trigger)
			})
		})

		// An unknown API path is a JSON 404, never the SPA.
		r.NotFound(func(w http.ResponseWriter, r *http.Request) {
			web.StatusNotFound(w, r, errors.New("no API route "+r.URL.Path))
		})
		r.MethodNotAllowed(func(w http.ResponseWriter, r *http.Request) {
			web.StatusMethodNotAllowed(w, r, errors.New(r.Method+" "+r.URL.Path))
		})
	})

	r.Get(handlers.ConfigScriptPath, configScript.Serve)
	r.Handle("/*", newSPAHandler(cfg.SPADir, pageTitle(cfg.Portal)))

	return r
}

// pageTitle is the browser title of every page: the SPA sets the same one.
func pageTitle(portal config.Portal) string {
	return portal.Name + " · " + portal.ProductName
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		next.ServeHTTP(w, r)
	})
}

func noStore(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}
