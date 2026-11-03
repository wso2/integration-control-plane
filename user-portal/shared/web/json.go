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

package web

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/go-playground/validator/v10"

	"github.com/wso2-enterprise/integration-user-portal-service/shared/common"
)

var Validate *validator.Validate

func init() {
	Validate = validator.New(validator.WithRequiredStructEnabled())
}

func WriteJSON(ctx context.Context, w http.ResponseWriter, status int, data any) error {
	var body bytes.Buffer
	if err := json.NewEncoder(&body).Encode(data); err != nil {
		return err
	}

	w.Header().Set("Content-Type", "application/json")
	SetCorrelationID(ctx, w)
	w.WriteHeader(status)
	_, _ = w.Write(body.Bytes())

	return nil
}

// SetCorrelationID echoes the in-flight request's id. Every response carries it,
// so the bodyless ones set it here rather than through WriteJSON.
func SetCorrelationID(ctx context.Context, w http.ResponseWriter) {
	if id := common.CorrelationIDFromContext(ctx); id != "" {
		w.Header().Set(common.CorrelationIDHeader, id)
	}
}

func ReadJSON(w http.ResponseWriter, r *http.Request, data any) error {
	maxBytes := 1_048_576 // 1 MB
	r.Body = http.MaxBytesReader(w, r.Body, int64(maxBytes))
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()

	if err := decoder.Decode(data); err != nil {
		return err
	}

	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return errors.New("body must carry exactly one json document")
	}

	return nil
}
