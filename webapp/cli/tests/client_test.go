package tests

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/TKlerx/webapp-template/cli/internal/client"
	"github.com/TKlerx/webapp-template/cli/internal/config"
)

func TestClientInjectsBearerHeaderAndPreservesBasePath(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		require.Equal(t, "/app/api/users", request.URL.Path)
		require.Equal(t, "Bearer test-token", request.Header.Get("Authorization"))
		_, _ = io.WriteString(writer, `{"ok":true}`)
	}))
	defer server.Close()

	httpClient := client.NewClient(&config.Config{
		ServerURL: server.URL + "/app",
		Token:     "test-token",
	})
	resp, err := httpClient.Get("/api/users")
	require.NoError(t, err)
	require.Equal(t, 200, resp.StatusCode)
}

func TestClientMapsErrorsAndVerboseOutput(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.WriteHeader(http.StatusUnauthorized)
		_, _ = io.WriteString(writer, `{"error":"unauthorized"}`)
	}))
	defer server.Close()

	stderr := &bytes.Buffer{}
	httpClient := client.NewClient(&config.Config{ServerURL: server.URL, Token: "test-token"})
	httpClient.SetVerbose(true)
	httpClient.SetStderr(stderr)

	_, err := httpClient.Get("/api/users")
	require.Error(t, err)
	require.Equal(t, 2, err.(interface{ ExitCode() int }).ExitCode())
	require.Contains(t, stderr.String(), "GET")
	require.Contains(t, stderr.String(), "401")
}

func TestClientSupportsAPIKeyHeader(t *testing.T) {
	t.Setenv("STARTERCTL_AUTH_HEADER", "api-key")

	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		require.Equal(t, "test-token", request.Header.Get("X-API-Key"))
		writer.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	httpClient := client.NewClient(&config.Config{ServerURL: server.URL, Token: "test-token"})
	_, err := httpClient.Delete("/api/tokens/123")
	require.NoError(t, err)
}

func TestClientMapsForbiddenAndConnectionErrors(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.WriteHeader(http.StatusForbidden)
		_, _ = io.WriteString(writer, `{"error":"forbidden"}`)
	}))
	defer server.Close()

	httpClient := client.NewClient(&config.Config{ServerURL: server.URL, Token: "test-token"})
	_, err := httpClient.Get("/api/users")
	require.Error(t, err)
	require.Equal(t, 4, err.(interface{ ExitCode() int }).ExitCode())

	unreachableClient := client.NewClient(&config.Config{ServerURL: "http://127.0.0.1:1", Token: "test-token"})
	_, err = unreachableClient.Get("/api/users")
	require.Error(t, err)
	require.Equal(t, 3, err.(interface{ ExitCode() int }).ExitCode())
}
