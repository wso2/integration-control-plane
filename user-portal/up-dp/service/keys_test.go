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

package service

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/lestrrat-go/jwx/v3/jwk"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/wso2-enterprise/integration-user-portal-service/shared/external-services/oidc"
	"github.com/wso2-enterprise/integration-user-portal-service/up-dp/domain"
)

const testJWKSURI = "https://widp-dp.example/oauth2/jwks"

// fakeIssuer serves a discovery document and the current key set, and counts the calls.
// A fetch waits on release when it is set, and records whether its context was done.
type fakeIssuer struct {
	oidc.Client

	mu         sync.Mutex
	issuer     string
	jwksURI    string
	keys       jwk.Set
	fail       bool
	discovered int
	fetched    int
	release    chan struct{}
	started    chan struct{}
	ctxDone    bool
}

func (f *fakeIssuer) set(edit func(*fakeIssuer)) {
	f.mu.Lock()
	defer f.mu.Unlock()
	edit(f)
}

func (f *fakeIssuer) counts() (discovered, fetched int) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.discovered, f.fetched
}

func (f *fakeIssuer) Discover(_ context.Context, wellKnownURL string) (*oidc.Metadata, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.discovered++
	if f.fail {
		return nil, errors.New("issuer down")
	}
	if wellKnownURL != oidc.WellKnownFor(testIssuer) {
		return nil, errors.New("unexpected discovery url " + wellKnownURL)
	}
	return &oidc.Metadata{Issuer: f.issuer, JWKSURI: f.jwksURI}, nil
}

// FetchJWKS answers with the keys published when the fetch reached the issuer.
func (f *fakeIssuer) FetchJWKS(ctx context.Context, jwksURI string) (json.RawMessage, error) {
	f.mu.Lock()
	f.fetched++
	release, started, published := f.release, f.started, f.keys
	f.mu.Unlock()
	if started != nil {
		close(started)
	}
	if release != nil {
		<-release
	}

	f.mu.Lock()
	defer f.mu.Unlock()
	f.ctxDone = ctx.Err() != nil
	if f.fail {
		return nil, errors.New("issuer down")
	}
	if jwksURI != f.jwksURI {
		return nil, errors.New("unexpected jwks uri " + jwksURI)
	}
	return json.Marshal(published)
}

// newTestKeys is the keys of an issuer publishing kid, on a clock the test moves.
func newTestKeys(t *testing.T, kid string) (*IssuerKeys, *fakeIssuer, *time.Time) {
	t.Helper()

	issuer := &fakeIssuer{issuer: testIssuer, jwksURI: testJWKSURI, keys: newSigner(t, kid).public}
	now := testNow
	keys := NewIssuerKeys(testIssuer, issuer)
	keys.now = func() time.Time { return now }
	return keys, issuer, &now
}

func kidsOf(t *testing.T, set jwk.Set) []string {
	t.Helper()

	var kids []string
	for i := range set.Len() {
		key, ok := set.Key(i)
		require.True(t, ok)
		kid, _ := key.KeyID()
		kids = append(kids, kid)
	}
	return kids
}

func TestKeysAreFoundThroughDiscoveryOnce(t *testing.T) {
	keys, issuer, now := newTestKeys(t, "k1")

	set, err := keys.Get(context.Background(), "k1")
	require.NoError(t, err)
	assert.Equal(t, []string{"k1"}, kidsOf(t, set))

	// Past the TTL, a Get starts a background fetch, which an unknown kid then joins.
	*now = now.Add(keysTTL)
	_, err = keys.Get(context.Background(), "k1")
	require.NoError(t, err)
	_, err = keys.Get(context.Background(), "unknown")
	require.NoError(t, err)

	discovered, fetched := issuer.counts()
	assert.Equal(t, 1, discovered)
	assert.Equal(t, 2, fetched)
}

func TestKeysAreCachedForTheirTTL(t *testing.T) {
	keys, issuer, now := newTestKeys(t, "k1")

	for range 3 {
		_, err := keys.Get(context.Background(), "k1")
		require.NoError(t, err)
		*now = now.Add(keysTTL / 4)
	}

	_, fetched := issuer.counts()
	assert.Equal(t, 1, fetched)
}

func TestAFailedFetchFindsTheKeysThroughDiscoveryAgain(t *testing.T) {
	keys, issuer, now := newTestKeys(t, "k1")
	_, err := keys.Get(context.Background(), "k1")
	require.NoError(t, err)

	// The issuer moves its keys, so the URI held fails.
	issuer.set(func(f *fakeIssuer) {
		f.jwksURI = "https://widp-dp.example/t/tenant/oauth2/jwks"
		f.keys = newSigner(t, "k2").public
	})
	*now = now.Add(keysRetry)
	_, err = keys.Get(context.Background(), "k2")
	require.NoError(t, err, "the stale keys still serve")

	*now = now.Add(keysRetry)
	set, err := keys.Get(context.Background(), "k2")
	require.NoError(t, err)
	assert.Equal(t, []string{"k2"}, kidsOf(t, set))
	discovered, fetched := issuer.counts()
	assert.Equal(t, 2, discovered)
	assert.Equal(t, 3, fetched)
}

