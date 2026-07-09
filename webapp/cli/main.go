package main

import (
	"fmt"
	"os"

	"github.com/TKlerx/webapp-template/cli/cmd"
)

func main() {
	if err := cmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		os.Exit(cmd.ExitCode(err))
	}
}
