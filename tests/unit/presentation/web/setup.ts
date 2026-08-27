import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Initialize web i18n so useTranslation('web') returns real English strings in tests
import '@/lib/i18n';

// Clean up after each test to prevent multiple elements from accumulating
afterEach(() => {
  cleanup();
});

// Mock localStorage for tests
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
};

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Mock ResizeObserver for Radix UI components (tooltips, popovers, etc.)
// and for any component that observes its own container (IDE file tree,
// xterm terminal, etc.).
//
// The constructor accepts (and ignores) the callback so the signature
// matches the real browser API — otherwise static analysers look at
// this polyfill's implicit zero-arg default constructor, see the
// production `new ResizeObserver(cb)` calls, and flag them as passing
// a superfluous argument. Matching the real API shape here keeps the
// code-quality bot happy without weakening test behaviour.
globalThis.ResizeObserver = class ResizeObserver {
  constructor(_callback: ResizeObserverCallback) {
    // Callback is intentionally stored nowhere — these tests don't
    // exercise real layout-change delivery, they just need
    // `new ResizeObserver(fn).observe(el)` to not throw.
  }
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
} as unknown as typeof globalThis.ResizeObserver;

// Polyfill EventSource for SSE-based hooks (chat runtime, deployment logs).
// jsdom does not implement the EventSource API, so any component that opens
// an SSE connection — e.g. the Chat tab content in feature-drawer-tabs —
// crashes with "EventSource is not defined" when a test activates it. This
// inert stub keeps such connections quiet; tests that need to drive SSE
// payloads install their own richer mock, which simply overrides this one.
class MockEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  close = vi.fn();
}
globalThis.EventSource = MockEventSource as unknown as typeof EventSource;

// Mock matchMedia for theme tests
Object.defineProperty(globalThis.window ?? globalThis, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