func TestAnUnknownKidFetchesTheRotatedKeys(t *testing.T) {
	keys, issuer, now := newTestKeys(t, "k1")
	_, err := keys.Get(context.Background(), "k1")
	require.NoError(t, err)

	issuer.set(func(f *fakeIssuer) { f.keys = newSigner(t, "k2").public })
	*now = now.Add(keysRetry)
	set, err := keys.Get(context.Background(), "k2")

	require.NoError(t, err)
	assert.Equal(t, []string{"k2"}, kidsOf(t, set))
}

func TestAnUnknownKidFetchesNoMoreThanOncePerRetry(t *testing.T) {
	keys, issuer, now := newTestKeys(t, "k1")
	_, err := keys.Get(context.Background(), "k1")
	require.NoError(t, err)

	for range 5 {
		_, err := keys.Get(context.Background(), "unknown")
		require.NoError(t, err)
		*now = now.Add(time.Second)
	}

	_, fetched := issuer.counts()
	assert.Equal(t, 1, fetched)
}

func TestStaleKeysServeWhileTheIssuerIsDown(t *testing.T) {
	keys, issuer, now := newTestKeys(t, "k1")
	_, err := keys.Get(context.Background(), "k1")
	require.NoError(t, err)

	issuer.set(func(f *fakeIssuer) { f.fail = true })
	*now = now.Add(keysTTL)
	set, err := keys.Get(context.Background(), "k1")

	require.NoError(t, err)
	assert.Equal(t, []string{"k1"}, kidsOf(t, set))
}

func TestStaleKeysStopServingAfterAnHour(t *testing.T) {
	keys, issuer, now := newTestKeys(t, "k1")
	_, err := keys.Get(context.Background(), "k1")
	require.NoError(t, err)

	issuer.set(func(f *fakeIssuer) { f.fail = true })
	*now = now.Add(keysStale)
	_, err = keys.Get(context.Background(), "k1")

	assert.ErrorIs(t, err, domain.ErrKeysUnavailable)
}

func TestNoKeysAtAllAreUnavailable(t *testing.T) {
	keys, issuer, now := newTestKeys(t, "k1")
	issuer.set(func(f *fakeIssuer) { f.fail = true })

	_, err := keys.Get(context.Background(), "k1")
	assert.ErrorIs(t, err, domain.ErrKeysUnavailable)

	// A failed fetch isn't retried on every request.
	*now = now.Add(time.Second)
	_, err = keys.Get(context.Background(), "k1")
	assert.ErrorIs(t, err, domain.ErrKeysUnavailable)
	discovered, _ := issuer.counts()
	assert.Equal(t, 1, discovered)

	issuer.set(func(f *fakeIssuer) { f.fail = false })
	*now = now.Add(keysRetry)
	_, err = keys.Get(context.Background(), "k1")
	assert.NoError(t, err)
}

func TestADiscoveryDocumentForAnotherIssuerIsRefused(t *testing.T) {
	keys, issuer, _ := newTestKeys(t, "k1")
	issuer.set(func(f *fakeIssuer) { f.issuer = "https://other.example" })

	_, err := keys.Get(context.Background(), "k1")

	assert.ErrorIs(t, err, domain.ErrKeysUnavailable)
	_, fetched := issuer.counts()
	assert.Zero(t, fetched)
}

// startSlowFetch has keys fetch for an unknown kid, in the background, and returns once
// the fetch has reached the issuer, with the function that lets it finish.
func startSlowFetch(t *testing.T, keys *IssuerKeys, issuer *fakeIssuer, ctx context.Context) (wait func() error, finish func()) {
	t.Helper()

	release, started := make(chan struct{}), make(chan struct{})
	issuer.set(func(f *fakeIssuer) { f.release, f.started = release, started })
	done := make(chan error, 1)
	go func() {
		_, err := keys.Get(ctx, "unknown")
		done <- err
	}()
	<-started
	issuer.set(func(f *fakeIssuer) { f.release, f.started = nil, nil })
	return func() error { return <-done }, func() { close(release) }
}

func TestAHeldKeyDoesNotWaitOnAFetch(t *testing.T) {
	keys, issuer, now := newTestKeys(t, "k1")
	_, err := keys.Get(context.Background(), "k1")
	require.NoError(t, err)
	*now = now.Add(keysRetry)

	wait, finish := startSlowFetch(t, keys, issuer, context.Background())
	defer func() { finish(); _ = wait() }()

	got := make(chan error, 1)
	go func() {
		_, err := keys.Get(context.Background(), "k1")
		got <- err
	}()
	select {
	case err := <-got:
		assert.NoError(t, err)
	case <-time.After(2 * time.Second):
		t.Fatal("a held key waited on the fetch")
	}
}

