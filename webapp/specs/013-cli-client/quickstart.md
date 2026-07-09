# Quickstart: Cross-Platform CLI Client

**Date**: 2026-04-09

## Prerequisites

- Go 1.22+ installed
- GoReleaser installed (for releases)
- The web application running with spec 012 (PAT + CLI auth) implemented
- A user account with a valid PAT or browser login capability

## Development Setup

```bash
cd cli/
go mod init github.com/<org>/starterctl
go mod tidy
go build -o starterctl .
```

## Development Sequence

### 1. Project Scaffold

Create `cli/` directory with `main.go`, `go.mod`, and the `cmd/` + `internal/` package structure. Set up cobra root command with global flags (`--format`, `--verbose`, `--help`).

### 2. Config Management

Implement `internal/config/config.go`: read/write JSON config file at platform-appropriate path. Handle `STARTERCTL_SERVER_URL` and `STARTERCTL_TOKEN` environment variable overrides.

### 3. HTTP Client

Implement `internal/client/client.go`: shared HTTP client that reads config, sets `Authorization: Bearer` header, prepends base path to API URLs, handles errors, and supports `--verbose` logging.

### 4. Browser Login Flow

Implement `internal/auth/browser.go`: start localhost HTTP server, open browser to auth URL, wait for callback, exchange code for token, save to config.

### 5. Output Formatters

Implement `internal/output/`: table (go-pretty), JSON (stdlib), CSV (stdlib) formatters. Non-interactive detection with auto-format switching.

### 6. Core Commands (P1)

Implement `cmd/login.go`, `cmd/logout.go`, `cmd/configure.go`, `cmd/users.go`, `cmd/users_role.go`. These cover User Stories 1 and 2.

### 7. Secondary Commands (P2)

Implement `cmd/audit.go`, `cmd/jobs.go`, `cmd/completion.go`. Add dynamic completion functions. These cover User Stories 3-6.

### 8. Utility Commands (P3)

Implement `cmd/health.go`, `cmd/version.go`. Add version check (`internal/update/check.go`).

### 9. GoReleaser Config

Create `.goreleaser.yaml` for 6-platform builds. Set up GitHub Actions workflow for automated releases.

## Key Dependencies

```
github.com/spf13/cobra         # CLI framework
github.com/jedib0t/go-pretty/v6 # Table output
github.com/pkg/browser          # Open URLs cross-platform
golang.org/x/term               # Terminal detection
github.com/stretchr/testify     # Test assertions
```

## Testing

```bash
cd cli/
go test ./...                   # Run all tests
go test -v ./cmd/...            # Verbose command tests
go test -cover ./...            # With coverage
```

## Building

```bash
# Local build
go build -o starterctl .

# Cross-compile for Linux
GOOS=linux GOARCH=amd64 go build -o starterctl-linux-amd64 .

# Full release (all platforms)
goreleaser release --snapshot --clean
```

## Manual Testing

```bash
# Browser login
./starterctl login --server http://localhost:3000

# PAT auth
./starterctl configure --server http://localhost:3000 --token starter_pat_abc123...

# Run commands
./starterctl users list
./starterctl users list --format json
./starterctl audit export --format csv > audit.csv
./starterctl health
./starterctl version
```
