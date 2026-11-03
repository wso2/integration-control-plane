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
	"errors"
	"net/http"
	"runtime/debug"

	"github.com/wso2-enterprise/integration-user-portal-service/shared/infrastructure/logging"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/web"
)

func Recovery(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				logging.S(r.Context()).Errorw("panic recovered",
					"error", err,
					"stack", string(debug.Stack()),
				)
				web.StatusInternalServerError(w, r, errors.New("internal server error"), nil)
			}
		}()
		next.ServeHTTP(w, r)
	})
}
