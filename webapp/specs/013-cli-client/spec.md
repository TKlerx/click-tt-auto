# Feature Specification: Cross-Platform CLI Client

**Feature Branch**: `013-cli-client`  
**Created**: 2026-04-08  
**Status**: Draft  
**Input**: User description: "Build a cross-platform CLI client (Windows, Linux, macOS) that provides a command-line interface to all API endpoints, with PAT authentication, shell autocompletion, and multiple output formats."

> Before drafting or implementing this feature, review `/CONTINUE.md` for the latest handoff context and current recommended next steps.

## Clarifications

### Session 2026-04-09

- Q: What should the CLI binary name be? â†’ A: `starterctl` (changeable later as a build-time setting).
- Q: How should the CLI be distributed? â†’ A: GitHub Releases with pre-built binaries per platform (Windows .exe, Linux/macOS binaries). Package manager support can be added later.
- Q: Where and how should CLI configuration be stored? â†’ A: `~/.config/starterctl/config.json` (Linux/macOS), `%APPDATA%\starterctl\config.json` (Windows). JSON format. Only stores server URL and token (PAT or browser-login token). Never stores usernames or passwords.
- Q: How should CLI updates be handled? â†’ A: Non-blocking update check on launch. Prints a one-line notification if a newer version exists on GitHub Releases. No auto-update.
- Q: What environment variable names for configuration? â†’ A: `STARTERCTL_SERVER_URL` and `STARTERCTL_TOKEN`.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Browser Login and Run First Command (Priority: P1)

A developer installs the CLI and runs `cli login --server https://my-app.example.com`. The CLI opens the default browser to the application's login page. After the user authenticates (via local login or SSO), the browser redirects to a localhost callback, and the CLI automatically receives and stores an API token. The user then runs their first command (e.g., `cli users list`) without any manual token copying.

**Why this priority**: Authentication and basic command execution are the foundation. The browser login flow is the default and most ergonomic path for developers.

**Independent Test**: Can be fully tested by running `cli login`, completing browser authentication, then running `cli users list` and verifying the output matches the API response.

**Acceptance Scenarios**:

1. **Given** a user has installed the CLI, **When** they run `cli login --server https://my-app.example.com`, **Then** the CLI opens the browser to the login page and starts a temporary localhost callback server.
2. **Given** the browser login completes successfully, **When** the CLI receives the callback, **Then** it exchanges the authorization code for a token, stores it locally, and displays the authenticated user's name and role.
3. **Given** a configured CLI, **When** the user runs `cli users list`, **Then** the CLI displays a formatted table of users matching what the API returns for that user's permissions.
4. **Given** a configured CLI with an expired token, **When** the user runs any command, **Then** the CLI displays a clear error message indicating the token has expired and suggests running `cli login` again.
5. **Given** a user wants to use a PAT instead, **When** they run `cli configure --server https://my-app.example.com --token <pat>`, **Then** the PAT is stored locally and used for all subsequent requests.

---

### User Story 2 - Manage Users via CLI (Priority: P1)

An administrator uses the CLI to perform user management tasks: listing users, approving pending users, changing roles, deactivating and reactivating users. Each operation maps to the corresponding API endpoint.

**Why this priority**: User management is a core administrative function and demonstrates the CLI's ability to cover the full API surface.

**Independent Test**: Can be tested by running user management commands and verifying the results match the web UI state.

**Acceptance Scenarios**:

1. **Given** an admin user with a configured CLI, **When** they run `cli users list`, **Then** they see all users with their status, role, and email.
2. **Given** a pending user exists, **When** the admin runs `cli users approve <user-id>`, **Then** the user's status changes to active and the CLI confirms the action.
3. **Given** an active user, **When** the admin runs `cli users role <user-id> --role SCOPE_ADMIN`, **Then** the user's role is updated and the CLI confirms.
4. **Given** an active user, **When** the admin runs `cli users deactivate <user-id>`, **Then** the user is deactivated and confirmed. Running `cli users reactivate <user-id>` reverses the action.

---

### User Story 3 - Shell Autocompletion (Priority: P2)

A user types a partial command and presses Tab to receive completion suggestions. The CLI completes command names, subcommands, flag names, and dynamic values (e.g., user IDs from the server, available roles).

**Why this priority**: Autocompletion dramatically improves usability and discoverability, but the core commands must work first.

**Independent Test**: Can be tested by installing shell completions, typing a partial command, pressing Tab, and verifying suggestions appear.

**Acceptance Scenarios**:

1. **Given** shell completions are installed, **When** the user types `cli us` and presses Tab, **Then** the shell completes to `cli users`.
2. **Given** shell completions are installed, **When** the user types `cli users ` and presses Tab, **Then** available subcommands (list, approve, deactivate, reactivate, role) are shown.
3. **Given** shell completions are installed and the CLI is configured, **When** the user types `cli users approve ` and presses Tab, **Then** the CLI fetches and displays pending user IDs as completion candidates.
4. **Given** a user types `cli users role <id> --role ` and presses Tab, **Then** available roles (PLATFORM_ADMIN, SCOPE_ADMIN, SCOPE_USER) are shown.

