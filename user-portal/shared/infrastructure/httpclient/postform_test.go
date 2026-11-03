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

package httpclient

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/url"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/wso2-enterprise/integration-user-portal-service/shared/common"
)

func exchangeForm() url.Values {
	return url.Values{
		"grant_type":         {"urn:ietf:params:oauth:grant-type:token-exchange"},
		"subject_token":      {"header.payload.signature"},
		"subject_token_type": {"urn:ietf:params:oauth:token-type:access_token"},
	}
}

func TestPostFormSendsFormEncodedBody(t *testing.T) {
	var gotMethod, gotContentType, gotBody string
	srv, calls := countingServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotMethod = r.Method
		gotContentType = r.Header.Get("Content-Type")

		body, err := io.ReadAll(r.Body)
		assert.NoError(t, err)
		gotBody = string(body)

		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"access_token":"t"}`))
	})

	c := newTestClient(t)

	resp, err := c.PostForm(context.Background(), srv.URL, exchangeForm())

	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, `{"access_token":"t"}`, string(resp.Body))
	assert.Equal(t, int64(1), calls.Load())

	assert.Equal(t, http.MethodPost, gotMethod)
	assert.Equal(t, "application/x-www-form-urlencoded", gotContentType)
	// Encoded, not JSON: the IdP rejects a JSON body outright.
	assert.Equal(t, exchangeForm().Encode(), gotBody)
}

func TestPostFormBodyParsesBackToTheSameValues(t *testing.T) {
	var got url.Values
	srv, _ := countingServer(t, func(w http.ResponseWriter, r *http.Request) {
		require.NoError(t, r.ParseForm())
		got = r.PostForm
		w.WriteHeader(http.StatusOK)
	})

	c := newTestClient(t)

	_, err := c.PostForm(context.Background(), srv.URL, exchangeForm())

	require.NoError(t, err)
	assert.Equal(t, exchangeForm(), got)
}

func TestPostFormSetsAcceptHeader(t *testing.T) {
	var got string
	srv, _ := countingServer(t, func(w http.ResponseWriter, r *http.Request) {
		got = r.Header.Get("Accept")
		w.WriteHeader(http.StatusOK)
	})

	c := newTestClient(t)

	_, err := c.PostForm(context.Background(), srv.URL, exchangeForm())

	require.NoError(t, err)
	assert.Equal(t, "application/json", got)
}

func TestPostFormForwardsCorrelationID(t *testing.T) {
	var got string
	srv, _ := countingServer(t, func(w http.ResponseWriter, r *http.Request) {
		got = r.Header.Get(common.CorrelationIDHeader)
		w.WriteHeader(http.StatusOK)
	})

	ctx := common.WithCorrelationID(context.Background(), "req-abc-123")

	c := newTestClient(t)

	_, err := c.PostForm(ctx, srv.URL, exchangeForm())

	require.NoError(t, err)
	assert.Equal(t, "req-abc-123", got)
}

func TestPostFormRequestOptionsSetHeaders(t *testing.T) {
	var got http.Header
	srv, _ := countingServer(t, func(w http.ResponseWriter, r *http.Request) {
		got = r.Header.Clone()
		w.WriteHeader(http.StatusOK)
	})

	c := newTestClient(t)

	_, err := c.PostForm(context.Background(), srv.URL, exchangeForm(),
		WithHeader("x-organization-id", "org-1"),
	)

	require.NoError(t, err)
	assert.Equal(t, "org-1", got.Get("x-organization-id"))
	assert.Equal(t, "application/x-www-form-urlencoded", got.Get("Content-Type"), "client headers still apply")
}

func TestPostFormRequestOptionsOverrideClientHeaders(t *testing.T) {
	var got string
	srv, _ := countingServer(t, func(w http.ResponseWriter, r *http.Request) {
		got = r.Header.Get("Content-Type")
		w.WriteHeader(http.StatusOK)
	})

	c := newTestClient(t)

	_, err := c.PostForm(context.Background(), srv.URL, exchangeForm(),
		WithHeader("Content-Type", "text/plain"))

	require.NoError(t, err)
	assert.Equal(t, "text/plain", got)
}

func TestPostFormIsNotRetried(t *testing.T) {
	for _, status := range []int{http.StatusInternalServerError, http.StatusBadGateway, http.StatusTooManyRequests} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			srv, calls := statusServer(t, status)

			c := newTestClient(t)

			resp, err := c.PostForm(context.Background(), srv.URL, exchangeForm())

			require.NoError(t, err)
			assert.Equal(t, status, resp.StatusCode)
			assert.Equal(t, int64(1), calls.Load())
		})
	}
}

func TestPostFormRetriesWhenNonIdempotentRetriesAreEnabled(t *testing.T) {
	srv, calls := statusServer(t, http.StatusInternalServerError)

	c := newTestClient(t, WithRetry(RetryParams{
		MaxAttempts:        3,
		BaseDelay:          time.Millisecond,
		MaxDelay:           5 * time.Millisecond,
		RetryNonIdempotent: true,
	}))

	_, err := c.PostForm(context.Background(), srv.URL, exchangeForm())

	require.NoError(t, err)
	assert.Equal(t, int64(3), calls.Load())
}

func TestPostFormReturnsNonSuccessResponseWithoutError(t *testing.T) {
	srv, _ := countingServer(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":"invalid_grant"}`))
	})

	c := newTestClient(t)

	resp, err := c.PostForm(context.Background(), srv.URL, exchangeForm())

	require.NoError(t, err)
	assert.False(t, resp.IsSuccess())
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	assert.Equal(t, `{"error":"invalid_grant"}`, string(resp.Body))
}

func TestPostFormWithEmptyFormStillSetsContentType(t *testing.T) {
	var gotContentType string
	var gotBody []byte
	srv, _ := countingServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotContentType = r.Header.Get("Content-Type")

		body, err := io.ReadAll(r.Body)
		assert.NoError(t, err)
		gotBody = body

		w.WriteHeader(http.StatusOK)
	})

	c := newTestClient(t)

	_, err := c.PostForm(context.Background(), srv.URL, url.Values{})

	require.NoError(t, err)
	assert.Equal(t, "application/x-www-form-urlencoded", gotContentType)
	assert.Empty(t, gotBody)
}

// A failure is still returned on its status, so an oversized error body only
// costs its tail.
func TestPostFormTruncatesAnOversizedFailureBody(t *testing.T) {
	srv, _ := countingServer(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write(bytes.Repeat([]byte("a"), maxBodyBytes+1024))
	})

	c := newTestClient(t)

	resp, err := c.PostForm(context.Background(), srv.URL, exchangeForm())

	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	assert.Len(t, resp.Body, maxBodyBytes, "the body must be capped at maxBodyBytes")
}

func TestPostFormWithCancelledContext(t *testing.T) {
	srv, calls := statusServer(t, http.StatusOK)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	c := newTestClient(t)

	resp, err := c.PostForm(ctx, srv.URL, exchangeForm())

	require.Error(t, err)
	assert.Nil(t, resp)
	assert.ErrorIs(t, err, context.Canceled)
	assert.Equal(t, int64(0), calls.Load())
}
