package tests

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/TKlerx/webapp-template/cli/internal/client"
	"github.com/TKlerx/webapp-template/cli/internal/config"
)

func TestAuditListAndExportEndpoints(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/api/audit":
			_, _ = io.WriteString(writer, `{"data":[{"id":"a1","action":"USER_CREATED","entityType":"User","entityId":"u1","actorId":"admin","createdAt":"2026-01-01T00:00:00Z"}]}`)
		case "/api/audit/export":
			require.Equal(t, "csv", request.URL.Query().Get("format"))
			_, _ = io.WriteString(writer, "Date,Action\n2026-01-01T00:00:00Z,USER_CREATED\n")
		default:
			http.NotFound(writer, request)
		}
	}))
	defer server.Close()

	httpClient := client.NewClient(&config.Config{ServerURL: server.URL, Token: "token"})
	resp, err := httpClient.Get("/api/audit?action=USER_CREATED")
	require.NoError(t, err)
	require.Contains(t, string(resp.Body), "USER_CREATED")

	resp, err = httpClient.Get("/api/audit/export?format=csv")
	require.NoError(t, err)
	require.Contains(t, string(resp.Body), "Date,Action")
}
