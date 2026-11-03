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

package ipaasportal

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/wso2-enterprise/integration-user-portal-service/shared/common"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/infrastructure/httpclient"
)

func TestEveryCallNamesTheOrgAndTheEnvironment(t *testing.T) {
	var paths []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/token" {
			_, _ = w.Write([]byte(`{"access_token":"tok","token_type":"Bearer","expires_in":3600}`))
			return
		}
		paths = append(paths, r.Method+" "+r.URL.RequestURI())
		assert.Equal(t, "Bearer tok", r.Header.Get("Authorization"))
		switch r.URL.Path {
		case "/portal/orgs/8f7c2a0e-4d1b-4c6a-9b3e-2f5d7a1c9e40/environments/0b6f3d2e-1c4a-4e5b-8a9d-7c6b5a4f3e21/scopes":
			_, _ = w.Write([]byte(`{"scopes":["orders:read"]}`))
		default:
			_, _ = w.Write([]byte(`{"items":[]}`))
		}
	}))
	t.Cleanup(server.Close)

	client := NewClient(Config{BaseURL: server.URL + "/portal", TokenURL: server.URL + "/token", ClientID: "c", ClientSecret: "s"},
		httpclient.WithRetry(httpclient.RetryParams{MaxAttempts: 1}))
	scope := Scope{
		OrgUUID: common.MustParseID("8f7c2a0e-4d1b-4c6a-9b3e-2f5d7a1c9e40"),
		EnvID:   common.MustParseID("0b6f3d2e-1c4a-4e5b-8a9d-7c6b5a4f3e21"),
	}

	scopes, err := client.GetScopes(context.Background(), scope)
	require.NoError(t, err)
	assert.Equal(t, []string{"orders:read"}, scopes)

	page, err := client.GetComponents(context.Background(), scope, ComponentQuery{
		Kinds: []DisplayType{DisplayTypeWorkflow, DisplayTypeAIAgent}, Projects: []string{"finance", "people"}, Search: "purchase order", Limit: 20, Cursor: "abc",
	})
	require.NoError(t, err)
	assert.Empty(t, page.Items)

	base := "/portal/orgs/8f7c2a0e-4d1b-4c6a-9b3e-2f5d7a1c9e40/environments/0b6f3d2e-1c4a-4e5b-8a9d-7c6b5a4f3e21"
	assert.Equal(t, []string{
		"GET " + base + "/scopes",
		"GET " + base + "/components?cursor=abc&kind=workflow&kind=aiAgent&limit=20&project=finance&project=people&search=purchase+order",
	}, paths)

	_, err = client.GetProjects(context.Background(), scope, []DisplayType{DisplayTypeAutomation})
	require.NoError(t, err)
	assert.Equal(t, "GET "+base+"/projects?kind=automation", paths[2])
}
