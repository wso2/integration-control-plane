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
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type readJSONBody struct {
	Name string `json:"name"`
}

func readJSON(t *testing.T, body string) (readJSONBody, error) {
	t.Helper()

	r := httptest.NewRequest(http.MethodPut, "/", strings.NewReader(body))

	var got readJSONBody
	return got, ReadJSON(httptest.NewRecorder(), r, &got)
}

func TestReadJSONReadsOneDocument(t *testing.T) {
	for name, body := range map[string]string{
		"one object":             `{"name":"a"}`,
		"trailing newline":       `{"name":"a"}` + "\n",
		"surrounding whitespace": "  \n" + `{"name":"a"}` + " \t\n",
	} {
		t.Run(name, func(t *testing.T) {
			got, err := readJSON(t, body)

			require.NoError(t, err)
			assert.Equal(t, "a", got.Name)
		})
	}
}

// One document per body, whatever the route: a caller that sent more meant
// something other than the request the handler went on to act on.
func TestReadJSONRejectsMoreThanOneDocument(t *testing.T) {
	for name, body := range map[string]string{
		"a second object":    `{"name":"a"} {"name":"b"}`,
		"a second, no space": `{"name":"a"}{"name":"b"}`,
		"a second scalar":    `{"name":"a"} 7`,
		"a stray brace":      `{"name":"a"}}`,
		"trailing garbage":   `{"name":"a"} nonsense`,
		"newline delimited":  `{"name":"a"}` + "\n" + `{"name":"b"}`,
	} {
		t.Run(name, func(t *testing.T) {
			_, err := readJSON(t, body)

			require.Error(t, err)
			// Never io.EOF: that is how an absent body reads, and the handlers
			// that allow one would let this through.
			assert.NotErrorIs(t, err, io.EOF)
		})
	}
}

// An absent body stays io.EOF. The automation-trigger handlers read that as
// "no arguments", so a different error there would turn a normal call into a 400.
func TestReadJSONReportsAnAbsentBodyAsEOF(t *testing.T) {
	_, err := readJSON(t, "")

	assert.ErrorIs(t, err, io.EOF)
}

func TestReadJSONRejectsUnknownFields(t *testing.T) {
	_, err := readJSON(t, `{"name":"a","other":"b"}`)

	require.Error(t, err)
	assert.NotErrorIs(t, err, io.EOF)
}

// unencodable is a value json.Encoder always refuses.
type unencodable struct{}

func (unencodable) MarshalJSON() ([]byte, error) {
	return nil, errors.New("this value cannot be encoded")
}

func TestWriteJSONLeavesTheResponseUntouchedWhenEncodingFails(t *testing.T) {
	rec := httptest.NewRecorder()

	err := WriteJSON(context.Background(), rec, http.StatusOK, unencodable{})

	require.Error(t, err)
	assert.Empty(t, rec.Body.String())
	assert.Empty(t, rec.Header().Get("Content-Type"))
}

func TestWriteJSONWritesTheStatusAndBodyOnSuccess(t *testing.T) {
	rec := httptest.NewRecorder()

	require.NoError(t, WriteJSON(context.Background(), rec, http.StatusCreated, readJSONBody{Name: "acme"}))

	assert.Equal(t, http.StatusCreated, rec.Code)
	assert.Equal(t, "application/json", rec.Header().Get("Content-Type"))
	assert.JSONEq(t, `{"name":"acme"}`, rec.Body.String())
}

func TestWriteResponseAnswers500WhenEncodingFails(t *testing.T) {
	rec := httptest.NewRecorder()

	WriteResponse(rec, httptest.NewRequest(http.MethodGet, "/", nil), http.StatusOK, unencodable{})

	assert.Equal(t, http.StatusInternalServerError, rec.Code)
	assert.JSONEq(t, `{"error":"Something went wrong"}`, rec.Body.String())
}
