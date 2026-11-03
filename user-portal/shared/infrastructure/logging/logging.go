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

package logging

import (
	"context"

	"go.uber.org/zap"
)

type contextKey struct{}

var loggerKey contextKey

// WithLogger returns a copy of ctx carrying logger.
func WithLogger(ctx context.Context, logger *zap.Logger) context.Context {
	return context.WithValue(ctx, loggerKey, logger)
}

// With returns a copy of ctx carrying its logger extended with fields.
func With(ctx context.Context, fields ...zap.Field) context.Context {
	return WithLogger(ctx, FromContext(ctx).With(fields...))
}

// FromContext returns the logger carried by ctx. A context without one yields a
// no-op logger, so callers never have to nil check.
func FromContext(ctx context.Context) *zap.Logger {
	if logger, ok := ctx.Value(loggerKey).(*zap.Logger); ok {
		return logger
	}
	return zap.NewNop()
}

// S is FromContext in sugared form, for printf and key-value style call sites.
func S(ctx context.Context) *zap.SugaredLogger {
	return FromContext(ctx).Sugar()
}
