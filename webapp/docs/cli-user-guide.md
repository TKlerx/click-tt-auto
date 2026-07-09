# Starter CLI User Guide

This guide is for people who already have the `starterctl` binary and want to use it against a running starter app environment.

If you need build, release, or packaging instructions, see [cli/README.md](../cli/README.md).

## CLI Cheat Sheet

These are the fastest copy/paste commands for common workflows.

Log in with browser flow:

```powershell
starterctl login --server http://localhost:3270
```

Configure with a PAT:

```powershell
starterctl configure --server http://localhost:3270 --token starter_pat_...
```

Check connectivity:

```powershell
starterctl health
starterctl version
```

List users:

```powershell
starterctl users list
starterctl users list --status ACTIVE
starterctl users list --format json
```

Approve or deactivate a user:

```powershell
starterctl users approve <user-id>
starterctl users deactivate <user-id>
```

Change a user role:

```powershell
starterctl users role <user-id> --role SCOPE_ADMIN
```

Browse audit entries:

```powershell
starterctl audit list
starterctl audit list --action AUTH_LOGIN_SUCCEEDED --format json
starterctl audit export --format csv > audit.csv
```

List or create jobs:

```powershell
starterctl jobs list
starterctl jobs create --type noop --payload "{}"
```

Use env vars instead of stored config:

```powershell
$env:STARTERCTL_SERVER_URL='http://localhost:3270'
$env:STARTERCTL_TOKEN='starter_pat_...'
starterctl users list --format json
```

Bootstrap your first PAT through the app API:

```powershell
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$loginBody = @{ email='admin@example.com'; password='ChangeMe123!' } | ConvertTo-Json
Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3270/api/auth/login' -Method POST -ContentType 'application/json' -Body $loginBody -WebSession $session
$tokenBody = @{ name='CLI Bootstrap Token'; expiresInDays=90 } | ConvertTo-Json
$tokenResponse = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3270/api/tokens' -Method POST -ContentType 'application/json' -Body $tokenBody -WebSession $session
($tokenResponse.Content | ConvertFrom-Json).token.tokenValue
```

Log out:

```powershell
starterctl logout
```

## What The CLI Does

`starterctl` lets you work with the app API from a terminal. Common uses:

- check whether an environment is healthy
- sign in and store an access token locally
- list users and manage user lifecycle
- inspect audit trail entries
- list or create background jobs

## Before You Start

You need:

- a running starter app environment
- permission to access that environment
- either a browser login flow or a personal access token

Examples in this guide use `http://localhost:3270`, but replace that with your real environment URL when needed.

## First-Time Login

You have two main options.

### Option 1: Browser Login

This is the friendliest path if your environment supports the CLI login flow.

```powershell
starterctl login --server http://localhost:3270
```

That command opens the browser, completes the web login flow, and stores the resulting token in your local CLI config.

If you already logged in before and only want to refresh the token, you can run:

```powershell
starterctl login
```

### Option 2: Personal Access Token

If you already have a PAT, configure the CLI directly:

```powershell
starterctl configure --server http://localhost:3270 --token starter_pat_...
```

This verifies the server and confirms the authenticated identity before saving the config.

If you need to bootstrap your very first PAT without the CLI, you can log into the app API and create one directly:

```powershell
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$loginBody = @{ email='admin@example.com'; password='ChangeMe123!' } | ConvertTo-Json
Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3270/api/auth/login' -Method POST -ContentType 'application/json' -Body $loginBody -WebSession $session
$tokenBody = @{ name='CLI Bootstrap Token'; expiresInDays=90 } | ConvertTo-Json
$tokenResponse = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3270/api/tokens' -Method POST -ContentType 'application/json' -Body $tokenBody -WebSession $session
($tokenResponse.Content | ConvertFrom-Json).token.tokenValue
```

## Where Configuration Is Stored

By default, the CLI stores config here:

