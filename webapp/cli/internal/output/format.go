package output

import (
	"fmt"
	"io"
	"os"
	"strings"

	"golang.org/x/term"
)

type Format string

const (
	FormatTable Format = "table"
	FormatJSON  Format = "json"
	FormatCSV   Format = "csv"
)

type Options struct {
	Format      string
	Stdout      io.Writer
	Stderr      io.Writer
	Interactive bool
}

type Renderer struct {
	format      Format
	stdout      io.Writer
	stderr      io.Writer
	interactive bool
}

func NewRenderer(options Options) *Renderer {
	return &Renderer{
		format:      ResolveFormat(options.Format, options.Interactive),
		stdout:      defaultWriter(options.Stdout, os.Stdout),
		stderr:      defaultWriter(options.Stderr, os.Stderr),
		interactive: options.Interactive,
	}
}

func (r *Renderer) Format() Format {
	return r.format
}

func (r *Renderer) RenderTable(headers []string, rows [][]string) error {
	switch r.format {
	case FormatJSON:
		return RenderJSONTo(r.stdout, rows)
	case FormatCSV:
		return RenderCSVTo(r.stdout, headers, rows)
	default:
		return RenderTableTo(r.stdout, headers, rows, r.interactive)
	}
}

func (r *Renderer) RenderData(data any) error {
	switch r.format {
	case FormatCSV:
		return fmt.Errorf("CSV output requires tabular row data")
	default:
		return RenderJSONTo(r.stdout, data)
	}
}

func ResolveFormat(format string, interactive bool) Format {
	switch strings.ToLower(strings.TrimSpace(format)) {
	case "", "table":
		if !interactive {
			return FormatJSON
		}
		return FormatTable
	case "json":
		return FormatJSON
	case "csv":
		return FormatCSV
	default:
		if !interactive {
			return FormatJSON
		}
		return FormatTable
	}
}

func IsInteractiveWriter(writer io.Writer) bool {
	file, ok := writer.(*os.File)
	if !ok {
		return false
	}
	return term.IsTerminal(int(file.Fd()))
}

func defaultWriter(writer io.Writer, fallback io.Writer) io.Writer {
	if writer != nil {
		return writer
	}
	return fallback
}
