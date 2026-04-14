/**
 * Derive a clean, human-readable slug from an Application display name.
 *
 * Used when creating external artifacts (GitHub repository, Cloudflare
 * Pages project) so those names are based on what the user actually
 * called their app ("My Todo App" → "my-todo-app") rather than the
 * internal `slug` field which appends a random 6-char hex suffix for
 * local folder uniqueness.
 *
 * Examples:
 *   "My Todo App"          → "my-todo-app"
 *   "Landing Page Hero"    → "landing-page-hero"
 *   "Blog & Portfolio!!"   → "blog-portfolio"
 *   "  Spaces  "           → "spaces"
 *
 * The result is always safe to use as a GitHub repo name or Cloudflare
 * Pages project name (lowercase alphanumeric + hyphens, no leading or
 * trailing hyphens, no consecutive hyphens).
 */
export function cleanDeployName(displayName: string): string {
  return displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // non-alphanumeric runs → single hyphen
    .replace(/^-+|-+$/g, '') // strip leading / trailing hyphens
    .slice(0, 100); // Cloudflare hard-caps project names at 100 chars
}
