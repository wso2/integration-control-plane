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

// Cache holds reads for ttl, fills each key once however many callers ask, and
// serves a copy up to stale old when a fill fails to get an answer.
type Cache struct {
	ttl   time.Duration
	stale time.Duration
	now   func() time.Time

	mu      sync.Mutex
	entries map[string]entry
	group   singleflight.Group
}

type Option func(*Cache)

// WithClock sets the time source, for tests.
func WithClock(now func() time.Time) Option {
	return func(c *Cache) { c.now = now }
}

func New(ttl, stale time.Duration, opts ...Option) *Cache {
	c := &Cache{ttl: ttl, stale: stale, now: time.Now, entries: map[string]entry{}}
	for _, opt := range opts {
		opt(c)
	}
	return c
}

// Get answers key from memory while it is fresh, and otherwise from fill. A copy
// stands in for a fill that fails with upstream.ErrUnavailable, up to stale old.
func (c *Cache) Get(ctx context.Context, key string, fill func(context.Context) (any, error)) (any, error) {
	c.mu.Lock()
	held, ok := c.entries[key]
	c.mu.Unlock()
	if ok && c.now().Sub(held.fetchedAt) < c.ttl {
		return held.value, nil
	}

	// Single-flight fills run under context.WithoutCancel, so one caller's cancel
	// can't abort the others.
	fillCtx := context.WithoutCancel(ctx)
	val, err, _ := c.group.Do(key, func() (any, error) {
		value, err := fill(fillCtx)
		if err != nil {
			return nil, err
		}
		c.mu.Lock()
		c.entries[key] = entry{value: value, fetchedAt: c.now()}
		c.mu.Unlock()
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
