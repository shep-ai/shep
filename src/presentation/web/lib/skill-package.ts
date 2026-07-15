// Package derivation for skills.
//
// This module is intentionally free of Node built-ins so it can be bundled for
// the browser (client components + Storybook). Keep filesystem access in
// `skills.ts` (server-only) — never import Node APIs here.
//
// Skills advertise package membership in one of two ways:
//   1. A namespace prefix on the name, e.g. `shep-kit:plan` → package `shep-kit`.
//   2. A trailing `(package)` tag on the description, e.g. `... (gstack)` → `gstack`.
// Standalone skills (a bare name and no tag) belong to no package.

export const UNGROUPED_PACKAGE_LABEL = 'Ungrouped';

const PACKAGE_NAME_SEPARATOR = ':';
const PACKAGE_SUFFIX_PATTERN = /\(([a-z][a-z0-9-]*)\)\s*$/i;

export function derivePackage(name: string, description: string): string | null {
  const separatorIndex = name.indexOf(PACKAGE_NAME_SEPARATOR);
  if (separatorIndex > 0) {
    return name.slice(0, separatorIndex);
  }

  const suffixMatch = description.match(PACKAGE_SUFFIX_PATTERN);
  if (suffixMatch) {
    return suffixMatch[1];
  }

  return null;
}
