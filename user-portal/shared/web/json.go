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
