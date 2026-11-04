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

package httpclient

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"go.uber.org/zap"

	"github.com/wso2-enterprise/integration-user-portal-service/shared/common"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/infrastructure/logging"
	"github.com/wso2-enterprise/integration-user-portal-service/shared/upstream"
)

const (
	defaultTimeout = time.Minute

	// maxBodyBytes caps how much of a response we buffer
	maxBodyBytes = 1 << 20 // 1 MB

	// defaultServiceName labels a client built without WithServiceName.
	defaultServiceName = "httpclient"

	contentTypeJSON = "application/json"
	contentTypeForm = "application/x-www-form-urlencoded"
)

// errBodyTooLarge is a success response past maxBodyBytes: an answer, so neither
// retried nor ErrUnavailable.
var errBodyTooLarge = fmt.Errorf("response body exceeds %d bytes", maxBodyBytes)

// RetryParams describes how a failed attempt is retried. Delays grow
// exponentially from BaseDelay and are capped at MaxDelay.
type RetryParams struct {
	// MaxAttempts counts the first try, so 1 disables retries.
	MaxAttempts int
	BaseDelay   time.Duration
	MaxDelay    time.Duration

	// RetryNonIdempotent allows retries of POST and PATCH. Off by default
	RetryNonIdempotent bool
}

func DefaultRetryParams() RetryParams {
	return RetryParams{
		MaxAttempts: 3,
		BaseDelay:   200 * time.Millisecond,
		MaxDelay:    2 * time.Second,
	}
}

type Client struct {
	http  *http.Client
	retry RetryParams

	// identifies the upstream this client talks to
	name string
}

type Option func(*Client)

func WithServiceName(name string) Option {
	return func(c *Client) { c.name = name }
}

// WithTimeout bounds each individual attempt, not the whole retry sequence. Use
// a ctx deadline to bound the sequence.
func WithTimeout(d time.Duration) Option {
	return func(c *Client) { c.http.Timeout = d }
}

func WithRetry(p RetryParams) Option {
	return func(c *Client) { c.retry = p }
}

// WithHTTPClient supplies the underlying client, for tests or a custom transport.
func WithHTTPClient(h *http.Client) Option {
	return func(c *Client) { c.http = h }
}

// WithInsecureTLS turns off server certificate verification.
func WithInsecureTLS() Option {
	return func(c *Client) {
		tr := http.DefaultTransport.(*http.Transport).Clone()
		tr.TLSClientConfig = &tls.Config{InsecureSkipVerify: true} // #nosec G402 -- dev only
		c.http.Transport = tr
	}
}

func New(opts ...Option) *Client {
	c := &Client{
		http:  &http.Client{Timeout: defaultTimeout},
		retry: DefaultRetryParams(),
		name:  defaultServiceName,
	}
	for _, opt := range opts {
		opt(c)
	}
	return c
}

// Response is a fully read, closed HTTP response.
type Response struct {
	StatusCode int
	Header     http.Header
	Body       []byte
}

func (r *Response) IsSuccess() bool {
	return r.StatusCode >= 200 && r.StatusCode < 300
}

// DecodeJSON unmarshals the body into out.
func (r *Response) DecodeJSON(out any) error {
	return json.Unmarshal(r.Body, out)
}

func Classify(err error) error {
	var statusErr *StatusError
	if errors.As(err, &statusErr) && statusErr.StatusCode == http.StatusNotFound {
		return fmt.Errorf("%w: %w", upstream.ErrNotFound, err)
	}
	return ClassifyUnavailable(err)
}

// ClassifyUnavailable is Classify without ErrNotFound, for an endpoint whose 404
// names no resource, such as a token endpoint.
func ClassifyUnavailable(err error) error {
	var statusErr *StatusError
	if !errors.As(err, &statusErr) {
		return err
	}

	switch statusErr.StatusCode {
	case http.StatusBadGateway, http.StatusServiceUnavailable, http.StatusGatewayTimeout:
		return fmt.Errorf("%w: %w", upstream.ErrUnavailable, err)
	}
	return err
}

// StatusError reports a response outside the 2xx range.
type StatusError struct {
	Method     string
	URL        string
	StatusCode int
	Body       string
}

func (e *StatusError) Error() string {
	return fmt.Sprintf("%s %s: upstream returned status %d: %s", e.Method, e.URL, e.StatusCode, e.Body)
}

const bodySnippetBytes = 512

// BodySnippet is as much of a body as belongs in a log line or an error string.
func (r *Response) BodySnippet() string {
	return bodySnippet(r.Body)
}

