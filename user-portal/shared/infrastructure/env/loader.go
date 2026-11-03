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
