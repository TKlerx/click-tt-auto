# Contract: Ops Health Dashboard

## Admin Page

**Route**: `/admin/ops`

**Audience**: Platform administrators only.

**Behavior**:

- Renders inside the existing dashboard shell and navigation.
- Shows environment/build metadata.
- Shows overall status and individual health areas.
- Shows a timestamp for the current snapshot.
- Offers a manual refresh action that loads a new snapshot.
- Offers a copy action for the non-secret diagnostic summary.
- Redirects or denies access for non-admin users using the existing admin-page pattern.

## Snapshot API

**Route**: `/api/admin/ops-health`

**Method**: `GET`

**Access**: Platform administrators only.

**Response: 200**

```json
{
  "capturedAt": "2026-06-11T15:24:00.000Z",
  "overallStatus": "healthy",
  "environment": {
    "environment": "staging",
    "version": "staging-42",
    "revision": "abcdef123456",
    "buildId": "123.2",
    "builtAt": "2026-06-11T12:00:00.000Z"
  },
  "checks": [
    {
      "key": "runtime",
      "status": "healthy",
      "summary": "Runtime is responding",
      "checkedAt": "2026-06-11T15:24:00.000Z"
    },
    {
      "key": "database",
      "status": "healthy",
      "summary": "Database connectivity check passed",
      "checkedAt": "2026-06-11T15:24:00.000Z"
    },
    {
      "key": "configuration",
      "status": "healthy",
      "summary": "Required runtime configuration is present",
      "checkedAt": "2026-06-11T15:24:00.000Z"
    },
    {
      "key": "worker",
      "status": "unknown",
      "summary": "No recent worker evidence is available"
    },
    {
      "key": "deploySmoke",
      "status": "unavailable",
      "summary": "No recent deployment smoke result is available"
    }
  ],
  "diagnosticSummary": {
    "generatedAt": "2026-06-11T15:24:00.000Z",
    "text": "Environment: staging\nVersion: staging-42\nRevision: abcdef123456\nBuild ID: 123.2\nOverall: healthy\nruntime: healthy\ndatabase: healthy\nconfiguration: healthy\nworker: unknown\ndeploySmoke: unavailable"
  }
}
```

**Response: 401/403**

Uses the existing unauthorized response/redirect behavior for API routes.

**Failure behavior**:

- A degraded check should normally return `200` with `overallStatus: "degraded"` so the page can render available diagnostics.
- Reserve `5xx` for failures that prevent assembling any safe snapshot.
- Response bodies must not include raw secrets or full configuration values.

## Navigation Contract

Add an admin-only navigation item:

- Label key: `nav.opsHealth`
- Target: `/admin/ops`
- Icon: use an existing lucide status/heartbeat/activity-style icon

## Internationalization Contract

Add translation keys for all visible labels, statuses, summaries, button text, and copy feedback in:

- `src/i18n/messages/en.json`
- `src/i18n/messages/de.json`
- `src/i18n/messages/es.json`
- `src/i18n/messages/fr.json`
- `src/i18n/messages/pt.json`

No hardcoded user-facing strings are allowed in page/components.
