# Shep template cheat sheet — read this BEFORE writing any component

This project was scaffolded with `bunx shadcn init --preset b0 --template vite`
and then Shep overlaid a set of pre-built building blocks you MUST use instead of
re-inventing them. The instructions below are NOT optional — rewriting anything in
this list wastes time and breaks the visual consistency the user expects.

## Where things live

```
src/
├── components/
│   ├── ui/         ← shadcn primitives (Button, Card, Dialog, Input, …)
│   ├── common/     ← Shep pre-built pieces — USE THESE, don't rewrite
│   └── features/   ← empty on purpose — your app-specific components go here
├── lib/
│   ├── theme.ts    ← palette + spacing + radii constants
│   ├── format.ts   ← date/currency/number formatting helpers
│   ├── mock.ts     ← deterministic sample-data generators
│   └── utils.ts    ← `cn()` from shadcn
├── types/
│   └── common.ts   ← shared TS types (User, Id, Url, Timestamp, …)
├── hooks/          ← empty, for your custom hooks
└── data/           ← empty, for mock datasets if you need them
```

## Pre-built `common/` components

Import from `@/components/common/<name>`. Never rewrite these.

| Component         | Purpose                                                              |
| ----------------- | -------------------------------------------------------------------- |
| `Avatar`          | Gradient-initial fallback, optional image, size variants, online dot |
| `StatusDot`       | online/offline/away/busy indicator                                   |
| `Badge`           | Notification count + dot variants                                    |
| `EmptyState`      | Icon + title + description + optional CTA — use on empty screens     |
| `LoadingSpinner`  | Inline or full-page loading indicator                                |
| `ErrorBoundary`   | React error boundary with fallback UI                                |
| `BottomNav`       | Mobile bottom navigation bar — configurable items                    |
| `TopBar`          | Screen header with back / title / action slots                       |
| `IconButton`      | Round icon-only button with hover + active states                    |
| `SectionHeader`   | `<h2>` + optional action for grouping content                        |

## The palette (NON-NEGOTIABLE)

Import the palette from `@/lib/theme.ts`. The defaults are already in
`src/index.css` — you should rarely need to hand-write color classes:

- Background: slate-950 (`bg-background`)
- Card surface: slate-900 (`bg-card`)
- Primary action: violet-500 (`bg-primary`)
- Accent: pink-500
- Online dot: emerald-500
- Muted text: slate-400
- Border: slate-800

Dark mode is the only mode. Do not add a light-mode toggle unless the user
explicitly asks for one.

## Helpers you already have

- `formatRelativeTime(date)` — "2m ago", "3h ago", "yesterday", "Mar 14"
- `formatCurrency(n, currency?)` — "$29.00"
- `formatCompactNumber(n)` — "1.2k", "3.4M"
- `pickAvatar(seed)` — deterministic gradient (6 options) from a string seed
- `pickName(seed)` — deterministic realistic name
- `pickTimestamp(offsetMinutes)` — Date N minutes ago
- `pickPrice(min, max, seed)` — deterministic integer price
- `pickParagraph(seed)` — two-sentence realistic paragraph (NOT lorem ipsum)

## Hard rules

1. **Never** re-implement Avatar, StatusDot, Badge, EmptyState, BottomNav,
   TopBar, IconButton, SectionHeader, LoadingSpinner, ErrorBoundary.
2. **Never** pick a new color palette — `src/index.css` already configures dark
   mode + shadcn CSS variables. Use Tailwind's semantic names (`bg-background`,
   `bg-card`, `text-foreground`, `bg-primary`, `border-border`) instead of raw
   `slate-950` / `violet-500` etc. when possible.
3. **Never** write lorem ipsum. Use `pickName`, `pickParagraph`, `pickPrice`.
4. **Never** hand-format timestamps — use `formatRelativeTime`.
5. **Every** screen needs an `EmptyState` for the "no data yet" case.
6. **Every** tappable icon uses `IconButton`, not a raw `<button>`.