---

### User Story 4 - Export and Query Audit Logs (Priority: P2)

A user queries the audit trail and exports audit data via the CLI. They can filter by date range, user, and event type. They can choose output format (table, JSON, CSV) for further processing.

**Why this priority**: Audit log access is an important operational capability, and output format flexibility demonstrates the CLI's data handling.

**Independent Test**: Can be tested by running `cli audit list` and `cli audit export --format csv` and verifying output correctness.

**Acceptance Scenarios**:

1. **Given** a configured CLI, **When** the user runs `cli audit list`, **Then** recent audit entries are displayed in table format.
2. **Given** a configured CLI, **When** the user runs `cli audit export --format json`, **Then** audit data is output as valid JSON to stdout.
3. **Given** a configured CLI, **When** the user runs `cli audit export --format csv > audit.csv`, **Then** the output is valid CSV that can be opened in a spreadsheet application.

---

### User Story 5 - Manage Background Jobs (Priority: P2)

A user creates, lists, and monitors background jobs via the CLI. They can submit new jobs with parameters and check job status.

**Why this priority**: Background job management rounds out the API coverage and is useful for automation workflows.

**Independent Test**: Can be tested by creating a job via CLI and verifying it appears in the job list with correct status.

**Acceptance Scenarios**:

1. **Given** a configured CLI, **When** the user runs `cli jobs create --type <jobType> --payload '{"key":"value"}'`, **Then** a new job is created and the CLI displays the job ID and initial status.
2. **Given** existing jobs, **When** the user runs `cli jobs list`, **Then** recent jobs are shown with ID, type, status, and creation time.

---

### User Story 6 - Install Shell Completions (Priority: P3)

A user runs a setup command to install shell-specific autocompletion scripts for their shell (bash, zsh, PowerShell, fish). The CLI provides instructions or automatic installation.

**Why this priority**: Completion installation is a one-time setup task that enhances the experience but is not required for basic usage.

**Independent Test**: Can be tested by running the completion install command for each supported shell and verifying the completion script is generated correctly.

**Acceptance Scenarios**:

1. **Given** a user is using bash, **When** they run `cli completion bash`, **Then** the CLI outputs a bash completion script that can be sourced.
2. **Given** a user is using PowerShell on Windows, **When** they run `cli completion powershell`, **Then** the CLI outputs a PowerShell completion script.
3. **Given** a user runs `cli completion install`, **Then** the CLI detects the current shell and installs the completion script to the appropriate location, or provides manual instructions if automatic installation is not possible.

---

### User Story 7 - Check System Health (Priority: P3)

A user or monitoring script checks the application health status via the CLI. This is useful for scripted health checks and operational monitoring.

**Why this priority**: Health checks are simple but useful for ops automation. Low priority because the health endpoint is already accessible via curl.

**Independent Test**: Can be tested by running `cli health` and verifying the output matches the health endpoint response.

**Acceptance Scenarios**:

1. **Given** a configured CLI, **When** the user runs `cli health`, **Then** the CLI displays the application health status including process availability and database connectivity.
2. **Given** a configured CLI pointing to an unreachable server, **When** the user runs `cli health`, **Then** the CLI displays a clear connection error with the server URL.

---

### Edge Cases

