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
	"fmt"
	"sync"
	"time"

	"github.com/lestrrat-go/jwx/v3/jwk"
	"golang.org/x/sync/singleflight"

	"github.com/wso2-enterprise/integration-user-portal-service/shared/external-services/oidc"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/infrastructure/logging"
	"github.com/wso2-enterprise/integration-user-portal-service/up-dp/domain"
)

const (
	keysTTL = 5 * time.Minute
	// keysRetry bounds how often an unknown kid or a failed fetch goes back to the issuer.
	keysRetry = 30 * time.Second
	// keysStale bounds how long keys serve while the issuer can't be reached, so a key the
	// issuer dropped stops being trusted.
	keysStale = time.Hour
)

// IssuerKeys is the issuer's signing keys, found through its discovery document.
type IssuerKeys struct {
	issuer string
	oidc   oidc.Client
	now    func() time.Time

	mu          sync.Mutex
	jwksURI     string
	set         jwk.Set
	fetchedAt   time.Time
	lastAttempt time.Time
	// started counts the fetches begun, so a caller can tell a fetch it joined began before it came.
	started uint64
	group   singleflight.Group
}

// flight is what one fetch gives every caller that shares it.
type flight struct {
	set jwk.Set
	// n is the fetch's number in started.
	n uint64
	// second is a fetch made for callers whose key the fetch before it lacked.
	second bool
}

func NewIssuerKeys(issuer string, client oidc.Client) *IssuerKeys {
	return &IssuerKeys{issuer: issuer, oidc: client, now: time.Now}
}

// Get returns the keys. Keys that hold kid serve at once for keysStale, and from keysTTL
// on each Get also starts a fetch in the background, so a caller whose key is held never
// waits on the issuer. A caller without its key, after a rotation or before the first
// fetch, waits for one, but no longer than its own context allows. Fetches for unknown
// kids come at most every keysRetry, so a rotated key works within keysRetry of the
// issuer publishing it.
func (k *IssuerKeys) Get(ctx context.Context, kid string) (jwk.Set, error) {
	k.mu.Lock()
	set, fetchedAt, lastAttempt, started := k.set, k.fetchedAt, k.lastAttempt, k.started
	k.mu.Unlock()

	now := k.now()
	usable := set != nil && now.Sub(fetchedAt) < keysStale
	due := now.Sub(lastAttempt) >= keysRetry
	if usable && holds(set, kid) {
		if due && now.Sub(fetchedAt) >= keysTTL {
			// DoChan's channel is buffered, so the result can go unread.
			k.group.DoChan("keys", k.fetch(ctx, false))
		}
		return set, nil
	}
	if !due {
		if usable {
			return set, nil
		}
		return nil, fmt.Errorf("issuerkeys:Get: last fetch from %s failed: %w", k.issuer, domain.ErrKeysUnavailable)
	}

	got, err := k.await(ctx, false)
	if err != nil {
		if usable && ctx.Err() == nil {
			return set, nil
		}
		return nil, err
	}
	// A fetch that began before this caller came may predate its key, and the attempt it
	// records holds off another for keysRetry. So the caller gets one more fetch, whose
	// own callers don't, which bounds the issuer to two fetches per keysRetry.
	if !holds(got.set, kid) && got.n <= started && !got.second {
		if again, err := k.await(ctx, true); err == nil {
			got = again
		}
	}
	return got.set, nil
}

func holds(set jwk.Set, kid string) bool {
	_, known := set.LookupKeyID(kid)
	return kid == "" || known
}

// await joins the fetch under way, or starts one, and waits for it as long as ctx allows.
func (k *IssuerKeys) await(ctx context.Context, second bool) (flight, error) {
	select {
	case result := <-k.group.DoChan("keys", k.fetch(ctx, second)):
		if result.Err != nil {
			return flight{}, fmt.Errorf("issuerkeys:Get: %w: %w", domain.ErrKeysUnavailable, result.Err)
		}
		return result.Val.(flight), nil
	case <-ctx.Done():
		return flight{}, fmt.Errorf("issuerkeys:Get: gave up waiting for %s: %w: %w", k.issuer, domain.ErrKeysUnavailable, ctx.Err())
	}
}

// fetch is the one fetch every caller shares. It runs under context.WithoutCancel, so a
// caller that stops waiting doesn't abort it for the others.
func (k *IssuerKeys) fetch(ctx context.Context, second bool) func() (any, error) {
	fetchCtx := context.WithoutCancel(ctx)
	return func() (any, error) {
		k.mu.Lock()
		k.started++
		n := k.started
		k.mu.Unlock()

		set, err := k.refresh(fetchCtx)
		if err != nil {
			logging.S(fetchCtx).Warnw("fetching signing keys failed", "issuer", k.issuer, "error", err)
			return nil, err
		}
		return flight{set: set, n: n, second: second}, nil
	}
}

// refresh fetches the keys. It records the attempt when it ends, so callers that come
// while it runs join it rather than being turned away.
func (k *IssuerKeys) refresh(ctx context.Context) (jwk.Set, error) {
	defer func() {
		k.mu.Lock()
		k.lastAttempt = k.now()
		k.mu.Unlock()
	}()

	k.mu.Lock()
	jwksURI := k.jwksURI
	k.mu.Unlock()

	if jwksURI == "" {
		metadata, err := k.oidc.Discover(ctx, oidc.WellKnownFor(k.issuer))
		if err != nil {
			return nil, fmt.Errorf("discover %s: %w", k.issuer, err)
		}
		if metadata.Issuer != k.issuer {
			return nil, fmt.Errorf("discovery document names issuer %q, want %q", metadata.Issuer, k.issuer)
		}
		jwksURI = metadata.JWKSURI
		k.mu.Lock()
		k.jwksURI = jwksURI
		k.mu.Unlock()
	}

	// A failed fetch forgets the URI, so the next one reads the discovery document again
	// and follows the issuer if it moved its keys.
	forget := func() {
		k.mu.Lock()
		k.jwksURI = ""
		k.mu.Unlock()
	}
	raw, err := k.oidc.FetchJWKS(ctx, jwksURI)
	if err != nil {
		forget()
		return nil, fmt.Errorf("fetch jwks: %w", err)
	}
	set, err := jwk.Parse(raw)
	if err != nil {
		forget()
		return nil, fmt.Errorf("parse jwks: %w", err)
	}

	k.mu.Lock()
	k.set, k.fetchedAt = set, k.now()
	k.mu.Unlock()
	return set, nil
}
