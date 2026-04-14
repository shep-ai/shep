/**
 * Shep default palette + spacing + radii.
 *
 * The values here match the CSS variables defined in `src/index.css`.
 * Import these constants when you need a color in JS (e.g. for an
 * inline gradient or a chart library) instead of picking one yourself.
 *
 * Prefer Tailwind semantic classes (`bg-background`, `bg-card`,
 * `text-foreground`, `bg-primary`, `border-border`) for styling —
 * these constants are for the rare cases where a class won't do.
 */

export const palette = {
  background: 'hsl(222 47% 6%)', // slate-950
  card: 'hsl(222 47% 10%)', // slate-900
  border: 'hsl(222 47% 16%)', // slate-800
  muted: 'hsl(218 20% 60%)', // slate-400
  foreground: 'hsl(210 40% 98%)', // near-white

  primary: 'hsl(262 83% 58%)', // violet-500
  primaryForeground: 'hsl(210 40% 98%)',
  accent: 'hsl(330 81% 60%)', // pink-500
  success: 'hsl(142 71% 45%)', // emerald-500 — online dots
  warning: 'hsl(38 92% 50%)', // amber-500
  destructive: 'hsl(0 84% 60%)', // red-500
} as const;

/** Gradient presets used by Avatar fallbacks. Indexed by hash(seed) % 6. */
export const avatarGradients = [
  'from-violet-500 to-pink-500',
  'from-cyan-500 to-blue-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
  'from-fuchsia-500 to-purple-500',
  'from-rose-500 to-red-500',
] as const;

/** Spacing scale in rems — mirrors Tailwind's default scale. */
export const spacing = {
  xs: '0.25rem',
  sm: '0.5rem',
  md: '1rem',
  lg: '1.5rem',
  xl: '2rem',
} as const;

/** Radii in rems. */
export const radii = {
  sm: '0.375rem',
  md: '0.5rem',
  lg: '0.75rem',
  full: '9999px',
} as const;
