import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ShellVariantProvider, useCanStartFeatures } from '@/hooks/shell-variant-context';

function wrapper(variant: 'full' | 'apps-only') {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <ShellVariantProvider variant={variant}>{children}</ShellVariantProvider>;
  };
}

describe('useCanStartFeatures', () => {
  it('is true in the full shell', () => {
    const { result } = renderHook(() => useCanStartFeatures(), { wrapper: wrapper('full') });
    expect(result.current).toBe(true);
  });

  it('is false in the apps-only shell, whose route guard blocks Control Center', () => {
    const { result } = renderHook(() => useCanStartFeatures(), { wrapper: wrapper('apps-only') });
    expect(result.current).toBe(false);
  });

  it('defaults to the full shell outside a provider (Storybook, tests)', () => {
    const { result } = renderHook(() => useCanStartFeatures());
    expect(result.current).toBe(true);
  });
});
