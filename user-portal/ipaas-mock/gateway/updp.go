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

package gateway

import (
	"net/http"
	"net/http/httputil"

	"github.com/wso2-enterprise/integration-user-portal-service/shared/infrastructure/logging"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/web"
)

// upDP is UP-DP behind the published environment's kgateway, which only routes: UP-DP
// verifies its own tokens. The token goes through in Authorization unchanged.
func (g *Gateway) upDP() http.Handler {
	return &httputil.ReverseProxy{
		Rewrite: func(pr *httputil.ProxyRequest) {
			pr.SetURL(g.cfg.UPDPUpstream)
			pr.SetXForwarded()
		},
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			logging.S(r.Context()).Warnw("UP-DP did not answer", "upstream", g.cfg.UPDPUpstream.String(), "error", err)
			web.WriteResponse(w, r, http.StatusBadGateway, map[string]string{"error": "Bad Gateway"})
		},
	}
}
