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

// Package gateway stands in for the published environment's API gateway and the
// agents, workflows and UP-DP behind it. The browser calls it directly with its
// WIdP-DP access token.
package gateway

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/lestrrat-go/jwx/v3/jwk"
	"github.com/lestrrat-go/jwx/v3/jwt"

	"github.com/wso2-enterprise/integration-user-portal-service/ipaas-mock/catalog"
	"github.com/wso2-enterprise/integration-user-portal-service/ipaas-mock/config"
	ipaasportal "github.com/wso2-enterprise/integration-user-portal-service/shared/external-services/ipaas-portal"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/external-services/oidc"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/infrastructure/httpclient"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/infrastructure/logging"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/web"
)

const jwksTTL = 5 * time.Minute

// Caller is who a gateway call is made by, read from the bearer token.
type Caller struct {
	Subject  string
	Username string
	Roles    []string
}

// UserID is the engine's caller id: the token's sub.
func (c Caller) UserID() string { return c.Subject }

func (c Caller) Name() string {
	if c.Username != "" {
		return c.Username
	}
	return c.Subject
}

type callerKey struct{}

func callerFrom(ctx context.Context) Caller {
	caller, _ := ctx.Value(callerKey{}).(Caller)
	return caller
}

type Gateway struct {
	cfg     config.GatewayConfig
	catalog *catalog.Catalog

	agents    *agents
	workflows map[string]*Engine // by endpoint path

	oidc      oidc.Client
	jwksMu    sync.Mutex
	jwks      jwk.Set
	jwksUntil time.Time
}

func New(ctx context.Context, cfg config.GatewayConfig, c *catalog.Catalog) *Gateway {
	var opts []httpclient.Option
	if cfg.InsecureTLS {
		opts = append(opts, httpclient.WithInsecureTLS())
	}

	g := &Gateway{
		cfg:       cfg,
		catalog:   c,
		agents:    newAgents(),
		workflows: map[string]*Engine{},
		oidc:      oidc.NewClient(opts...),
	}

	for _, integration := range c.Integrations() {
		if integration.Component.DisplayType != ipaasportal.DisplayTypeWorkflow {
			continue
		}
		for _, endpoints := range integration.Endpoints {
			for _, endpoint := range endpoints {
				definitions := definitionsFor(integration.Component.Name)
				if len(definitions) == 0 {
					continue
				}
				engine := NewEngine(integration.Component.Name+"-queue", definitions, cfg.StepDuration)
				engine.Seed()
				engine.Start(ctx)
				g.workflows[endpoint.Path] = engine
			}
		}
	}

	return g
}

// Routes serves the agents and workflows at their endpoint paths, and UP-DP at
// every other path.
func (g *Gateway) Routes() http.Handler {
	endpoints := g.cors(g.authenticate(http.HandlerFunc(g.dispatch)))
	upDP := g.upDP()
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, _, _, ok := g.catalog.ByEndpointPath(r.URL.Path); ok {
			endpoints.ServeHTTP(w, r)
			return
		}
		upDP.ServeHTTP(w, r)
	})
}

// dispatch finds the endpoint a path belongs to and hands the rest of the path to
// the agent or workflow behind it.
func (g *Gateway) dispatch(w http.ResponseWriter, r *http.Request) {
	integration, endpoint, _, ok := g.catalog.ByEndpointPath(r.URL.Path)
	if !ok || !g.catalog.IsPublished(integration, catalog.GatewayEnvironment) {
		web.StatusNotFound(w, r, fmt.Errorf("no published endpoint at %s", r.URL.Path))
		return
	}
	rest := strings.TrimPrefix(r.URL.Path, endpoint.Path)

	switch integration.Component.DisplayType {
	case ipaasportal.DisplayTypeAIAgent:
		if rest != "/chat" {
			web.StatusNotFound(w, r, fmt.Errorf("agent %s has no route %s", integration.Component.Name, rest))
			return
		}
		if r.Method != http.MethodPost {
			web.StatusMethodNotAllowed(w, r, fmt.Errorf("%s %s", r.Method, r.URL.Path))
			return
		}
		g.agents.chat(w, r, integration.Component.Name, endpoint.Name)

	case ipaasportal.DisplayTypeWorkflow:
		engine, ok := g.workflows[endpoint.Path]
		if !ok {
			web.StatusNotFound(w, r, fmt.Errorf("workflow %s has no engine", integration.Component.Name))
			return
		}
		// A fresh routing context, or chi matches the outer router's path instead of the stripped one.
		r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, nil))
		http.StripPrefix(endpoint.Path, engine.Routes()).ServeHTTP(w, r)

	default:
		web.StatusNotFound(w, r, fmt.Errorf("%s is not exposed through the gateway", integration.Component.Name))
	}
}

