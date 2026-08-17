// ============================================================
// Centralized Error Reporting & User Feedback
// ============================================================
//
// This module provides a single entry point for all error handling.
// It replaces scattered `console.error` + `alert()` calls with:
//   1. Structured Sentry capture (with context)
//   2. User-facing toast notifications (via Sonner)
//   3. Dev-mode console logging
//
// Usage:
//   import { reportError, reportMutationError } from "@/lib/errorReporting";
//
//   try { ... } catch (err) {
//     reportMutationError(err, "Failed to add item");
//   }
// ============================================================

import * as Sentry from "@sentry/nextjs";
import { toast } from "sonner";

interface ErrorContext {
  /** A user-friendly message to display in the toast */
  userMessage?: string;
  /** Extra metadata to attach to the Sentry event */
  tags?: Record<string, string>;
  /** Additional context data for Sentry */
  extra?: Record<string, unknown>;
  /** Whether to show a toast to the user (default: true) */
  showToast?: boolean;
}

export function parseDatabaseError(error: unknown, fallbackMessage: string): string {
  if (!error) return fallbackMessage;
  const msg = typeof error === "string" ? error : (error as Error).message || "";
  if (!msg) return fallbackMessage;

  const lowerMsg = msg.toLowerCase();
  
  if (lowerMsg.includes("violates foreign key constraint")) {
    return "This action failed because a required related record (like a group or board) could not be found.";
  }
  if (lowerMsg.includes("violates unique constraint") || lowerMsg.includes("duplicate key value")) {
    return "A record with this information already exists.";
  }
  if (lowerMsg.includes("row-level security policy") || lowerMsg.includes("rls")) {
    return "You do not have permission to perform this action.";
  }
  if (lowerMsg.includes("network error") || lowerMsg.includes("fetch error")) {
    return "Network error. Please check your connection and try again.";
  }
  
  return fallbackMessage;
}

/**
 * Report an error to Sentry and optionally show a toast to the user.
 *
 * This is the primary error reporting function. Use it in catch blocks
 * everywhere instead of `console.error`.
 */
export function reportError(error: unknown, context?: ErrorContext) {
  const {
    userMessage = "Something went wrong. Please try again.",
    tags,
    extra,
    showToast = true,
  } = context || {};

  const friendlyMessage = parseDatabaseError(error, userMessage);

  // 1. Always log in development
  if (process.env.NODE_ENV === "development") {
    console.error(`[HostFlow Error] ${friendlyMessage}`, error);
  }

  // 2. Capture in Sentry with context
  Sentry.withScope((scope) => {
    if (tags) {
      Object.entries(tags).forEach(([key, value]) => {
        scope.setTag(key, value);
      });
    }
    if (extra) {
      Object.entries(extra).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
    }

    if (error instanceof Error) {
      Sentry.captureException(error);
    } else {
      Sentry.captureException(new Error(String(error)));
    }
  });

  // 3. Show user-facing toast
  if (showToast) {
    toast.error(friendlyMessage);
  }
}

/**
 * Convenience wrapper for mutation errors (create, update, delete).
 *
 * Automatically tags the Sentry event with the operation context
 * and shows a user-friendly error toast.
 *
 * @example
 * ```ts
 * try {
 *   await supabase.from("items").insert({ ... });
 * } catch (err) {
 *   reportMutationError(err, "Failed to create item", { table: "items", operation: "insert" });
 * }
 * ```
 */
export function reportMutationError(
  error: unknown,
  userMessage: string,
  meta?: { table?: string; operation?: string; itemId?: string }
) {
  reportError(error, {
    userMessage,
    tags: {
      error_domain: "mutation",
      ...(meta?.table && { db_table: meta.table }),
      ...(meta?.operation && { db_operation: meta.operation }),
    },
    extra: {
      ...(meta?.itemId && { item_id: meta.itemId }),
    },
  });
}

/**
 * Convenience wrapper for data fetching errors.
 *
 * @example
 * ```ts
 * try {
 *   const { data } = await supabase.from("boards").select("*");
 * } catch (err) {
 *   reportFetchError(err, "Failed to load boards");
 * }
 * ```
 */
export function reportFetchError(
  error: unknown,
  userMessage: string,
  meta?: { table?: string; query?: string }
) {
  reportError(error, {
    userMessage,
    tags: {
      error_domain: "fetch",
      ...(meta?.table && { db_table: meta.table }),
    },
    extra: {
      ...(meta?.query && { query: meta.query }),
    },
    // Fetch errors are less intrusive — show toast but keep it brief
    showToast: true,
  });
}

/**
 * Report a successful mutation with a toast.
 * Use this to replace silent success paths with user feedback.
 *
 * @example
 * ```ts
 * reportSuccess("Board created successfully");
 * ```
 */
export function reportSuccess(message: string) {
  toast.success(message);
}
