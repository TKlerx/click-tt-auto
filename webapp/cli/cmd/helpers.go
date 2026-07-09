package cmd

import (
	"strings"

	"github.com/spf13/cobra"

	"github.com/TKlerx/webapp-template/cli/internal/config"
)

var formatChoices = []string{"table", "json", "csv"}

func configOrNil() (*config.Config, error) {
	return config.Load()
}

func staticCompletion(values []string) func(*cobra.Command, []string, string) ([]string, cobra.ShellCompDirective) {
	return func(_ *cobra.Command, _ []string, toComplete string) ([]string, cobra.ShellCompDirective) {
		results := make([]string, 0, len(values))
		for _, value := range values {
			if toComplete == "" || strings.HasPrefix(value, toComplete) {
				results = append(results, value)
			}
		}
		return results, cobra.ShellCompDirectiveNoFileComp
	}
}
