# Command Schema: GVI CLI

**Date**: 2026-04-09

## Global Flags

| Flag        | Short | Type   | Default | Description                           |
| ----------- | ----- | ------ | ------- | ------------------------------------- |
| `--format`  | `-f`  | string | `table` | Output format: `table`, `json`, `csv` |
| `--verbose` | `-v`  | bool   | false   | Show request/response details         |
| `--help`    | `-h`  | bool   | false   | Show help for any command             |

## Commands

### starterctl login

Authenticate via browser login flow.

```
starterctl login --server <url>
```

| Flag       | Required         | Description                                       |
| ---------- | ---------------- | ------------------------------------------------- |
| `--server` | Yes (first time) | Server URL; saved to config for subsequent logins |

**Behavior**: Opens browser to server login page. Starts localhost callback server. Waits up to 120s. On success, stores token and server URL in config. Prints user name and role.

**Exit codes**: 0 (success), 2 (auth failed/timeout), 3 (server unreachable)

---

### starterctl logout

Remove stored credentials.

```
starterctl logout
```

**Behavior**: Deletes token from config file. Confirms action.

---

### starterctl configure

Manually set server URL and PAT.

```
starterctl configure --server <url> --token <pat>
```

| Flag       | Required | Description                                    |
| ---------- | -------- | ---------------------------------------------- |
| `--server` | Yes      | Server URL (including base path if applicable) |
| `--token`  | Yes      | Personal access token                          |

**Behavior**: Stores server URL and token in config. Validates by calling health endpoint. Prints user name and role on success.

---

### starterctl version

Show CLI and server version.

```
starterctl version
```

**Output**: CLI version, server URL, server version (from health endpoint). If not configured, shows only CLI version.

---

### starterctl health

Check server health.

```
starterctl health
```

**Output**: Server status, database status, server version.

**Exit codes**: 0 (healthy), 3 (unreachable), 1 (unhealthy)

---

### starterctl users list

List users.

```
starterctl users list [--status <status>]
```

| Flag       | Required | Description                                                |
| ---------- | -------- | ---------------------------------------------------------- |
| `--status` | No       | Filter by status: `ACTIVE`, `PENDING_APPROVAL`, `INACTIVE` |

**Output columns**: ID, Name, Email, Role, Status

**Dynamic completion**: `--status` completes to available status values.

---

### starterctl users approve

Approve a pending user.

```
starterctl users approve <user-id>
```

**Dynamic completion**: `<user-id>` completes to pending user IDs (fetched from API with `?status=PENDING_APPROVAL`).

---

### starterctl users deactivate

Deactivate a user.

```
starterctl users deactivate <user-id>
```

**Dynamic completion**: `<user-id>` completes to active user IDs.

---

### starterctl users reactivate

Reactivate a user.

```
starterctl users reactivate <user-id>
```

**Dynamic completion**: `<user-id>` completes to inactive user IDs.

---

### starterctl users role

Change a user's role.

```
starterctl users role <user-id> --role <role>
```

| Flag     | Required | Description                                             |
| -------- | -------- | ------------------------------------------------------- |
| `--role` | Yes      | New role: `PLATFORM_ADMIN`, `SCOPE_ADMIN`, `SCOPE_USER` |

**Dynamic completion**: `<user-id>` completes to all user IDs. `--role` completes to available roles.

---

### starterctl audit list

List recent audit entries.

```
starterctl audit list [--action <action>] [--from <date>] [--to <date>] [--actor <user-id>]
```

| Flag       | Required | Description             |
| ---------- | -------- | ----------------------- |
| `--action` | No       | Filter by audit action  |
| `--from`   | No       | Start date (ISO 8601)   |
| `--to`     | No       | End date (ISO 8601)     |
| `--actor`  | No       | Filter by actor user ID |

**Output columns**: ID, Action, Entity, Actor, Date

---

### starterctl audit export

Export audit data.

```
starterctl audit export [--from <date>] [--to <date>] [--format <format>]
```

**Behavior**: Outputs all audit entries matching filters to stdout. Default format: JSON when piped, table when interactive.

---

### starterctl jobs list

List background jobs.

```
starterctl jobs list
```

**Output columns**: ID, Type, Status, Created

---

### starterctl jobs create

Create a background job.

```
starterctl jobs create --type <job-type> --payload <json>
```

| Flag        | Required | Description         |
| ----------- | -------- | ------------------- |
| `--type`    | Yes      | Job type string     |
| `--payload` | Yes      | JSON payload string |

---

### starterctl completion

Generate or install shell completion scripts.

```
starterctl completion bash|zsh|powershell|fish
starterctl completion install
```

**Subcommands**:

- `bash`, `zsh`, `powershell`, `fish`: Output completion script to stdout
- `install`: Auto-detect shell and install completion script

## Non-Interactive Detection

When stdout is not a terminal (piped or redirected):

- Table format switches to JSON automatically
- Colors and progress indicators are disabled
- Update notifications are suppressed
- All diagnostic output goes to stderr
