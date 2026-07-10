# Clarify: Auth Security Hardening

**Feature**: `010-auth-security-hardening`  
**Date**: 2026-04-01

## Resolved Decisions

- Rate limiting scope: per IP address only
- Rate limit threshold: 5 attempts
- Rate limit window and cooldown: 15 minutes
- Rate limit storage: in-memory per process
- Audit write failure behavior: log-and-continue

## Notes

- This clarification step resolved the main behavioral questions before research and planning.
- The follow-up analysis is recorded in `research.md`.
