# API Contract Invariants: API Route Refactor

**Feature**: 011-route-refactor | **Date**: 2026-04-01

This feature is an implementation refactor only. No public API endpoint is added, removed, renamed, or behaviorally standardized.

## Global Invariants

- Existing status codes remain unchanged.
- Existing JSON payload shapes remain unchanged.
- Existing error-message text remains unchanged.
- Existing authorization outcomes remain unchanged.
- Existing audit side effects remain unchanged unless they are already part of the current route behavior.

## Route Families In Scope

### Auth Routes

| Endpoint                         | Contract Requirement                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/change-password` | Preserve validation errors, local-account restriction, password-update transaction, and success payload |
| `POST /api/auth/logout`          | Preserve redirect target and cookie clearing behavior                                                   |
| `GET /api/auth/session`          | Preserve current authenticated-session response contract                                                |

### User/Admin Routes

| Endpoint                           | Contract Requirement                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `GET /api/users`                   | Preserve filter semantics, status validation, ordering, and response shape                             |
| `POST /api/users`                  | Preserve required fields, role/password validation, duplicate-email behavior, and created-user payload |
| `PATCH /api/users/[id]/approve`    | Preserve pending-approval transition and response shape                                                |
| `PATCH /api/users/[id]/deactivate` | Preserve last-admin protection and response shape                                                      |
| `PATCH /api/users/[id]/reactivate` | Preserve inactive-only reactivation rule and response shape                                            |
| `PATCH /api/users/[id]/role`       | Preserve role validation, last-admin protection, and response shape                                    |
| `PATCH /api/users/[id]/theme`      | Preserve self-only authorization and response shape                                                    |

### Audit And Ops Routes

| Endpoint                    | Contract Requirement                                                              |
| --------------------------- | --------------------------------------------------------------------------------- |
| `GET /api/audit`            | Preserve query parameters, enum validation, pagination inputs, and response shape |
| `GET /api/audit/export`     | Preserve `csv` and `pdf` export behavior, headers, and unsupported-format error   |
| `GET /api/background-jobs`  | Preserve admin/global visibility and non-admin self-filtering                     |
| `POST /api/background-jobs` | Preserve `jobType` validation, payload serialization, and created-job response    |

## Non-Goals

- No error response normalization
- No new endpoint versioning
- No schema migration required for the current starter
- No login, SSO, locale, or health route rewrites in this feature
- No new document-version or AI endpoints introduced solely for this refactor