func (g *Gateway) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && slices.Contains(g.cfg.AllowedOrigins, origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Max-Age", "600")
			w.Header().Add("Vary", "Origin")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (g *Gateway) authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !ok || raw == "" {
			web.StatusUnauthorized(w, r, errors.New("no bearer token"))
			return
		}

		token, err := g.parse(r.Context(), raw)
		if err != nil {
			web.StatusUnauthorized(w, r, err)
			return
		}

		caller := Caller{Roles: rolesOf(token)}
		caller.Subject, _ = token.Subject()
		for _, claim := range []string{"username", "preferred_username", "email"} {
			if err := token.Get(claim, &caller.Username); err == nil && caller.Username != "" {
				break
			}
		}

		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), callerKey{}, caller)))
	})
}

// parse verifies the token when a key set is configured, and only reads it otherwise.
func (g *Gateway) parse(ctx context.Context, raw string) (jwt.Token, error) {
	if g.cfg.JWKSURL == "" {
		token, err := jwt.ParseInsecure([]byte(raw))
		if err != nil {
			return nil, fmt.Errorf("gateway: parse token: %w", err)
		}
		return token, nil
	}

	set, err := g.keySet(ctx)
	if err != nil {
		return nil, err
	}

	opts := []jwt.ParseOption{jwt.WithKeySet(set), jwt.WithAcceptableSkew(30 * time.Second)}
	if g.cfg.Issuer != "" {
		opts = append(opts, jwt.WithIssuer(g.cfg.Issuer))
	}
	token, err := jwt.Parse([]byte(raw), opts...)
	if err != nil {
		return nil, fmt.Errorf("gateway: verify token: %w", err)
	}
	return token, nil
}

func (g *Gateway) keySet(ctx context.Context) (jwk.Set, error) {
	g.jwksMu.Lock()
	defer g.jwksMu.Unlock()

	if g.jwks != nil && time.Now().Before(g.jwksUntil) {
		return g.jwks, nil
	}

	raw, err := g.oidc.FetchJWKS(ctx, g.cfg.JWKSURL)
	if err != nil {
		if g.jwks != nil {
			logging.S(ctx).Warnw("serving stale jwks after a failed fetch", "error", err)
			return g.jwks, nil
		}
		return nil, fmt.Errorf("gateway: fetch jwks: %w", err)
	}
	set, err := jwk.Parse(raw)
	if err != nil {
		return nil, fmt.Errorf("gateway: parse jwks: %w", err)
	}

	g.jwks, g.jwksUntil = set, time.Now().Add(jwksTTL)
	return set, nil
}

// rolesOf reads the roles claim as the workflow engine does: a list, or a comma-separated
// string. A caller with none has nil, which the engine treats as no roles at all.
func rolesOf(token jwt.Token) []string {
	var values []string
	var list []any
	var joined string
	if err := token.Get("roles", &list); err == nil {
		for _, v := range list {
			if s, ok := v.(string); ok {
				values = append(values, s)
			}
		}
	} else if err := token.Get("roles", &joined); err == nil {
		values = strings.Split(joined, ",")
	}
	var roles []string
	for _, v := range values {
		if v = strings.TrimSpace(v); v != "" {
			roles = append(roles, v)
		}
	}
	return roles
}
