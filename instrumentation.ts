// This file is used to register instrumentation hooks.
// It is loaded by Next.js before any other code.
// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Dynamically import the Sentry server config when running in Node.js
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    // Dynamically import the Sentry edge config when running on the edge
    await import("./sentry.edge.config");
  }
}

export const onRequestError = async (...args: unknown[]) => {
  // Forward request errors to Sentry
  const Sentry = await import("@sentry/nextjs");
  // @ts-expect-error — Sentry's captureRequestError signature varies by version
  return Sentry.captureRequestError(...args);
};
