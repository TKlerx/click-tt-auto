package tests

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/TKlerx/webapp-template/cli/internal/auth"
)

func TestBrowserLoginExchangesCode(t *testing.T) {
	originalOpen := auth.OpenBrowser
	auth.OpenBrowser = func(target string) error {
		go func() {
			_ = issueLocalGET(target)
		}()
		return nil
	}
	defer func() { auth.OpenBrowser = originalOpen }()

	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/api/cli-auth/authorize":
			callbackURL := request.URL.Query().Get("callback_url")
			state := request.URL.Query().Get("state")
			go func() {
				_ = issueCallback(callbackURL, "auth-code", state)
			}()
			writer.WriteHeader(http.StatusFound)
		case "/api/cli-auth/token":
			_, _ = io.WriteString(writer, `{"token":"token-123","expiresAt":"2026-04-09T00:00:00Z","user":{"name":"Ada","email":"ada@example.com","role":"PLATFORM_ADMIN"}}`)
		default:
			http.NotFound(writer, request)
		}
	}))
	defer server.Close()

	timeout := auth.BrowserLoginTimeout
	auth.BrowserLoginTimeout = 2 * time.Second
	defer func() { auth.BrowserLoginTimeout = timeout }()

	result, err := auth.LoginWithBrowser(auth.Options{ServerURL: server.URL, Stderr: io.Discard})
	require.NoError(t, err)
	require.Equal(t, "token-123", result.Token)
	require.Equal(t, "Ada", result.User.Name)
}

func TestBrowserLoginTimeout(t *testing.T) {
	originalOpen := auth.OpenBrowser
	auth.OpenBrowser = func(string) error { return nil }
	defer func() { auth.OpenBrowser = originalOpen }()

	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.WriteHeader(http.StatusFound)
	}))
	defer server.Close()

	timeout := auth.BrowserLoginTimeout
	auth.BrowserLoginTimeout = 10 * time.Millisecond
	defer func() { auth.BrowserLoginTimeout = timeout }()

	_, err := auth.LoginWithBrowser(auth.Options{ServerURL: server.URL, Stderr: io.Discard})
	require.Error(t, err)
	require.Contains(t, err.Error(), "timed out")
}

func TestBrowserLoginPrintsURLWhenBrowserOpenFails(t *testing.T) {
	originalOpen := auth.OpenBrowser
	auth.OpenBrowser = func(target string) error {
		go func() {
			_ = issueLocalGET(target)
		}()
		return errors.New("no browser")
	}
	defer func() { auth.OpenBrowser = originalOpen }()

	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/api/cli-auth/authorize":
			callbackURL := request.URL.Query().Get("callback_url")
			state := request.URL.Query().Get("state")
			go func() {
				_ = issueCallback(callbackURL, "auth-code", state)
			}()
			writer.WriteHeader(http.StatusFound)
		case "/api/cli-auth/token":
			_, _ = io.WriteString(writer, `{"token":"token-123","expiresAt":"2026-04-09T00:00:00Z","user":{"name":"Ada","email":"ada@example.com","role":"PLATFORM_ADMIN"}}`)
		default:
			http.NotFound(writer, request)
		}
	}))
	defer server.Close()

	stderr := &bytes.Buffer{}
	timeout := auth.BrowserLoginTimeout
	auth.BrowserLoginTimeout = 2 * time.Second
	defer func() { auth.BrowserLoginTimeout = timeout }()

	result, err := auth.LoginWithBrowser(auth.Options{ServerURL: server.URL, Stderr: stderr})
	require.NoError(t, err)
	require.Equal(t, "token-123", result.Token)
	require.Contains(t, stderr.String(), "Open this URL in your browser:")
}

func TestBrowserLoginRejectsInvalidState(t *testing.T) {
	originalOpen := auth.OpenBrowser
	auth.OpenBrowser = func(target string) error {
		go func() {
			_ = issueLocalGET(target)
		}()
		return nil
	}
	defer func() { auth.OpenBrowser = originalOpen }()

	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/api/cli-auth/authorize":
			callbackURL := request.URL.Query().Get("callback_url")
			go func() {
				_ = issueCallback(callbackURL, "auth-code", "wrong-state")
			}()
			writer.WriteHeader(http.StatusFound)
		default:
			http.NotFound(writer, request)
		}
	}))
	defer server.Close()

	timeout := auth.BrowserLoginTimeout
	auth.BrowserLoginTimeout = 2 * time.Second
	defer func() { auth.BrowserLoginTimeout = timeout }()

	_, err := auth.LoginWithBrowser(auth.Options{ServerURL: server.URL, Stderr: io.Discard})
	require.Error(t, err)
	require.Contains(t, err.Error(), "invalid login state")
}

func issueCallback(callbackURL string, code string, state string) error {
	parsed, err := url.Parse(callbackURL)
	if err != nil {
		return err
	}

	query := parsed.Query()
	query.Set("code", code)
	query.Set("state", state)
	parsed.RawQuery = query.Encode()

	return issueLocalGET(parsed.String())
}

func issueLocalGET(rawURL string) error {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return err
	}
	if parsed.Scheme != "http" {
		return fmt.Errorf("expected http URL, got %q", parsed.Scheme)
	}
	host := parsed.Hostname()
	if host != "127.0.0.1" && host != "localhost" {
		return fmt.Errorf("expected loopback host, got %q", host)
	}
	if parsed.Port() == "" {
		return fmt.Errorf("expected explicit callback port")
	}

	conn, err := net.Dial("tcp", parsed.Host)
	if err != nil {
		return err
	}
	defer conn.Close()

	path := parsed.EscapedPath()
	if path == "" {
		path = "/"
	}
	if parsed.RawQuery != "" {
		path += "?" + parsed.RawQuery
	}

	if _, err := fmt.Fprintf(conn, "GET %s HTTP/1.1\r\nHost: %s\r\nConnection: close\r\n\r\n", path, parsed.Host); err != nil {
		return err
	}

	_, err = io.Copy(io.Discard, conn)
	return err
}
