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

package env

import (
	"context"
	"time"
)

// Loader reads a group of variables and keeps the FIRST error
type Loader struct {
	ctx context.Context
	err error
}

func NewLoader(ctx context.Context) *Loader {
	return &Loader{ctx: ctx}
}

// Err is the first failure, or nil.
func (l *Loader) Err() error {
	return l.err
}

func (l *Loader) String(key string, fallback ...string) string {
	if l.err != nil {
		return ""
	}
	val, err := GetString(l.ctx, key, fallback...)
	l.err = err
	return val
}

// Strings reads a comma-separated list
func (l *Loader) Strings(key string, fallback ...[]string) []string {
	if l.err != nil {
		return nil
	}
	val, err := GetStrings(l.ctx, key, fallback...)
	l.err = err
	return val
}

func (l *Loader) Int(key string, fallback ...int) int {
	if l.err != nil {
		return 0
	}
	val, err := GetInt(l.ctx, key, fallback...)
	l.err = err
	return val
}

func (l *Loader) Bool(key string, fallback ...bool) bool {
	if l.err != nil {
		return false
	}
	val, err := GetBool(l.ctx, key, fallback...)
	l.err = err
	return val
}

func (l *Loader) Duration(key string, fallback ...time.Duration) time.Duration {
	if l.err != nil {
		return 0
	}
	val, err := GetDuration(l.ctx, key, fallback...)
	l.err = err
	return val
}
