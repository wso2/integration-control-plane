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
	"context"
	"fmt"
	"io"
	"net/http"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/wso2-enterprise/integration-user-portal-service/shared/upstream"
)

func TestIsIdempotent(t *testing.T) {
	tests := []struct {
		method string
		want   bool
	}{
		{method: http.MethodGet, want: true},
		{method: http.MethodHead, want: true},
		{method: http.MethodOptions, want: true},
		{method: http.MethodTrace, want: true},
		{method: http.MethodPut, want: true},
		{method: http.MethodDelete, want: true},
		{method: http.MethodPost, want: false},
		{method: http.MethodPatch, want: false},
		{method: http.MethodConnect, want: false},
	}

	for _, tt := range tests {
		t.Run(tt.method, func(t *testing.T) {
			assert.Equal(t, tt.want, isIdempotent(tt.method))
		})
	}
}

func TestIsRetryableStatus(t *testing.T) {
	tests := []struct {
		name   string
		status int
		want   bool
	}{
		{name: "request timeout", status: http.StatusRequestTimeout, want: true},
		{name: "too many requests", status: http.StatusTooManyRequests, want: true},
		{name: "internal server error", status: http.StatusInternalServerError, want: true},
		{name: "bad gateway", status: http.StatusBadGateway, want: true},
		{name: "service unavailable", status: http.StatusServiceUnavailable, want: true},
		{name: "gateway timeout", status: http.StatusGatewayTimeout, want: true},
		// A 501 means the endpoint will never exist, so a retry cannot help.
		{name: "not implemented", status: http.StatusNotImplemented, want: false},
		{name: "ok", status: http.StatusOK, want: false},
		{name: "bad request", status: http.StatusBadRequest, want: false},
		{name: "unauthorized", status: http.StatusUnauthorized, want: false},
		{name: "forbidden", status: http.StatusForbidden, want: false},
		{name: "not found", status: http.StatusNotFound, want: false},
		{name: "conflict", status: http.StatusConflict, want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, isRetryableStatus(tt.status))
		})
	}
}

func TestBackoffGrowsExponentiallyAndCaps(t *testing.T) {
	c := New(WithRetry(RetryParams{
		MaxAttempts: 10,
		BaseDelay:   200 * time.Millisecond,
		MaxDelay:    2 * time.Second,
	}))

	tests := []struct {
		attempt int
		want    time.Duration
	}{
		{attempt: 2, want: 200 * time.Millisecond},
		{attempt: 3, want: 400 * time.Millisecond},
		{attempt: 4, want: 800 * time.Millisecond},
		{attempt: 5, want: 1600 * time.Millisecond},
		{attempt: 6, want: 2 * time.Second},
		{attempt: 7, want: 2 * time.Second},
	}

	for _, tt := range tests {
		assert.Equal(t, tt.want, c.backoff(tt.attempt), "backoff(%d)", tt.attempt)
	}
}

func TestBackoffCapsWhenMaxDelayIsBelowBaseDelay(t *testing.T) {
	c := New(WithRetry(RetryParams{
		MaxAttempts: 3,
		BaseDelay:   time.Second,
		MaxDelay:    250 * time.Millisecond,
	}))

	assert.Equal(t, 250*time.Millisecond, c.backoff(2))
}

// A MaxDelay of zero or less means "no cap"
func TestBackoffWithoutMaxDelayGrowsUncapped(t *testing.T) {
	tests := []struct {
		name     string
		maxDelay time.Duration
	}{
		{name: "zero", maxDelay: 0},
		{name: "negative", maxDelay: -time.Second},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := New(WithRetry(RetryParams{
				MaxAttempts: 5,
				BaseDelay:   200 * time.Millisecond,
				MaxDelay:    tt.maxDelay,
			}))

			assert.Equal(t, 200*time.Millisecond, c.backoff(2))
			assert.Equal(t, 400*time.Millisecond, c.backoff(3))
			assert.Equal(t, 800*time.Millisecond, c.backoff(4))
		})
	}
}

// An uncapped delay must not double its way past the int64 range and come back
// out as a negative duration, which time.NewTimer would fire on immediately.
func TestBackoffWithoutMaxDelayNeverGoesNegative(t *testing.T) {
	c := New(WithRetry(RetryParams{
		MaxAttempts: 200,
		BaseDelay:   time.Hour,
		MaxDelay:    0,
	}))

	for attempt := 2; attempt <= 200; attempt++ {
		assert.Positive(t, c.backoff(attempt), "backoff(%d)", attempt)
	}
}

func TestWait(t *testing.T) {
	t.Run("returns nil once the delay elapses", func(t *testing.T) {
		assert.NoError(t, wait(context.Background(), time.Millisecond))
	})

	t.Run("returns the context error when the context is done first", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		cancel()

		err := wait(ctx, time.Hour)

		assert.ErrorIs(t, err, context.Canceled)
	})
}

