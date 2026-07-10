# Clarify: Shared Mailbox Notifications

**Feature**: `014-shared-mailbox-notifications`  
**Date**: 2026-04-19

## Resolved Decisions

- Mail provider strategy: start with a provider-neutral abstraction, but the first implementation and supported provider is Microsoft Graph only
- Authentication model: shared mailbox access uses application credentials, not delegated user sessions
- Initial slice scope: list mailbox messages, fetch a message by ID, and send mail from the shared mailbox before building notification workflows
- Configuration model: mailbox/provider settings remain server-side and environment-driven, not editable through the UI
- Inbound processing architecture: future mailbox polling will run in the existing separate worker process rather than inside web requests
- Delivery sequencing: durable outbound notifications come before admin controls and inbound message processing

## Notes

- This feature is clarified and analyzed/planned for incremental delivery.
- The Graph mail foundation is already implemented; the next required product step is outbound notification persistence and async delivery.
