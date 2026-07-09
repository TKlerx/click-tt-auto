# Theme Design

This template uses a deliberately quiet, token-based light/dark theme. The goal is a simple operational UI: readable panels, restrained contrast, and no decorative gradients or heavy visual effects.

## Core Approach

Theme colors live in `src/app/globals.css` as CSS custom properties:

- `:root` defines the light theme.
- `[data-theme="dark"]` overrides only the same tokens for dark mode.
- Components should use the tokens instead of hardcoded theme colors.

Important tokens:

- `--background`: full page background
- `--foreground`: primary text
- `--panel`: main surface/card/panel background
- `--panel-foreground`: text on panel surfaces
- `--accent`: primary action/accent color
- `--accent-foreground`: text on accent surfaces
- `--muted`: quiet borders and disabled surfaces
- `--muted-foreground`: secondary text
- `--accent-soft`: subtle selected/active backgrounds
- `--border`, `--input`, `--ring`: form and focus infrastructure

The palette intentionally uses a muted green accent instead of a blue/purple SaaS palette:

```css
:root {
  --background: #f7f8f5;
  --foreground: #17201b;
  --panel: #ffffff;
  --accent: #2f6f4e;
}

[data-theme="dark"] {
  --background: #101411;
  --foreground: #eef2eb;
  --panel: #171d19;
  --accent: #7ab18d;
}
```

## Theme Activation

Dark mode is selected by setting `data-theme="dark"` on the document element.

`src/components/providers/ThemeProvider.tsx` owns this:

```ts
useEffect(() => {
  document.documentElement.dataset.theme = theme.toLowerCase();
}, [theme]);
```

Tailwind is configured in `tailwind.config.ts` to use that selector:

```ts
darkMode: ["selector", "[data-theme='dark']"];
```

This keeps CSS variable styling and Tailwind `dark:` variants aligned.

## User Preference

`src/components/ui/ThemeToggle.tsx`:

- reads the current theme from `ThemeProvider`
- optimistically switches the UI
- persists the preference through `PATCH /api/users/:id/theme`
- rolls back and shows a toast if persistence fails

The stored enum is `LIGHT | DARK`.

## Component Guidelines

When building new UI, prefer these patterns:

- page background: `bg-[var(--background)]`
- panel/card background: `bg-[var(--panel)]`
- main text: inherited `var(--foreground)`
- secondary text: `text-[var(--muted-foreground)]`
- borders: `border-black/10 dark:border-white/10` or `border-[var(--border)]`
- primary action: `bg-[var(--accent)] text-[var(--accent-foreground)]`
- subtle selected state: `bg-[var(--accent-soft)] text-[var(--accent-soft-foreground)]`

Avoid:

- one-off dark colors inside components
- decorative gradient backgrounds
- large shadows as the main depth mechanism
- theme-specific component forks

## Design Intent

The dark mode should feel calm rather than flashy:

- near-black green-gray page background
- slightly lifted panel surfaces
- muted secondary text
- green accent used sparingly for action and focus
- clear contrast without neon colors

This makes dashboards and admin tools comfortable for long sessions while staying visually minimal.
