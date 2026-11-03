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
	"net/http"

	"github.com/wso2-enterprise/integration-user-portal-service/shared/infrastructure/logging"
)

type ErrorResponse struct {
	Error string `json:"error"`
}

// StatusInternalServerError writes message as the body, or "Something went wrong" when it is nil.
func StatusInternalServerError(w http.ResponseWriter, r *http.Request, err error, message *string) {
	logging.S(r.Context()).Errorw("Internal Server Error", "method", r.Method, "path", r.URL.Path, "error", err.Error())
	body := "Something went wrong"
	if message != nil {
		body = *message
	}
	_ = WriteJSON(r.Context(), w, http.StatusInternalServerError, &ErrorResponse{Error: body})
}

func StatusBadRequest(w http.ResponseWriter, r *http.Request, err error, message string) {
	logging.S(r.Context()).Warnw("Bad Request", "method", r.Method, "path", r.URL.Path, "error", err.Error())
	_ = WriteJSON(r.Context(), w, http.StatusBadRequest, &ErrorResponse{Error: message})
}

func StatusUnauthorized(w http.ResponseWriter, r *http.Request, err error) {
	logging.S(r.Context()).Warnw("Unauthorized", "method", r.Method, "path", r.URL.Path, "error", err.Error())
	// Set before WriteJSON, which writes the status and commits the header block.
	w.Header().Set("WWW-Authenticate", `Bearer error="invalid_token"`)
	_ = WriteJSON(r.Context(), w, http.StatusUnauthorized, &ErrorResponse{Error: "Unauthorized"})
}

func StatusForbidden(w http.ResponseWriter, r *http.Request, err error) {
	logging.S(r.Context()).Warnw("Forbidden", "method", r.Method, "path", r.URL.Path, "error", err.Error())
	// Set before WriteJSON, which writes the status and commits the header block.
	w.Header().Set("WWW-Authenticate", `Bearer error="insufficient_scope"`)
	_ = WriteJSON(r.Context(), w, http.StatusForbidden, &ErrorResponse{Error: "Forbidden"})
}

func StatusServiceUnavailable(w http.ResponseWriter, r *http.Request, err error) {
	logging.S(r.Context()).Errorw("Service Unavailable", "method", r.Method, "path", r.URL.Path, "error", err.Error())
	_ = WriteJSON(r.Context(), w, http.StatusServiceUnavailable, &ErrorResponse{Error: "Service unavailable"})
}

func StatusNotFound(w http.ResponseWriter, r *http.Request, err error) {
	logging.S(r.Context()).Warnw("Resource Not Found", "method", r.Method, "path", r.URL.Path, "error", err.Error())
	_ = WriteJSON(r.Context(), w, http.StatusNotFound, &ErrorResponse{Error: "Resource not found"})
}

func StatusConflict(w http.ResponseWriter, r *http.Request, err error, message string) {
	logging.S(r.Context()).Warnw("Conflict Occurred", "method", r.Method, "path", r.URL.Path, "error", err.Error())
	_ = WriteJSON(r.Context(), w, http.StatusConflict, &ErrorResponse{Error: message})
}

func StatusMethodNotAllowed(w http.ResponseWriter, r *http.Request, err error) {
	logging.S(r.Context()).Warnw("Method Not Allowed", "method", r.Method, "path", r.URL.Path, "error", err.Error())
	_ = WriteJSON(r.Context(), w, http.StatusMethodNotAllowed, &ErrorResponse{Error: "Method not allowed"})
}
