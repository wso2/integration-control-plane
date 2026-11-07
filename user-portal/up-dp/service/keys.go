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
	group       singleflight.Group
}

func NewIssuerKeys(issuer string, client oidc.Client) *IssuerKeys {
	return &IssuerKeys{issuer: issuer, oidc: client, now: time.Now}
}

// Get returns the keys, fetched again once they are keysTTL old, or sooner when they
// lack kid, so a rotated key is picked up without waiting out the TTL. A fetch holds no
// lock, so a caller whose key is held never waits on one.
func (k *IssuerKeys) Get(ctx context.Context, kid string) (jwk.Set, error) {
	k.mu.Lock()
	set, fetchedAt, lastAttempt := k.set, k.fetchedAt, k.lastAttempt
	k.mu.Unlock()

	now := k.now()
	if set != nil && now.Sub(fetchedAt) < keysTTL {
		if _, known := set.LookupKeyID(kid); kid == "" || known {
			return set, nil
		}
	}
	usable := set != nil && now.Sub(fetchedAt) < keysStale
	if now.Sub(lastAttempt) < keysRetry {
		if usable {
			return set, nil
		}
		return nil, fmt.Errorf("issuerkeys:Get: last fetch from %s failed: %w", k.issuer, domain.ErrKeysUnavailable)
	}

	// One fetch for every caller, under context.WithoutCancel, so one caller's cancel
	// can't abort it for the others.
	fetchCtx := context.WithoutCancel(ctx)
	fetched, err, _ := k.group.Do("keys", func() (any, error) { return k.refresh(fetchCtx) })
	if err != nil {
		if usable {
			logging.S(ctx).Warnw("serving stale signing keys after a failed fetch", "issuer", k.issuer, "error", err)
			return set, nil
		}
		return nil, fmt.Errorf("issuerkeys:Get: %w: %w", domain.ErrKeysUnavailable, err)
	}
	return fetched.(jwk.Set), nil
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

	raw, err := k.oidc.FetchJWKS(ctx, jwksURI)
	if err != nil {
		return nil, fmt.Errorf("fetch jwks: %w", err)
	}
	set, err := jwk.Parse(raw)
	if err != nil {
		return nil, fmt.Errorf("parse jwks: %w", err)
	}

	k.mu.Lock()
	k.set, k.fetchedAt = set, k.now()
	k.mu.Unlock()
	return set, nil
}
