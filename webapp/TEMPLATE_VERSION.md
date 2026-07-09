# Template Version

- Template repo: `https://github.com/TKlerx/webapp-template.git`
- Default branch: `main`
- Recorded upstream template commit: `91c20e9d9ceac0f1233ab2b1d4a13a70952dde16`
- Short commit: `91c20e9`
- Recorded at: `2026-04-01`
- Version label: `main+011-route-refactor@91c20e9`

## Purpose

This file gives humans a quick way to see which upstream template revision this repository is recorded against.

For machine-readable tooling and downstream propagation, also see `.template-origin.json`.

Because commit hashes are self-referential, a repository cannot permanently store its own exact current commit hash inside the same commit without changing that hash. The practical pattern is to record the latest known upstream baseline and refresh it after pulling template updates.

## Downstream Usage

When a product app is created from this template, keep both `TEMPLATE_VERSION.md` and `.template-origin.json`.

Then run:

```powershell
pnpm run template:stamp
```

When the app later pulls in upstream template fixes:

1. Apply the upstream template change.
2. Run `pnpm run template:stamp`.
3. Commit the updated `.template-origin.json` and `TEMPLATE_VERSION.md`.

That gives each downstream app a visible and scriptable record of the template version it is based on.
