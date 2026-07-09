# Research: Shared Mailbox Notifications

**Date**: 2026-04-19 | **Spec**: [spec.md](./spec.md)

## Decision 1: Start with a provider-neutral mail client

- **Decision**: Define a small `MailClient` interface for mailbox listing, message fetch, and send operations, then place provider selection behind `createMailClient()`.
- **Why**: The product direction calls for a mail abstraction layer, and the first step is Graph-only. A neutral interface lets the app ship the Graph slice now without coupling future notification code to provider-specific APIs.
- **Alternatives considered**:
  - Call Microsoft Graph directly from each feature: rejected because it would scatter auth, payload mapping, and mailbox handling across the app.
  - Build a large notification framework first: rejected because it delays the immediate shared-mailbox read/send capability the user requested.

## Decision 2: Use Microsoft Graph client-credentials flow for Phase 1

- **Decision**: Authenticate using tenant/client ID/client secret and request `https://graph.microsoft.com/.default`.
- **Why**: The feature specifically targets shared mailbox access via Graph API and must not depend on an interactive per-user session.
- **Alternatives considered**:
  - Delegated user auth: rejected because it does not match service-to-service shared mailbox access.
  - Introducing an SDK dependency first: rejected because the required calls are small and direct HTTP keeps the initial surface area modest.

## Decision 3: Keep Phase 1 configuration server-side and environment-driven

- **Decision**: Read provider and default mailbox configuration from environment variables, with Graph credentials coming from the existing Graph/Azure config.
- **Why**: The business spec explicitly keeps mailbox connection settings out of the UI, and environment config matches the rest of the starter's operational model.
- **Alternatives considered**:
  - Editable admin UI settings: rejected for the first slice because secrets would still need a secure backend store and operational validation path.

## Decision 4: Defer persistence and queueing until notification workflows exist

- **Decision**: Phase 1 only provides live mailbox access and send capabilities; it does not create notification tables, retry workers, or audit history yet.
- **Why**: The current implementation goal is a reusable mail access layer, not full event delivery. This keeps the first slice small and immediately useful.
- **Alternatives considered**:
  - Building notification persistence in the same slice: rejected because it expands the scope into multiple product stories at once.

## Decision 5: Cover Graph behavior with focused unit tests before wiring product flows

- **Decision**: Validate provider selection, mailbox requirement behavior, token reuse, list/get/send requests, and Graph error propagation with unit tests.
- **Why**: The main current risk is correctness of the mail abstraction itself. That risk is best reduced with direct tests around the Graph transport and provider resolution.
- **Alternatives considered**:
  - Waiting for higher-level integration tests: rejected because failures would be harder to isolate and slower to debug.
