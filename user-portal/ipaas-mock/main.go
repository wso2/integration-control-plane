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

// ipaas-mock stands in for everything UP-DP reaches in the cloud: the Platform
// IdP's token endpoint, iPaaS-Service's portal routes, and the published
// environment's API gateway with sample agents and workflows, and UP-DP, behind it.
package main

import (
	"context"
	"errors"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/joho/godotenv"
	"go.uber.org/zap"

	"github.com/wso2-enterprise/integration-user-portal-service/ipaas-mock/catalog"
	"github.com/wso2-enterprise/integration-user-portal-service/ipaas-mock/config"
	"github.com/wso2-enterprise/integration-user-portal-service/ipaas-mock/gateway"
	"github.com/wso2-enterprise/integration-user-portal-service/ipaas-mock/platformidp"
	"github.com/wso2-enterprise/integration-user-portal-service/ipaas-mock/portal"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/httpmw"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/infrastructure/logging"
)

func main() {
	_ = godotenv.Load("ipaas-mock/.env")

	logger := zap.Must(zap.NewDevelopment())
	defer func() { _ = logger.Sync() }()
	log := logger.Sugar()

	ctx, stop := signal.NotifyContext(logging.WithLogger(context.Background(), logger), os.Interrupt, syscall.SIGTERM)
	defer stop()

	cfg, err := config.Load(ctx)
	if err != nil {
		log.Fatal(err)
	}

	idp, err := platformidp.New(cfg.IdP, cfg.Org, cfg.Portal.Audience)
	if err != nil {
		log.Fatal(err)
	}
	cat := catalog.New(cfg.Org, cfg.Gateway.URL, cfg.Portal.RunDuration)
	gw := gateway.New(ctx, cfg.Gateway, cat)

	servers := []*http.Server{
		serve("platform-idp", cfg.IdP.Addr, idp.Routes(), logger),
		serve("ipaas-service", cfg.Portal.Addr, portal.New(cat, idp).Routes(), logger),
		serve("gateway", cfg.Gateway.Addr, gw.Routes(), logger),
	}

	errs := make(chan error, len(servers))
	for _, srv := range servers {
		go func() {
			if err := srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
				errs <- err
			}
		}()
	}
	log.Infow("ipaas-mock is up",
		"org", cfg.Org.Handle, "orgUuid", cfg.Org.UUID,
		"platformIdp", cfg.IdP.Addr, "ipaasService", cfg.Portal.Addr, "gateway", cfg.Gateway.Addr,
		"portalClientId", cfg.IdP.ClientID, "verifiesGatewayTokens", cfg.Gateway.JWKSURL != "",
		"upDp", cfg.Gateway.UPDPUpstream.String())

	select {
	case err := <-errs:
		log.Fatal(err)
	case <-ctx.Done():
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	for _, srv := range servers {
		_ = srv.Shutdown(shutdownCtx)
	}
}

func serve(name, addr string, handler http.Handler, logger *zap.Logger) *http.Server {
	r := chi.NewRouter()
	r.Use(httpmw.RequestID, httpmw.CorrelationID, httpmw.WithLogger(logger.Named(name)), httpmw.Recovery, httpmw.LoggerMiddleware())
	r.Mount("/", handler)

	return &http.Server{
		Addr:              addr,
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       time.Minute,
	}
}
