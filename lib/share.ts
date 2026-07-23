/* One share primitive for the whole realm. A share button should never feel
   dead: on a phone it opens the native share sheet, on a desktop it copies the
   link, and where neither is available it falls back to a legacy copy. Returns
   what actually happened so the UI can confirm it ("Shared" / "Copied").

   Every path is best-effort and never throws; a genuine failure returns
   "failed" so the caller can say so plainly instead of going silent. */

export type ShareResult = "shared" | "copied" | "failed";

async function legacyCopy(text: string): Promise<boolean> {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export async function shareOrCopy(
  url: string,
  title?: string
): Promise<ShareResult> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share(title ? { title, url } : { url });
      return "shared";
    } catch (e) {
      /* A cancelled share sheet is a deliberate user choice, not a failure. */
      if (e instanceof Error && /abort|cancel/i.test(e.message)) return "shared";
      /* Any other share error: fall through to copying instead. */
    }
  }

  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  ) {
    try {
      await navigator.clipboard.writeText(url);
      return "copied";
    } catch {
      /* Clipboard blocked (insecure context, permissions): try legacy copy. */
    }
  }

  return (await legacyCopy(url)) ? "copied" : "failed";
}
