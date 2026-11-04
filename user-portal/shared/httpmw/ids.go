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
