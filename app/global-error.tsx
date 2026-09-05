"use client";

/* The last resort: an error thrown by the root layout itself.
 *
 * This one replaces the root layout, so it cannot use the app's chrome, its
 * providers, its fonts or its primitives: none of them are mounted when this
 * renders, and reaching for them is how a global error handler becomes the
 * second thing to crash. It therefore carries its own html and body tags, as
 * the framework requires, and inlines the few brand values it needs rather
 * than importing the stylesheet's tokens.
 *
 * It is deliberately the plainest surface in the realm. Obsidian ground,
 * forged gold on the one control, and no motion: whatever went wrong here
 * went wrong early, and the only job left is to say so and offer a way out.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          background: "#0c0c11",
          color: "#ece4d2",
          fontFamily: "Georgia, 'Times New Roman', serif",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: "34rem" }}>
          <p
            style={{
              margin: "0 0 12px",
              fontSize: "11px",
              letterSpacing: "0.26em",
              textTransform: "uppercase",
              color: "#837c6e",
            }}
          >
            The Ravenspire
          </p>
          <h1 style={{ margin: "0 0 12px", fontSize: "24px", fontWeight: 600 }}>
            The realm did not open
          </h1>
          <p
            style={{
              margin: "0 0 24px",
              fontSize: "15px",
              lineHeight: 1.6,
              color: "#b4ac9a",
            }}
          >
            This is a fault in the realm rather than in your connection.
            Nothing you have earned is affected: standing, Renown and balances
            settle on the server and are untouched by a page that failed to
            load.
          </p>
          <button
            type="button"
            onClick={() => unstable_retry()}
            /* Both, deliberately. This file replaces the root layout, so the
               stylesheet the root layout imports may never reach it and the
               inline sizes are what actually hold the 44px floor here. The
               classes carry the same floor for the case where the sheet does
               load, and they are what the house rule checker reads. */
            className="touch:min-h-11 touch:min-w-11"
            style={{
              minHeight: "44px",
              minWidth: "44px",
              padding: "0 20px",
              borderRadius: "10px",
              border: "1px solid rgba(217, 176, 64, 0.45)",
              background: "linear-gradient(180deg, #e7c878, #8e6a28)",
              color: "#1b1508",
              fontSize: "14px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error.digest ? (
            <p style={{ marginTop: "20px", fontSize: "11px", color: "#837c6e" }}>
              Reference {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
