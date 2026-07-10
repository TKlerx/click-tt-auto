package cmd

import (
	"errors"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/spf13/cobra"

	"github.com/TKlerx/webapp-template/cli/internal/config"
	"github.com/TKlerx/webapp-template/cli/internal/update"
)

const defaultFormat = "table"

var (
	version = "dev"

	stdout io.Writer = os.Stdout
	stderr io.Writer = os.Stderr

	formatFlag  string
	verboseFlag bool

	rootCmd = &cobra.Command{
		Use:           "starterctl",
		Short:         "Starter CLI for the business app template",
		Example:       "starterctl login --server http://localhost:3000\n" + "starterctl users list --format json\n" + "starterctl health",
		SilenceUsage:  true,
		SilenceErrors: true,
		Version:       version,
		PersistentPreRun: func(cmd *cobra.Command, _ []string) {
			maybeStartUpdateCheck(cmd)
		},
		PersistentPostRun: func(cmd *cobra.Command, _ []string) {
			maybePrintUpdateNotification(cmd)
		},
	}
)

func init() {
	rootCmd.SetOut(stdout)
	rootCmd.SetErr(stderr)
	rootCmd.PersistentFlags().StringVarP(&formatFlag, "format", "f", defaultFormat, "Output format: table, json, csv")
	rootCmd.PersistentFlags().BoolVarP(&verboseFlag, "verbose", "v", false, "Show request and response details")
	_ = rootCmd.RegisterFlagCompletionFunc("format", staticCompletion(formatChoices))

	rootCmd.AddCommand(newLoginCommand())
	rootCmd.AddCommand(newLogoutCommand())
	rootCmd.AddCommand(newConfigureCommand())
	rootCmd.AddCommand(newUsersCommand())
	rootCmd.AddCommand(newAuditCommand())
	rootCmd.AddCommand(newJobsCommand())
	rootCmd.AddCommand(newCompletionCommand())
	rootCmd.AddCommand(newHealthCommand())
	rootCmd.AddCommand(newVersionCommand())
}

func Execute() error {
	rootCmd.SetOut(stdout)
	rootCmd.SetErr(stderr)
	rootCmd.Version = version
	return rootCmd.Execute()
}

func SetVersion(value string) {
	version = value
	rootCmd.Version = value
}

func SetIO(out io.Writer, errOut io.Writer) {
	if out != nil {
		stdout = out
	}
	if errOut != nil {
		stderr = errOut
	}
	rootCmd.SetOut(stdout)
	rootCmd.SetErr(stderr)
}

func ExitCode(err error) int {
	var coded interface{ ExitCode() int }
	if errors.As(err, &coded) {
		return coded.ExitCode()
	}
	return 1
}

func loadConfig() (*config.Config, error) {
	return config.Load()
}

func requireConfiguredClient() (*config.Config, error) {
	cfg, err := loadConfig()
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(cfg.ServerURL) == "" {
		return nil, fmt.Errorf("server URL is not configured; run `starterctl login --server <url>` or `starterctl configure --server <url> --token <token>`")
	}
	if strings.TrimSpace(cfg.Token) == "" {
		return nil, fmt.Errorf("token is not configured; run `starterctl login` or `starterctl configure --token <token>`")
	}
	return cfg, nil
}

func maybeStartUpdateCheck(cmd *cobra.Command) {
	if cmd == nil || !update.IsInteractive() || cmd.Name() == "completion" {
		return
	}

	checker := update.NewChecker(update.Config{
		CurrentVersion: version,
		Stderr:         stderr,
	})
	checker.Start()
	cmd.SetContext(update.WithChecker(cmd.Context(), checker))
}

func maybePrintUpdateNotification(cmd *cobra.Command) {
	if cmd == nil {
		return
	}
	checker := update.FromContext(cmd.Context())
	if checker == nil {
		return
	}
	if message, ok := checker.Result(); ok && strings.TrimSpace(message) != "" {
		fmt.Fprintln(stderr, message)
	}
}
