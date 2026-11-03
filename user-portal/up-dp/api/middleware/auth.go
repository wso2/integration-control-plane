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

// WithAuth admits a request only with a bearer token whose claims name a caller.
// The gateway in front of UP-DP has verified it.
func WithAuth(tokenSvc domain.TokenService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			rawToken, ok := bearerToken(r)
			if !ok {
				web.StatusUnauthorized(w, r, errors.New("request carries no bearer token"))
				return
			}

			identity, err := tokenSvc.Read(rawToken)
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
	web.StatusInternalServerError(w, r, err, nil)
}
