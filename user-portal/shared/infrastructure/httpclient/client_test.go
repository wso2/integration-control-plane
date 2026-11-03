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
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/wso2-enterprise/integration-user-portal-service/shared/common"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/upstream"
)

// newTestClient builds a client whose backoff is near-instant, so tests that
// exercise the retry loop finish in milliseconds instead of seconds.
func newTestClient(t *testing.T, opts ...Option) *Client {
	t.Helper()

	base := []Option{WithRetry(RetryParams{
		MaxAttempts: 3,
		BaseDelay:   time.Millisecond,
		MaxDelay:    5 * time.Millisecond,
	})}

	return New(append(base, opts...)...)
}

// countingServer starts a server that runs h and counts the requests it received.
func countingServer(t *testing.T, h http.HandlerFunc) (*httptest.Server, *atomic.Int64) {
	t.Helper()

	var calls atomic.Int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		h(w, r)
	}))
	t.Cleanup(srv.Close)

	return srv, &calls
}

// statusServer starts a server that answers every request with status.
func statusServer(t *testing.T, status int) (*httptest.Server, *atomic.Int64) {
	t.Helper()

	return countingServer(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(status)
	})
}

// refusedURL returns an address that reliably refuses connections, for exercising
// transport-level failures. A server is started to claim a port, then closed.
func refusedURL(t *testing.T) string {
	t.Helper()

	srv := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	url := srv.URL
	srv.Close()

	return url
}

func TestIsSuccess(t *testing.T) {
	tests := []struct {
		name   string
		status int
		want   bool
	}{
		{name: "continue is not success", status: http.StatusContinue, want: false},
		{name: "199 is not success", status: 199, want: false},
		{name: "200 is success", status: http.StatusOK, want: true},
		{name: "204 is success", status: http.StatusNoContent, want: true},
		{name: "299 is success", status: 299, want: true},
		{name: "300 is not success", status: http.StatusMultipleChoices, want: false},
		{name: "404 is not success", status: http.StatusNotFound, want: false},
		{name: "500 is not success", status: http.StatusInternalServerError, want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resp := &Response{StatusCode: tt.status}
			assert.Equal(t, tt.want, resp.IsSuccess())
		})
	}

}

func TestDoReturnsSuccessfulResponse(t *testing.T) {

	srv, _ := countingServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Upstream", "yes")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	c := newTestClient(t)

	resp, err := c.Get(context.Background(), srv.URL)

	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, `{"ok":true}`, string(resp.Body))
	assert.Equal(t, "yes", resp.Header.Get("X-Upstream"))
	assert.True(t, resp.IsSuccess())
}

// A non-2xx is returned as a Response with a nil error, not as an error
func TestDoReturnsNonSuccessResponseWithoutError(t *testing.T) {
	srv, _ := countingServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`Resource not found`))
	}))
	t.Cleanup(srv.Close)
	c := newTestClient(t)
	resp, err := c.Get(context.Background(), srv.URL)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
	assert.Equal(t, "Resource not found", string(resp.Body))
	assert.False(t, resp.IsSuccess())
}

func TestDoReturnsEmptyBodyForNoContent(t *testing.T) {
	srv, calls := statusServer(t, http.StatusNoContent)

	c := newTestClient(t)

	resp, err := c.Get(context.Background(), srv.URL)

	require.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
	assert.Empty(t, resp.Body)
	assert.Equal(t, int64(1), calls.Load())
}

func TestDecodeJSON(t *testing.T) {
	type payload struct {
		Name string `json:"name"`
		Age  int    `json:"age"`
	}

	t.Run("valid json populates the target", func(t *testing.T) {
		resp := &Response{Body: []byte(`{"name":"alice","age":30}`)}

		var got payload
		require.NoError(t, resp.DecodeJSON(&got))
		assert.Equal(t, payload{Name: "alice", Age: 30}, got)
	})

	t.Run("malformed json returns an error", func(t *testing.T) {
		resp := &Response{Body: []byte(`{"name":`)}

		var got payload
		assert.Error(t, resp.DecodeJSON(&got))
	})

	t.Run("empty body returns an error", func(t *testing.T) {
		resp := &Response{Body: []byte{}}

		var got payload
		assert.Error(t, resp.DecodeJSON(&got))
	})
}

