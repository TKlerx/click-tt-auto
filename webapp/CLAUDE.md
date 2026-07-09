# Business App Starter Development Guidelines

## Workflow First Step

- Read `CONTINUE.md` before starting implementation work.
- Treat `CONTINUE.md` as the current handoff state: recent changes, where work stopped, open risks, and what to do next.
- If project state materially changes, update `CONTINUE.md` and append to `CONTINUE_LOG.md`.

## Tech Stack

- TypeScript with Next.js 16 (App Router)
- BetterAuth for authentication (email/password + Azure AD SSO)
- Prisma 7 ORM with SQLite locally and PostgreSQL in Docker
- Tailwind CSS 4
- next-intl for internationalization (en, de, es, fr, pt)
- bcryptjs for password hashing

## Project Structure

```text
src/
  app/           # Next.js App Router pages and API routes
  components/    # React components (auth, providers, ui)
  lib/           # Core utilities (auth, db, rbac, base-path)
  i18n/          # Internationalization (messages, config)
prisma/          # Database schema and seeds
tests/           # Unit and E2E tests
```

## Commands

- `pnpm run dev` - Start dev server
- `pnpm run build` - Production build
- `pnpm test` - Run unit tests (vitest)
- `pnpm run test:e2e` - Run E2E tests (playwright)
- `pnpm run lint` - ESLint
- `pnpm run typecheck` - TypeScript check
- `pnpm run validate` - Run all checks
- `pnpm run continuity:update` - Refresh `CONTINUE.md` and `CONTINUE_LOG.md`
- `pnpm run prisma:generate` - Generate Prisma client
- `pnpm run prisma:migrate` - Run migrations
- `pnpm run prisma:seed` - Seed database

## Key Features

- Dark/light theme with per-user persistence
- Role-based access control (ADMIN, MARKETER_LEAD, MARKETER, REVIEWER)
- Custom base path support (reverse-proxy friendly)
- Azure AD SSO + local password auth
- i18n with 5 locales, cookie-based locale selection
- Responsive design (mobile-first with Tailwind breakpoints)

## Code Style

- TypeScript strict mode
- Next.js App Router conventions
- All UI text uses next-intl translation keys (no hardcoded strings in components)
- CSS variables for theming, Tailwind for layout
- Dark mode via `dark:` Tailwind variant and `[data-theme="dark"]` CSS
- Repository text files use UTF-8 encoding (UTF-8 with or without BOM)
