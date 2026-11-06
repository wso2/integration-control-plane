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

package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/wso2-enterprise/integration-user-portal-service/up-dp/config"
)

const ConfigScriptPath = "/config.js"

type pageConfig struct {
	config.Portal
	OrgHandle string     `json:"orgHandle"`
	OrgName   string     `json:"orgName"`
	Auth      authConfig `json:"auth"`
}

type authConfig struct {
	Issuer   string `json:"issuer"`
	ClientID string `json:"clientId"`
	Resource string `json:"resource"`
}

type ConfigScript struct {
	body []byte
}

func NewConfigScript(portal config.Portal, org config.Org, oidc config.OIDC) *ConfigScript {
	links := map[string]string{}
	for name, url := range portal.Links {
		if url != "" {
			links[name] = url
		}
	}
	portal.Links = links

	// json.Marshal escapes <, > and &, so nothing in the config can end the script.
	raw, err := json.Marshal(pageConfig{
		Portal:    portal,
		OrgHandle: org.Handle,
		OrgName:   org.Name,
		Auth:      authConfig{Issuer: oidc.Issuer, ClientID: oidc.ClientID, Resource: oidc.Resource},
	})
	if err != nil {
		raw = []byte("{}")
	}
	return &ConfigScript{body: []byte("window.__UP_DP_CONFIG__ = " + string(raw) + ";\n")}
}

func (c *ConfigScript) Serve(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(c.body)
}