func TestStatusError(t *testing.T) {
	resp := &Response{StatusCode: http.StatusNotFound, Body: []byte("component not found")}

	err := resp.StatusError(http.MethodGet, "http://upstream/component/1")

	assert.Equal(t, http.MethodGet, err.Method)
	assert.Equal(t, "http://upstream/component/1", err.URL)
	assert.Equal(t, http.StatusNotFound, err.StatusCode)
	assert.Equal(t, "component not found", err.Body)

	// The message is what lands in logs, so every field needs to survive into it.
	msg := err.Error()
	assert.Contains(t, msg, http.MethodGet)
	assert.Contains(t, msg, "http://upstream/component/1")
	assert.Contains(t, msg, "404")
	assert.Contains(t, msg, "component not found")
}

func TestNewDefaults(t *testing.T) {
	c := New()

	assert.Equal(t, defaultServiceName, c.name)
	assert.Equal(t, defaultTimeout, c.http.Timeout)
	assert.Equal(t, DefaultRetryParams(), c.retry)
}

func TestDefaultRetryParams(t *testing.T) {
	p := DefaultRetryParams()

	assert.Equal(t, 3, p.MaxAttempts)
	assert.Equal(t, 200*time.Millisecond, p.BaseDelay)
	assert.Equal(t, 2*time.Second, p.MaxDelay)
	assert.False(t, p.RetryNonIdempotent, "retrying POST and PATCH must be opt-in")
}

func TestOptions(t *testing.T) {
	custom := &http.Client{Timeout: 3 * time.Second}
	retry := RetryParams{
		MaxAttempts:        7,
		BaseDelay:          time.Second,
		MaxDelay:           time.Minute,
		RetryNonIdempotent: true,
	}

	c := New(
		WithServiceName("projectManager"),
		WithHTTPClient(custom),
		WithRetry(retry),
		WithTimeout(9*time.Second),
	)

	assert.Equal(t, "projectManager", c.name)
	assert.Equal(t, retry, c.retry)
	assert.Same(t, custom, c.http)

	// Options are applied in order, and WithTimeout mutates whichever client is
	// installed at that point — here the caller's own. Passing WithTimeout before
	// WithHTTPClient would silently lose the timeout instead.
	assert.Equal(t, 9*time.Second, c.http.Timeout)
	assert.Equal(t, 9*time.Second, custom.Timeout)
}

func TestOptionsLastOneWins(t *testing.T) {
	c := New(WithServiceName("first"), WithServiceName("second"))

	assert.Equal(t, "second", c.name)
}

func TestGetSendsGETWithoutBody(t *testing.T) {
	srv, calls := countingServer(t, func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Empty(t, r.Header.Get("Content-Type"), "a bodyless request must not claim a content type")

		body, err := io.ReadAll(r.Body)
		assert.NoError(t, err)
		assert.Empty(t, body)

		w.WriteHeader(http.StatusOK)
	})

	c := newTestClient(t)

	_, err := c.Get(context.Background(), srv.URL)

	require.NoError(t, err)
	assert.Equal(t, int64(1), calls.Load())
}

func TestDoSetsAcceptHeader(t *testing.T) {
	srv, calls := countingServer(t, func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "application/json", r.Header.Get("Accept"))
		w.WriteHeader(http.StatusOK)
	})

	c := newTestClient(t)

	_, err := c.Get(context.Background(), srv.URL)

	require.NoError(t, err)
	assert.Equal(t, int64(1), calls.Load())
}

func TestDoSendsJSONBody(t *testing.T) {
	type payload struct {
		Name string `json:"name"`
	}

	srv, calls := countingServer(t, func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "application/json", r.Header.Get("Content-Type"))

		body, err := io.ReadAll(r.Body)
		assert.NoError(t, err)
		assert.JSONEq(t, `{"name":"alice"}`, string(body))

		w.WriteHeader(http.StatusCreated)
	})

	c := newTestClient(t)

	resp, err := c.Do(context.Background(), http.MethodPost, srv.URL, payload{Name: "alice"})

	require.NoError(t, err)
	assert.Equal(t, http.StatusCreated, resp.StatusCode)
	assert.Equal(t, int64(1), calls.Load())
}

