package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"

	"github.com/spf13/cobra"
)

func newCompletionCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:     "completion",
		Short:   "Generate or install shell completion scripts",
		Example: "starterctl completion bash\n" + "starterctl completion install",
	}

	cmd.AddCommand(&cobra.Command{
		Use:     "bash",
		Short:   "Generate bash completions",
		Example: "starterctl completion bash > ~/.bash_completion.d/starterctl",
		RunE: func(_ *cobra.Command, _ []string) error {
			return rootCmd.GenBashCompletionV2(stdout, true)
		},
	})
	cmd.AddCommand(&cobra.Command{
		Use:     "zsh",
		Short:   "Generate zsh completions",
		Example: "starterctl completion zsh > ~/.zsh/completion/_starterctl",
		RunE: func(_ *cobra.Command, _ []string) error {
			return rootCmd.GenZshCompletion(stdout)
		},
	})
	cmd.AddCommand(&cobra.Command{
		Use:     "powershell",
		Short:   "Generate PowerShell completions",
		Example: "starterctl completion powershell > $PROFILE.CurrentUserAllHosts",
		RunE: func(_ *cobra.Command, _ []string) error {
			return rootCmd.GenPowerShellCompletionWithDesc(stdout)
		},
	})
	cmd.AddCommand(&cobra.Command{
		Use:     "fish",
		Short:   "Generate fish completions",
		Example: "starterctl completion fish > ~/.config/fish/completions/starterctl.fish",
		RunE: func(_ *cobra.Command, _ []string) error {
			return rootCmd.GenFishCompletion(stdout, true)
		},
	})
	cmd.AddCommand(newCompletionInstallCommand())
	return cmd
}

func newCompletionInstallCommand() *cobra.Command {
	return &cobra.Command{
		Use:     "install",
		Short:   "Install the current shell's completion script",
		Example: "starterctl completion install",
		RunE: func(_ *cobra.Command, _ []string) error {
			shell := detectShell()
			path, err := completionInstallPath(shell)
			if err != nil {
				return err
			}
			if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
				return err
			}

			file, err := os.Create(path)
			if err != nil {
				return err
			}
			defer file.Close()

			switch shell {
			case "bash":
				err = rootCmd.GenBashCompletionV2(file, true)
			case "zsh":
				err = rootCmd.GenZshCompletion(file)
			case "powershell":
				err = rootCmd.GenPowerShellCompletionWithDesc(file)
			case "fish":
				err = rootCmd.GenFishCompletion(file, true)
			default:
				return fmt.Errorf("unsupported shell %q; run `starterctl completion <shell>` manually", shell)
			}
			if err != nil {
				return err
			}

			fmt.Fprintf(stdout, "Installed %s completion at %s\n", shell, path)
			return nil
		},
	}
}

func detectShell() string {
	if runtime.GOOS == "windows" {
		return "powershell"
	}

	switch filepath.Base(os.Getenv("SHELL")) {
	case "zsh":
		return "zsh"
	case "fish":
		return "fish"
	default:
		return "bash"
	}
}

func completionInstallPath(shell string) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}

	switch shell {
	case "bash":
		return filepath.Join(home, ".bash_completion.d", "starterctl"), nil
	case "zsh":
		return filepath.Join(home, ".zsh", "completion", "_starterctl"), nil
	case "powershell":
		return filepath.Join(home, "Documents", "PowerShell", "Completions", "starterctl.ps1"), nil
	case "fish":
		return filepath.Join(home, ".config", "fish", "completions", "starterctl.fish"), nil
	default:
		return "", fmt.Errorf("unknown shell %q", shell)
	}
}
