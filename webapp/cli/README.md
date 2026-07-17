# Starter CLI

`starterctl` is the Go-based command-line client for this starter app. It talks to the app's HTTP API and supports health checks, user management, audit queries, background jobs, shell completion, and authenticated automation via personal access tokens.

If you are looking for the end-user guide instead of build and packaging details, see [docs/cli-user-guide.md](../docs/cli-user-guide.md).

## Requirements

- Go 1.25+
- A running app server
- A personal access token for the target environment

For local development, the default app URL is `http://localhost:3270`.

## Build

Build the CLI from the `cli/` directory:

```powershell
go build -o starterctl.exe .
```

On macOS or Linux:

```bash
go build -o starterctl .
```

## Configure

The simplest setup flow is to store the server URL and PAT locally:

```powershell
starterctl configure --server http://localhost:3270 --token starter_pat_...
```

That validates both `/api/health` and `/api/auth/me` before saving the config.

The default config locations are:

- Windows: `%APPDATA%\starterctl\config.json`
- macOS/Linux: `~/.config/starterctl/config.json`

You can also override config and auth through environment variables:

- `STARTERCTL_CONFIG_DIR`
- `STARTERCTL_SERVER_URL`
- `STARTERCTL_TOKEN`
- `STARTERCTL_AUTH_HEADER`

`STARTERCTL_AUTH_HEADER=api-key` switches auth from `Authorization: Bearer ...` to `X-API-Key: ...`.

## Common Commands

Check connectivity:

```powershell
starterctl health
starterctl version
```

List users:

```powershell
starterctl users list
starterctl users list --format json
starterctl users list --status ACTIVE
```

Inspect audit events:

```powershell
starterctl audit list
starterctl audit list --format json
```

Work with background jobs:

```powershell
starterctl jobs list
starterctl jobs create --type noop --payload "{}"
```

Generate shell completions:

```powershell
starterctl completion powershell
starterctl completion install powershell
```

## Local Smoke Test

This is the fastest local verification path on Windows PowerShell.

1. Create a local `.env` if you do not already have one.

```dotenv
DATABASE_URL="postgresql://starter:starter_e2e_password@localhost:45432/business_app_starter_e2e_test"
PORT=3270
AUTH_BASE_URL=http://localhost:3270
BETTER_AUTH_SECRET=dev-secret-change-me-in-production
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_PASSWORD=ChangeMe123!
PAT_TOKEN_PREFIX=starter_pat
```

2. Start the PostgreSQL container, apply migrations, and seed the admin user.

```powershell
node scripts/ensure-e2e-db.mjs
```

3. Start the app.

```powershell
pnpm run dev
```

4. In another terminal, build the CLI.

```powershell
cd cli
go build -o starterctl.exe .
```

5. Create a PAT from the running app.

You can do that in the UI, or by logging in and calling the API:

```powershell
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$loginBody = @{ email='admin@example.com'; password='ChangeMe123!' } | ConvertTo-Json
Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3270/api/auth/login' -Method POST -ContentType 'application/json' -Body $loginBody -WebSession $session
$tokenBody = @{ name='CLI Smoke Test'; expiresInDays=90 } | ConvertTo-Json
$tokenResponse = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3270/api/tokens' -Method POST -ContentType 'application/json' -Body $tokenBody -WebSession $session
($tokenResponse.Content | ConvertFrom-Json).token.tokenValue
```

6. Configure the CLI and run a few live commands.

```powershell
starterctl configure --server http://localhost:3270 --token starter_pat_...
starterctl health --format json
starterctl version
starterctl users list --format json
```

## Cross-Platform Builds

For a quick manual cross-build, set `GOOS` and `GOARCH`:

```powershell
$env:GOOS='windows'; $env:GOARCH='amd64'; go build -o dist/starterctl-windows-amd64.exe .
$env:GOOS='linux';   $env:GOARCH='amd64'; go build -o dist/starterctl-linux-amd64 .
$env:GOOS='darwin';  $env:GOARCH='arm64'; go build -o dist/starterctl-darwin-arm64 .
Remove-Item Env:GOOS
Remove-Item Env:GOARCH
```

This repo also includes GoReleaser config in [`.goreleaser.yaml`](./.goreleaser.yaml) and the GitHub Actions workflow in [`.github/workflows/cli-release.yml`](../.github/workflows/cli-release.yml).

Create a local snapshot release from `cli/` with:

```powershell
goreleaser release --snapshot --clean
```

## Verification

From `cli/`:

```powershell
gofmt -l .
go test ./...
go vet ./...
go run honnef.co/go/tools/cmd/staticcheck ./...
go run github.com/fzipp/gocyclo/cmd/gocyclo -over 15 .
go build ./...
```

From the repository root, `pnpm run quality:cli` runs the full CLI quality gate,
including the Go cyclomatic-complexity threshold. Set
`QUALITY_THRESHOLDS_BYPASS=1` to make that threshold advisory while keeping the
other CLI checks blocking.

## Troubleshooting

- If `go` works in a fresh terminal but not in VS Code, fully close all VS Code windows and reopen the editor so it picks up the updated `PATH`.
- If `starterctl health` says the server URL is not configured, rerun `starterctl configure --server ... --token ...` or set `STARTERCTL_SERVER_URL` and `STARTERCTL_TOKEN` explicitly.
- If local auth requests fail, make sure the app is actually running on `http://localhost:3270` and that your `.env` matches that origin.
