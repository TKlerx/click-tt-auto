package output

import (
	"encoding/csv"
	"io"
	"os"
)

func RenderCSV(headers []string, rows [][]string) error {
	return RenderCSVTo(os.Stdout, headers, rows)
}

func RenderCSVTo(writer io.Writer, headers []string, rows [][]string) error {
	csvWriter := csv.NewWriter(writer)
	if len(headers) > 0 {
		if err := csvWriter.Write(headers); err != nil {
			return err
		}
	}
	for _, row := range rows {
		if err := csvWriter.Write(row); err != nil {
			return err
		}
	}
	csvWriter.Flush()
	return csvWriter.Error()
}
