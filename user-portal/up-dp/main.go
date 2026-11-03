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

package main

import (
	"context"
	"errors"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"
	"go.uber.org/zap"

	"github.com/wso2-enterprise/integration-user-portal-service/shared/infrastructure/logging"
	"github.com/wso2-enterprise/integration-user-portal-service/up-dp/api"
	"github.com/wso2-enterprise/integration-user-portal-service/up-dp/config"
	"github.com/wso2-enterprise/integration-user-portal-service/up-dp/service"
)

func main() {
	// Each service reads its own file, so the two never pick up each other's settings.
	_ = godotenv.Load("up-dp/.env")

	logger := zap.Must(zap.NewProduction())
	if os.Getenv("ENV") == "" || os.Getenv("ENV") == "Development" {
		logger = zap.Must(zap.NewDevelopment())
	}
	defer func() { _ = logger.Sync() }()
	log := logger.Sugar()

	// Root context every startup call site pulls its logger from.
	ctx := logging.WithLogger(context.Background(), logger)

	cfg, err := config.Load(ctx)
	if err != nil {
		log.Fatal(err)
	}

	services := service.NewRegistry(cfg)

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           api.Mount(services, cfg, logger),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       time.Minute,
	}

	serverErrors := make(chan error, 1)
	go func() {
		log.Infow("Starting UP-DP", "addr", cfg.Addr, "org", cfg.Org.Handle, "issuer", cfg.OIDC.Issuer, "spaDir", cfg.SPADir)
		serverErrors <- srv.ListenAndServe()
	}()

	shutdown := make(chan os.Signal, 1)
	signal.Notify(shutdown, os.Interrupt, syscall.SIGTERM)

	select {
	case err := <-serverErrors:
		if !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("Error starting server: %v", err)
		}

	case sig := <-shutdown:
		log.Infof("Received signal %v. Shutting down...", sig)

		shutdownCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		defer cancel()

		if err := srv.Shutdown(shutdownCtx); err != nil {
			log.Fatalf("Error shutting down server: %v", err)
		}
	}
}
