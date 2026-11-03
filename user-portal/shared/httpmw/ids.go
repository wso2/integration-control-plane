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

	"github.com/wso2-enterprise/integration-user-portal-service/shared/common"
)

const maxCorrelationIDLen = 128

// RequestID mints this hop's id: a UUID, always ours.
func RequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := common.WithRequestID(r.Context(), common.NewID().String())
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// CorrelationID resolves the id of the chain this request belongs to
func CorrelationID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get(common.CorrelationIDHeader)
		if !validCorrelationID(id) {
			id = common.RequestIDFromContext(r.Context())
		}

		next.ServeHTTP(w, r.WithContext(common.WithCorrelationID(r.Context(), id)))
	})
}

func validCorrelationID(id string) bool {
	if id == "" || len(id) > maxCorrelationIDLen {
		return false
	}

	for i := 0; i < len(id); i++ {
		switch c := id[i]; {
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9':
		case c == '-', c == '_', c == '.', c == '/':
		default:
			return false
		}
	}

	return true
}