func bodySnippet(body []byte) string {
	if len(body) <= bodySnippetBytes {
		return string(body)
	}
	return string(body[:bodySnippetBytes]) + "... (truncated)"
}

// LogUpstreamFailure logs a non-2xx: the snippet at warn, and the whole body at
// debug when it was truncated. Every client's failure path goes through here.
func LogUpstreamFailure(ctx context.Context, service, op string, resp *Response) {
	logging.S(ctx).Warnw("upstream returned an error response",
		"service", service, "op", op, "status", resp.StatusCode, "body", resp.BodySnippet(),
	)

	if len(resp.Body) > bodySnippetBytes {
		logging.S(ctx).Debugw("upstream response body",
			"service", service, "op", op, "status", resp.StatusCode,
			zap.ByteString("body", resp.Body),
		)
	}
}

// RequestOption adjusts an outbound request after the client has set its own
// headers, so it can add to them or override them.
type RequestOption func(*http.Request)

// WithHeader sets a header on every attempt of the request. Use it for
// per-request values such as tenancy headers; anything constant across a whole
// upstream belongs on the Client instead.
func WithHeader(key, value string) RequestOption {
	return func(r *http.Request) { r.Header.Set(key, value) }
}

func (c *Client) Get(ctx context.Context, url string, opts ...RequestOption) (*Response, error) {
	return c.Do(ctx, http.MethodGet, url, nil, opts...)
}

// requestBody is an already-encoded body and the content type describing it, so
// the retry loop below stays independent of how the body was encoded.
type requestBody struct {
	payload     []byte
	contentType string
}

// Do sends body as JSON (when non-nil) and returns the response, retrying
// transient failures per the client's RetryParams. A non-2xx response is
// returned, not an error; use Response.IsSuccess or StatusError to act on it,
// and Classify to turn that status into a sentinel.
func (c *Client) Do(ctx context.Context, method, url string, body any, opts ...RequestOption) (*Response, error) {
	var encoded requestBody
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("httpclient: marshal %s %s body: %w", method, url, err)
		}
		encoded = requestBody{payload: payload, contentType: contentTypeJSON}
	}

	return c.send(ctx, method, url, encoded, opts)
}

// PostForm sends form as application/x-www-form-urlencoded
func (c *Client) PostForm(ctx context.Context, requestURL string, form url.Values, opts ...RequestOption) (*Response, error) {
	body := requestBody{payload: []byte(form.Encode()), contentType: contentTypeForm}
	return c.send(ctx, http.MethodPost, requestURL, body, opts)
}

// send runs the retry loop over an already-encoded body.
func (c *Client) send(ctx context.Context, method, url string, body requestBody, opts []RequestOption) (*Response, error) {
	attempts := max(c.retry.MaxAttempts, 1)
	if !c.retry.RetryNonIdempotent && !isIdempotent(method) {
		attempts = 1
	}

	log := logging.S(ctx)
	var lastErr error

	for attempt := 1; attempt <= attempts; attempt++ {
		if attempt > 1 {
			if err := wait(ctx, c.backoff(attempt)); err != nil {
				return nil, abandoned(ctx, method, url, lastErr)
			}
			log.Debugw("retrying outbound request",
				"method", method, "url", url, "attempt", attempt, "lastFailure", lastErr,
			)
		}

		resp, err := c.attempt(ctx, method, url, body, opts)
		if errors.Is(err, errBodyTooLarge) {
			return nil, fmt.Errorf("httpclient: %s %s: %w", method, url, err)
		}
		if err != nil {
			// A cancelled or expired ctx is the caller giving up, not a
			// transient upstream fault — further attempts would fail the same way.
			if ctx.Err() != nil {
				return nil, abandoned(ctx, method, url, lastErr)
			}
			lastErr = err
			continue
		}

		if attempt < attempts && isRetryableStatus(resp.StatusCode) {
			lastErr = &StatusError{Method: method, URL: url, StatusCode: resp.StatusCode, Body: bodySnippet(resp.Body)}
			continue
		}

		return resp, nil
	}

	// Only a transport failure reaches here: a retryable status on the last
	// attempt is returned as a response, so every attempt ended without an answer.
	return nil, fmt.Errorf("%w: httpclient: %s %s: gave up after %d attempts: %w",
		upstream.ErrUnavailable, method, url, attempts, lastErr)
}

// StatusError builds the error describing this response, for callers that treat
// a non-2xx as failure.
func (r *Response) StatusError(method, url string) *StatusError {
	return &StatusError{Method: method, URL: url, StatusCode: r.StatusCode, Body: bodySnippet(r.Body)}
}

