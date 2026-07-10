# Clarify: OpenAPI Specification & Personal Access Tokens

**Feature**: `012-openapi-and-pat`  
**Date**: 2026-04-09

## Resolved Decisions

- Token format: Prefixed opaque tokens (`<PREFIX>_<random>`), prefix configurable via `PAT_TOKEN_PREFIX` env var
- Token hashing: SHA-256 (not bcrypt — tokens have high entropy, brute-force infeasible)
- Revoked/expired token handling: Auto-hide in UI after 90 days with "show all" toggle, never auto-delete from DB
- PAT management UI location: Under user's profile/account settings page, admin view in admin panel
- API docs access: Any authenticated user regardless of role (not public, not role-restricted)
- CLI browser login CSRF protection: CLI generates random `state` parameter, validates on callback (OAuth2 pattern)
- Token lifecycle: Three distinct operations — revoke (disable, keep visible), delete (permanent removal), renew (new secret, same entry)
- PAT expiration: User-chosen from 7d/30d/60d/90d/180d/1y, default 90d, max 1 year
- CLI login token expiration: Default 30 days, separate from PAT default
- OpenAPI approach: Hand-maintained YAML, not auto-generated (small API surface ~18 endpoints)
