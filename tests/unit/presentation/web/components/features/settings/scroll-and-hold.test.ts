import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SETTLE_MS, scrollAndHold } from '@/components/features/settings/scroll-and-hold';

/** A ResizeObserver the test triggers by hand, to stand in for content loading in. */
class FakeResizeObserver {
  static last: FakeResizeObserver | undefined;
  observed: Element[] = [];
  disconnected = false;
  constructor(private readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.last = this;
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  unobserve = vi.fn();
  disconnect() {
    this.disconnected = true;
  }
  /** Content inside the observed element changed size. */
  resize() {
    if (!this.disconnected) this.callback([], this as unknown as ResizeObserver);
  }
}

function section() {
  const list = document.createElement('div');
  const target = document.createElement('div');
  list.append(target);
  document.body.append(list);
  target.scrollIntoView = vi.fn();
  return { list, target };
}

describe('scrollAndHold', () => {
  const real = globalThis.ResizeObserver;

  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.ResizeObserver = real;
    document.body.innerHTML = '';
  });

  it('jumps to the section at once', () => {
    const { target } = section();
    scrollAndHold(target);
    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'instant', block: 'start' });
  });

  it('keeps the section in view while content around it is still loading', () => {
    const { list, target } = section();
    scrollAndHold(target);
    expect(FakeResizeObserver.last?.observed).toEqual([list]);

    FakeResizeObserver.last?.resize();
    expect(target.scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it('lets go once the page has settled', () => {
    const { target } = section();
    scrollAndHold(target);
    vi.advanceTimersByTime(SETTLE_MS);

    FakeResizeObserver.last?.resize();
    expect(target.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(FakeResizeObserver.last?.disconnected).toBe(true);
  });

  it.each(['wheel', 'touchmove', 'keydown', 'pointerdown'])(
    'lets go as soon as the person moves the page themselves (%s)',
    (event) => {
      const { target } = section();
      scrollAndHold(target);
      window.dispatchEvent(new Event(event));

      FakeResizeObserver.last?.resize();
      expect(target.scrollIntoView).toHaveBeenCalledTimes(1);
    }
  );

  it('can be let go early, as when another section is chosen', () => {
    const { target } = section();
    const release = scrollAndHold(target);
    release();

    FakeResizeObserver.last?.resize();
    expect(target.scrollIntoView).toHaveBeenCalledTimes(1);
  });
});
