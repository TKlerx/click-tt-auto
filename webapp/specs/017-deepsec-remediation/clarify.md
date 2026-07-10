# Clarifications: DeepSec Remediation

**Feature**: `017-deepsec-remediation`
**Date**: 2026-06-01

## Decisions

- Use one remediation specification with two priorities instead of splitting Phase 2 into a separate spec.
- Execute Phase 1 first for HIGH and HIGH_BUG DeepSec findings, then execute Phase 2 task runs for MEDIUM and BUG findings.
- Treat test-only Playwright E2E credentials in `playwright.config.ts` as accepted risk after all production/runtime findings are fixed or revalidated.
- Preserve previously revalidated mock SSO and CLI browser-login fixes while implementing the remaining DeepSec remediation tasks.

## Scope Boundaries

- Production and shared-deployment runtime code is in scope for remediation.
- Test-only scaffolding is in scope for documentation and accepted-risk tracking when DeepSec reports it, but does not block production closure unless it creates a production/runtime exposure.
- DeepSec revalidation evidence must be captured in the spec evidence files before final closure.
