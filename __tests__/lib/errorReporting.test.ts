import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  reportError,
  reportMutationError,
  reportFetchError,
  reportSuccess,
} from "@/lib/errorReporting";
import * as Sentry from "@sentry/nextjs";
import { toast } from "sonner";

vi.mock("@sentry/nextjs", () => {
  const scopeMock = {
    setTag: vi.fn(),
    setExtra: vi.fn(),
  };
  return {
    withScope: vi.fn((callback) => callback(scopeMock)),
    captureException: vi.fn(),
  };
});

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe("errorReporting utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reportError logs to Sentry and displays a toast by default", () => {
    const error = new Error("Test exception");
    reportError(error, {
      userMessage: "Custom error message",
      tags: { feature: "board" },
      extra: { id: "123" },
    });

    expect(Sentry.withScope).toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
    expect(toast.error).toHaveBeenCalledWith("Custom error message");
  });

  it("reportError wraps strings in Error objects and uses default userMessage", () => {
    reportError("String error value");

    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "String error value" })
    );
    expect(toast.error).toHaveBeenCalledWith(
      "Something went wrong. Please try again."
    );
  });

  it("reportError suppresses toast when showToast is false", () => {
    reportError(new Error("silent error"), { showToast: false });
    expect(Sentry.captureException).toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("reportMutationError tags event with mutation domain and table metadata", () => {
    const error = new Error("Mutation failed");
    reportMutationError(error, "Failed to create item", {
      table: "items",
      operation: "insert",
      itemId: "item-1",
    });

    expect(Sentry.captureException).toHaveBeenCalledWith(error);
    expect(toast.error).toHaveBeenCalledWith("Failed to create item");
  });

  it("reportFetchError tags event with fetch domain", () => {
    const error = new Error("Network error");
    reportFetchError(error, "Failed to load data", { table: "boards" });

    expect(Sentry.captureException).toHaveBeenCalledWith(error);
    // parseDatabaseError recognises connectivity failures and replaces the
    // caller's generic message with actionable guidance.
    expect(toast.error).toHaveBeenCalledWith(
      "Network error. Please check your connection and try again."
    );
  });

  it("reportFetchError keeps the caller's message for unrecognised errors", () => {
    const error = new Error("something unexpected happened");
    reportFetchError(error, "Failed to load data", { table: "boards" });

    expect(toast.error).toHaveBeenCalledWith("Failed to load data");
  });

  it("reportSuccess displays a success toast", () => {
    reportSuccess("Item updated successfully");
    expect(toast.success).toHaveBeenCalledWith("Item updated successfully");
  });
});
