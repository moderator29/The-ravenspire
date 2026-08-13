import "server-only";
import { captureException, captureMessage } from "@/lib/observability/sentry";

/* A small structured server logger (V2 Part Three, section 38, infra).
 *
 * The commerce routes handle money, so when one fails the operator needs more
 * than a bare 503 in a scrollback: which route, which order, which member, and
 * the error itself. This emits one JSON line per event, which every log
 * aggregator (including Vercel's) ingests and lets you query by field, and it
 * forwards warnings and errors to Sentry so a failure surfaces without anyone
 * watching the stream.
 *
 * It carries no PII beyond ids that already live in our own tables: a profile
 * id, an order id, an error message. It never logs a card number, a redemption
 * code, a seed, or a payment secret. Keep it that way.
 *
 * Usage:
 *   const log = logger("commerce.webhook");
 *   log.error("settle failed", { orderId, err });
 */

type Level = "info" | "warn" | "error";

interface Fields {
  [key: string]: unknown;
  /* When present, the error is both serialised into the line and, for warn and
     error, forwarded to Sentry. */
  err?: unknown;
}

function serialiseError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { name: err.name, message: err.message };
  }
  /* A Supabase error is a plain object with code and message; pass its shape
     through rather than stringify it into noise. */
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    return {
      message: typeof e.message === "string" ? e.message : undefined,
      code: typeof e.code === "string" ? e.code : undefined,
    };
  }
  return { message: String(err) };
}

function emit(scope: string, level: Level, message: string, fields?: Fields) {
  const { err, ...rest } = fields ?? {};
  const line: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    scope,
    message,
    ...rest,
  };
  if (err !== undefined) line.err = serialiseError(err);

  const text = JSON.stringify(line);
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.log(text);

  /* Forward to monitoring. An error with an actual Error or thrown value goes as
     an exception; anything else worth seeing goes as a message. Both no op
     without a Sentry DSN. */
  if (level === "error") {
    if (err !== undefined) captureException(err, { scope, message, ...rest });
    else captureMessage(message, { scope, ...rest }, "error");
  } else if (level === "warn") {
    captureMessage(message, { scope, ...rest }, "warning");
  }
}

export interface Logger {
  info(message: string, fields?: Fields): void;
  warn(message: string, fields?: Fields): void;
  error(message: string, fields?: Fields): void;
}

/* Build a logger bound to a scope, e.g. "commerce.checkout". The scope is the
   one field every line in a route shares, so filtering to a route is one query. */
export function logger(scope: string): Logger {
  return {
    info: (message, fields) => emit(scope, "info", message, fields),
    warn: (message, fields) => emit(scope, "warn", message, fields),
    error: (message, fields) => emit(scope, "error", message, fields),
  };
}
