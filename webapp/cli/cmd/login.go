package cmd

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/TKlerx/webapp-template/cli/internal/auth"
	"github.com/TKlerx/webapp-template/cli/internal/config"
)

func newLoginCommand() *cobra.Command {
	var server string

	cmd := &cobra.Command{
		Use:   "login",
		Short: "Authenticate with the browser-based login flow",
		Example: "" +
			"starterctl login --server http://localhost:3000\n" +
			"starterctl login",
		RunE: func(_ *cobra.Command, _ []string) error {
			cfg, err := config.Load()
			if err != nil {
				return err
			}

			if server != "" {
				cfg.ServerURL = server
			}
			if cfg.ServerURL == "" {
				return fmt.Errorf("--server is required on first login")
			}

			result, err := auth.LoginWithBrowser(auth.Options{
				ServerURL: cfg.ServerURL,
				Stderr:    stderr,
				Verbose:   verboseFlag,
			})
			if err != nil {
				return err
			}

			cfg.Token = result.Token
			if err := config.Save(cfg); err != nil {
				return err
			}

			fmt.Fprintf(stdout, "Logged in as %s (%s)\n", result.User.Name, result.User.Role)
			return nil
		},
	}

	cmd.Flags().StringVar(&server, "server", "", "Server URL, including base path if applicable")
	return cmd
}
