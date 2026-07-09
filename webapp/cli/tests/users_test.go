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

func TestUsersListPayloadMatchesExpectedShape(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		require.Equal(t, "/api/users", request.URL.Path)
		_, _ = io.WriteString(writer, `{"users":[{"id":"u1","name":"Ada","email":"ada@example.com","role":"PLATFORM_ADMIN","status":"ACTIVE"}]}`)
	}))
	defer server.Close()

	httpClient := client.NewClient(&config.Config{ServerURL: server.URL, Token: "token"})
	resp, err := httpClient.Get("/api/users")
	require.NoError(t, err)
	require.Contains(t, string(resp.Body), `"Ada"`)
}

func TestUserMutationNotFoundMapsToGeneralError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.WriteHeader(http.StatusNotFound)
		_, _ = io.WriteString(writer, `{"error":"User not found"}`)
	}))
	defer server.Close()

	httpClient := client.NewClient(&config.Config{ServerURL: server.URL, Token: "token"})
	_, err := httpClient.Patch("/api/users/missing/approve", map[string]any{})
	require.Error(t, err)
	require.Equal(t, 1, err.(interface{ ExitCode() int }).ExitCode())
}

func TestVerboseUserListingWritesDiagnostics(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		_, _ = io.WriteString(writer, `{"users":[]}`)
	}))
	defer server.Close()

	diagnostics := &bytes.Buffer{}
	httpClient := client.NewClient(&config.Config{ServerURL: server.URL, Token: "token"})
	httpClient.SetVerbose(true)
	httpClient.SetStderr(diagnostics)
	_, err := httpClient.Get("/api/users?status=ACTIVE")
	require.NoError(t, err)
	require.Contains(t, diagnostics.String(), "/api/users")
}

func TestUserMutationsAndRoleChangeUseExpectedRoutes(t *testing.T) {
	requests := make([]string, 0, 3)
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		requests = append(requests, request.Method+" "+request.URL.Path)
		_, _ = io.WriteString(writer, `{"user":{"id":"u1","status":"ACTIVE","role":"SCOPE_ADMIN"}}`)
	}))
	defer server.Close()

	httpClient := client.NewClient(&config.Config{ServerURL: server.URL, Token: "token"})
	_, err := httpClient.Patch("/api/users/u1/approve", nil)
	require.NoError(t, err)
	_, err = httpClient.Patch("/api/users/u1/deactivate", nil)
	require.NoError(t, err)
	_, err = httpClient.Patch("/api/users/u1/role", map[string]string{"role": "SCOPE_ADMIN"})
	require.NoError(t, err)

	require.Equal(t, []string{
		"PATCH /api/users/u1/approve",
		"PATCH /api/users/u1/deactivate",
		"PATCH /api/users/u1/role",
	}, requests)
}
