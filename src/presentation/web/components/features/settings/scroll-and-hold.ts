/**
 * Jumps to a settings section and keeps it in view while the page around it is still loading.
 *
 * Sections above the destination fill in asynchronously (usage metrics, integrations, model
 * catalogs). A plain jump lands correctly and is then pushed out of view when one of them grows,
 * so choosing "Database" could leave you looking at "Usage metrics". This re-aligns the section
 * whenever the section list changes size, until the page settles or the person scrolls.
 */

/** How long the destination is held in place after a jump. */
export const SETTLE_MS = 1500;

const ALIGN: ScrollIntoViewOptions = { behavior: 'instant', block: 'start' };

/** Anything the person does to move the page ends the hold at once. */
const PERSON_MOVES = ['wheel', 'touchmove', 'keydown', 'pointerdown'] as const;

/** Scrolls `target` to the top of the view and holds it there; returns a function to let go. */
export function scrollAndHold(target: HTMLElement, settleMs = SETTLE_MS): () => void {
  const align = () => target.scrollIntoView(ALIGN);
  align();

  const observer = new ResizeObserver(align);
  observer.observe(target.parentElement ?? target);

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    observer.disconnect();
    window.clearTimeout(timer);
    for (const event of PERSON_MOVES) window.removeEventListener(event, release, true);
  };
  const timer = window.setTimeout(release, settleMs);
  for (const event of PERSON_MOVES) {
    window.addEventListener(event, release, { capture: true, passive: true });
  }
  return release;
}
