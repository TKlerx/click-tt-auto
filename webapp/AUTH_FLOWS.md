# Authentication Flows

## Overview

This starter uses Better Auth with Prisma-backed storage and bcryptjs password hashing.
It supports two login methods:

- local email/password
- Azure AD / Microsoft Entra SSO

Self-service signup is disabled. Users are either created by admins or provisioned on first SSO login.

## Key Files

| File                                           | Purpose                                                    |
| ---------------------------------------------- | ---------------------------------------------------------- |
| `src/lib/better-auth.ts`                       | Better Auth configuration                                  |
| `src/lib/auth.ts`                              | Session lookup and password helper functions               |
| `src/lib/azure-auth.ts`                        | Azure AD configuration helpers                             |
| `src/lib/rbac.ts`                              | Role-based access control helpers                          |
| `src/lib/route-auth.ts`                        | API route authorization helpers                            |
| `src/app/api/auth/login/route.ts`              | Email/password login endpoint                              |
| `src/app/api/auth/logout/route.ts`             | Logout endpoint                                            |
| `src/app/api/auth/change-password/route.ts`    | Password change endpoint                                   |
| `src/app/api/auth/session/route.ts`            | Session info endpoint                                      |
| `src/app/api/auth/sso/azure/route.ts`          | Azure SSO initiation and test-only mock path               |
| `src/app/api/auth/sso/azure/callback/route.ts` | Azure SSO callback handler                                 |
| `src/app/(dashboard)/layout.tsx`               | Dashboard layout with auth enforcement                     |
| `prisma/schema.prisma`                         | SQLite schema for local development                        |
| `prisma/schema.postgres.prisma`                | PostgreSQL schema for Docker / production-style deployment |

## 1. Email/Password Login

```text
User submits email + password
  -> POST /api/auth/login
    -> Look up user by email
    -> Reject missing or INACTIVE users
    -> Better Auth signInEmail()
    -> Update authMethod to BOTH if previously SSO-only
    -> Return redirect:
       mustChangePassword=true  -> /change-password
       mustChangePassword=false -> /dashboard
```

Component:

- `src/components/auth/LoginForm.tsx`

## 2. Azure AD SSO Login

```text
User clicks "Sign in with Azure AD"
  -> GET/POST /api/auth/sso/azure
    -> Verify Azure config is real
    -> Better Auth signInSocial({ provider: "microsoft" })
    -> Redirect to Azure AD login

Azure returns authorization code
  -> GET /api/auth/sso/azure/callback
    -> Redirect to /api/auth/callback/microsoft
    -> Better Auth exchanges code for tokens
    -> Provision or update the user
    -> Create session
    -> Redirect to /dashboard or /pending
```

The route also contains a mock SSO branch for E2E tests. It is only enabled when `E2E_MOCK_SSO === "1"`.

## 3. Session Management

The starter uses Better Auth sessions only.

- sessions are stored in the Prisma `Session` model
- `getSessionUser()` resolves the Better Auth session and refreshes the current user from Prisma
- INACTIVE users are treated as unauthenticated

Cookie attributes are scoped through Better Auth configuration so reverse-proxy base paths continue to work.

## 4. Route Protection

### Dashboard Routes

All routes under `src/app/(dashboard)/` call `requireSession()` in the shared layout:

- unauthenticated users are redirected to `/login`
- `PENDING_APPROVAL` users are redirected to `/pending`
- authenticated `ACTIVE` users can proceed

### API Routes

`src/lib/route-auth.ts` provides:

- `requireApiUser()`
- `requireApiUserWithRoles(roles)`
- `authorizeRoute(request, options)`

## 5. Role-Based Access Control

```text
PLATFORM_ADMIN
SCOPE_ADMIN
SCOPE_USER
```

Key expectations:

- admin pages enforce role checks on the server
- admin APIs enforce role checks in handlers
- navigation visibility is not an authorization mechanism
- scope access is checked against `UserScopeAssignment`

## 6. Password Management

Hashing:

- bcryptjs
- 12 salt rounds

Complexity rules:

- minimum 8 characters
- at least one lowercase letter
- at least one uppercase letter
- at least one digit

