# Research: Cross-Platform CLI Client

**Date**: 2026-04-09 | **Spec**: [spec.md](./spec.md)

## Language Choice: Go

**Decision**: Go 1.22+ for the CLI implementation.

**Rationale**: Go compiles to single static binaries per platform with zero runtime dependencies â€” exactly what FR-009 requires. The Go CLI ecosystem is mature: cobra (used by kubectl, gh, docker) provides command parsing, shell completions (bash/zsh/PowerShell/fish), and help generation out of the box. Cross-compilation is trivial (`GOOS=windows GOARCH=amd64 go build`). GoReleaser automates building for all 6 platform targets and publishing to GitHub Releases.

**Alternatives considered**:

- **Rust (clap)**: Better performance but slower development. The team is TypeScript-focused; Go's simplicity is more approachable.
- **TypeScript (Node.js + pkg/nexe)**: Single binary is possible but bundles a Node.js runtime (~40-80MB). Startup time is slower. Shell completion support is weaker.
- **TypeScript (Bun compile)**: Smaller binaries than pkg but Bun's single-binary compilation is still experimental on Windows. Risk of platform-specific issues.
- **Python (Click + PyInstaller)**: Large binaries (~50MB+), slow startup, fragile packaging.

## CLI Framework: Cobra

**Decision**: Use `github.com/spf13/cobra` for command parsing and `github.com/spf13/viper` is NOT used (too heavy for a simple JSON config).

**Rationale**: Cobra is the de-facto Go CLI framework. It provides: hierarchical command structure, automatic `--help` generation, shell completion scripts (bash/zsh/PowerShell/fish) with custom completion functions for dynamic values, and persistent flags. This covers FR-007, FR-008, FR-012.

**Alternatives considered**:

- **urfave/cli**: Simpler but weaker shell completion support. No built-in dynamic completion hooks.
- **kong**: Good but less ecosystem support and fewer examples. Completion support is a third-party plugin.
- **Manual flag parsing**: No reason when cobra exists.

## Output Formatting

**Decision**: Use `github.com/jedib0t/go-pretty/v6/table` for table output, `encoding/json` (stdlib) for JSON, `encoding/csv` (stdlib) for CSV.

**Rationale**: go-pretty provides aligned, colored tables with automatic column width. JSON and CSV are stdlib â€” no dependencies needed. Non-interactive detection uses `os.IsTerminal()` (golang.org/x/term) to auto-switch from table to JSON when piped.

**Alternatives considered**:

- **tablewriter**: Less maintained, fewer features.
- **lipgloss/bubbletea**: Too heavy for output formatting. Better suited for interactive TUIs.
- **Custom table formatter**: Unnecessary when go-pretty exists.

## Browser Login Flow

**Decision**: The CLI starts a temporary HTTP server on a random available port on localhost, opens the browser to the server's `/api/cli-auth/authorize` endpoint with the callback URL and state parameter, then waits for the callback.

**Rationale**: This follows the same pattern as `gh auth login` and `az login`. The temporary server is created with `net/http` (stdlib), and the browser is opened with `github.com/pkg/browser` (cross-platform browser opener). The server shuts down after receiving the callback or timing out after 120 seconds.

**Alternatives considered**:

- **Polling-based**: CLI generates a code, user enters it on a web page, CLI polls for completion. More complex and worse UX.
- **Copy-paste flow**: User copies a URL, authenticates, copies a code back. Works but poor UX.

## Configuration Storage

**Decision**: Simple JSON file at platform-appropriate location. Read/write with `encoding/json` (stdlib) and `os` package. File permissions set to 0600 on creation.

```json
{
  "server_url": "https://my-app.example.com/app",
  "token": "starter_pat_a1b2c3d4..."
}
```

**Rationale**: JSON is simple, human-readable, and debuggable. The config contains only two fields â€” no need for YAML, TOML, or a library like viper. On Windows, Go's `os.Chmod` doesn't enforce Unix permissions but the file is in the user's AppData directory which is already user-scoped.

**Alternatives considered**:

- **Viper**: Too heavy for 2 config fields. Pulls in many transitive dependencies.
- **YAML/TOML**: Adds a dependency for no benefit over JSON.
- **OS keychain (keyring)**: More secure but adds complexity and platform-specific code. The token is already in the user's home directory which is user-scoped.

## Version Check

**Decision**: On each command invocation, make a non-blocking background HTTP request to the GitHub Releases API (`GET /repos/{owner}/{repo}/releases/latest`) to check for newer versions. Cache the result for 24 hours in the config directory (`~/.config/starterctl/version-check.json`). Print a one-line notification to stderr if an update is available.

**Rationale**: Non-blocking means the check doesn't delay command execution. 24-hour cache means at most one API call per day. Printing to stderr ensures it doesn't interfere with JSON/CSV output piped to other tools.

**Alternatives considered**:

- **No check**: Users would never know about updates.
- **Blocking check**: Would slow down every command execution.
- **Self-update command**: More complex, raises trust/security concerns about replacing binaries.

## Cross-Compilation & Distribution

**Decision**: Use GoReleaser for building and publishing. Configure `.goreleaser.yaml` to build for 6 targets: linux/amd64, linux/arm64, darwin/amd64, darwin/arm64, windows/amd64, windows/arm64. Publish as GitHub Releases with checksums.

**Rationale**: GoReleaser is the standard tool for Go project releases. It handles cross-compilation, binary naming, archive creation (tar.gz for Linux/macOS, zip for Windows), checksum generation, and GitHub Release creation in a single `goreleaser release` command. Can be triggered from GitHub Actions.

**Alternatives considered**:

- **Manual `go build` scripts**: Works but loses changelog generation, checksum files, and release notes.
- **Docker-based builds**: Unnecessary when Go cross-compiles natively.

## Dynamic Shell Completion

**Decision**: Use cobra's `RegisterFlagCompletionFunc` and `ValidArgsFunction` for dynamic completions. For values that require server queries (user IDs, role names), the completion function makes an API call using the stored token and returns results.

**Rationale**: Cobra has first-class support for dynamic completion functions. The completion function receives the current command line state and returns suggestions. For server-side values, it calls the API (e.g., `GET /api/users` for user ID completion). Results are not cached â€” each Tab press makes a fresh API call. This ensures completions are always up-to-date.

**Alternatives considered**:

- **Cached completions**: Would show stale data. With ~10 users, API calls are fast enough.
- **Static-only completions**: Would miss the user IDs and other dynamic values that make completions truly useful.
