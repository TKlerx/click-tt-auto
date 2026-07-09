package cmd

import (
	"fmt"
	"net/url"

	"github.com/spf13/cobra"

	"github.com/TKlerx/webapp-template/cli/internal/client"
)

func newUsersRoleCommand() *cobra.Command {
	var role string

	cmd := &cobra.Command{
		Use:               "role <user-id>",
		Short:             "Change a user's role",
		Args:              cobra.ExactArgs(1),
		ValidArgsFunction: dynamicUserCompletion(""),
		Example:           "starterctl users role user_123 --role SCOPE_ADMIN",
		RunE: func(_ *cobra.Command, args []string) error {
			cfg, err := requireConfiguredClient()
			if err != nil {
				return err
			}

			httpClient := client.NewClient(cfg)
			httpClient.SetVerbose(verboseFlag)
			httpClient.SetStderr(stderr)
			if _, err := httpClient.Patch("/api/users/"+url.PathEscape(args[0])+"/role", map[string]string{
				"role": role,
			}); err != nil {
				return err
			}

			fmt.Fprintf(stdout, "Updated role for %s to %s\n", args[0], role)
			return nil
		},
	}

	cmd.Flags().StringVar(&role, "role", "", "New user role")
	_ = cmd.MarkFlagRequired("role")
	_ = cmd.RegisterFlagCompletionFunc("role", staticCompletion(userRoles))
	return cmd
}
