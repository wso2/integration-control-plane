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

package ipaasportal

import (
	"context"
	"errors"
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
		case "/user-portal/orgs/8f7c2a0e-4d1b-4c6a-9b3e-2f5d7a1c9e40/environments/0b6f3d2e-1c4a-4e5b-8a9d-7c6b5a4f3e21/scopes":
			_, _ = w.Write([]byte(`{"scopes":["orders:read"]}`))
		default:
			_, _ = w.Write([]byte(`{"items":[]}`))
		}
	}))
	t.Cleanup(server.Close)

	client := NewClient(Config{BaseURL: server.URL + "/user-portal", TokenURL: server.URL + "/token", ClientID: "c", ClientSecret: "s"},
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

	base := "/user-portal/orgs/8f7c2a0e-4d1b-4c6a-9b3e-2f5d7a1c9e40/environments/0b6f3d2e-1c4a-4e5b-8a9d-7c6b5a4f3e21"
	assert.Equal(t, []string{
		"GET " + base + "/scopes",
		"GET " + base + "/components?cursor=abc&kind=workflow&kind=aiAgent&limit=20&project=finance&project=people&search=purchase+order",
	}, paths)

	_, err = client.GetProjects(context.Background(), scope, []DisplayType{DisplayTypeAutomation})
	require.NoError(t, err)
	assert.Equal(t, "GET "+base+"/projects?kind=automation", paths[2])
}

func TestABadRequestIsAnInvalidCursorOnlyByItsMessage(t *testing.T) {
	for _, tc := range []struct {
		name    string
		body    string
		invalid bool
	}{
		{name: "the cursor", body: `{"error":"The cursor is not one this listing gave."}`, invalid: true},
		{name: "anything else", body: `{"error":"search is malformed"}`},
		{name: "no JSON", body: `bad request`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				if r.URL.Path == "/token" {
					_, _ = w.Write([]byte(`{"access_token":"tok","token_type":"Bearer","expires_in":3600}`))
					return
				}
				w.WriteHeader(http.StatusBadRequest)
				_, _ = w.Write([]byte(tc.body))
			}))
			t.Cleanup(server.Close)
			client := NewClient(Config{BaseURL: server.URL + "/user-portal", TokenURL: server.URL + "/token", ClientID: "c", ClientSecret: "s"},
				httpclient.WithRetry(httpclient.RetryParams{MaxAttempts: 1}))

			_, err := client.GetComponents(context.Background(), Scope{OrgUUID: common.NewID(), EnvID: common.NewID()}, ComponentQuery{Limit: 20, Cursor: "page-2"})

			require.Error(t, err)
			assert.Equal(t, tc.invalid, errors.Is(err, ErrInvalidCursor))
		})
	}
}
