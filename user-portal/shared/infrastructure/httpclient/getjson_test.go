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

package httpclient

import (
	"bytes"
	"context"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// user stands in for the upstream payloads GetJSON decodes in production.
type user struct {
	Name string `json:"name"`
	Age  int    `json:"age"`
}

func TestGetJSONDecodesBody(t *testing.T) {
	srv, calls := countingServer(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"name":"alice","age":30}`))
	})

	c := newTestClient(t, WithServiceName("testupstream"))

	got, err := GetJSON[user](context.Background(), c, "GetUser", srv.URL)

	require.NoError(t, err)
	assert.Equal(t, user{Name: "alice", Age: 30}, got)
	assert.Equal(t, int64(1), calls.Load())
}

func TestGetJSONReturnsStatusErrorForNonSuccess(t *testing.T) {
	srv, _ := countingServer(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`no such user`))
	})

	c := newTestClient(t, WithServiceName("testupstream"))

	got, err := GetJSON[user](context.Background(), c, "GetUser", srv.URL)

	require.Error(t, err)
	assert.Equal(t, user{}, got)

	var statusErr *StatusError
	require.ErrorAs(t, err, &statusErr)
	assert.Equal(t, http.StatusNotFound, statusErr.StatusCode)
	assert.Equal(t, "no such user", statusErr.Body)
	assert.Equal(t, http.MethodGet, statusErr.Method)
}

// A type mismatch is decoded field by field, so a plain json.Unmarshal would leave
// Name populated before failing on Age. GetJSON resets to the zero value, so a
// caller that ignores the error still cannot act on half-decoded data.
func TestGetJSONReturnsZeroValueOnDecodeError(t *testing.T) {
	srv, _ := countingServer(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"name":"alice","age":"not-a-number"}`))
	})

	c := newTestClient(t, WithServiceName("testupstream"))

	got, err := GetJSON[user](context.Background(), c, "GetUser", srv.URL)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "unmarshal response")
	assert.Equal(t, user{}, got, "a failed decode must not leak partial data")
}

func TestGetJSONErrorsIncludeServiceAndOperation(t *testing.T) {
	tests := []struct {
		name    string
		handler http.HandlerFunc
	}{
		{
			name: "non success status",
			handler: func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(http.StatusNotFound)
			},
		},
		{
			name: "malformed body",
			handler: func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(`{`))
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv, _ := countingServer(t, tt.handler)

			c := newTestClient(t, WithServiceName("projectManager"))

			_, err := GetJSON[user](context.Background(), c, "GetProjectById", srv.URL)

			require.Error(t, err)
			assert.Contains(t, err.Error(), "projectManager:GetProjectById")
		})
	}
}

func TestGetJSONWrapsTransportFailures(t *testing.T) {
	c := newTestClient(t, WithServiceName("projectManager"))

	_, err := GetJSON[user](context.Background(), c, "GetProjectById", refusedURL(t))

	require.Error(t, err)
	assert.Contains(t, err.Error(), "projectManager:GetProjectById")
	assert.Contains(t, err.Error(), "gave up after 3 attempts")
}

// Upstreams add fields without warning, so decoding must tolerate them.
func TestGetJSONIgnoresUnknownFields(t *testing.T) {
	srv, _ := countingServer(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"name":"alice","age":30,"unexpected":"ignored","nested":{"a":1}}`))
	})

	c := newTestClient(t)

	got, err := GetJSON[user](context.Background(), c, "GetUser", srv.URL)

	require.NoError(t, err)
	assert.Equal(t, user{Name: "alice", Age: 30}, got)
}

// A JSON null decodes cleanly into a nil slice, so GetJSON reports success.
func TestGetJSONNullDecodesToNilSliceWithoutError(t *testing.T) {
	srv, _ := countingServer(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`null`))
	})

	c := newTestClient(t)

	got, err := GetJSON[[]user](context.Background(), c, "ListUsers", srv.URL)

	require.NoError(t, err)
	assert.Nil(t, got)
}

func TestGetJSONDecodesEmptyList(t *testing.T) {
	srv, _ := countingServer(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`[]`))
	})

	c := newTestClient(t)

	got, err := GetJSON[[]user](context.Background(), c, "ListUsers", srv.URL)

	require.NoError(t, err)
	assert.NotNil(t, got, "an empty array is distinct from null")
	assert.Empty(t, got)
}

// An oversized payload names its size, not an unmarshal error on a cut document.
func TestGetJSONFailsOnAnOversizedBody(t *testing.T) {
	srv, _ := countingServer(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"name":"`))
		_, _ = w.Write(bytes.Repeat([]byte("a"), maxBodyBytes))
		_, _ = w.Write([]byte(`","age":30}`))
	})

	c := newTestClient(t)

	_, err := GetJSON[user](context.Background(), c, "GetUser", srv.URL)

	require.Error(t, err)
	assert.ErrorIs(t, err, errBodyTooLarge)
	assert.NotContains(t, err.Error(), "unmarshal response")
}
