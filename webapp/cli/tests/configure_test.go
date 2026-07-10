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

func TestConfigureFlowCanValidateHealthAndReadIdentity(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/api/health":
			_, _ = io.WriteString(writer, `{"status":"ok","checks":{"database":{"status":"ok"}}}`)
		case "/api/auth/me":
			_, _ = io.WriteString(writer, `{"user":{"name":"Ada","role":"PLATFORM_ADMIN"}}`)
		default:
			http.NotFound(writer, request)
		}
	}))
	defer server.Close()

	httpClient := client.NewClient(&config.Config{ServerURL: server.URL, Token: "token"})
	buffer := &bytes.Buffer{}
	httpClient.SetStderr(buffer)

	health, err := httpClient.Get("/api/health")
	require.NoError(t, err)
	require.Equal(t, 200, health.StatusCode)

	me, err := httpClient.Get("/api/auth/me")
	require.NoError(t, err)

	var payload struct {
		User struct {
			Name string `json:"name"`
			Role string `json:"role"`
		} `json:"user"`
	}
	require.NoError(t, me.DecodeJSON(&payload))
	require.Equal(t, "Ada", payload.User.Name)
	require.Equal(t, "PLATFORM_ADMIN", payload.User.Role)
}
