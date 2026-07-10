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

func TestJobsListAndCreate(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.Method + " " + request.URL.Path {
		case "GET /api/background-jobs":
			_, _ = io.WriteString(writer, `{"jobs":[{"id":"job1","jobType":"echo","status":"PENDING","createdAt":"2026-01-01T00:00:00Z"}]}`)
		case "POST /api/background-jobs":
			writer.WriteHeader(http.StatusCreated)
			_, _ = io.WriteString(writer, `{"job":{"id":"job2","jobType":"echo","status":"PENDING","createdAt":"2026-01-01T00:00:00Z"}}`)
		default:
			http.NotFound(writer, request)
		}
	}))
	defer server.Close()

	httpClient := client.NewClient(&config.Config{ServerURL: server.URL, Token: "token"})
	resp, err := httpClient.Get("/api/background-jobs")
	require.NoError(t, err)
	require.Contains(t, string(resp.Body), "job1")

	resp, err = httpClient.Post("/api/background-jobs", map[string]any{"jobType": "echo", "payload": map[string]string{"message": "hi"}})
	require.NoError(t, err)
	require.Contains(t, string(resp.Body), "job2")
}
