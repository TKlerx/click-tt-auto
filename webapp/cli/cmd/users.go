package cmd

import (
	"encoding/json"
	"fmt"
	"net/url"
	"strings"

	"github.com/spf13/cobra"

	"github.com/TKlerx/webapp-template/cli/internal/client"
	"github.com/TKlerx/webapp-template/cli/internal/output"
)

var userStatuses = []string{"ACTIVE", "PENDING_APPROVAL", "INACTIVE"}
var userRoles = []string{"PLATFORM_ADMIN", "SCOPE_ADMIN", "SCOPE_USER"}

type userRecord struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Email  string `json:"email"`
	Role   string `json:"role"`
	Status string `json:"status"`
}

func newUsersCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:       "users",
		Short:     "Manage users",
		ValidArgs: []string{"list", "approve", "deactivate", "reactivate", "role"},
		Example:   "starterctl users list --status ACTIVE\n" + "starterctl users approve user_123",
	}

	cmd.AddCommand(newUsersListCommand())
	cmd.AddCommand(newUsersApproveCommand())
	cmd.AddCommand(newUsersDeactivateCommand())
	cmd.AddCommand(newUsersReactivateCommand())
	cmd.AddCommand(newUsersRoleCommand())
	return cmd
}

func newUsersListCommand() *cobra.Command {
	var status string

	cmd := &cobra.Command{
		Use:   "list",
		Short: "List users",
		Example: "" +
			"starterctl users list\n" +
			"starterctl users list --status ACTIVE --format json",
		RunE: func(_ *cobra.Command, _ []string) error {
			cfg, err := requireConfiguredClient()
			if err != nil {
				return err
			}

			httpClient := client.NewClient(cfg)
			httpClient.SetVerbose(verboseFlag)
			httpClient.SetStderr(stderr)

			path := "/api/users"
			if status != "" {
				path += "?status=" + url.QueryEscape(status)
			}

			resp, err := httpClient.Get(path)
			if err != nil {
				return err
			}

			payload := struct {
				Users []userRecord `json:"users"`
			}{}
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
				return renderer.RenderData(payload.Users)
			}

			headers := []string{"ID", "Name", "Email", "Role", "Status"}
			rows := make([][]string, 0, len(payload.Users))
			for _, user := range payload.Users {
				rows = append(rows, []string{user.ID, user.Name, user.Email, user.Role, user.Status})
			}

			return renderer.RenderTable(headers, rows)
		},
	}

	cmd.Flags().StringVar(&status, "status", "", "Filter by status")
	_ = cmd.RegisterFlagCompletionFunc("status", staticCompletion(userStatuses))
	_ = cmd.RegisterFlagCompletionFunc("format", staticCompletion(formatChoices))
	return cmd
}

func newUsersApproveCommand() *cobra.Command {
	return &cobra.Command{
		Use:               "approve <user-id>",
		Short:             "Approve a pending user",
		Args:              cobra.ExactArgs(1),
		ValidArgsFunction: dynamicUserCompletion("PENDING_APPROVAL"),
		Example:           "starterctl users approve user_123",
		RunE: func(_ *cobra.Command, args []string) error {
			return mutateUser(args[0], "/approve", "Approved user")
		},
	}
}

func newUsersDeactivateCommand() *cobra.Command {
	return &cobra.Command{
		Use:               "deactivate <user-id>",
		Short:             "Deactivate a user",
		Args:              cobra.ExactArgs(1),
		ValidArgsFunction: dynamicUserCompletion("ACTIVE"),
		Example:           "starterctl users deactivate user_123",
		RunE: func(_ *cobra.Command, args []string) error {
			return mutateUser(args[0], "/deactivate", "Deactivated user")
		},
	}
}

func newUsersReactivateCommand() *cobra.Command {
	return &cobra.Command{
		Use:               "reactivate <user-id>",
		Short:             "Reactivate a user",
		Args:              cobra.ExactArgs(1),
		ValidArgsFunction: dynamicUserCompletion("INACTIVE"),
		Example:           "starterctl users reactivate user_123",
		RunE: func(_ *cobra.Command, args []string) error {
			return mutateUser(args[0], "/reactivate", "Reactivated user")
		},
	}
}

func mutateUser(userID string, suffix string, message string) error {
	cfg, err := requireConfiguredClient()
	if err != nil {
		return err
	}

	httpClient := client.NewClient(cfg)
	httpClient.SetVerbose(verboseFlag)
	httpClient.SetStderr(stderr)
	if _, err := httpClient.Patch("/api/users/"+url.PathEscape(userID)+suffix, nil); err != nil {
		return err
	}

	fmt.Fprintf(stdout, "%s %s\n", message, userID)
	return nil
}

func dynamicUserCompletion(status string) func(*cobra.Command, []string, string) ([]string, cobra.ShellCompDirective) {
	return func(_ *cobra.Command, _ []string, toComplete string) ([]string, cobra.ShellCompDirective) {
		cfg, err := configOrNil()
		if err != nil || cfg == nil || cfg.ServerURL == "" || cfg.Token == "" {
			return nil, cobra.ShellCompDirectiveNoFileComp
		}

		queryPath := "/api/users"
		if status != "" {
			queryPath += "?status=" + url.QueryEscape(status)
		}

		httpClient := client.NewClient(cfg)
		resp, err := httpClient.Get(queryPath)
		if err != nil {
			return nil, cobra.ShellCompDirectiveNoFileComp
		}

		payload := struct {
			Users []userRecord `json:"users"`
		}{}
		if err := json.Unmarshal(resp.Body, &payload); err != nil {
			return nil, cobra.ShellCompDirectiveNoFileComp
		}

		results := make([]string, 0, len(payload.Users))
		for _, user := range payload.Users {
			if strings.HasPrefix(user.ID, toComplete) {
				results = append(results, user.ID+"\t"+user.Name)
			}
		}
		return results, cobra.ShellCompDirectiveNoFileComp
	}
}
