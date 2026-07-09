# Clarifications: Teams Messaging Skeleton

## Session 2026-04-23

- Integration mechanism: Microsoft Graph API with application permissions (app identity), behind a thin `TeamsClient` abstraction.
- Inbound receive mode: polling via background jobs (no webhook endpoint in skeleton scope).
- Outbound retries: fixed-interval retries up to 3 attempts, then permanent failure surfaced in admin status.
- Admin UI location: Settings -> Integrations -> Teams.
- Credential source: environment variables, reusing the existing Azure AD app registration setup.

## Session 2026-04-27

- `ChannelMessage.Send` is delegated-only in Graph permissions.
- Outbound channel sends should use admin-triggered delegated OAuth consent and send in consenting user context.
- Inbound polling remains application-permission based and independent from delegated send consent.
