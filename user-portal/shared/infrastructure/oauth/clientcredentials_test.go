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

package oauth

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/wso2-enterprise/integration-user-portal-service/shared/infrastructure/httpclient"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/upstream"
)

const (
	testServiceName  = "test-upstream"
	testClientID     = "client-id"
	testClientSecret = "client-secret"
	testScopes       = "scope_one scope_two"
)

func newSource(t *testing.T, tokenURL string) *ClientCredentials {
	t.Helper()

	return New(httpclient.New(
		httpclient.WithServiceName(testServiceName),
		httpclient.WithRetry(httpclient.RetryParams{MaxAttempts: 1}),
	), Config{
		ServiceName:  testServiceName,
		TokenURL:     tokenURL,
		ClientID:     testClientID,
		ClientSecret: testClientSecret,
		Scopes:       testScopes,
	})
}

// grantServer answers every request with body, counting the calls.
func grantServer(t *testing.T, body string) (string, *atomic.Int32) {
	t.Helper()

	minted := &atomic.Int32{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		minted.Add(1)
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)

	return srv.URL, minted
}

func TestGrantIsClientCredentialsOverBasicAuth(t *testing.T) {
	var form url.Values
	var contentType, authorization string
	var basicUser, basicPass string
	var basicOK bool

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		contentType = r.Header.Get("Content-Type")
		authorization = r.Header.Get("Authorization")
		basicUser, basicPass, basicOK = r.BasicAuth()

		body, err := io.ReadAll(r.Body)
		assert.NoError(t, err)
		form, err = url.ParseQuery(string(body))
		assert.NoError(t, err)

		_, _ = w.Write([]byte(`{"access_token":"tok","expires_in":3600}`))
	}))
	t.Cleanup(srv.Close)

	got, err := newSource(t, srv.URL).Token(context.Background())

	require.NoError(t, err)
	assert.Equal(t, "tok", got)
	assert.Equal(t, "application/x-www-form-urlencoded", contentType)

	assert.True(t, strings.HasPrefix(authorization, "Basic "))
	require.True(t, basicOK)
	assert.Equal(t, testClientID, basicUser)
	assert.Equal(t, testClientSecret, basicPass)

	assert.Equal(t, "client_credentials", form.Get("grant_type"))
	assert.Equal(t, testScopes, form.Get("scope"))

	// The secret must not travel in the body as well as the header.
	assert.Empty(t, form.Get("client_id"))
	assert.Empty(t, form.Get("client_secret"))
}

func TestTokenIsCachedAcrossCalls(t *testing.T) {
	tokenURL, minted := grantServer(t, `{"access_token":"tok","expires_in":3600}`)
	source := newSource(t, tokenURL)

	for range 3 {
		_, err := source.Token(context.Background())
		require.NoError(t, err)
	}

	assert.Equal(t, int32(1), minted.Load())
}

func TestTokenIsRefetchedOnceItIsWithinTheSkewOfExpiry(t *testing.T) {
	tokenURL, minted := grantServer(t, `{"access_token":"tok","expires_in":300}`)

	now := time.Now()
	source := newSource(t, tokenURL)
	source.now = func() time.Time { return now }

	_, err := source.Token(context.Background())
	require.NoError(t, err)

	// Still inside the lifetime, and outside the skew: served from cache.
	now = now.Add(200 * time.Second)
	_, err = source.Token(context.Background())
	require.NoError(t, err)
	assert.Equal(t, int32(1), minted.Load())

	// Inside the skew but not yet expired upstream: refetched anyway, which is
	// the point of the skew — a token must not expire in flight.
	now = now.Add(60 * time.Second)
	_, err = source.Token(context.Background())
	require.NoError(t, err)
	assert.Equal(t, int32(2), minted.Load())
}

func TestAShortLivedTokenIsStillCachedForHalfItsLifetime(t *testing.T) {
	tokenURL, minted := grantServer(t, `{"access_token":"tok","expires_in":30}`)

	now := time.Now()
	source := newSource(t, tokenURL)
	source.now = func() time.Time { return now }

	_, err := source.Token(context.Background())
	require.NoError(t, err)

	now = now.Add(14 * time.Second)
	_, err = source.Token(context.Background())
	require.NoError(t, err)
	assert.Equal(t, int32(1), minted.Load())

	now = now.Add(time.Second)
	_, err = source.Token(context.Background())
	require.NoError(t, err)
	assert.Equal(t, int32(2), minted.Load())
}

