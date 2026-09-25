"use client";

// ============================================================
// Global Error Boundary (Root Layout Fallback)
// ============================================================
// This is the LAST line of defense. It catches errors that
// occur in the root layout itself, which the route-level
// error.tsx cannot catch. It must include its own <html> and
// <body> tags because the root layout is replaced.
// ============================================================

import * as Sentry from "@sentry/nextjs";
import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950 font-sans">
        <div className="max-w-md w-full text-center p-6 space-y-6">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
            <AlertTriangle size={30} className="text-red-500 dark:text-red-400" aria-hidden />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Critical Error
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              HostFlow encountered a critical error. Our team has been automatically notified.
            </p>
          </div>
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Reload Application
          </button>
          {error.digest && (
            <p className="text-xs text-gray-400 font-mono">
              Reference: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
