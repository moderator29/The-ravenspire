/* One share primitive for the whole realm. A share button should never feel
   dead: on a phone it opens the native share sheet, on a desktop it copies the
   link, and where neither is available it falls back to a legacy copy. Returns
   what actually happened so the UI can confirm it ("Shared" / "Copied").

   Every path is best-effort and never throws; a genuine failure returns
   "failed" so the caller can say so plainly instead of going silent, and a
   sheet the member dismissed returns "dismissed", which is neither a success
   to confirm nor a failure to apologise for. Treat it as "say nothing". */

export type ShareResult = "shared" | "copied" | "failed" | "dismissed";

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
      /* A cancelled share sheet is a deliberate user choice, not a failure,
         and it must not fall through to copying: quietly putting a link on the
         clipboard because somebody dismissed the sheet is the product doing
         the thing they just declined.

         Detected by `name`, not by the message. The message was the only test
         here, and it is the browser's own prose: Chrome says "Share canceled",
         Safari says "The operation was aborted", and both happen to match the
         pattern in English. Neither is specified, and a member running a
         localized build got neither, so their cancelled share silently became
         a copy. `AbortError` is the specified signal and it does not translate.
         The message test stays behind it for any engine old enough to reject
         with a plain Error. */
      const name = (e as { name?: string })?.name;
      if (name === "AbortError") return "dismissed";
      if (e instanceof Error && /abort|cancel/i.test(e.message)) {
        return "dismissed";
      }
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
