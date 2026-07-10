package cmd

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/TKlerx/webapp-template/cli/internal/config"
)

func newLogoutCommand() *cobra.Command {
	return &cobra.Command{
		Use:     "logout",
		Short:   "Remove the stored token from local config",
		Example: "starterctl logout",
		RunE: func(_ *cobra.Command, _ []string) error {
			cfg, err := config.Load()
			if err != nil {
				return err
			}

			cfg.Token = ""
			if err := config.Save(cfg); err != nil {
				return err
			}

			fmt.Fprintln(stdout, "Logged out.")
			return nil
		},
	}
}
