package output

import (
	"io"
	"os"

	"github.com/jedib0t/go-pretty/v6/table"
)

func RenderTable(headers []string, rows [][]string) error {
	return RenderTableTo(os.Stdout, headers, rows, true)
}

func RenderTableTo(writer io.Writer, headers []string, rows [][]string, interactive bool) error {
	renderer := table.NewWriter()
	renderer.SetOutputMirror(writer)

	headerRow := make(table.Row, 0, len(headers))
	for _, header := range headers {
		headerRow = append(headerRow, header)
	}
	renderer.AppendHeader(headerRow)

	for _, row := range rows {
		tableRow := make(table.Row, 0, len(row))
		for _, value := range row {
			tableRow = append(tableRow, value)
		}
		renderer.AppendRow(tableRow)
	}

	style := table.StyleRounded
	if !interactive {
		style.Color = table.ColorOptions{}
	}
	renderer.SetStyle(style)
	renderer.Render()
	return nil
}