// GetJSON fetches url and decodes the response body into T, treating a non-2xx
// as an error and classifying it.
func GetJSON[T any](ctx context.Context, c *Client, op, url string, opts ...RequestOption) (T, error) {
	var out T

	resp, err := c.Get(ctx, url, opts...)
	if err != nil {
		return out, fmt.Errorf("%s:%s: %w", c.name, op, err)
	}

	log := logging.S(ctx)
	if !resp.IsSuccess() {
		LogUpstreamFailure(ctx, c.name, op, resp)
		return out, Classify(fmt.Errorf("%s:%s: %w", c.name, op, resp.StatusError(http.MethodGet, url)))
	}

	if err := resp.DecodeJSON(&out); err != nil {
		log.Warnw("failed to unmarshal upstream response",
			"service", c.name, "op", op, "error", err, "bodyBytes", len(resp.Body),
		)
		logging.S(ctx).Debugw("upstream response body",
			"service", c.name, "op", op, "status", resp.StatusCode,
			zap.ByteString("body", resp.Body),
		)
		var zero T
		return zero, fmt.Errorf("%s:%s: unmarshal response: %w", c.name, op, err)
	}

	return out, nil
}

func (c *Client) attempt(ctx context.Context, method, url string, body requestBody, opts []RequestOption) (*Response, error) {
	var reader io.Reader
	if body.contentType != "" {
		reader = bytes.NewReader(body.payload)
	}

	req, err := http.NewRequestWithContext(ctx, method, url, reader)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	if body.contentType != "" {
		req.Header.Set("Content-Type", body.contentType)
	}
	if id := common.CorrelationIDFromContext(ctx); id != "" {
		req.Header.Set(common.CorrelationIDHeader, id)
	}
	// Applied last so a caller can override any header set above.
	for _, opt := range opts {
		opt(req)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, maxBodyBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read response body: %w", err)
	}
	if len(respBody) > maxBodyBytes {
		// A failure is classified on its status, so its body only needs a snippet.
		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			return nil, errBodyTooLarge
		}
		respBody = respBody[:maxBodyBytes]
	}

	return &Response{StatusCode: resp.StatusCode, Header: resp.Header, Body: respBody}, nil
}

// backoff returns the delay before the given attempt (which is always >= 2).
// A MaxDelay of zero or less means the delay is not capped.
func (c *Client) backoff(attempt int) time.Duration {
	delay := c.retry.BaseDelay
	for i := 2; i < attempt; i++ {
		doubled := delay * 2
		// An uncapped delay doubled often enough overflows into a negative
		// duration, which would drop the backoff altogether.
		if doubled < delay {
			break
		}
		delay = doubled
		if c.retry.MaxDelay > 0 && delay >= c.retry.MaxDelay {
			return c.retry.MaxDelay
		}
	}
	if c.retry.MaxDelay > 0 && delay > c.retry.MaxDelay {
		return c.retry.MaxDelay
	}
	return delay
}

// abandoned is the error for a ctx that ended mid-sequence, wherever it ended.
// An exhausted deadline is still an upstream that did not answer in the time it
// was given; a cancellation has no caller left to tell.
func abandoned(ctx context.Context, method, url string, lastErr error) error {
	failed := fmt.Errorf("httpclient: %s %s: %w", method, url, ctx.Err())
	if lastErr != nil {
		failed = fmt.Errorf("httpclient: %s %s: %w (last failure: %w)", method, url, ctx.Err(), lastErr)
	}
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return fmt.Errorf("%w: %w", upstream.ErrUnavailable, failed)
	}
	return failed
}

// wait sleeps for d, or returns early if ctx is done.
func wait(ctx context.Context, d time.Duration) error {
	timer := time.NewTimer(d)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

// isIdempotent reports whether replaying the method is safe. Per RFC 9110 these
// methods may be repeated without additional effect.
func isIdempotent(method string) bool {
	switch method {
	case http.MethodGet, http.MethodHead, http.MethodOptions, http.MethodTrace,
		http.MethodPut, http.MethodDelete:
		return true
	default:
		return false
	}
}

// isRetryableStatus covers upstream faults that a later attempt may survive.
func isRetryableStatus(status int) bool {
	switch status {
	case http.StatusTooManyRequests, http.StatusRequestTimeout:
		return true
	// A 501 means the endpoint will never exist; retrying it is pointless.
	case http.StatusNotImplemented:
		return false
	default:
		return status >= 500
	}
}
