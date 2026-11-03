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

package httpmw

import (
	"net/http"
	"slices"
	"time"

	chimw "github.com/go-chi/chi/v5/middleware"

	"github.com/wso2-enterprise/integration-user-portal-service/shared/infrastructure/logging"
)

// LoggerMiddleware logs one line per request, except for requests to quietPaths.
func LoggerMiddleware(quietPaths ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if slices.Contains(quietPaths, r.URL.Path) {
				next.ServeHTTP(w, r)
				return
			}

			ww := chimw.NewWrapResponseWriter(w, r.ProtoMajor)
			start := time.Now()

			defer func() {
				logging.S(r.Context()).Infow("request",
					"method", r.Method,
					"path", r.URL.Path,
					"status", ww.Status(),
					"bytes", ww.BytesWritten(),
					"duration", time.Since(start),
				)
			}()

			next.ServeHTTP(ww, r)
		})
	}
}
