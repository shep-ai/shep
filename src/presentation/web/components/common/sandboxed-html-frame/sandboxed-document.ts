/**
 * The document an agent-authored HTML page runs in (spec 137).
 *
 * Agent HTML is untrusted. It runs in an iframe with `sandbox="allow-scripts"`
 * and no `allow-same-origin`, so it has an opaque origin: no app cookies, no
 * app storage, no same-origin API calls. This module adds the two things the
 * sandbox attribute cannot:
 *
 * - a Content-Security-Policy that blocks every network request (fetch,
 *   images, fonts, forms), so a page cannot send anything anywhere. A CSP
 *   delivered this way can only be tightened by the page, never loosened;
 * - a few lines of script that report the page's height to the parent, so
 *   the frame can fit its content (as T3 Code's HtmlRenderFrame does).
 */

/** `type` of the message a page posts with its content height. */
export const HTML_FRAME_HEIGHT_MESSAGE = 'shep:html-frame:height';

/** Inline styles and scripts only; nothing is fetched. */
export const SANDBOXED_HTML_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  'media-src data: blob:',
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

const HEIGHT_REPORTER = `<script>(function(){var send=function(){parent.postMessage({type:${JSON.stringify(
  HTML_FRAME_HEIGHT_MESSAGE
)},height:Math.ceil(document.documentElement.scrollHeight)},'*')};addEventListener('load',send);if(typeof ResizeObserver==='function'){new ResizeObserver(send).observe(document.documentElement)}})();</script>`;

/** The agent's HTML with the CSP and the height reporter placed first. */
export function buildSandboxedDocument(html: string): string {
  return [
    '<!doctype html>',
    `<meta http-equiv="Content-Security-Policy" content="${SANDBOXED_HTML_CSP}">`,
    HEIGHT_REPORTER,
    html,
  ].join('\n');
}
