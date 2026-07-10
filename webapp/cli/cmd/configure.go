package cmd

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/TKlerx/webapp-template/cli/internal/client"
	"github.com/TKlerx/webapp-template/cli/internal/config"
)

func newConfigureCommand() *cobra.Command {
	var server string
	var token string

	cmd := &cobra.Command{
		Use:   "configure",
		Short: "Store a server URL and personal access token",
		Example: "" +
			"starterctl configure --server http://localhost:3000 --token starter_pat_123\n" +
			"starterctl configure --server https://example.com/app --token $STARTERCTL_TOKEN",
		RunE: func(_ *cobra.Command, _ []string) error {
			cfg := &config.Config{
				ServerURL: server,
				Token:     token,
			}

			httpClient := client.NewClient(cfg)
			httpClient.SetVerbose(verboseFlag)
			httpClient.SetStderr(stderr)
			if _, err := httpClient.Get("/api/health"); err != nil {
				return err
			}
			meResponse, err := httpClient.Get("/api/auth/me")
			if err != nil {
				return err
			}

			var payload struct {
				User struct {
					Name string `json:"name"`
					Role string `json:"role"`
				} `json:"user"`
			}
			if err := meResponse.DecodeJSON(&payload); err != nil {
				return err
			}

			if err := config.Save(cfg); err != nil {
				return err
			}

			fmt.Fprintf(stdout, "Saved configuration for %s\n", cfg.ServerURL)
			fmt.Fprintf(stdout, "Authenticated as %s (%s)\n", payload.User.Name, payload.User.Role)
			return nil
		},
	}

	cmd.Flags().StringVar(&server, "server", "", "Server URL, including base path if applicable")
	cmd.Flags().StringVar(&token, "token", "", "Personal access token")
	_ = cmd.MarkFlagRequired("server")
	_ = cmd.MarkFlagRequired("token")
	return cmd
}
