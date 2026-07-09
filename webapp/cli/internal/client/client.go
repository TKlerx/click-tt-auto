package client

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/TKlerx/webapp-template/cli/internal/config"
)

type AppError struct {
	Message string
	Code    int
}

func (e *AppError) Error() string {
	return e.Message
}

func (e *AppError) ExitCode() int {
	return e.Code
}

type Client struct {
	baseURL    *url.URL
	httpClient *http.Client
	token      string
	verbose    bool
	stderr     io.Writer
	authHeader string
}

type Response struct {
	StatusCode int
	Header     http.Header
	Body       []byte
}

func (r *Response) DecodeJSON(target any) error {
	return json.Unmarshal(r.Body, target)
}

func NewClient(cfg *config.Config) *Client {
	parsed, _ := url.Parse(strings.TrimSpace(cfg.ServerURL))
	return &Client{
		baseURL: parsed,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		token:      strings.TrimSpace(cfg.Token),
		stderr:     os.Stderr,
		authHeader: resolveAuthHeader(),
	}
}

func (c *Client) SetVerbose(enabled bool) {
	c.verbose = enabled
}

func (c *Client) SetStderr(writer io.Writer) {
	if writer != nil {
		c.stderr = writer
	}
}

func (c *Client) Get(path string) (*Response, error) {
	return c.do(context.Background(), http.MethodGet, path, nil)
}

func (c *Client) Post(path string, body any) (*Response, error) {
	return c.do(context.Background(), http.MethodPost, path, body)
}

func (c *Client) Patch(path string, body any) (*Response, error) {
	return c.do(context.Background(), http.MethodPatch, path, body)
}

func (c *Client) Delete(path string) (*Response, error) {
	return c.do(context.Background(), http.MethodDelete, path, nil)
}

func (c *Client) do(ctx context.Context, method string, path string, body any) (*Response, error) {
	if c.baseURL == nil || c.baseURL.Scheme == "" || c.baseURL.Host == "" {
		return nil, &AppError{Message: "server URL is not configured", Code: 1}
	}

	var payload io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		payload = bytes.NewReader(data)
	}

	endpoint := joinURL(c.baseURL, path)
	req, err := http.NewRequestWithContext(ctx, method, endpoint, payload)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.token != "" {
		req.Header.Set(c.authHeader, buildAuthValue(c.authHeader, c.token))
	}

	httpResp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, &AppError{Message: fmt.Sprintf("connection error: %v", err), Code: 3}
	}
	defer httpResp.Body.Close()

	responseBody, readErr := io.ReadAll(httpResp.Body)
	if readErr != nil {
		return nil, readErr
	}

	if c.verbose {
		fmt.Fprintf(c.stderr, "%s %s -> %d\n", method, endpoint, httpResp.StatusCode)
		if len(responseBody) > 0 {
			fmt.Fprintf(c.stderr, "%s\n", string(responseBody))
		}
	}

	resp := &Response{
		StatusCode: httpResp.StatusCode,
		Header:     httpResp.Header.Clone(),
		Body:       responseBody,
	}

	if httpResp.StatusCode >= 200 && httpResp.StatusCode < 300 {
		return resp, nil
	}

	return nil, mapHTTPError(httpResp.StatusCode, responseBody)
}

func joinURL(base *url.URL, path string) string {
	clone := *base
	relative, err := url.Parse(path)
	if err != nil {
		basePath := strings.TrimRight(clone.Path, "/")
		apiPath := "/" + strings.TrimLeft(path, "/")
		clone.Path = basePath + apiPath
		clone.RawPath = clone.Path
		return clone.String()
	}

	basePath := strings.TrimRight(clone.Path, "/")
	relativePath := "/" + strings.TrimLeft(relative.Path, "/")
	clone.Path = basePath + relativePath
	clone.RawPath = clone.Path
	clone.RawQuery = relative.RawQuery
	return clone.String()
}

func resolveAuthHeader() string {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("STARTERCTL_AUTH_HEADER"))) {
	case "api-key":
		return "X-API-Key"
	default:
		return "Authorization"
	}
}

func buildAuthValue(header string, token string) string {
	if header == "X-API-Key" {
		return token
	}
	return "Bearer " + token
}

func mapHTTPError(statusCode int, body []byte) error {
	message := strings.TrimSpace(string(body))
	if message == "" {
		message = http.StatusText(statusCode)
	}

	switch statusCode {
	case http.StatusUnauthorized:
		return &AppError{Message: message, Code: 2}
	case http.StatusForbidden:
		return &AppError{Message: message, Code: 4}
	default:
		return &AppError{Message: message, Code: 1}
	}
}