func TestDoRetriesRetryableStatuses(t *testing.T) {
	tests := []struct {
		name         string
		status       int
		wantRequests int64
	}{
		{name: "internal server error is retried", status: http.StatusInternalServerError, wantRequests: 3},
		{name: "bad gateway is retried", status: http.StatusBadGateway, wantRequests: 3},
		{name: "service unavailable is retried", status: http.StatusServiceUnavailable, wantRequests: 3},
		{name: "gateway timeout is retried", status: http.StatusGatewayTimeout, wantRequests: 3},
		{name: "too many requests is retried", status: http.StatusTooManyRequests, wantRequests: 3},
		{name: "request timeout is retried", status: http.StatusRequestTimeout, wantRequests: 3},
		{name: "not implemented is not retried", status: http.StatusNotImplemented, wantRequests: 1},
		{name: "not found is not retried", status: http.StatusNotFound, wantRequests: 1},
		{name: "bad request is not retried", status: http.StatusBadRequest, wantRequests: 1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv, calls := statusServer(t, tt.status)

			c := newTestClient(t)

			resp, err := c.Get(context.Background(), srv.URL)

			require.NoError(t, err)
			assert.Equal(t, tt.status, resp.StatusCode)
			assert.Equal(t, tt.wantRequests, calls.Load())
		})
	}
}

// Running out of attempts on a *status* is not an error. The "gave up after N
// attempts" path is only reachable when every attempt fails at the transport
// level; a persistently failing status exhausts the attempts and then returns the
// last response normally.
func TestDoExhaustedStatusRetriesReturnLastResponse(t *testing.T) {
	srv, calls := statusServer(t, http.StatusInternalServerError)

	c := newTestClient(t)

	resp, err := c.Get(context.Background(), srv.URL)

	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
	assert.False(t, resp.IsSuccess())
	assert.Equal(t, int64(3), calls.Load())
}

func TestExhaustedStatusRetriesClassifyOnTheStatusTheyEndedOn(t *testing.T) {
	t.Run("503 is unavailable", func(t *testing.T) {
		srv, _ := statusServer(t, http.StatusServiceUnavailable)

		_, err := GetJSON[map[string]any](context.Background(), newTestClient(t), "Op", srv.URL)

		require.Error(t, err)
		assert.ErrorIs(t, err, upstream.ErrUnavailable)
	})

	t.Run("500 is not", func(t *testing.T) {
		srv, _ := statusServer(t, http.StatusInternalServerError)

		_, err := GetJSON[map[string]any](context.Background(), newTestClient(t), "Op", srv.URL)

		require.Error(t, err)
		assert.NotErrorIs(t, err, upstream.ErrUnavailable)
	})
}

func TestDoRetriesUntilSuccess(t *testing.T) {
	var attempts atomic.Int64
	srv, calls := countingServer(t, func(w http.ResponseWriter, _ *http.Request) {
		if attempts.Add(1) == 1 {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`recovered`))
	})

	c := newTestClient(t)

	resp, err := c.Get(context.Background(), srv.URL)

	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, "recovered", string(resp.Body))
	assert.Equal(t, int64(2), calls.Load(), "retrying must stop as soon as an attempt succeeds")
}

func TestDoRetriesAcrossDifferentRetryableStatuses(t *testing.T) {
	var attempts atomic.Int64
	srv, calls := countingServer(t, func(w http.ResponseWriter, _ *http.Request) {
		switch attempts.Add(1) {
		case 1:
			w.WriteHeader(http.StatusInternalServerError)
		case 2:
			w.WriteHeader(http.StatusTooManyRequests)
		default:
			w.WriteHeader(http.StatusOK)
		}
	})

	c := newTestClient(t)

	resp, err := c.Get(context.Background(), srv.URL)

	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, int64(3), calls.Load())
}

func TestDoRetryDisabledWhenMaxAttemptsIsOne(t *testing.T) {
	srv, calls := statusServer(t, http.StatusInternalServerError)

	c := newTestClient(t, WithRetry(RetryParams{
		MaxAttempts: 1,
		BaseDelay:   time.Millisecond,
		MaxDelay:    time.Millisecond,
	}))

	resp, err := c.Get(context.Background(), srv.URL)

	require.NoError(t, err)
	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
	assert.Equal(t, int64(1), calls.Load())
}

