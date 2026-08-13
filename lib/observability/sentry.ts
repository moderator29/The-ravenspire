import "server-only";

/* Error monitoring, env gated on a DSN (V2 Part Three, section 38, infra).
 *
 * Rule 19 is assume the budget is zero and add no paid service without
 * justification. Sentry has a free tier, but the point here is stronger: this
 * integration is inert until a DSN exists, so it costs nothing, ships nothing to
 * anyone, and needs no dependency to be installed. When SENTRY_DSN is unset,
 * every function is a no op.
 *
 * Deliberately built with fetch against Sentry's ingestion (store) endpoint,
 * not the @sentry/node SDK. Same reasoning as the Coinbase and Gelato clients: the
 * SDK is a large dependency that patches the runtime, and everything needed here
 * is one HTTP POST of a JSON event. The secret half of the DSN never exists,
 * because Sentry ingestion authenticates with the public key alone, so nothing
 * secret reaches the client (this module is server only regardless).
 *
 * Every call is fire and forget and swallows its own errors: monitoring must
 * never be able to break the request it is monitoring.
 */

interface Dsn {
  publicKey: string;
  host: string;
  projectId: string;
  protocol: string;
}

/* Parse a DSN of the form protocol://publicKey@host/projectId. Returns null for
   anything malformed, which keeps the whole module a no op on a bad value rather
   than throwing at import time. */
function parseDsn(raw: string | undefined): Dsn | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const projectId = url.pathname.replace(/^\//, "");
    if (!url.username || !url.hostname || !projectId) return null;
    return {
      publicKey: url.username,
      host: url.host,
      projectId,
      protocol: url.protocol.replace(":", ""),
    };
  } catch {
    return null;
  }
}

const DSN = parseDsn(process.env.SENTRY_DSN);

/* The environment tag on every event, so staging noise and production incidents
   are separable in the dashboard. */
function environment(): string {
  return (
    process.env.SENTRY_ENVIRONMENT?.trim() ||
    process.env.VERCEL_ENV?.trim() ||
    process.env.NODE_ENV ||
    "development"
  );
}

/* Whether monitoring is live. Callers rarely need this; the capture functions
   already no op without a DSN. */
export function sentryEnabled(): boolean {
  return DSN !== null;
}

/* Post one event to the store endpoint. Best effort: any failure, including no
   DSN, resolves without throwing. */
async function send(event: Record<string, unknown>): Promise<void> {
  if (!DSN) return;
  const endpoint = `${DSN.protocol}://${DSN.host}/api/${DSN.projectId}/store/`;
  const auth = [
    "Sentry sentry_version=7",
    "sentry_client=ravenspire-fetch/1.0",
    `sentry_key=${DSN.publicKey}`,
  ].join(", ");
  try {
    await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-sentry-auth": auth,
      },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        platform: "node",
        environment: environment(),
        ...event,
      }),
      /* Never let a slow monitoring endpoint hang a route. */
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    /* Monitoring is best effort and never throws into the caller. */
  }
}

/* Report an exception with optional structured context. Returns immediately;
   the network write happens in the background. */
export function captureException(
  err: unknown,
  context?: Record<string, unknown>
): void {
  if (!DSN) return;
  const error = err instanceof Error ? err : new Error(String(err));
  void send({
    level: "error",
    exception: {
      values: [
        {
          type: error.name,
          value: error.message,
          stacktrace: error.stack ? { frames: [] } : undefined,
        },
      ],
    },
    extra: {
      ...context,
      stack: error.stack ?? null,
    },
  });
}

/* Report a message event, for a handled condition worth seeing without an
   exception (a mispriced webhook, an unmapped fulfillment product). */
export function captureMessage(
  message: string,
  context?: Record<string, unknown>,
  level: "info" | "warning" | "error" = "warning"
): void {
  if (!DSN) return;
  void send({ level, message, extra: context ?? {} });
}
