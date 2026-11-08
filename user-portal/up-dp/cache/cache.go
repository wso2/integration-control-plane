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

package cache

import (
	"context"
	"errors"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"

	"github.com/wso2-enterprise/integration-user-portal-service/shared/infrastructure/logging"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/upstream"
)

type entry struct {
	value     any
	fetchedAt time.Time
}

// DefaultMaxEntries is how many keys a cache holds unless WithMaxEntries says otherwise.
const DefaultMaxEntries = 512

// Cache holds reads for ttl, fills each key once however many callers ask, and
// serves a copy up to stale old when a fill fails to get an answer. It holds at
// most maxEntries keys, dropping the oldest to make room.
type Cache struct {
	ttl        time.Duration
	stale      time.Duration
	maxEntries int
	now        func() time.Time

	mu      sync.Mutex
	entries map[string]entry
	sweptAt time.Time
	group   singleflight.Group
}

type Option func(*Cache)

// WithClock sets the time source, for tests.
func WithClock(now func() time.Time) Option {
	return func(c *Cache) { c.now = now }
}

// WithMaxEntries sets how many keys the cache holds.
func WithMaxEntries(n int) Option {
	return func(c *Cache) { c.maxEntries = n }
}

func New(ttl, stale time.Duration, opts ...Option) *Cache {
	c := &Cache{ttl: ttl, stale: stale, maxEntries: DefaultMaxEntries, now: time.Now, entries: map[string]entry{}}
	for _, opt := range opts {
		opt(c)
	}
	return c
}

// Get answers key from memory while it is fresh, and otherwise from fill. A copy
// stands in for a fill that fails with upstream.ErrUnavailable, up to stale old.
func (c *Cache) Get(ctx context.Context, key string, fill func(context.Context) (any, error)) (any, error) {
	held, ok := c.lookup(key)
	if ok && c.fresh(held) {
		return held.value, nil
	}

	// Single-flight fills run under context.WithoutCancel, so one caller's cancel
	// can't abort the others.
	fillCtx := context.WithoutCancel(ctx)
	val, err, _ := c.group.Do(key, func() (any, error) {
		// A caller that missed just before another fill finished and left the
		// group would otherwise fill the key a second time.
		if stored, ok := c.lookup(key); ok && c.fresh(stored) {
			return stored.value, nil
		}
		value, err := fill(fillCtx)
		if err != nil {
			return nil, err
		}
		c.store(key, value)
		return value, nil
	})
	if err != nil {
		if ok && errors.Is(err, upstream.ErrUnavailable) && c.now().Sub(held.fetchedAt) < c.stale {
			logging.S(ctx).Warnw("serving a stale read", "key", key, "error", err)
			return held.value, nil
		}
		return nil, err
	}
	return val, nil
}

func (c *Cache) lookup(key string) (entry, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	held, ok := c.entries[key]
	return held, ok
}

func (c *Cache) fresh(held entry) bool {
	return c.now().Sub(held.fetchedAt) < c.ttl
}

// store keeps value, and at most once per keep drops the entries too old to serve, fresh or stale.
// A new key on a full cache first drops those, then the oldest entry if none were.
func (c *Cache) store(key string, value any) {
	c.mu.Lock()
	defer c.mu.Unlock()

	now := c.now()
	_, held := c.entries[key]
	full := !held && len(c.entries) >= c.maxEntries
	if full || now.Sub(c.sweptAt) >= max(c.ttl, c.stale) {
		c.sweep(now)
	}
	if !held && len(c.entries) >= c.maxEntries {
		c.dropOldest()
	}
	c.entries[key] = entry{value: value, fetchedAt: now}
}

func (c *Cache) sweep(now time.Time) {
	keep := max(c.ttl, c.stale)
	for k, held := range c.entries {
		if now.Sub(held.fetchedAt) >= keep {
			delete(c.entries, k)
		}
	}
	c.sweptAt = now
}

func (c *Cache) dropOldest() {
	var oldest string
	var at time.Time
	for k, held := range c.entries {
		if at.IsZero() || held.fetchedAt.Before(at) {
			oldest, at = k, held.fetchedAt
		}
	}
	delete(c.entries, oldest)
}