func TestDoForwardsCorrelationID(t *testing.T) {
	t.Run("forwards the id when the context carries one", func(t *testing.T) {
		srv, calls := countingServer(t, func(w http.ResponseWriter, r *http.Request) {
			assert.Equal(t, "req-abc-123", r.Header.Get(common.CorrelationIDHeader))
			w.WriteHeader(http.StatusOK)
		})

		ctx := common.WithCorrelationID(context.Background(), "req-abc-123")

		c := newTestClient(t)

		_, err := c.Get(ctx, srv.URL)

		require.NoError(t, err)
		assert.Equal(t, int64(1), calls.Load())
	})

	t.Run("omits the header when the context has no id", func(t *testing.T) {
		srv, calls := countingServer(t, func(w http.ResponseWriter, r *http.Request) {
			assert.Empty(t, r.Header.Get(common.CorrelationIDHeader))
			w.WriteHeader(http.StatusOK)
		})

		c := newTestClient(t)

		_, err := c.Get(context.Background(), srv.URL)

		require.NoError(t, err)
		assert.Equal(t, int64(1), calls.Load())
	})
}

func TestDoFailsBeforeSendingWhenBodyCannotBeMarshalled(t *testing.T) {
	srv, calls := statusServer(t, http.StatusOK)

	c := newTestClient(t)

	resp, err := c.Do(context.Background(), http.MethodPost, srv.URL, make(chan int))

	require.Error(t, err)
	assert.Nil(t, resp)
	assert.Contains(t, err.Error(), "marshal")
	assert.Equal(t, int64(0), calls.Load(), "an unmarshallable body must not reach the upstream")
}

func TestDoRefusesAnOversizedSuccessBody(t *testing.T) {
	srv, calls := countingServer(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(bytes.Repeat([]byte("a"), maxBodyBytes+1))
	})

	c := newTestClient(t)

	resp, err := c.Get(context.Background(), srv.URL)

	require.Error(t, err)
	assert.Nil(t, resp)
	assert.ErrorIs(t, err, errBodyTooLarge)
	// An answer, not an outage: no retry, and no 503.
	assert.NotErrorIs(t, err, upstream.ErrUnavailable)
	assert.Equal(t, int64(1), calls.Load())
}

func TestDoAcceptsASuccessBodyOfExactlyTheLimit(t *testing.T) {
	srv, _ := countingServer(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(bytes.Repeat([]byte("a"), maxBodyBytes))
	})

	resp, err := newTestClient(t).Get(context.Background(), srv.URL)

	require.NoError(t, err)
	assert.Len(t, resp.Body, maxBodyBytes)
}

func TestRequestOptionsSetHeaders(t *testing.T) {
	var got http.Header
	srv, _ := countingServer(t, func(w http.ResponseWriter, r *http.Request) {
		got = r.Header.Clone()
	})

	c := newTestClient(t)

	_, err := c.Get(context.Background(), srv.URL,
		WithHeader("x-project-id", "proj-1"),
		WithHeader("x-organization-id", "org-1"),
	)

	require.NoError(t, err)
	assert.Equal(t, "proj-1", got.Get("x-project-id"))
	assert.Equal(t, "org-1", got.Get("x-organization-id"))
	assert.Equal(t, "application/json", got.Get("Accept"), "client headers still apply")
}

// Options run after the client sets its own headers, so a caller can override
// them rather than being stuck with the default.
func TestRequestOptionsOverrideClientHeaders(t *testing.T) {
	var got string
	srv, _ := countingServer(t, func(w http.ResponseWriter, r *http.Request) {
		got = r.Header.Get("Accept")
	})

	c := newTestClient(t)

	_, err := c.Get(context.Background(), srv.URL, WithHeader("Accept", "text/plain"))

	require.NoError(t, err)
	assert.Equal(t, "text/plain", got)
}

// A retry builds a fresh request, so the options have to be reapplied or the
// second attempt would silently drop the tenancy headers.
func TestRequestOptionsApplyToEveryAttempt(t *testing.T) {
	var seen []string
	srv, calls := countingServer(t, func(w http.ResponseWriter, r *http.Request) {
		seen = append(seen, r.Header.Get("x-project-id"))
		if len(seen) == 1 {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
	})

	c := newTestClient(t)

	resp, err := c.Get(context.Background(), srv.URL, WithHeader("x-project-id", "proj-1"))

	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, int64(2), calls.Load())
	assert.Equal(t, []string{"proj-1", "proj-1"}, seen)
}

func TestGetJSONForwardsRequestOptions(t *testing.T) {
	var got string
	srv, _ := countingServer(t, func(w http.ResponseWriter, r *http.Request) {
		got = r.Header.Get("x-organization-id")
		_, _ = w.Write([]byte(`{"name":"alice","age":30}`))
	})

	c := newTestClient(t)

	_, err := GetJSON[user](context.Background(), c, "GetUser", srv.URL,
		WithHeader("x-organization-id", "org-1"))

	require.NoError(t, err)
	assert.Equal(t, "org-1", got)
}

