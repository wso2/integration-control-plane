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

package middleware

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"go.uber.org/zap"

	"github.com/wso2-enterprise/integration-user-portal-service/shared/infrastructure/logging"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/web"
	"github.com/wso2-enterprise/integration-user-portal-service/up-dp/domain"
)

const bearerPrefix = "Bearer "

type identityKey struct{}

func Identity(ctx context.Context) *domain.TokenIdentity {
	identity, _ := ctx.Value(identityKey{}).(*domain.TokenIdentity)
	return identity
}

// WithAuth admits a request only with a bearer token the token service verifies.
func WithAuth(tokenSvc domain.TokenService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			rawToken, ok := bearerToken(r)
			if !ok {
				web.StatusUnauthorized(w, r, errors.New("request carries no bearer token"))
				return
			}

			identity, err := tokenSvc.Read(r.Context(), rawToken)
			if err != nil {
				writeAuthError(w, r, err)
				return
			}

			ctx := context.WithValue(r.Context(), identityKey{}, identity)
			ctx = logging.With(ctx, zap.String("userId", identity.UserID))
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func bearerToken(r *http.Request) (string, bool) {
	header := r.Header.Get("Authorization")
	if len(header) < len(bearerPrefix) || !strings.EqualFold(header[:len(bearerPrefix)], bearerPrefix) {
		return "", false
	}

	token := strings.TrimSpace(header[len(bearerPrefix):])
	return token, token != ""
}

func writeAuthError(w http.ResponseWriter, r *http.Request, err error) {
	if domain.IsTokenRejection(err) {
		web.StatusUnauthorized(w, r, err)
		return
	}
	if errors.Is(err, domain.ErrKeysUnavailable) {
		web.StatusServiceUnavailable(w, r, err)
		return
	}
	web.StatusInternalServerError(w, r, err, nil)
}