func TestDoClampsMaxAttemptsToAtLeastOne(t *testing.T) {
	tests := []struct {
		name        string
		maxAttempts int
	}{
		{name: "zero", maxAttempts: 0},
		{name: "negative", maxAttempts: -5},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv, calls := statusServer(t, http.StatusInternalServerError)

			c := newTestClient(t, WithRetry(RetryParams{
				MaxAttempts: tt.maxAttempts,
				BaseDelay:   time.Millisecond,
				MaxDelay:    time.Millisecond,
			}))

			resp, err := c.Get(context.Background(), srv.URL)

			require.NoError(t, err)
			assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
			assert.Equal(t, int64(1), calls.Load(), "one attempt must always be made")
		})
	}
}

func TestDoRetriesOnlyIdempotentMethodsByDefault(t *testing.T) {
	tests := []struct {
		method             string
		retryNonIdempotent bool
		wantRequests       int64
	}{
		{method: http.MethodGet, wantRequests: 3},
		{method: http.MethodHead, wantRequests: 3},
		{method: http.MethodPut, wantRequests: 3},
		{method: http.MethodDelete, wantRequests: 3},
		{method: http.MethodPost, wantRequests: 1},
		{method: http.MethodPatch, wantRequests: 1},
		{method: http.MethodPost, retryNonIdempotent: true, wantRequests: 3},
		{method: http.MethodPatch, retryNonIdempotent: true, wantRequests: 3},
	}

	for _, tt := range tests {
		name := fmt.Sprintf("%s with RetryNonIdempotent=%t", tt.method, tt.retryNonIdempotent)

		t.Run(name, func(t *testing.T) {
			srv, calls := statusServer(t, http.StatusInternalServerError)

			c := newTestClient(t, WithRetry(RetryParams{
				MaxAttempts:        3,
				BaseDelay:          time.Millisecond,
				MaxDelay:           5 * time.Millisecond,
				RetryNonIdempotent: tt.retryNonIdempotent,
			}))

			resp, err := c.Do(context.Background(), tt.method, srv.URL, nil)

			require.NoError(t, err)
			assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
			assert.Equal(t, tt.wantRequests, calls.Load())
		})
	}
}

func TestDoRetriesTransportFailures(t *testing.T) {
	var attempts atomic.Int64
	srv, calls := countingServer(t, func(w http.ResponseWriter, _ *http.Request) {
		if attempts.Add(1) == 1 {
			// Hijacking and closing the connection without writing a response
			// makes the client see a transport failure rather than a status code.
			conn, _, err := w.(http.Hijacker).Hijack()
			if err != nil {
				t.Errorf("hijack connection: %v", err)
				return
			}
			_ = conn.Close()
			return
		}
		w.WriteHeader(http.StatusOK)
	})

	c := newTestClient(t)

	resp, err := c.Get(context.Background(), srv.URL)

	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, int64(2), calls.Load())
}

func TestDoGivesUpAfterRepeatedTransportFailures(t *testing.T) {
	c := newTestClient(t)

	resp, err := c.Get(context.Background(), refusedURL(t))

	require.Error(t, err)
	assert.Nil(t, resp)
	assert.Contains(t, err.Error(), "gave up after 3 attempts")
	assert.ErrorIs(t, err, upstream.ErrUnavailable)
}

// TestDoRetriesUnbuildableRequests documents a wasteful path. A URL that
// url.Parse rejects fails inside attempt, before any connection is made, and Do
// cannot tell that apart from a transient fault — so it burns every attempt, and
// the backoff between them, on an error that can never succeed.
func TestDoRetriesUnbuildableRequests(t *testing.T) {
	c := newTestClient(t)

	resp, err := c.Get(context.Background(), "http://\x7f-invalid")

	require.Error(t, err)
	assert.Nil(t, resp)
	assert.Contains(t, err.Error(), "gave up after 3 attempts")
	assert.Contains(t, err.Error(), "build request")
}

func TestDoWithCancelledContext(t *testing.T) {
	srv, calls := statusServer(t, http.StatusOK)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	c := newTestClient(t)

	resp, err := c.Get(ctx, srv.URL)

	require.Error(t, err)
	assert.Nil(t, resp)
	assert.ErrorIs(t, err, context.Canceled)
	assert.NotErrorIs(t, err, upstream.ErrUnavailable)
	assert.Equal(t, int64(0), calls.Load(), "a cancelled context must not reach the upstream")
}

func TestDoWithExpiredDeadline(t *testing.T) {
	srv, calls := statusServer(t, http.StatusOK)

	ctx, cancel := context.WithDeadline(context.Background(), time.Now().Add(-time.Second))
	t.Cleanup(cancel)

	c := newTestClient(t)

	resp, err := c.Get(ctx, srv.URL)

	require.Error(t, err)
	assert.Nil(t, resp)
	assert.ErrorIs(t, err, context.DeadlineExceeded)
	assert.ErrorIs(t, err, upstream.ErrUnavailable)
	assert.Equal(t, int64(0), calls.Load())
}