Storage model:

- local credential hashes live on the Better Auth `Account` row
- the credential account uses `providerId = "credential"`
- `User` no longer stores a separate password hash

Change password flow:

```text
POST /api/auth/change-password
  -> Verify current password against credential Account.password
  -> Validate new password complexity
  -> Update credential Account.password
  -> Set mustChangePassword = false
  -> Revoke other active sessions
```

## 7. User Lifecycle

### Admin-Created Users

```text
Admin POST /api/users { email, name, role, temporaryPassword }
  -> Requires PLATFORM_ADMIN
  -> Validates uniqueness, role, and password complexity
  -> Creates user with:
     status=ACTIVE
     authMethod=LOCAL
     mustChangePassword=true
  -> Creates credential Account record
```

### SSO-Provisioned Users

```text
First Azure AD login
  -> Create or update user
  -> New users start as:
     status=PENDING_APPROVAL
     authMethod=SSO
     mustChangePassword=false
```

### Approval And Deactivation

- `PATCH /api/users/[id]/approve` promotes `PENDING_APPROVAL` to `ACTIVE`
- `PATCH /api/users/[id]/deactivate` marks a user `INACTIVE`
- the last platform admin cannot be deactivated

## 8. Sign-Out

```text
POST /api/auth/logout
  -> Better Auth signOut()
  -> Clear auth cookies
  -> Redirect to /login
```

## 9. Initial Setup / Seeding

`prisma/seed.ts` creates the first admin user from env vars:

- `INITIAL_ADMIN_EMAIL`
- `INITIAL_ADMIN_PASSWORD`

Seeded user defaults:

- role `PLATFORM_ADMIN`
- status `ACTIVE`
- auth method `LOCAL`
- `mustChangePassword = true`

## 10. API Endpoint Summary

| Method   | Path                            | Auth           | Purpose                      |
| -------- | ------------------------------- | -------------- | ---------------------------- |
| POST     | `/api/auth/login`               | Public         | Email/password login         |
| POST     | `/api/auth/logout`              | Authenticated  | Sign out                     |
| POST     | `/api/auth/change-password`     | Authenticated  | Change password              |
| GET      | `/api/auth/session`             | Authenticated  | Get session user info        |
| GET/POST | `/api/auth/sso/azure`           | Public         | Initiate Azure SSO           |
| GET/POST | `/api/auth/sso/azure/callback`  | Public         | Azure callback shim          |
| GET/POST | `/api/auth/callback/[provider]` | Public         | Better Auth OAuth callback   |
| GET      | `/api/users`                    | PLATFORM_ADMIN | List users                   |
| POST     | `/api/users`                    | PLATFORM_ADMIN | Create user                  |
| PATCH    | `/api/users/[id]/approve`       | PLATFORM_ADMIN | Approve pending user         |
| PATCH    | `/api/users/[id]/deactivate`    | PLATFORM_ADMIN | Deactivate user              |
| PATCH    | `/api/users/[id]/reactivate`    | PLATFORM_ADMIN | Reactivate inactive user     |
| PATCH    | `/api/users/[id]/role`          | PLATFORM_ADMIN | Change user role             |
| PATCH    | `/api/users/[id]/theme`         | Authenticated  | Update user theme preference |

## Environment Variables

```env
BETTERAUTH_SECRET=<32+ character secret>
AUTH_BASE_URL=http://localhost:3270
AZURE_AD_CLIENT_ID=<azure app registration client id>
AZURE_AD_CLIENT_SECRET=<azure app registration secret>
AZURE_AD_TENANT_ID=<azure tenant id>
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_PASSWORD=ChangeMe123!
```

## Historical Review Findings

The original Claude auth review that inspired these follow-up fixes is still useful as historical context, but it is no longer a perfect description of the current starter.

The most relevant findings that are now addressed in this starter are:

- Better Auth is the only session layer
- password hashing is consolidated onto credential `Account` rows
- password change revokes other active sessions
- production now fails if Better Auth would use the development fallback secret

The remaining review notes should be read as past audit context, not as the current source of truth for this repo.