- What happens when the server is unreachable? The CLI displays a connection error with the server URL and a suggestion to check the configuration.
- What happens when the server returns an unexpected response format? The CLI displays the raw response with a warning that the response format was unexpected.
- What happens when the user's PAT has insufficient permissions for a command? The CLI displays the permission error from the server and indicates which role is required.
- What happens when the CLI configuration file is missing or corrupted? The CLI prompts the user to reconfigure.
- What happens when output is piped to another program? The CLI detects non-interactive mode and switches to plain output (no colors, no progress indicators).
- What happens when a command requires a user ID and an invalid ID is given? The CLI forwards the server's 404 response as a clear "user not found" message.
- What happens when the browser cannot be opened (headless/SSH environment)? The CLI prints the login URL and suggests using `cli configure --token` with a PAT instead.
- What happens when the user closes the browser without completing login? The CLI times out after 120 seconds and displays a message suggesting retry or PAT auth.
- What happens when the server URL includes a base path? The CLI preserves the full path (e.g., `https://example.com/app/api/users`) for all requests. The `cli login` flow also uses the base path for the authorization URL.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: CLI MUST support Windows, Linux, and macOS as target platforms.
- **FR-002**: CLI MUST provide a `login` command that opens the user's browser to the server's login page and receives a token via localhost callback (default auth method). This works with both local login and Azure SSO â€” the CLI is agnostic to how the user authenticates in the browser.
- **FR-003**: CLI MUST provide a `configure` command to manually set server URL and PAT for non-interactive environments (CI, scripts, headless servers).
- **FR-003a**: CLI MUST authenticate against the server using the stored token (from browser login or PAT) via the API's `Authorization: Bearer` header.
- **FR-004**: CLI MUST store configuration in `~/.config/starterctl/config.json` (Linux/macOS) or `%APPDATA%\starterctl\config.json` (Windows) as JSON, with file permissions restricted to owner read/write only. The config file stores only server URL and token (PAT or browser-login token). The CLI MUST NOT store usernames, passwords, or any other credentials.
- **FR-005**: CLI MUST provide commands that mirror the API resource structure: `users`, `audit`, `jobs`, `health`.
- **FR-006**: CLI MUST support output formats: table (default for interactive), JSON, and CSV, selectable via `--format` flag.
- **FR-007**: CLI MUST provide shell autocompletion for commands, subcommands, and flag names for bash, zsh, PowerShell, and fish shells.
- **FR-008**: CLI MUST provide dynamic autocompletion for server-side values (e.g., user IDs, role names) by querying the API at completion time.
- **FR-009**: CLI MUST be distributed as pre-built binaries via GitHub Releases (Windows .exe, Linux binary, macOS binary). No runtime dependencies required on the target machine. Package manager support (homebrew, scoop) may be added later.
- **FR-010**: CLI MUST detect non-interactive (piped) output and disable colors and interactive formatting automatically.
- **FR-011**: CLI MUST display helpful error messages for authentication failures, permission errors, and connectivity issues.
- **FR-012**: CLI MUST provide a `--help` flag for every command and subcommand with usage examples.
- **FR-013**: CLI MUST support a `--verbose` flag for detailed request/response logging for debugging.
- **FR-014**: CLI MUST support setting the server URL and token via environment variables `STARTERCTL_SERVER_URL` and `STARTERCTL_TOKEN` as an alternative to the configuration file. Environment variables take precedence over the config file when set.
- **FR-015**: CLI MUST provide a `version` command that displays the CLI version, server URL, and server version (via health endpoint).
- **FR-016**: CLI MUST exit with appropriate exit codes (0 for success, non-zero for errors) to support scripting.
- **FR-016a**: CLI MUST check for newer versions on GitHub Releases at launch and display a non-blocking one-line notification if an update is available (e.g., "Update available: v1.2.3 â†’ https://..."). This check MUST NOT delay command execution or block output.
- **FR-017**: CLI MUST support the `X-API-Key` header as an alternative authentication method (matching spec 012).
- **FR-018**: CLI MUST correctly handle server URLs that include a base path (e.g., `https://example.com/app`) for reverse proxy deployments. All API requests must prepend the base path.
- **FR-019**: CLI MUST provide a `logout` command that removes the locally stored token and confirms the action.

### Key Entities

- **CLI Configuration**: Local per-user JSON file containing server URL and API token only (no usernames or passwords). Stored at `~/.config/starterctl/config.json` (Linux/macOS) or `%APPDATA%\starterctl\config.json` (Windows).
- **Command**: A top-level resource group (e.g., `users`, `audit`, `jobs`, `health`) that maps to an API endpoint group.
- **Subcommand**: An action within a command (e.g., `list`, `create`, `approve`, `export`) that maps to a specific API operation.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Users can install the CLI, log in via browser, and run their first command in under 3 minutes.
- **SC-002**: All API endpoints accessible to the user's role are usable through corresponding CLI commands.
- **SC-003**: Shell autocompletion resolves static commands and subcommands in under 200 milliseconds, and dynamic values (requiring server queries) in under 2 seconds.
- **SC-004**: CLI operates identically on Windows, Linux, and macOS with no platform-specific workarounds required by the user.
- **SC-005**: CLI output in JSON format is parseable by standard tools (e.g., piping to other programs) with zero formatting issues.
- **SC-006**: CLI provides a single downloadable artifact per platform with no additional runtime dependencies.
- **SC-007**: 90% of users who install the CLI can complete common tasks (list users, export audit) without consulting documentation beyond `--help`.

## Assumptions

- The CLI is a companion tool distributed separately from the web application (not bundled with the server).
- The CLI binary name is `starterctl`. This is a build-time setting and can be changed later without code changes.
- The CLI supports one configured server at a time (no multi-server profile management in initial version).
- Dynamic autocompletion makes API calls on each Tab press; results are not cached across invocations.
- The browser login flow (`cli login`) is the default and recommended auth method for interactive use. PAT configuration (`cli configure --token`) is the alternative for non-interactive environments.
- The CLI opens the system default browser for the login flow. If the browser cannot be opened (e.g., headless environment), the CLI prints the login URL and instructs the user to open it manually or use PAT auth instead.
- The locale/language endpoint is excluded from CLI commands as it is a browser-specific preference.
- The auth endpoints (change-password, SSO initiation) are excluded from CLI commands as they are browser-only flows. The CLI uses the server's browser login flow (spec 012 FR-017 through FR-021) for its own authentication.

## Dependencies

- **Depends on**: Spec 012 (OpenAPI & Personal Access Tokens) â€” requires PAT auth and CLI browser login flow
