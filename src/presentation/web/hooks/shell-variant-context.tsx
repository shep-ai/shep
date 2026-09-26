'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { DEFAULT_SHELL_VARIANT, type ShellVariant } from '@/lib/shell-variant';

const ShellVariantContext = createContext<ShellVariant>(DEFAULT_SHELL_VARIANT);

interface ShellVariantProviderProps {
  children: ReactNode;
  variant: ShellVariant;
}

/**
 * Exposes the server-resolved shell variant (see `lib/shell-variant.ts`) to
 * client components, so a surface can hide actions whose routes the current
 * shell does not serve.
 */
export function ShellVariantProvider({ children, variant }: ShellVariantProviderProps) {
  return <ShellVariantContext.Provider value={variant}>{children}</ShellVariantContext.Provider>;
}

export function useShellVariant(): ShellVariant {
  return useContext(ShellVariantContext);
}

/**
 * Whether this shell can start Features (Control Center, `/create`). The
 * apps-only shell's route guard redirects those routes, so links to them must
 * not be offered there.
 */
export function useCanStartFeatures(): boolean {
  return useShellVariant() !== 'apps-only';
}