func TestCallersShareOneFetch(t *testing.T) {
	keys, issuer, _ := newTestKeys(t, "k1")

	wait, finish := startSlowFetch(t, keys, issuer, context.Background())
	joined := make(chan error, 3)
	for range 3 {
		go func() {
			_, err := keys.Get(context.Background(), "k1")
			joined <- err
		}()
	}
	time.Sleep(50 * time.Millisecond)
	finish()

	require.NoError(t, wait())
	for range 3 {
		assert.NoError(t, <-joined)
	}
	_, fetched := issuer.counts()
	assert.Equal(t, 1, fetched)
}

func TestAHeldKeyPastItsTTLDoesNotWaitOnTheRefresh(t *testing.T) {
	keys, issuer, now := newTestKeys(t, "k1")
	_, err := keys.Get(context.Background(), "k1")
	require.NoError(t, err)
	*now = now.Add(keysTTL)

	release, started := make(chan struct{}), make(chan struct{})
	issuer.set(func(f *fakeIssuer) {
		f.release, f.started = release, started
		f.keys = newSigner(t, "k2").public
	})
	got := make(chan jwk.Set, 1)
	go func() {
		set, err := keys.Get(context.Background(), "k1")
		assert.NoError(t, err)
		got <- set
	}()
	select {
	case set := <-got:
		assert.Equal(t, []string{"k1"}, kidsOf(t, set))
	case <-time.After(2 * time.Second):
		t.Fatal("a held key waited on the refresh")
	}

	// The refresh went on in the background, and brings the rotated key.
	<-started
	issuer.set(func(f *fakeIssuer) { f.release, f.started = nil, nil })
	close(release)
	set, err := keys.Get(context.Background(), "k2")
	require.NoError(t, err)
	assert.Equal(t, []string{"k2"}, kidsOf(t, set))
	_, fetched := issuer.counts()
	assert.Equal(t, 2, fetched)
}

func TestAKeyPublishedDuringAFetchIsFetchedAgain(t *testing.T) {
	keys, issuer, now := newTestKeys(t, "k1")
	_, err := keys.Get(context.Background(), "k1")
	require.NoError(t, err)
	*now = now.Add(keysRetry)

	wait, finish := startSlowFetch(t, keys, issuer, context.Background())
	issuer.set(func(f *fakeIssuer) { f.keys = newSigner(t, "k2").public })
	rotated := make(chan jwk.Set, 1)
	go func() {
		set, err := keys.Get(context.Background(), "k2")
		assert.NoError(t, err)
		rotated <- set
	}()
	time.Sleep(50 * time.Millisecond)
	finish()

	// The caller that started the fetch gets its result; the one that joined it fetches again.
	require.NoError(t, wait())
	got := <-rotated
	assert.Equal(t, []string{"k2"}, kidsOf(t, got))
	_, fetched := issuer.counts()
	assert.Equal(t, 3, fetched)
}

func TestAnUnknownKidGetsOneSecondFetchAtMost(t *testing.T) {
	keys, issuer, now := newTestKeys(t, "k1")
	_, err := keys.Get(context.Background(), "k1")
	require.NoError(t, err)
	*now = now.Add(keysRetry)

	wait, finish := startSlowFetch(t, keys, issuer, context.Background())
	joined := make(chan error, 3)
	for range 3 {
		go func() {
			_, err := keys.Get(context.Background(), "garbage")
			joined <- err
		}()
	}
	time.Sleep(50 * time.Millisecond)
	finish()

	require.NoError(t, wait())
	for range 3 {
		assert.NoError(t, <-joined)
	}
	_, err = keys.Get(context.Background(), "garbage")
	require.NoError(t, err)
	_, fetched := issuer.counts()
	assert.Equal(t, 3, fetched, "the first fetch, its one follow-up, and no more")
}

func TestACancelledCallerStopsWaitingButNotTheFetch(t *testing.T) {
	keys, issuer, _ := newTestKeys(t, "k1")
	ctx, cancel := context.WithCancel(context.Background())

	wait, finish := startSlowFetch(t, keys, issuer, ctx)
	cancel()
	err := wait()
	assert.ErrorIs(t, err, domain.ErrKeysUnavailable)
	assert.ErrorIs(t, err, context.Canceled)

	// Another caller joins the fetch, which finishes for it.
	finish()
	_, err = keys.Get(context.Background(), "k1")
	require.NoError(t, err)
	_, fetched := issuer.counts()
	assert.Equal(t, 1, fetched)
	issuer.mu.Lock()
	defer issuer.mu.Unlock()
	assert.False(t, issuer.ctxDone, "the fetch saw the caller's cancel")
}
