/**
 * SandboxedHtmlFrame (spec 137) — agent HTML runs with an opaque origin and no
 * network, and only its own frame may resize it.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import {
  HTML_FRAME_HEIGHT_MESSAGE,
  HTML_FRAME_MAX_HEIGHT,
  SANDBOXED_HTML_CSP,
  SandboxedHtmlFrame,
  buildSandboxedDocument,
} from '@/components/common/sandboxed-html-frame';

describe('buildSandboxedDocument', () => {
  it('puts a network-blocking CSP and the height reporter ahead of the agent HTML', () => {
    const doc = buildSandboxedDocument('<html><body><h1>Hi</h1></body></html>');

    const cspAt = doc.indexOf(
      `<meta http-equiv="Content-Security-Policy" content="${SANDBOXED_HTML_CSP}">`
    );
    const htmlAt = doc.indexOf('<h1>Hi</h1>');
    expect(cspAt).toBeGreaterThan(-1);
    expect(cspAt).toBeLessThan(htmlAt);
    expect(doc).toContain(HTML_FRAME_HEIGHT_MESSAGE);
    expect(SANDBOXED_HTML_CSP).toContain("default-src 'none'");
    expect(SANDBOXED_HTML_CSP).toContain("form-action 'none'");
    expect(SANDBOXED_HTML_CSP).not.toMatch(/https?:/);
  });

  it('leaves the colour scheme to the page, so unstyled text stays readable in a dark app', () => {
    // A `color-scheme: dark` default turns unstyled text white on the frame's white page.
    expect(buildSandboxedDocument('<p>x</p>')).not.toContain('color-scheme');
  });
});

describe('SandboxedHtmlFrame', () => {
  function frame(): HTMLIFrameElement {
    return screen.getByTitle('Pricing card') as HTMLIFrameElement;
  }

  it('never shares the app origin', () => {
    render(<SandboxedHtmlFrame html="<p>x</p>" title="Pricing card" />);
    expect(frame().getAttribute('sandbox')).toBe('allow-scripts');
    expect(frame().getAttribute('srcdoc')).toContain('<p>x</p>');
    expect(frame().getAttribute('referrerpolicy')).toBe('no-referrer');
  });

  it('takes the height its own page reports, within bounds', () => {
    render(<SandboxedHtmlFrame html="<p>x</p>" title="Pricing card" />);
    const source = frame().contentWindow;

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: HTML_FRAME_HEIGHT_MESSAGE, height: 321 },
          source,
        })
      );
    });
    expect(frame().style.height).toBe('321px');

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: HTML_FRAME_HEIGHT_MESSAGE, height: 999_999 },
          source,
        })
      );
    });
    expect(frame().style.height).toBe(`${HTML_FRAME_MAX_HEIGHT}px`);
  });

  it('ignores height messages from anything but its own frame', () => {
    render(<SandboxedHtmlFrame html="<p>x</p>" title="Pricing card" />);
    const before = frame().style.height;

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: HTML_FRAME_HEIGHT_MESSAGE, height: 600 },
          source: window,
        })
      );
    });
    expect(frame().style.height).toBe(before);
  });

  it('fills its container when auto height is off', () => {
    render(<SandboxedHtmlFrame html="<p>x</p>" title="Pricing card" autoHeight={false} />);
    expect(frame().style.height).toBe('');
  });
});
