package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/pkg/browser"

	"github.com/TKlerx/webapp-template/cli/internal/client"
	"github.com/TKlerx/webapp-template/cli/internal/config"
)

var BrowserLoginTimeout = 120 * time.Second
var OpenBrowser = browser.OpenURL

type Options struct {
	ServerURL string
	Stderr    io.Writer
	Verbose   bool
}

type Result struct {
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expiresAt"`
	User      struct {
		Name  string `json:"name"`
		Email string `json:"email"`
		Role  string `json:"role"`
	} `json:"user"`
}

type callbackPayload struct {
	Code string
	Err  error
}

func LoginWithBrowser(options Options) (*Result, error) {
	state, err := randomState()
	if err != nil {
		return nil, err
	}

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, err
	}
	defer listener.Close()

	callbackURL := fmt.Sprintf("http://127.0.0.1:%d/callback", listener.Addr().(*net.TCPAddr).Port)
	callbackCh := make(chan callbackPayload, 1)

	server := &http.Server{
		Handler: http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
			query := request.URL.Query()
			code := query.Get("code")
			returnedState := query.Get("state")

			if returnedState != state {
				http.Error(writer, "invalid state", http.StatusBadRequest)
				callbackCh <- callbackPayload{Err: &client.AppError{Message: "invalid login state", Code: 2}}
				return
			}
			if code == "" {
				http.Error(writer, "missing code", http.StatusBadRequest)
				callbackCh <- callbackPayload{Err: &client.AppError{Message: "authorization code missing from callback", Code: 2}}
				return
			}

			_, _ = io.WriteString(writer, "Login complete. You can close this tab.")
			callbackCh <- callbackPayload{Code: code}
		}),
	}

	go func() {
		_ = server.Serve(listener)
	}()
	defer server.Shutdown(context.Background())

	authorizeURL := buildAuthorizeURL(options.ServerURL, callbackURL, state)
	if err := OpenBrowser(authorizeURL); err != nil && options.Stderr != nil {
		fmt.Fprintf(options.Stderr, "Open this URL in your browser:\n%s\n", authorizeURL)
	}

	select {
	case result := <-callbackCh:
		if result.Err != nil {
			return nil, result.Err
		}
		return exchangeCode(options, result.Code, state)
	case <-time.After(BrowserLoginTimeout):
		return nil, &client.AppError{Message: "timed out waiting for browser login; try `starterctl configure --token ...` instead", Code: 2}
	}
}

func buildAuthorizeURL(serverURL string, callbackURL string, state string) string {
	parsed, _ := url.Parse(strings.TrimSpace(serverURL))
	query := parsed.Query()
	query.Set("callback_url", callbackURL)
	query.Set("state", state)
	parsed.Path = strings.TrimRight(parsed.Path, "/") + "/api/cli-auth/authorize"
	parsed.RawQuery = query.Encode()
	return parsed.String()
}

func exchangeCode(options Options, code string, state string) (*Result, error) {
	httpClient := client.NewClient(&config.Config{ServerURL: options.ServerURL})
	httpClient.SetVerbose(options.Verbose)
	httpClient.SetStderr(options.Stderr)
	resp, err := httpClient.Post("/api/cli-auth/token", map[string]string{
		"code":  code,
		"state": state,
	})
	if err != nil {
		return nil, err
	}

	result := &Result{}
	if err := json.Unmarshal(resp.Body, result); err != nil {
		return nil, err
	}
	return result, nil
}

func randomState() (string, error) {
	buffer := make([]byte, 24)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buffer), nil
}
