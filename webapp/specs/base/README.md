# Base Spec

This folder captures the stable baseline architecture and operating model of the starter repo.

It is not a feature spec for one in-progress change. Instead, it documents the current foundation
that new feature specs should build on.

## Contents

- `architecture.md` - system structure, major components, and data flow
- `runtime-and-ops.md` - local dev, Docker deployment, validation, and dependency safety rules
- `auth-and-rbac.md` - authentication modes, session rules, and access model
- `data-model.md` - core Prisma entities and relationships
- `api-surface.md` - route groups and backend contract overview
- `testing-and-quality.md` - testing layers, validation gates, and quality expectations

## Current Baseline

- Next.js 16 App Router frontend and API routes
- Prisma data layer
- PostgreSQL for local development, Docker, and production-style deployment
- Python worker skeleton managed with `uv`
- Better Auth with local login plus Azure SSO
- RBAC, user management, audit trail, and background jobs

## Intended Usage

- Read this folder before creating new product-specific specs.
- Treat it as the shared foundation for future work.
- Update it when the repo's underlying architecture materially changes.
- Prefer adding a focused new markdown file over turning one file into a giant catch-all spec.
- Preserve `TEMPLATE_VERSION.md` and `.template-origin.json` in downstream apps so template provenance stays visible.
- Refresh those files with `pnpm run template:stamp` after pulling upstream template changes into a downstream app.
- Those provenance files are shipped with the template on purpose, so copied repos still know their last recorded upstream baseline even without Git history.

## Upstream Workflow

This template is the upstream source for apps generated from it.

When you discover a generic bug or improvement in a downstream app:

1. Fix it in the downstream app.
2. Port the shared part of the fix back here as a focused change.
3. Add or update template tests for that behavior.
4. Propagate the same focused fix to other downstream apps.
5. Update `TEMPLATE_VERSION.md` and `.template-origin.json` in the downstream app after pulling in the upstream fix.

Use small commits and avoid mixing template fixes with product-specific changes. That keeps
backports manageable across multiple apps.
