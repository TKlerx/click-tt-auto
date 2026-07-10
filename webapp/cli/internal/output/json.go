package output

import (
	"encoding/json"
	"io"
	"os"
)

func RenderJSON(data any) error {
	return RenderJSONTo(os.Stdout, data)
}

func RenderJSONTo(writer io.Writer, data any) error {
	encoded, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return err
	}
	_, err = writer.Write(append(encoded, '\n'))
	return err
}
