package tests

import (
	"bytes"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/TKlerx/webapp-template/cli/internal/output"
)

func TestRenderersProduceExpectedFormats(t *testing.T) {
	tableBuffer := &bytes.Buffer{}
	jsonBuffer := &bytes.Buffer{}
	csvBuffer := &bytes.Buffer{}

	require.NoError(t, output.RenderTableTo(tableBuffer, []string{"ID", "Name"}, [][]string{{"1", "Ada"}}, true))
	require.Contains(t, tableBuffer.String(), "Ada")

	require.NoError(t, output.RenderJSONTo(jsonBuffer, map[string]string{"name": "Ada"}))
	require.Contains(t, jsonBuffer.String(), "\"name\": \"Ada\"")

	require.NoError(t, output.RenderCSVTo(csvBuffer, []string{"ID", "Name"}, [][]string{{"1", "Ada"}}))
	require.Contains(t, csvBuffer.String(), "ID,Name")
}

func TestNonInteractiveDefaultsToJSON(t *testing.T) {
	renderer := output.NewRenderer(output.Options{
		Format:      "table",
		Stdout:      &bytes.Buffer{},
		Stderr:      &bytes.Buffer{},
		Interactive: false,
	})

	require.Equal(t, output.FormatJSON, renderer.Format())
}
