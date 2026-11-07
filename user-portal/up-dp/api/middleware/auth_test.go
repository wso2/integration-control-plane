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

package middleware

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/wso2-enterprise/integration-user-portal-service/up-dp/domain"
)

// tokens answers every token with the same identity or error, and records the last token.
type tokens struct {
	identity *domain.TokenIdentity
	err      error
	got      string
}

func (s *tokens) Read(_ context.Context, rawToken string) (*domain.TokenIdentity, error) {
	s.got = rawToken
	return s.identity, s.err
}

func serve(svc domain.TokenService, authorization string) (*httptest.ResponseRecorder, *domain.TokenIdentity) {
	var seen *domain.TokenIdentity
	handler := WithAuth(svc)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = Identity(r.Context())
		w.WriteHeader(http.StatusNoContent)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/projects", nil)
	if authorization != "" {
		req.Header.Set("Authorization", authorization)
	}
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec, seen
}

func TestWithAuthPassesTheVerifiedCallerOn(t *testing.T) {
	svc := &tokens{identity: &domain.TokenIdentity{UserID: "user-1"}}

	rec, seen := serve(svc, "bearer  abc.def.ghi ")

	assert.Equal(t, http.StatusNoContent, rec.Code)
	assert.Equal(t, "abc.def.ghi", svc.got)
	assert.Equal(t, "user-1", seen.UserID)
}

func TestWithAuthAnswers(t *testing.T) {
	for name, tc := range map[string]struct {
		authorization string
		err           error
		want          int
	}{
		"401 without a token":      {authorization: "", want: http.StatusUnauthorized},
		"401 for another scheme":   {authorization: "Basic dXNlcjpwYXNz", want: http.StatusUnauthorized},
		"401 for an empty bearer":  {authorization: "Bearer ", want: http.StatusUnauthorized},
		"401 for a rejected token": {authorization: "Bearer t", err: fmt.Errorf("bad signature: %w", domain.ErrInvalidToken), want: http.StatusUnauthorized},
		"401 for an expired token": {authorization: "Bearer t", err: domain.ErrTokenExpired, want: http.StatusUnauthorized},
		"503 while the keys are out of reach": {
			authorization: "Bearer t", err: fmt.Errorf("issuer down: %w", domain.ErrKeysUnavailable), want: http.StatusServiceUnavailable,
		},
		"500 for anything else": {authorization: "Bearer t", err: errors.New("boom"), want: http.StatusInternalServerError},
	} {
		t.Run(name, func(t *testing.T) {
			rec, seen := serve(&tokens{err: tc.err}, tc.authorization)

			assert.Equal(t, tc.want, rec.Code)
			assert.Nil(t, seen)
			if tc.want == http.StatusUnauthorized {
				assert.Equal(t, `Bearer error="invalid_token"`, rec.Header().Get("WWW-Authenticate"))
			}
		})
	}
}
