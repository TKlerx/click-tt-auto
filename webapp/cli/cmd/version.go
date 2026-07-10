package cmd

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/TKlerx/webapp-template/cli/internal/client"
	"github.com/TKlerx/webapp-template/cli/internal/config"
)

func newVersionCommand() *cobra.Command {
	return &cobra.Command{
		Use:     "version",
		Short:   "Show CLI and server version information",
		Example: "starterctl version",
		RunE: func(_ *cobra.Command, _ []string) error {
			fmt.Fprintf(stdout, "starterctl %s\n", version)

			cfg, err := config.Load()
			if err != nil {
				return err
			}
			if cfg.ServerURL == "" || cfg.Token == "" {
				return nil
			}

			httpClient := client.NewClient(cfg)
			httpClient.SetVerbose(verboseFlag)
			httpClient.SetStderr(stderr)
			resp, err := httpClient.Get("/api/health")
			if err != nil {
				return nil
			}

			var payload map[string]any
			if err := resp.DecodeJSON(&payload); err != nil {
				return nil
			}

			fmt.Fprintf(stdout, "server %s\n", cfg.ServerURL)
			if versionValue, ok := payload["version"]; ok {
				fmt.Fprintf(stdout, "server_version %v\n", versionValue)
			}
			return nil
		},
	}
}