func TestTokenWithNoStatedLifetimeIsNotCached(t *testing.T) {
	tokenURL, minted := grantServer(t, `{"access_token":"tok"}`)
	source := newSource(t, tokenURL)

	for range 2 {
		_, err := source.Token(context.Background())
		require.NoError(t, err)
	}

	assert.Equal(t, int32(2), minted.Load())
}

func TestInvalidateForcesTheNextCallToMint(t *testing.T) {
	tokenURL, minted := grantServer(t, `{"access_token":"tok","expires_in":3600}`)
	source := newSource(t, tokenURL)

	_, err := source.Token(context.Background())
	require.NoError(t, err)

	source.Invalidate()

	_, err = source.Token(context.Background())
	require.NoError(t, err)
	assert.Equal(t, int32(2), minted.Load())
}

func TestConcurrentCallersShareOneGrant(t *testing.T) {
	minted := &atomic.Int32{}
	release := make(chan struct{})

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		minted.Add(1)
		<-release
		_, _ = w.Write([]byte(`{"access_token":"tok","expires_in":3600}`))
	}))
	t.Cleanup(srv.Close)

	source := newSource(t, srv.URL)

	var wg sync.WaitGroup
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			got, err := source.Token(context.Background())
			assert.NoError(t, err)
			assert.Equal(t, "tok", got)
		}()
	}

	// Let the goroutines pile up behind the leader before it answers.
	time.Sleep(5 * time.Millisecond)
	close(release)
	wg.Wait()

	assert.Equal(t, int32(1), minted.Load())
}

// The leader's cancellation must not abort the fill the others are waiting on.
func TestFillOutlivesTheCancellingCaller(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Fails the fill if it inherited a cancelled context.
		assert.NoError(t, r.Context().Err())
		_, _ = w.Write([]byte(`{"access_token":"tok","expires_in":3600}`))
	}))
	t.Cleanup(srv.Close)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	got, err := newSource(t, srv.URL).Token(ctx)

	require.NoError(t, err)
	assert.Equal(t, "tok", got)
}

func TestRejectedGrantIsAnError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":"invalid_client"}`))
	}))
	t.Cleanup(srv.Close)

	got, err := newSource(t, srv.URL).Token(context.Background())

	require.Error(t, err)
	assert.Empty(t, got)

	// The upstream's name, not this package's, so a log line names the grant that failed.
	assert.Contains(t, err.Error(), testServiceName)

	var statusErr *httpclient.StatusError
	require.ErrorAs(t, err, &statusErr)
	assert.Equal(t, http.StatusUnauthorized, statusErr.StatusCode)
}

// Only an outage is classified: a token endpoint's 404 names no resource, and
// ErrNotFound would read as the caller's resource being gone.
func TestAFailedGrantIsClassifiedAsUnavailableOnly(t *testing.T) {
	for status, unavailable := range map[int]bool{
		http.StatusBadGateway:          true,
		http.StatusServiceUnavailable:  true,
		http.StatusGatewayTimeout:      true,
		http.StatusNotFound:            false,
		http.StatusInternalServerError: false,
	} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(status)
			}))
			t.Cleanup(srv.Close)

			_, err := newSource(t, srv.URL).Token(context.Background())

			require.Error(t, err)
			assert.Equal(t, unavailable, errors.Is(err, upstream.ErrUnavailable))
			assert.NotErrorIs(t, err, upstream.ErrNotFound)
		})
	}
}

func TestGrantWithNoAccessTokenIsRejected(t *testing.T) {
	tokenURL, _ := grantServer(t, `{"token_type":"Bearer","expires_in":3600}`)

	_, err := newSource(t, tokenURL).Token(context.Background())

	require.Error(t, err)
	assert.Contains(t, err.Error(), "unexpected empty data")
}

func TestTokenURLIsReported(t *testing.T) {
	assert.Equal(t, "https://idp.example/oauth2/token",
		newSource(t, "https://idp.example/oauth2/token").TokenURL())
}