- Windows: `%APPDATA%\starterctl\config.json`
- macOS/Linux: `~/.config/starterctl/config.json`

You can override that location with:

```powershell
$env:STARTERCTL_CONFIG_DIR='C:\temp\starterctl'
```

## Quick Health Check

After login or configuration, these are the best first commands:

```powershell
starterctl health
starterctl version
```

Useful output variants:

```powershell
starterctl health --format json
starterctl users list --format json
starterctl audit list --format csv
```

Supported output formats are:

- `table`
- `json`
- `csv`

## Common Day-To-Day Tasks

### List Users

```powershell
starterctl users list
starterctl users list --status ACTIVE
starterctl users list --format json
```

Supported status filters:

- `ACTIVE`
- `PENDING_APPROVAL`
- `INACTIVE`

### Approve, Deactivate, Or Reactivate A User

Approve a pending user:

```powershell
starterctl users approve <user-id>
```

Deactivate a user:

```powershell
starterctl users deactivate <user-id>
```

Reactivate a user:

```powershell
starterctl users reactivate <user-id>
```

Change a user role:

```powershell
starterctl users role <user-id> --role SCOPE_ADMIN
```

Supported roles:

- `PLATFORM_ADMIN`
- `SCOPE_ADMIN`
- `SCOPE_USER`

### Browse Audit Trail Entries

List recent entries:

```powershell
starterctl audit list
```

Filter by action:

```powershell
starterctl audit list --action AUTH_LOGIN_SUCCEEDED
starterctl audit list --action USER_CREATED --format json
```

Filter by actor or date range:

```powershell
starterctl audit list --actor <user-id>
starterctl audit list --from 2026-04-01T00:00:00Z --to 2026-04-30T23:59:59Z
```

Export audit data:

```powershell
starterctl audit export --format json
starterctl audit export --format csv > audit.csv
```

### Work With Background Jobs

List jobs:

```powershell
starterctl jobs list
starterctl jobs list --format json
```

Create a job:

```powershell
starterctl jobs create --type noop --payload "{}"
```

Example with structured payload:

```powershell
starterctl jobs create --type echo --payload "{\"message\":\"hello\"}"
```

Whether job creation succeeds depends on your server-side permissions and the allowlisted job types in that environment.

## Useful Global Flags

You can use these on most commands:

```powershell
starterctl --help
starterctl users --help
starterctl audit list --help
```

Verbose HTTP output:

```powershell
starterctl --verbose health
```

Structured output:

```powershell
starterctl --format json users list
```

## Shell Completion

Generate completion scripts:

```powershell
starterctl completion powershell
starterctl completion bash
starterctl completion zsh
```

Install PowerShell completion:

```powershell
starterctl completion install powershell
```

Completion is especially helpful for user IDs and some enum-style flags.

## Logging Out

To remove the stored token from local config:

```powershell
starterctl logout
```

After that, commands that need authentication will fail until you run `login` or `configure` again.

## Environment Variables

You can control CLI behavior with environment variables instead of stored config:

- `STARTERCTL_CONFIG_DIR`
- `STARTERCTL_SERVER_URL`
- `STARTERCTL_TOKEN`
- `STARTERCTL_AUTH_HEADER`

Example:

```powershell
$env:STARTERCTL_SERVER_URL='http://localhost:3270'
$env:STARTERCTL_TOKEN='starter_pat_...'
starterctl users list --format json
```

If `STARTERCTL_AUTH_HEADER=api-key`, the CLI sends the token in `X-API-Key` instead of `Authorization: Bearer ...`.

## Troubleshooting

- If a command says the server URL is not configured, run `starterctl login --server ...` or `starterctl configure --server ... --token ...`.
- If a command returns a connection error, verify the app URL and make sure the environment is reachable from your machine.
- If the browser login flow does not open, try PAT-based `configure` instead.
- If you are scripting the CLI, prefer `--format json` so downstream tools do not depend on table formatting.
