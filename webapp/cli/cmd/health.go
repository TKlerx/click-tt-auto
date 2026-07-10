package cmd

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/TKlerx/webapp-template/cli/internal/client"
	"github.com/TKlerx/webapp-template/cli/internal/output"
)

type healthPayload struct {
	Status  string `json:"status"`
	Version string `json:"version"`
	Checks  struct {
		Database struct {
			Status string `json:"status"`
		} `json:"database"`
	} `json:"checks"`
}

func newHealthCommand() *cobra.Command {
	return &cobra.Command{
		Use:     "health",
		Short:   "Check server health",
		Example: "starterctl health\n" + "starterctl health --format json",
		RunE: func(_ *cobra.Command, _ []string) error {
			cfg, err := requireConfiguredClient()
			if err != nil {
				return err
			}

			httpClient := client.NewClient(cfg)
			httpClient.SetVerbose(verboseFlag)
			httpClient.SetStderr(stderr)
			resp, err := httpClient.Get("/api/health")
			if err != nil {
				return err
			}

			payload := healthPayload{}
			if err := resp.DecodeJSON(&payload); err != nil {
				return err
			}

			renderer := output.NewRenderer(output.Options{
				Format:      formatFlag,
				Stdout:      stdout,
				Stderr:      stderr,
				Interactive: output.IsInteractiveWriter(stdout),
			})
			if renderer.Format() == output.FormatJSON {
				return renderer.RenderData(payload)
			}

			if payload.Version != "" {
				fmt.Fprintf(stdout, "status=%s database=%s version=%s\n", payload.Status, payload.Checks.Database.Status, payload.Version)
				return nil
			}
			fmt.Fprintf(stdout, "status=%s database=%s\n", payload.Status, payload.Checks.Database.Status)
			return nil
		},
	}
}
