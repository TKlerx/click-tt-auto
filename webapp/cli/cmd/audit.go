package cmd

import (
	"encoding/json"
	"net/url"

	"github.com/spf13/cobra"

	"github.com/TKlerx/webapp-template/cli/internal/client"
	"github.com/TKlerx/webapp-template/cli/internal/output"
)

var auditActions = []string{
	"USER_CREATED",
	"ROLE_CHANGED",
	"USER_STATUS_CHANGED",
	"USER_THEME_CHANGED",
	"AUTH_LOGIN_SUCCEEDED",
	"AUTH_LOGIN_REJECTED",
	"AUTH_PASSWORD_CHANGED",
	"AUTH_LOGOUT_SUCCEEDED",
	"CLI_LOGIN_COMPLETED",
}

type auditEntry struct {
	ID         string `json:"id"`
	Action     string `json:"action"`
	EntityType string `json:"entityType"`
	EntityID   string `json:"entityId"`
	ActorID    string `json:"actorId"`
	CreatedAt  string `json:"createdAt"`
}

type auditFilterFlags struct {
	Action string
	From   string
	To     string
	Actor  string
}

func newAuditCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:       "audit",
		Short:     "Query audit trail entries",
		ValidArgs: []string{"list", "export"},
		Example:   "starterctl audit list --action USER_CREATED",
	}

	cmd.AddCommand(newAuditListCommand())
	cmd.AddCommand(newAuditExportCommand())
	return cmd
}

func newAuditListCommand() *cobra.Command {
	var filters auditFilterFlags

	cmd := &cobra.Command{
		Use:   "list",
		Short: "List audit entries",
		Example: "" +
			"starterctl audit list\n" +
			"starterctl audit list --action USER_CREATED --actor user_123",
		RunE: func(_ *cobra.Command, _ []string) error {
			cfg, err := requireConfiguredClient()
			if err != nil {
				return err
			}

			httpClient := client.NewClient(cfg)
			httpClient.SetVerbose(verboseFlag)
			httpClient.SetStderr(stderr)
			resp, err := httpClient.Get("/api/audit" + filters.QueryString())
			if err != nil {
				return err
			}

			payload := struct {
				Data []auditEntry `json:"data"`
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
				return renderer.RenderData(payload.Data)
			}

			headers := []string{"ID", "Action", "Entity", "Actor", "Date"}
			rows := make([][]string, 0, len(payload.Data))
			for _, entry := range payload.Data {
				rows = append(rows, []string{
					entry.ID,
					entry.Action,
					entry.EntityType + " " + entry.EntityID,
					entry.ActorID,
					entry.CreatedAt,
				})
			}
			return renderer.RenderTable(headers, rows)
		},
	}

	filters.Bind(cmd)
	_ = cmd.RegisterFlagCompletionFunc("format", staticCompletion(formatChoices))
	return cmd
}

func newAuditExportCommand() *cobra.Command {
	var filters auditFilterFlags
	var exportFormat string

	cmd := &cobra.Command{
		Use:   "export",
		Short: "Export audit entries",
		Example: "" +
			"starterctl audit export --format json\n" +
			"starterctl audit export --from 2026-01-01T00:00:00Z --format csv > audit.csv",
		RunE: func(_ *cobra.Command, _ []string) error {
			cfg, err := requireConfiguredClient()
			if err != nil {
				return err
			}

			httpClient := client.NewClient(cfg)
			httpClient.SetVerbose(verboseFlag)
			httpClient.SetStderr(stderr)

			renderer := output.NewRenderer(output.Options{
				Format:      stringsOrDefault(exportFormat, formatFlag),
				Stdout:      stdout,
				Stderr:      stderr,
				Interactive: output.IsInteractiveWriter(stdout),
			})

			if renderer.Format() == output.FormatCSV {
				resp, err := httpClient.Get("/api/audit/export" + filters.QueryStringWithFormat("csv"))
				if err != nil {
					return err
				}
				_, err = stdout.Write(resp.Body)
				return err
			}

			resp, err := httpClient.Get("/api/audit" + filters.QueryString())
			if err != nil {
				return err
			}

			payload := struct {
				Data []auditEntry `json:"data"`
			}{}
			if err := json.Unmarshal(resp.Body, &payload); err != nil {
				return err
			}
			return renderer.RenderData(payload.Data)
		},
	}

	filters.Bind(cmd)
	cmd.Flags().StringVar(&exportFormat, "format", "", "Override output format")
	_ = cmd.RegisterFlagCompletionFunc("format", staticCompletion(formatChoices))
	return cmd
}

func (f *auditFilterFlags) Bind(cmd *cobra.Command) {
	cmd.Flags().StringVar(&f.Action, "action", "", "Filter by audit action")
	cmd.Flags().StringVar(&f.From, "from", "", "Start date in ISO 8601 format")
	cmd.Flags().StringVar(&f.To, "to", "", "End date in ISO 8601 format")
	cmd.Flags().StringVar(&f.Actor, "actor", "", "Filter by actor user ID")
	_ = cmd.RegisterFlagCompletionFunc("action", staticCompletion(auditActions))
	_ = cmd.RegisterFlagCompletionFunc("actor", dynamicUserCompletion(""))
}

func (f auditFilterFlags) QueryString() string {
	values := url.Values{}
	if f.Action != "" {
		values.Set("action", f.Action)
	}
	if f.From != "" {
		values.Set("dateFrom", f.From)
	}
	if f.To != "" {
		values.Set("dateTo", f.To)
	}
	if f.Actor != "" {
		values.Set("actorId", f.Actor)
	}
	if len(values) == 0 {
		return ""
	}
	return "?" + values.Encode()
}

func (f auditFilterFlags) QueryStringWithFormat(format string) string {
	values := url.Values{}
	if query := f.QueryString(); query != "" {
		parsed, _ := url.ParseQuery(query[1:])
		values = parsed
	}
	if format != "" {
		values.Set("format", format)
	}
	if len(values) == 0 {
		return ""
	}
	return "?" + values.Encode()
}

func stringsOrDefault(value string, fallback string) string {
	if value != "" {
		return value
	}
	return fallback
}