func TestDoStopsWhenContextIsCancelledDuringBackoff(t *testing.T) {
	srv, calls := statusServer(t, http.StatusInternalServerError)

	ctx, cancel := context.WithCancel(context.Background())

	// Cancel only once the client has read the 500 and closed its body: the
	// server counting the request is too early, as the cancellation can then
	// land before the response arrives. A long backoff keeps Do sleeping there.
	answered := make(chan struct{})
	var once sync.Once
	transport := onBodyClose{next: http.DefaultTransport, closed: func() { once.Do(func() { close(answered) }) }}
	c := newTestClient(t,
		WithRetry(RetryParams{
			MaxAttempts: 3,
			BaseDelay:   10 * time.Second,
			MaxDelay:    10 * time.Second,
		}),
		WithHTTPClient(&http.Client{Transport: transport}),
	)

	go func() {
		<-answered
		cancel()
	}()

	start := time.Now()
	resp, err := c.Get(ctx, srv.URL)
	elapsed := time.Since(start)

	require.Error(t, err)
	assert.Nil(t, resp)
	assert.ErrorIs(t, err, context.Canceled)
	assert.NotErrorIs(t, err, upstream.ErrUnavailable)
	// The failure that triggered the retry survives into the error, unwrappable.
	var statusErr *StatusError
	require.ErrorAs(t, err, &statusErr)
	assert.Equal(t, http.StatusInternalServerError, statusErr.StatusCode)
	assert.Equal(t, int64(1), calls.Load())
	assert.Less(t, elapsed, 5*time.Second, "the backoff must be abandoned, not slept out")
}

// onBodyClose is a transport that calls closed whenever a response body is closed.
type onBodyClose struct {
	next   http.RoundTripper
	closed func()
}

func (t onBodyClose) RoundTrip(req *http.Request) (*http.Response, error) {
	resp, err := t.next.RoundTrip(req)
	if err != nil {
		return nil, err
	}
	resp.Body = closeHook{ReadCloser: resp.Body, closed: t.closed}
	return resp, nil
}

type closeHook struct {
	io.ReadCloser
	closed func()
}

func (b closeHook) Close() error {
	err := b.ReadCloser.Close()
	b.closed()
	return err
}

// A deadline is an outage wherever it runs out: mid-request or mid-backoff.
func TestDoTreatsADeadlineThatExpiresDuringBackoffAsUnavailable(t *testing.T) {
	srv, calls := statusServer(t, http.StatusInternalServerError)

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	t.Cleanup(cancel)

	c := newTestClient(t, WithRetry(RetryParams{
		MaxAttempts: 3,
		BaseDelay:   10 * time.Second,
		MaxDelay:    10 * time.Second,
	}))

	_, err := c.Get(ctx, srv.URL)

	require.Error(t, err)
	assert.ErrorIs(t, err, context.DeadlineExceeded)
	assert.ErrorIs(t, err, upstream.ErrUnavailable)
	assert.Equal(t, int64(1), calls.Load())
}

func TestDoStopsWhenContextIsCancelledMidRequest(t *testing.T) {
	release := make(chan struct{})
	srv, calls := countingServer(t, func(w http.ResponseWriter, _ *http.Request) {
		<-release
		w.WriteHeader(http.StatusOK)
	})
	// Cleanups run last-registered-first, so this unblocks the handler before
	// httptest waits for it in srv.Close.
	t.Cleanup(func() { close(release) })

	ctx, cancel := context.WithCancel(context.Background())

	go func() {
		for calls.Load() == 0 {
			time.Sleep(time.Millisecond)
		}
		cancel()
	}()

	c := newTestClient(t)

	resp, err := c.Get(ctx, srv.URL)

	require.Error(t, err)
	assert.Nil(t, resp)
	assert.ErrorIs(t, err, context.Canceled)
	// A cancelled context is the caller giving up, so the remaining attempts are
	// abandoned rather than retried.
	assert.Equal(t, int64(1), calls.Load())
}

// WithTimeout bounds a single attempt, not the whole retry sequence, so an
// upstream that is slow on every attempt is retried until the attempts run out.
// Bounding the sequence requires a context deadline instead.
func TestDoRetriesPerAttemptTimeouts(t *testing.T) {
	srv, calls := countingServer(t, func(w http.ResponseWriter, _ *http.Request) {
		time.Sleep(50 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	})

	c := newTestClient(t, WithTimeout(5*time.Millisecond))

	resp, err := c.Get(context.Background(), srv.URL)

	require.Error(t, err)
	assert.Nil(t, resp)
	assert.Contains(t, err.Error(), "gave up after 3 attempts")
	assert.Equal(t, int64(3), calls.Load())
}
