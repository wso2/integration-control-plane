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
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/wso2-enterprise/integration-user-portal-service/shared/upstream"
)

// clock is a settable time source.
type clock struct {
	mu  sync.Mutex
	now time.Time
}

func (c *clock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

func (c *clock) advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.now = c.now.Add(d)
}

func newTestCache() (*Cache, *clock) {
	clk := &clock{now: time.Date(2026, 11, 2, 9, 0, 0, 0, time.UTC)}
	return New(30*time.Second, 15*time.Minute, WithClock(clk.Now)), clk
}

// counter answers the number of times it was asked, or err.
type counter struct {
	calls atomic.Int32
	err   error
}

func (f *counter) fill(context.Context) (any, error) {
	n := f.calls.Add(1)
	if f.err != nil {
		return nil, f.err
	}
	return int(n), nil
}

func TestGetServesAFreshReadFromMemory(t *testing.T) {
	c, clk := newTestCache()
	source := &counter{}

	first, err := c.Get(context.Background(), "k", source.fill)
	require.NoError(t, err)
	again, err := c.Get(context.Background(), "k", source.fill)
	require.NoError(t, err)
	assert.Equal(t, 1, again)
	assert.Equal(t, first, again)

	clk.advance(30 * time.Second)
	refilled, err := c.Get(context.Background(), "k", source.fill)
	require.NoError(t, err)
	assert.Equal(t, 2, refilled)
}

func TestGetKeepsKeysApart(t *testing.T) {
	c, _ := newTestCache()
	source := &counter{}

	_, _ = c.Get(context.Background(), "a", source.fill)
	_, _ = c.Get(context.Background(), "b", source.fill)

	assert.Equal(t, int32(2), source.calls.Load())
}

func TestGetServesAStaleCopyOnlyWhileTheUpstreamDoesNotAnswer(t *testing.T) {
	c, clk := newTestCache()
	source := &counter{}
	_, err := c.Get(context.Background(), "k", source.fill)
	require.NoError(t, err)

	source.err = fmt.Errorf("ipaas: %w", upstream.ErrUnavailable)
	clk.advance(time.Minute)
	stale, err := c.Get(context.Background(), "k", source.fill)
	require.NoError(t, err)
	assert.Equal(t, 1, stale)

	clk.advance(15 * time.Minute)
	_, err = c.Get(context.Background(), "k", source.fill)
	assert.ErrorIs(t, err, upstream.ErrUnavailable)
}

func TestGetServesNoStaleCopyForAnAnswer(t *testing.T) {
	c, clk := newTestCache()
	source := &counter{}
	_, err := c.Get(context.Background(), "k", source.fill)
	require.NoError(t, err)

	source.err = fmt.Errorf("ipaas: %w", upstream.ErrNotFound)
	clk.advance(time.Minute)
	_, err = c.Get(context.Background(), "k", source.fill)
	assert.ErrorIs(t, err, upstream.ErrNotFound)
}

func TestGetFillsOnceForCallersAtTheSameTime(t *testing.T) {
	c, _ := newTestCache()
	release := make(chan struct{})
	var calls atomic.Int32
	fill := func(context.Context) (any, error) {
		calls.Add(1)
		<-release
		return "v", nil
	}

	var wg sync.WaitGroup
	for range 5 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			value, err := c.Get(context.Background(), "k", fill)
			assert.NoError(t, err)
			assert.Equal(t, "v", value)
		}()
	}
	assert.Eventually(t, func() bool { return calls.Load() == 1 }, time.Second, time.Millisecond)
	close(release)
	wg.Wait()

	assert.Equal(t, int32(1), calls.Load())
}

func TestGetFillsWithoutTheCallersCancel(t *testing.T) {
	c, _ := newTestCache()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	value, err := c.Get(ctx, "k", func(fillCtx context.Context) (any, error) {
		if fillCtx.Err() != nil {
			return nil, errors.New("the fill saw the caller's cancel")
		}
		return "v", nil
	})

	require.NoError(t, err)
	assert.Equal(t, "v", value)
}
