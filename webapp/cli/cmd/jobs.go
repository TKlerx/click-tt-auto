package cmd

import (
	"encoding/json"
	"fmt"

	"github.com/spf13/cobra"

	"github.com/TKlerx/webapp-template/cli/internal/client"
	"github.com/TKlerx/webapp-template/cli/internal/output"
)

type backgroundJob struct {
	ID        string `json:"id"`
	JobType   string `json:"jobType"`
	Status    string `json:"status"`
	CreatedAt string `json:"createdAt"`
}

func newJobsCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:       "jobs",
		Short:     "Manage background jobs",
		ValidArgs: []string{"list", "create"},
		Example:   "starterctl jobs list\n" + "starterctl jobs create --type echo --payload '{\"message\":\"hi\"}'",
	}

	cmd.AddCommand(newJobsListCommand())
	cmd.AddCommand(newJobsCreateCommand())
	return cmd
}

func newJobsListCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:     "list",
		Short:   "List background jobs",
		Example: "starterctl jobs list --format json",
		RunE: func(_ *cobra.Command, _ []string) error {
			cfg, err := requireConfiguredClient()
			if err != nil {
				return err
			}

			httpClient := client.NewClient(cfg)
			httpClient.SetVerbose(verboseFlag)
			httpClient.SetStderr(stderr)
			resp, err := httpClient.Get("/api/background-jobs")
			if err != nil {
				return err
			}

			payload := struct {
				Jobs []backgroundJob `json:"jobs"`
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
				return renderer.RenderData(payload.Jobs)
			}

			headers := []string{"ID", "Type", "Status", "Created"}
			rows := make([][]string, 0, len(payload.Jobs))
			for _, job := range payload.Jobs {
				rows = append(rows, []string{job.ID, job.JobType, job.Status, job.CreatedAt})
			}
			return renderer.RenderTable(headers, rows)
		},
	}
	_ = cmd.RegisterFlagCompletionFunc("format", staticCompletion(formatChoices))
	return cmd
}

func newJobsCreateCommand() *cobra.Command {
	var jobType string
	var payload string

	cmd := &cobra.Command{
		Use:     "create",
		Short:   "Create a background job",
		Example: "starterctl jobs create --type echo --payload '{\"message\":\"hello\"}'",
		RunE: func(_ *cobra.Command, _ []string) error {
			cfg, err := requireConfiguredClient()
			if err != nil {
				return err
			}

			var parsedPayload any
			if err := json.Unmarshal([]byte(payload), &parsedPayload); err != nil {
				return fmt.Errorf("payload must be valid JSON: %w", err)
			}

			httpClient := client.NewClient(cfg)
			httpClient.SetVerbose(verboseFlag)
			httpClient.SetStderr(stderr)
			resp, err := httpClient.Post("/api/background-jobs", map[string]any{
				"jobType": jobType,
				"payload": parsedPayload,
			})
			if err != nil {
				return err
			}

			body := struct {
				Job backgroundJob `json:"job"`
			}{}
			if err := resp.DecodeJSON(&body); err != nil {
				return err
			}

			fmt.Fprintf(stdout, "Created job %s (%s)\n", body.Job.ID, body.Job.Status)
			return nil
		},
	}

	cmd.Flags().StringVar(&jobType, "type", "", "Job type")
	cmd.Flags().StringVar(&payload, "payload", "", "JSON payload")
	_ = cmd.MarkFlagRequired("type")
	_ = cmd.MarkFlagRequired("payload")
	return cmd
}
