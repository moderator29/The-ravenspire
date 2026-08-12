"use client";

import { useEffect } from "react";

/* Finishes the job `aria-modal` starts, once, for every dialog in the product.
 *
 * Base UI's Dialog marks the rest of the document `aria-hidden="true"` while a
 * modal is open, which is correct and is what makes the background silent to a
 * screen reader. It does not also mark it `inert`, and `aria-hidden` has no
 * effect on the tab order, so the background stayed reachable by keyboard.
 *
 * Measured on a Ceremony over the signed out shell at 1440, recording the
 * identity of `document.activeElement` after each Tab rather than its text,
 * which matters because the first two reads are misleading: press 3 lands on
 * Base UI's own 1x1 focus guard and press 4 rests on `body` for a frame, and
 * counting either as an escape reports a leak that is not there. Press 5
 * onwards is a real leak. Focus cycled correctly inside the dialog twice, then
 * left for good:
 *
 *   0 BUTTON  Secondary          inside
 *   1 BUTTON  Primary            inside
 *   2 BUTTON  Secondary          inside
 *   3 SPAN    1x1 focus guard    (not a leak)
 *   4 BODY                       (not a leak)
 *   5 A       THE RAVENSPIRE     outside
 *   6 A       Sign in            outside
 *   7 A       The Ravenry        outside
 *   ... and on down the side nav, never returning
 *
 * `aria-modal="true"` is a promise that the rest of the page is inert. Making
 * that promise while the page is fully tabbable is worse than not making it,
 * because a screen reader stops announcing the background it is still sending
 * you into.
 *
 * This is not a Ceremony problem. The Modal primitive leaked identically in
 * the same build, which is expected: both are the same Base UI Dialog, and
 * that is precisely why the fix belongs here rather than in either component.
 * Mounted once in the shell, it covers Modal, ConfirmDialog, Sheet, Ceremony
 * and every dialog not yet written.
 *
 * Mirroring rather than deciding. This never chooses what to hide; it only
 * copies a decision Base UI has already made and expressed in the DOM, so
 * there is no second source of truth to drift. Re-measured with it in place:
 * zero escapes in twelve presses, the cycle containing only the dialog's own
 * two controls. */

const HIDDEN = "aria-hidden";
const INERT = "inert";
/* Marks the ones we added, so a background that was already inert for its own
   reasons is never un-inerted by us on the way out. */
const OURS = "data-inert-by-shell";

function sync() {
  for (const el of Array.from(document.body.children)) {
    if (!(el instanceof HTMLElement)) continue;
    const hidden = el.getAttribute(HIDDEN) === "true";
    if (hidden && !el.hasAttribute(INERT)) {
      el.setAttribute(INERT, "");
      el.setAttribute(OURS, "");
    } else if (!hidden && el.hasAttribute(OURS)) {
      el.removeAttribute(INERT);
      el.removeAttribute(OURS);
    }
  }
}

export function InertBackground() {
  useEffect(() => {
    sync();
    /* `childList` because the portal and its aria-hidden siblings are added and
       removed as dialogs open and close, and `attributes` because Base UI flips
       `aria-hidden` in place on the elements that stay. */
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      childList: true,
      subtree: false,
      attributes: true,
      attributeFilter: [HIDDEN],
    });
    return () => {
      observer.disconnect();
      for (const el of Array.from(document.body.children)) {
        if (el instanceof HTMLElement && el.hasAttribute(OURS)) {
          el.removeAttribute(INERT);
          el.removeAttribute(OURS);
        }
      }
    };
  }, []);

  return null;
}