// The sentinel and the StatusError are both reachable from one error: errors.Is
// classifies it for the service layer, errors.As keeps the status and body for
// logs. Callers depend on both, so they are pinned together.
func TestGetJSONClassifiesNotFound(t *testing.T) {
	srv, _ := countingServer(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`no such user`))
	})

	c := newTestClient(t, WithServiceName("testupstream"))

	_, err := GetJSON[user](context.Background(), c, "GetUser", srv.URL)

	require.Error(t, err)
	assert.ErrorIs(t, err, upstream.ErrNotFound)

	var statusErr *StatusError
	require.ErrorAs(t, err, &statusErr)
	assert.Equal(t, http.StatusNotFound, statusErr.StatusCode)
	assert.Equal(t, "no such user", statusErr.Body)
	assert.Contains(t, err.Error(), "testupstream:GetUser")
}

// Only a 404 is a not-found. Any other failure must stay unclassified
func TestGetJSONDoesNotClassifyOtherStatuses(t *testing.T) {
	for _, status := range []int{http.StatusBadRequest, http.StatusForbidden, http.StatusGone, http.StatusInternalServerError} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			srv, _ := statusServer(t, status)

			c := newTestClient(t, WithRetry(RetryParams{MaxAttempts: 1}))

			_, err := GetJSON[user](context.Background(), c, "GetUser", srv.URL)

			require.Error(t, err)
			assert.NotErrorIs(t, err, upstream.ErrNotFound)
		})
	}
}

func TestClassify(t *testing.T) {
	t.Run("wraps a 404", func(t *testing.T) {
		err := Classify(&StatusError{Method: http.MethodPost, URL: "u", StatusCode: http.StatusNotFound})

		assert.ErrorIs(t, err, upstream.ErrNotFound)

		var statusErr *StatusError
		require.ErrorAs(t, err, &statusErr)
		assert.Equal(t, http.MethodPost, statusErr.Method, "the verb that failed must survive")
	})

	// A 500 is an upstream that answered, and answering badly is not being down.
	t.Run("leaves a 500 alone", func(t *testing.T) {
		original := &StatusError{StatusCode: http.StatusInternalServerError}

		err := Classify(original)

		assert.Same(t, original, err, "an unclassified error is returned untouched")
		assert.NotErrorIs(t, err, upstream.ErrNotFound)
		assert.NotErrorIs(t, err, upstream.ErrUnavailable)
	})

	for name, status := range map[string]int{
		"502": http.StatusBadGateway,
		"503": http.StatusServiceUnavailable,
		"504": http.StatusGatewayTimeout,
	} {
		t.Run("wraps a "+name, func(t *testing.T) {
			err := Classify(&StatusError{Method: http.MethodGet, URL: "u", StatusCode: status})

			assert.ErrorIs(t, err, upstream.ErrUnavailable)
			assert.NotErrorIs(t, err, upstream.ErrNotFound)

			var statusErr *StatusError
			require.ErrorAs(t, err, &statusErr)
			assert.Equal(t, status, statusErr.StatusCode, "the status that failed must survive")
		})
	}

	t.Run("leaves a non-status error alone", func(t *testing.T) {
		original := errors.New("dial tcp: connection refused")

		err := Classify(original)

		assert.Same(t, original, err)
		assert.NotErrorIs(t, err, upstream.ErrNotFound)
	})
}

func TestBodySnippetTruncatesALongBody(t *testing.T) {
	short := []byte(`{"error":"invalid_client"}`)
	assert.Equal(t, string(short), (&Response{Body: short}).BodySnippet())

	long := bytes.Repeat([]byte("a"), bodySnippetBytes+100)
	got := (&Response{Body: long}).BodySnippet()

	assert.Equal(t, strings.Repeat("a", bodySnippetBytes)+"... (truncated)", got)
	assert.NotContains(t, got, strings.Repeat("a", bodySnippetBytes+1))
}

func TestStatusErrorCarriesOnlyASnippet(t *testing.T) {
	resp := &Response{StatusCode: http.StatusInternalServerError, Body: bytes.Repeat([]byte("a"), maxBodyBytes)}

	err := resp.StatusError(http.MethodGet, "https://upstream.example/x")

	assert.Less(t, len(err.Error()), bodySnippetBytes+200)
}
