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
		Auth:      authConfig{Issuer: oidc.Issuer, ClientID: oidc.ClientID},
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
